"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Shift } from "@/domain/shift/schedule";
import { InventoryPhotosResponseSchema, type InventoryPhoto } from "@/lib/dto/inventoryPhoto";

const endpoint = "/api/admin/inventory-photos";
const maxBytes = 5 * 1024 * 1024;
const formatTime = (value: string) => new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
});

export function InventoryPhotoPanel({ activeShifts }: { activeShifts: Shift[] }) {
    const router = useRouter();
    const [photos, setPhotos] = useState<InventoryPhoto[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const [capturedBy, setCapturedBy] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(async (offset = 0) => {
        const response = await fetch(`${endpoint}?offset=${offset}`, { cache: "no-store" });
        if (response.status === 401) { router.replace("/admin/login"); throw new Error("unauthorized"); }
        if (!response.ok) throw new Error("load failed");
        const result = InventoryPhotosResponseSchema.parse(await response.json());
        setPhotos((current) => offset === 0 ? result.photos : [...current, ...result.photos]);
        setHasMore(result.hasMore);
        setLoaded(true);
    }, [router]);

    useEffect(() => {
        let live = true;
        const initial = window.setTimeout(() => {
            void load().catch(() => { if (live) setError("재고 사진을 불러오지 못했습니다. 다시 시도해 주세요."); });
        }, 0);
        const timer = window.setInterval(() => {
            void load().catch(() => { if (live) setError("재고 사진을 새로고침하지 못했습니다."); });
        }, 30 * 60_000);
        return () => { live = false; window.clearTimeout(initial); window.clearInterval(timer); };
    }, [load]);

    const latestShiftStart = activeShifts.length
        ? Math.max(...activeShifts.map((shift) => new Date(`${shift.date}T${shift.startsAt}:00+09:00`).getTime()))
        : null;
    const photoDue = loaded && latestShiftStart !== null &&
        (!photos.length || Date.parse(photos[0].capturedAt) < latestShiftStart);

    async function upload(event: FormEvent) {
        event.preventDefault();
        const name = capturedBy.trim() || activeShifts[0]?.personName || "";
        setError(""); setMessage("");
        if (!file || !name) { setError("사진과 촬영자 이름을 입력해 주세요."); return; }
        if (file.size < 1 || file.size > maxBytes) { setError("5MB 이하 사진을 선택해 주세요."); return; }
        setBusy(true);
        try {
            const form = new FormData();
            form.append("photo", file);
            form.append("capturedBy", name);
            const response = await fetch(endpoint, { method: "POST", body: form });
            if (response.status === 401) { router.replace("/admin/login"); return; }
            if (!response.ok) throw new Error("upload failed");
            await load();
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
            setCapturedBy("");
            setMessage("재고 사진을 저장했습니다.");
        } catch {
            setError("사진 저장에 실패했습니다. 입력을 유지했으니 다시 시도해 주세요.");
        } finally { setBusy(false); }
    }

    async function cleanup() {
        if (!window.confirm("촬영 후 30일이 지난 재고 사진을 삭제할까요? 삭제한 사진은 복구할 수 없습니다.")) return;
        setBusy(true); setError(""); setMessage("");
        try {
            const response = await fetch(endpoint, { method: "DELETE" });
            if (response.status === 401) { router.replace("/admin/login"); return; }
            if (!response.ok) throw new Error("cleanup failed");
            const result = await response.json() as { deleted: number };
            await load();
            setMessage(`30일 지난 사진 ${result.deleted}건을 정리했습니다.`);
        } catch {
            setError("지난 사진을 정리하지 못했습니다. 다시 시도해 주세요.");
        } finally { setBusy(false); }
    }

    return <section id="inventory-photos" aria-labelledby="inventory-photos-heading"
        className="space-y-4 rounded-xl border border-iron-line bg-iron-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 id="inventory-photos-heading" className="font-semibold">교대 재고 사진</h2>
                <p className="mt-1 text-sm text-dough-dim">교대할 때마다 재고를 촬영해 기록하세요. 사진은 관리자만 볼 수 있습니다.</p>
            </div>
            <button type="button" disabled={busy} onClick={() => void load().catch(() => setError("재고 사진을 불러오지 못했습니다."))}
                className="rounded-lg border border-iron-line px-3 py-2 text-sm disabled:opacity-50">새로고침</button>
        </div>
        {photoDue && <p role="alert" className="rounded-lg border border-syrup/50 bg-syrup/10 p-3 text-sm font-semibold text-syrup">
            새 교대가 시작됐습니다. 재고 사진을 촬영해 주세요.
        </p>}
        {error && <p role="alert" className="text-sm text-chili">{error}</p>}
        {message && <p role="status" className="text-sm text-ok">{message}</p>}
        <form onSubmit={upload} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm">촬영자 이름
                <input value={capturedBy} onChange={(event) => setCapturedBy(event.target.value)} maxLength={80}
                    placeholder={activeShifts[0]?.personName ?? "이름 입력"} disabled={busy}
                    className="rounded-lg border border-iron-line bg-iron px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm">재고 사진
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={busy}
                    className="min-w-0 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-syrup file:px-3 file:py-2 file:font-semibold file:text-molasses" />
            </label>
            <button type="submit" disabled={busy || !file} className="rounded-lg bg-syrup px-4 py-2 font-semibold text-molasses disabled:opacity-50">
                {busy ? "처리 중…" : "사진 저장"}
            </button>
        </form>
        <p className="text-xs text-dough-dim">JPEG·PNG·WebP, 사진당 최대 5MB. 촬영 30일 후 관리자 정리 대상입니다.</p>
        <div className="flex items-center justify-between gap-3 border-t border-iron-line pt-4">
            <h3 className="font-semibold">촬영 기록</h3>
            <button type="button" disabled={busy} onClick={() => void cleanup()} className="text-xs text-dough-dim underline disabled:opacity-50">
                30일 지난 사진 정리
            </button>
        </div>
        {!loaded ? <p role="status" className="text-sm text-dough-dim">사진을 불러오는 중…</p>
            : photos.length === 0 ? <p className="text-sm text-dough-dim">아직 촬영 기록이 없습니다.</p>
                : <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {photos.map((photo) => <li key={photo.id} className="overflow-hidden rounded-lg border border-iron-line bg-iron">
                        {/* 관리자 전용 서명 URL로 제공하는 현장 기록 사진이다. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.imageUrl} alt={`${photo.capturedBy} 재고 사진`} className="aspect-video w-full object-cover" />
                        <div className="p-3 text-sm">
                            <p className="font-semibold">{photo.capturedBy}</p>
                            <time dateTime={photo.capturedAt} className="text-dough-dim">{formatTime(photo.capturedAt)}</time>
                        </div>
                    </li>)}
                </ol>}
        {hasMore && <button type="button" disabled={busy} onClick={() => void load(photos.length).catch(() => setError("이전 사진을 불러오지 못했습니다."))}
            className="rounded-lg border border-iron-line px-4 py-2 text-sm disabled:opacity-50">이전 사진 더 보기</button>}
    </section>;
}
