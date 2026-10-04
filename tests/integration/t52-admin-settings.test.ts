import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { SupabaseSettingsRepository } from "@/infra/repositories/settingsRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { ADMIN_SETTING_KEYS } from "@/lib/dto/settings";
import { getAllAdminSettings, updateAdminSettings } from "@/services/settingsService";

// T-52 설정 패널 저장 경로(F-48, Architecture 테스트 기준 "PUT 부분 갱신·알 수 없는 키 400(통합)"):
// updateAdminSettings → SupabaseSettingsRepository.setMany → app_settings upsert를 실제 DB로 확인한다.
// 통합 테스트에는 동작을 바꾸는 mock을 쓰지 않는다(DECISIONS #46) — 관리자 인증·요청 본문 검사(strict)는
// Route Handler 경계라 단위 테스트(tests/unit/api/adminSettingsRoute.test.ts)가 맡는다.
// 스윕 테스트(t18) 등이 같은 키를 읽으므로 시작 전 행을 저장해 두고 끝나면 그대로 되돌린다.
const db = createServiceClient();
const repository = new SupabaseSettingsRepository(db);
const adminId = randomUUID();

type Row = { key: string; value: string; updated_by: string | null };

// 각 테스트 시작 시 6개 키를 이 값으로 맞춘다(updated_by 없음).
const BASE: Record<string, string> = {
  "transfer.bank_name": "테스트은행",
  "transfer.account_number": "",
  "transfer.account_holder": "",
  "auto_complete.enabled": "false",
  "auto_complete.minutes": "15",
  "payment.expire_minutes": "10",
};

let original: Row[] = [];

async function settingRows(): Promise<Record<string, Row>> {
  const { data, error } = await db.from("app_settings")
    .select("key, value, updated_by").in("key", [...ADMIN_SETTING_KEYS]);
  if (error) throw error;
  return Object.fromEntries((data as Row[]).map((row) => [row.key, row]));
}

// 거부된 호출이 던진 AppError의 code·HTTP 상태
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, status: (error as AppError).status };
}

function expectBaseExcept(rows: Record<string, Row>, changed: Record<string, string>) {
  for (const key of ADMIN_SETTING_KEYS) {
    if (key in changed) {
      expect(rows[key]).toEqual({ key, value: changed[key], updated_by: adminId });
    } else {
      expect(rows[key]).toEqual({ key, value: BASE[key], updated_by: null });
    }
  }
}

beforeAll(async () => {
  original = Object.values(await settingRows());
});

beforeEach(async () => {
  const { error } = await db.from("app_settings")
    .upsert(Object.entries(BASE).map(([key, value]) => ({ key, value, updated_by: null })));
  if (error) throw error;
});

afterAll(async () => {
  // 원래 없던 키는 지우고, 원래 있던 행은 값·updated_by를 되돌린다.
  const existed = new Set(original.map((row) => row.key));
  const added = ADMIN_SETTING_KEYS.filter((key) => !existed.has(key));
  if (added.length) {
    const { error } = await db.from("app_settings").delete().in("key", added);
    if (error) throw error;
  }
  if (original.length) {
    const { error } = await db.from("app_settings").upsert(original);
    if (error) throw error;
  }
});

describe("T-52 PUT 부분 갱신", () => {
  test("보낸 키만 바뀌고 나머지 키는 그대로 — updated_by는 요청한 관리자", async () => {
    const result = await updateAdminSettings(repository, { "payment.expire_minutes": "15" }, adminId);

    expect(result).toMatchObject({ ...BASE, "payment.expire_minutes": "15" });
    expectBaseExcept(await settingRows(), { "payment.expire_minutes": "15" });
  });

  test("여러 키를 한 번에 갱신하고, 계좌 정보 빈 문자열(=미입력)도 저장한다", async () => {
    const changed = { "transfer.bank_name": "", "auto_complete.enabled": "true", "auto_complete.minutes": "20" };

    await updateAdminSettings(repository, changed, adminId);

    expectBaseExcept(await settingRows(), changed);
  });

  test("갱신 후 전체 조회(GET)가 DB 값을 그대로 돌려준다", async () => {
    await updateAdminSettings(repository, { "transfer.account_holder": "홍길동" }, adminId);

    expect(await getAllAdminSettings(repository)).toMatchObject({ ...BASE, "transfer.account_holder": "홍길동" });
  });
});

describe("T-52 PUT 거부 시 저장 없음", () => {
  test("알 수 없는 키가 섞이면 400 VALIDATION_ERROR — 같이 보낸 정상 키도 저장되지 않고 새 키도 생기지 않는다", async () => {
    expect(await rejection(updateAdminSettings(
      repository, { "payment.expire_minutes": "20", "unknown.setting": "x" }, adminId,
    ))).toEqual({ code: "VALIDATION_ERROR", status: 400 });

    expectBaseExcept(await settingRows(), {});
    const { data, error } = await db.from("app_settings").select("key").eq("key", "unknown.setting");
    if (error) throw error;
    expect(data).toEqual([]);
  });

  test("범위 밖 값(만료 121분)이면 400 VALIDATION_ERROR — 아무 키도 저장되지 않는다", async () => {
    expect(await rejection(updateAdminSettings(
      repository, { "transfer.bank_name": "국민은행", "payment.expire_minutes": "121" }, adminId,
    ))).toEqual({ code: "VALIDATION_ERROR", status: 400 });

    expectBaseExcept(await settingRows(), {});
  });
});
