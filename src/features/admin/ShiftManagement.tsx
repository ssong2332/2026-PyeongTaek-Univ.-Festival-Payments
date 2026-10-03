"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { currentShifts, SHIFT_RULES, type Shift, type ShiftInput } from "@/domain/shift/schedule";
import { kstDate } from "@/domain/time/kst";
import { AppError } from "@/lib/api/errors";
import { fetchJson } from "@/lib/api/client";
import { ShiftInputSchema, ShiftSchema, ShiftsResponseSchema } from "@/lib/dto/shift";

export interface ShiftApi {
  list(): Promise<Shift[]>;
  create(input: ShiftInput): Promise<Shift>;
  update(id: string, input: ShiftInput): Promise<Shift>;
  remove(id: string): Promise<void>;
}
const shiftApi: ShiftApi = {
  async list() { return (await fetchJson("/api/admin/shifts", {}, { parse: (data) => ShiftsResponseSchema.parse(data) })).shifts; },
  create(input) { return fetchJson("/api/admin/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, { parse: (data) => ShiftSchema.parse(data) }); },
  update(id, input) { return fetchJson(`/api/admin/shifts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, { parse: (data) => ShiftSchema.parse(data) }); },
  async remove(id) { await fetchJson(`/api/admin/shifts/${id}`, { method: "DELETE" }); },
};

function emptyInput(now: Date): ShiftInput {
  return { personName: "", date: kstDate(now.toISOString()), startsAt: "10:00", endsAt: "12:00", role: "" };
}
function sorted(shifts: Shift[]) {
  return [...shifts].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.personName.localeCompare(b.personName) || a.id.localeCompare(b.id));
}

export function ShiftManagement({ initialNow, api = shiftApi }: { initialNow: string; api?: ShiftApi }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(initialNow));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState(() => emptyInput(new Date(initialNow)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const parsed = ShiftInputSchema.safeParse(form);
  const fieldErrors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
  const active = currentShifts(shifts, now);
  const locked = loading || saving || !loaded;

  useEffect(() => {
    let live = true;
    api.list().then((items) => { if (live) { setShifts(sorted(items)); setLoaded(true); } }).catch((failure) => {
      if (!live) return;
      if (failure instanceof AppError && failure.status === 401) router.replace("/admin/login");
      else setError("스케줄을 불러오지 못했습니다. 다시 시도해 주세요.");
    }).finally(() => { if (live) setLoading(false); });
    const timer = setInterval(() => setNow(new Date()), SHIFT_RULES.refreshMs);
    return () => { live = false; clearInterval(timer); };
  }, [api, router]);

  async function reload() {
    setLoading(true); setError(""); setNotice("");
    try { setShifts(sorted(await api.list())); setLoaded(true); }
    catch (failure) { reportFailure(failure, "스케줄을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }
  function reportFailure(failure: unknown, message: string) {
    if (failure instanceof AppError && failure.status === 401) router.replace("/admin/login");
    else if (failure instanceof AppError && failure.status === 404) setError("다른 관리자가 이 스케줄을 삭제했습니다. 새로고침 후 다시 확인해 주세요.");
    else setError(message + " 다시 시도해 주세요.");
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setShowValidation(true); setError(""); setNotice("");
    if (!parsed.success || locked) return;
    setSaving(true);
    try {
      const shift = editingId ? await api.update(editingId, parsed.data) : await api.create(parsed.data);
      setShifts((items) => sorted([...items.filter((item) => item.id !== shift.id), shift]));
      setForm(emptyInput(now)); setEditingId(null); setShowValidation(false);
      setNotice("스케줄을 저장했습니다.");
    } catch (failure) { reportFailure(failure, "스케줄 저장에 실패했습니다."); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    if (locked) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api.remove(id);
      setShifts((items) => items.filter((item) => item.id !== id));
      if (editingId === id) { setEditingId(null); setForm(emptyInput(now)); }
      setDeletingId(null); setNotice("스케줄을 삭제했습니다.");
    } catch (failure) { reportFailure(failure, "스케줄 삭제에 실패했습니다."); }
    finally { setSaving(false); }
  }
  function edit(shift: Shift) {
    setEditingId(shift.id);
    setForm({ personName: shift.personName, date: shift.date, startsAt: shift.startsAt, endsAt: shift.endsAt, role: shift.role });
    setShowValidation(false); setError(""); setNotice(""); setDeletingId(null);
    document.getElementById("shift-name")?.focus();
  }
  function field(name: keyof ShiftInput, label: string, type = "text", id = `shift-${name}`) {
    const validation = (showValidation || (name === "endsAt" && !!form.endsAt)) ? fieldErrors[name] : undefined;
    return <label className="flex flex-col gap-2 text-sm font-medium text-gray-700" htmlFor={id}>
      {label}<input id={id} name={name} type={type} required value={form[name]} disabled={locked}
        maxLength={name === "personName" ? SHIFT_RULES.nameMaxLength : name === "role" ? SHIFT_RULES.roleMaxLength : undefined}
        aria-invalid={!!validation} aria-describedby={validation ? id + "-error" : undefined}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-brand-deep disabled:opacity-60" />
      {validation && <span id={id + "-error"} className="text-xs text-red-700">{validation}</span>}
    </label>;
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-brand-deep">운영 관리</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">교대 스케줄</h1>
        <p className="mt-2 text-sm text-gray-600">운영진의 시간과 역할을 관리하세요. 모든 시간은 한국 시간(KST) 기준입니다.</p></div>
      <button type="button" disabled={loading || saving} onClick={reload} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">새로고침</button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
    <section aria-labelledby="shift-current" className="rounded-xl border border-badge bg-peach p-5">
      <div className="flex flex-wrap justify-between gap-2"><h2 id="shift-current" className="font-semibold text-gray-900">현재 담당자</h2>
        <time className="text-sm text-gray-600" dateTime={now.toISOString()}>{now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time></div>
      {loading ? <p role="status" className="mt-3 text-sm text-gray-600">스케줄 불러오는 중…</p>
        : !loaded ? <p className="mt-3 text-sm text-gray-600">스케줄 조회가 필요합니다.</p>
        : active.length ? <ul className="mt-3 flex flex-wrap gap-3">{active.map((shift) =>
          <li key={shift.id} className="rounded-lg border border-badge bg-white px-4 py-3">
            <span className="font-semibold">{shift.personName}</span><span className="ml-2 text-sm text-gray-600">{shift.role}</span>
            <p className="mt-1 text-xs text-gray-500">{shift.startsAt}–{shift.endsAt}</p></li>)}</ul>
        : <p className="mt-3 text-sm text-gray-600">현재 담당자 없음</p>}
    </section>
    <section aria-labelledby="shift-form-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
      <h2 id="shift-form-heading" className="mb-4 font-semibold">{editingId ? "스케줄 수정" : "스케줄 추가"}</h2>
      <form onSubmit={save}>
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {field("personName", "이름", "text", "shift-name")}{field("date", "날짜", "date")}
          {field("startsAt", "시작 시각", "time")}{field("endsAt", "종료 시각", "time")}{field("role", "역할")}
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={locked} className="rounded-lg bg-brand-deep px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "처리 중…" : editingId ? "수정 저장" : "스케줄 등록"}</button>
          {editingId && <button type="button" disabled={locked} onClick={() => { setEditingId(null); setForm(emptyInput(now)); setShowValidation(false); }} className="rounded-lg border px-4 py-2 text-sm">수정 취소</button>}
          <p className="text-xs text-gray-500">같은 시간대에 여러 명을 등록할 수 있습니다.</p>
        </div>
      </form>
    </section>
    <section aria-labelledby="shift-list-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
      <h2 id="shift-list-heading" className="border-b px-5 py-4 font-semibold">전체 스케줄 {loaded && <span className="ml-2 text-sm font-normal text-gray-500">{shifts.length}건</span>}</h2>
      {loading ? <p role="status" className="p-8 text-center text-sm text-gray-500">스케줄 불러오는 중…</p>
        : !loaded ? <p className="p-8 text-center text-sm text-gray-600">새로고침으로 스케줄을 다시 불러와 주세요.</p>
        : !shifts.length ? <div className="p-10 text-center"><p className="text-gray-600">등록된 스케줄 없음</p><button type="button" onClick={() => document.getElementById("shift-name")?.focus()} className="mt-3 text-sm font-semibold text-brand-deep underline">스케줄 추가</button></div>
        : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">운영진 교대 스케줄, 한국 시간 기준</caption>
          <thead className="bg-gray-50 text-gray-600"><tr>{["날짜", "시간대", "이름", "역할", "관리"].map((label) => <th key={label} scope="col" className="px-5 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y">{shifts.map((shift) => <tr key={shift.id} className={active.some((item) => item.id === shift.id) ? "bg-peach/50" : ""}>
            <td className="px-5 py-4">{shift.date}</td><td className="px-5 py-4 whitespace-nowrap">{shift.startsAt}–{shift.endsAt}</td>
            <td className="px-5 py-4 font-medium">{shift.personName}{active.some((item) => item.id === shift.id) && <span className="ml-2 rounded bg-orange-100 px-2 py-1 text-xs text-orange-900">현재</span>}</td>
            <td className="px-5 py-4">{shift.role}</td><td className="px-5 py-4">
              {deletingId === shift.id ? <div className="flex flex-wrap gap-2"><span className="w-full text-xs text-gray-600">삭제하시겠습니까?</span>
                <button type="button" disabled={locked} onClick={() => remove(shift.id)} className="text-red-700 underline">삭제 확인</button>
                <button type="button" disabled={locked} onClick={() => setDeletingId(null)}>취소</button></div>
                : <div className="flex gap-3"><button type="button" disabled={locked} onClick={() => edit(shift)} aria-label={`${shift.personName} ${shift.date} ${shift.startsAt} 수정`} className="text-brand-deep underline">수정</button>
                  <button type="button" disabled={locked} onClick={() => setDeletingId(shift.id)} aria-label={`${shift.personName} ${shift.date} ${shift.startsAt} 삭제`} className="text-red-700 underline">삭제</button></div>}
            </td></tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
}
