# T-24 E2E 테스트 1개 — 검증 기록 (BE1)

> **현황(2026-10-05): 시나리오 1개 작성·로컬 실행 통과.** 선행 화면(T-09·T-16·T-31·T-32)이 dev에 모두 들어온 뒤 작성했다. 실행 환경·가드·준비 데이터·정리 범위는 QA(이주노) 확인(2026-10-05)대로다: 운영 주소가 아닌 **로컬 Supabase(Docker)**, 주소가 127.0.0.1·localhost가 아니면 실행 중단, 계좌 설정·메뉴·관리자 계정은 테스트 fixture, 종료 후 생성 데이터 정리, CI 미포함. **소스(`src/`) 변경 없음.** Tasks 상태는 바꾸지 않는다.

## 범위 (Tasks T-24 · PRD N-13 · Architecture "E2E 1개(T-24 시나리오)" · ADR-0007)

시나리오: QR URL 진입(`/`) → 메뉴 담기 → 계좌이체 선택 → 주문 완료(송금 안내 표시) → [송금했어요] → 관리자 로그인 → 대시보드에서 해당 주문 "송금 신고됨" 확인 → 입금 확인.

| 파일 | 내용 |
|---|---|
| `tests/e2e/t24-transfer-order.spec.ts` | 시나리오 1개. 화면 조작과 함께 로컬 DB의 주문·재고·이력을 직접 확인한다(mock 없음) |
| `tests/e2e/support/transferOrderFixture.ts` | 준비 데이터 생성·정리 |
| `tests/e2e/support/localSupabase.ts` | 로컬 주소 가드, 개발 서버에 넘길 환경값 |
| `tests/unit/e2e/localSupabaseGuard.test.ts` | 가드 단위 테스트 16개 |
| `playwright.config.ts` (공용 파일) | 시작 시 가드 실행, `webServer.env`로 로컬 Supabase 값 전달 |
| `README.md` · `docs/CodingRules.md` · `tests/e2e/README.md` | "E2E는 DB 없이 실행" 문구를 "로컬 Supabase 필요"로 갱신 |

## 운영 DB 보호 (가드)

`npm run test:e2e`가 띄우는 개발 서버(`npm run dev`)는 `.env.local`을 읽는데, 그 파일은 운영 Supabase를 가리킨다. 그대로 두면 E2E가 운영 DB에 주문을 만든다.

- `playwright.config.ts`가 `.env.test.local`의 로컬 값(통합 테스트와 같은 파일)을 읽어 개발 서버에 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY` 환경변수로 넘긴다. Next는 `process.env`를 `.env.local`보다 먼저 읽으므로(Next 문서 "Environment Variable Load Order") 운영 값이 쓰이지 않는다.
- 넘기기 전에 주소의 호스트가 `127.0.0.1` 또는 `localhost`인지 확인하고, 아니면 설정을 읽는 단계에서 예외로 멈춘다 — 개발 서버도 뜨지 않는다. 셸에 `NEXT_PUBLIC_SUPABASE_URL`이 로컬이 아닌 값으로 잡혀 있어도 멈춘다. `.env.test.local`이 없거나 값이 비어도 멈춘다.
- fixture가 DB에 쓰기 직전에 같은 확인을 한 번 더 한다.
- 확인: `NEXT_PUBLIC_SUPABASE_URL=https://<프로젝트>.supabase.co npx playwright test` → 설정 로드 단계에서 종료(코드 1), 3100 포트에 서버 없음.
- 개발 서버가 실제로 로컬 DB를 쓰는지는 시나리오가 증명한다: 로컬 DB에만 넣은 전용 메뉴가 메뉴판에 보이고, 화면에서 만든 주문을 로컬 DB에서 토큰으로 조회한다.

## 준비 데이터와 정리

| 준비 (테스트마다) | 정리 |
|---|---|
| 전용 메뉴 1개(재고 5, 2,000원, 이름 `E2E 호떡 <임의 6자>`) + 한국어 번역 | 주문 삭제 → 메뉴 삭제(재고 차감은 이 메뉴에만 걸려 함께 사라짐) |
| 계좌 설정 `transfer.bank_name`·`account_number`·`account_holder` | 실행 전 값으로 복원(없던 키는 삭제) |
| 관리자 계정 — 로컬 Auth Admin API(ADR-0007: seed에 비밀번호를 두지 않음). 이메일·비밀번호는 실행마다 새로 만들고 저장하지 않는다 | 계정 삭제 |
| (실행 전 값 기록) 픽업 번호 카운터 | 이 테스트가 마지막으로 쓴 번호 그대로일 때만 실행 전 값으로 복원 |
| (실행 전 값 기록) 속도 제한 기록(T-51) | 새로 생긴 행 삭제, 늘어난 횟수 복원 |

정리는 fixture의 `finally`에서 하므로 시나리오가 중간에 실패해도 실행된다. seed 적용 여부와 무관하게 동작한다(seed 메뉴를 쓰지 않는다).

## 시나리오가 확인하는 것

| 단계 | 화면 | DB(로컬) |
|---|---|---|
| 메뉴 담기 → 장바구니 → 결제 | 전용 메뉴 카드 → [담기] → "장바구니 보기 (1개…" → [주문하기] | — |
| 계좌이체 주문 | 계좌이체 선택 → "2,000원 주문하기" → `/orders/{token}?new=1` | 주문 `pending`·`transfer`·2,000원·신고 시각 없음, 재고 5 → 4 |
| 송금 안내(T-31) | 은행·계좌번호·예금주가 설정값 그대로, 입금할 금액 2,000원 | — |
| [송금했어요](T-32) | "송금 신고 완료 HH:MM" | `transfer_reported_at` 기록, 상태는 `pending` 그대로 |
| 관리자 로그인(T-13) | 비로그인 `/admin` → `/admin/login` 이동 → 로그인 → `/admin` | — |
| 대시보드(T-15·T-32) | 주문표 "픽업 NNN 주문 상세"에 "송금 신고됨", 상세에 "송금 신고됨"·"계좌이체" | — |
| 입금 확인(T-16) | [입금 확인] → 주문표 상태 `paid` | 주문 `paid`·`paid_at` 기록, 이력 2행(생성 `customer` / `confirm_payment` `admin`·관리자 id), 재고 4 그대로 |

고객 화면은 Architecture 테스트 절대로 모바일 프로젝트 2개(`customer-android` Pixel 7, `customer-ios` iPhone 14 — 둘 다 Chromium 에뮬레이션)에서 실행하고, `admin-desktop` 프로젝트에서는 건너뛴다. 관리자 화면은 같은 테스트 안에서 데스크톱 창을 따로 연다.

## 검증 (2026-10-05, Node 22.23.3, Playwright 1.63.0, 로컬 Supabase — dev 9f2d721, 마이그레이션 0001~0019·0100~0103 + `supabase/seed.sql` 적용)

`npm run test:e2e`:

```
Running 6 tests using 1 worker

  ✓  1 [customer-android] › tests/e2e/smoke.spec.ts:3:5 › 첫 화면은 정상 응답하고 문서 언어는 한국어다 (330ms)
  ✓  2 [customer-android] › tests/e2e/t24-transfer-order.spec.ts:12:5 › 계좌이체 주문 → 송금 신고 → 관리자 입금 확인 (9.5s)
  ✓  3 [customer-ios] › tests/e2e/smoke.spec.ts:3:5 › 첫 화면은 정상 응답하고 문서 언어는 한국어다 (325ms)
  ✓  4 [customer-ios] › tests/e2e/t24-transfer-order.spec.ts:12:5 › 계좌이체 주문 → 송금 신고 → 관리자 입금 확인 (6.3s)
  ✓  5 [admin-desktop] › tests/e2e/smoke.spec.ts:3:5 › 첫 화면은 정상 응답하고 문서 언어는 한국어다 (338ms)
  -  6 [admin-desktop] › tests/e2e/t24-transfer-order.spec.ts:12:5 › 계좌이체 주문 → 송금 신고 → 관리자 입금 확인

  1 skipped
  5 passed (18.8s)
```

- 정리 확인: 실행 전후로 메뉴(재고·가격 포함)·`app_settings`·픽업 번호 카운터의 해시와 주문·이력·계정·속도 제한 행 수가 같다. seed를 적용한 DB에서 3회 연속 실행 후에도 같고, seed 없이 `db reset`만 한 빈 DB에서도 통과·잔여 0건.
- `npm run test` 1136 통과(가드 16개 포함) · `npm run test:integration` 202 통과(1개는 기존 건너뜀) · `typecheck` 0 · `build` 통과 · `lint` 오류 0(경고 1건은 기존 `src/app/api/admin/settings/route.ts`의 `_request` — 이 PR과 무관).
- 운영 DB는 사용하지 않았다.
- Red-First: 가드는 단위 테스트를 먼저 써서 실패(모듈 없음)를 확인한 뒤 구현했다. 시나리오는 기존 화면·API의 연결 검증이라, 소스를 일부러 망가뜨려 실패하는 것을 확인했다(모두 원복).
  - 송금 신고 API가 실패하게 함 → "송금 신고 완료"를 찾지 못해 실패
  - 대시보드 주문표에서 "송금 신고됨" 표시를 뺌 → 주문표 글자 검사에서 실패
  - 관리자 전환 API가 실패하게 함 → 주문표 상태가 `pending`에 머물러 실패
  - 세 경우 모두 실패 뒤 DB 잔여 0건(실패해도 정리된다)

## 남은 것·한계

- E2E는 CI에서 돌지 않는다(DECISIONS #34). 이 기록의 실행 결과는 로컬 1대(macOS, Docker) 기준이다.
- `customer-ios`는 Chromium 기기 에뮬레이션이다 — 실제 iOS Safari 검증이 아니다.
- 화면 요소는 역할·이름(버튼 "담기"·"송금했어요"·"입금 확인", 주문표 "픽업 NNN 주문 상세" 등)으로 찾는다. 화면 문구가 바뀌면 이 시나리오도 같이 고쳐야 한다.
- 이제 `smoke.spec.ts`도 로컬 Supabase 설정(`.env.test.local`)이 있어야 실행된다(가드가 설정 로드 단계에 있다).
- 로컬 DB의 pg_cron `sweep-orders`(0019)가 1분마다 돌지만, 시나리오의 주문은 만든 지 수 초라 만료 대상이 아니다.
- 현금 주문·취소 요청·환불·자동 만료의 화면 흐름은 이 시나리오 범위가 아니다(각 작업의 통합 테스트가 다룬다).
