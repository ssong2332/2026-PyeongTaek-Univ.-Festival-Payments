import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseShiftRepository } from "@/infra/repositories/supabaseShiftRepository";
import { listShifts, saveShift, deleteShift } from "@/services/shiftService";

const db = createServiceClient();
const repo = createSupabaseShiftRepository(db);
const prefix = `t46-${randomUUID()}`;
const input = { personName: prefix, date: "2026-10-07", startsAt: "10:00", endsAt: "12:00", role: "주문 확인" };
let fixtureId: string;
let userId: string | undefined;
const ids: string[] = [];
function browser(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("로컬 Supabase 접속 설정이 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
const anon = browser();
const admin = browser();
beforeAll(async () => {
  const row = await repo.create(input);
  fixtureId = row.id; ids.push(row.id);
  const email = `${prefix}@example.test`;
  const password = randomUUID();
  const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  const signIn = await admin.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
});
afterAll(async () => {
  if (ids.length) {
    const deleted = await db.from("shifts").delete().in("id", ids);
    if (deleted.error) throw deleted.error;
  }
  if (userId) {
    const deleted = await db.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
});

test("실제 DB에서 겹치는 교대 등록·조회·수정·삭제", async () => {
  const second = await saveShift(repo, { ...input, personName: prefix + "-second" });
  ids.push(second.id);
  expect((await listShifts(repo)).filter((row) => ids.includes(row.id))).toHaveLength(2);
  const updated = await saveShift(repo, { ...input, startsAt: "11:00", role: "조리" }, second.id);
  expect(updated).toMatchObject({ id: second.id, startsAt: "11:00", role: "조리" });
  await deleteShift(repo, second.id);
  expect((await listShifts(repo)).some((row) => row.id === second.id)).toBe(false);
  await expect(deleteShift(repo, second.id)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});
test("서비스 검증과 DB 제약 모두 잘못된 시간·빈 이름을 차단한다", async () => {
  await expect(saveShift(repo, { ...input, endsAt: "09:00" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  for (const change of [{ ends_at: "09:00" }, { person_name: " " }, { starts_at: "10:00:01" }]) {
    const { error } = await db.from("shifts").insert({
      person_name: prefix + "-invalid", date: input.date, starts_at: input.startsAt, ends_at: input.endsAt, role: input.role, ...change,
    });
    expect(error?.code).toBe("23514");
  }
});
test("anon은 읽기·쓰기 거부, authenticated는 읽기만 허용", async () => {
  const anonymousRead = await anon.from("shifts").select("*").eq("id", fixtureId);
  expect(anonymousRead.error?.code).toBe("42501");
  const adminRead = await admin.from("shifts").select("id, person_name").eq("id", fixtureId);
  expect(adminRead.error).toBeNull();
  expect(adminRead.data).toEqual([{ id: fixtureId, person_name: input.personName }]);
  for (const client of [anon, admin]) {
    const insert = await client.from("shifts").insert({ person_name: prefix + "-denied", date: input.date, starts_at: input.startsAt, ends_at: input.endsAt, role: input.role });
    const update = await client.from("shifts").update({ person_name: "변조" }).eq("id", fixtureId);
    const remove = await client.from("shifts").delete().eq("id", fixtureId);
    expect(insert.error?.code).toBe("42501");
    expect(update.error?.code).toBe("42501");
    expect(remove.error?.code).toBe("42501");
  }
  expect((await listShifts(repo)).find((row) => row.id === fixtureId)?.personName).toBe(input.personName);
});
