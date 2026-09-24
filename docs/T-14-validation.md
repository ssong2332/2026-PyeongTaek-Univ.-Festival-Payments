# T-14 상태 전환 규칙 — 선작업 검증

2026-09-24 작성. T-14 전체 완료가 아니라 DB 없이 실행하는 도메인 규칙까지 구현했다.

- `src/domain/order/status.ts`: 주문 상태·결제수단·변경 동작 타입.
- `src/domain/order/stateMachine.ts`: Architecture의 전환 표와 `resolveTransition`, 관리자 버튼용 `availableActions`.
- `tests/unit/domain/order/stateMachine.test.ts`: 7상태 × 8동작 전수 검사, 결제수단 구분, 사유 공백 거부, 환불 경로 일치, 종료 상태 버튼 없음, 입력 불변 검사.

구현 전 모듈 없음으로 테스트 실패를 확인한 후 구현했다. 반환하는 오류 코드는 서비스/API에서 `INVALID_TRANSITION` → 409, `REASON_REQUIRED`·`REFUND_CHANNEL_REQUIRED` → 400으로 변환해야 한다. 현재 HTTP API는 구현하지 않았다.

`availableActions`는 관리자용 동작만 반환하며 사유 입력 전에도 취소·환불 버튼을 제공한다. 버튼 표시 자체는 권한 검사가 아니다. 호출자 인증은 T-13/T-16에서 처리한다.

`expire`·`auto_complete`는 허용 상태 쌍만 판정한다. 시간 경과, 자동 완료 설정, 송금 신고 제외 조건은 T-18/T-19의 시스템 호출 경로에서 반드시 검사해야 한다. 현재 자동 실행 기능은 없다.

남은 T-14 작업: 상태 갱신과 이력(이전·다음·시각·주체·사유)의 원자적 DB 저장, 상태 동시 변경 검증 및 실제 DB 통합 테스트. 현금 확인의 결제·조리 시작 시각 동시 기록과 재고 복구도 DB 연결 시 검증한다. Tasks.md 상태는 변경하지 않았다.

검증 결과(Node 20.20.2): `npm run test` 95개 통과(기존 27개 + T-14 68개), `npm run lint` 통과, `npm run typecheck` 통과. 로컬 설치 폴더와 빌드 캐시에 남은 중복 파일로 타입 검사가 실패했으나, 잠금 파일 기준 재설치와 생성 캐시 백업 이동 후 통과했다. 커밋·업로드·GitHub CI 검증은 아직 수행하지 않았다.

## 이슈 #23 — 결제수단 축소 반영 (2026-09-24)

- `TransferMethod` 타입과 주문 입력의 `transferMethod`를 제거했다.
- 환불수단은 `cash`·`bank`만 사용하며 현금 주문은 `cash`, 계좌이체 주문은 `bank`로 판정한다.
- 최신 입력 형식으로 테스트 변경 후 계좌이체 환불 테스트 2개가 실패하는 것을 확인하고 수정했다.
- 카카오페이·토스는 정상 경로 테스트에서 제거하고, 잘못된 입력으로 들어왔을 때 거부되는지만 검사한다.
- 수정 후 `npm run test` 95개(T-14 68개), `npm run lint`, `npm run typecheck` 모두 통과했다.
- 이슈 수정분은 로컬 검증 완료 상태이며 커밋·업로드·원격 CI 확인은 남아 있다. DB 변경(T-53)과 T-14의 이력 저장은 이번 수정에 포함하지 않는다.

## 서비스 계층 (2026-09-24)

- `src/services/adminOrderService.ts`의 `transition`: 주문 조회 → 관리자 동작 여부 → `resolveTransition` → `repo.transition`(from·to·주체·사유·환불 채널).
  - 주문 없음 404 `NOT_FOUND` · 불허 전환과 관리자의 `expire`·`auto_complete` 409 `INVALID_TRANSITION` · 사유 빈값 400 `REASON_REQUIRED` · 환불 채널 없음 400 `REFUND_CHANNEL_REQUIRED` · CAS 실패 409 `STATE_CHANGED`(repo가 던진 것을 그대로 전달).
  - 사유는 앞뒤 공백을 제거해 저장하고, 필요 없는 전환에 온 사유·환불 채널은 `null`로 버린다.
- `src/services/ports.ts`: `OrderRepository`(`findById`, `transition`)의 T-14 최소 형태. `src/lib/api/errors.ts`: `AppError(code, details?)` — HTTP 상태는 ErrorCode 표에서 자동으로 정한다.
- `tests/unit/fakes/fakeOrderRepository.ts`(CAS 흉내) + `tests/unit/services/adminOrderService.test.ts` 14개.
- 모듈 없음으로 실패 확인 후 구현. `npm run test` 109개 통과, `npm run typecheck`·`npm run lint` 통과.
- 남은 일: Supabase 구현체와 `transition_order` SQL·통합 테스트(T-03·T-53 적용 후), 이력.

## 팀장 확인 필요 (2026-09-24)

1. ✅ **해결(2026-09-24, PR #31 `docs: align AppError contract with architecture`)** — `AppError(code, httpStatus, details?)`로 확정, `message`는 응답 변환 시 `code`로 정한다. 코드를 이 모양으로 바꿨다(호출부가 HTTP 상태를 ErrorCode 표대로 넘김). 이전 내용: 문서끼리 다르다. CodingRules: `AppError(code, message, status, details)` / Architecture "예외를 잡는 위치": `AppError(code, httpStatus, details?)`.
   구현은 `AppError(code, details?, message?)`로, HTTP 상태를 ErrorCode 표에서 자동으로 정한다(코드마다 상태가 고정이라 호출할 때마다 적으면 틀릴 수 있음). 이대로 괜찮으면 CodingRules·Architecture 문구를 맞춰야 한다.
2. **services → `lib/api/errors` import** — PR #31로 CodingRules가 "`services/`·`infra/`는 `AppError`를 던진다"로 바뀌어 사실상 허용. 모듈 경계 표 문구만 남음 — 모듈 경계 표에서 services의 의존 대상은 `domain, ports`뿐인데, 같은 문서가 "서비스는 AppError를 던진다"고 한다. `AppError`는 순수 TS라 lint 규칙에는 걸리지 않는다. 의존 대상에 `lib/api/errors`를 추가할지, `AppError` 위치를 옮길지 결정 필요.
3. **의존성 기본값 미적용** — Architecture는 `transition(dto, deps = defaultDeps())`처럼 기본값 주입이지만, Supabase 구현체가 아직 없어 지금은 `deps`를 필수 인자로 두었다. 구현체(T-03·T-53 적용 후)를 만들 때 기본값을 넣는다.
4. **이슈 #23 남은 결정** — ① `stateMachine.test.ts` 맨 아래 "kakaopay/toss 입력 거부" 테스트를 안전장치로 유지할지(현재 유지) 이슈 문구대로 삭제할지. ② 이슈를 "210dbf2로 반영, T-14 PR에서 닫음" 댓글 후 T-14 PR로 닫을지, 상태 머신만 먼저 PR할지.

## DB 함수 `transition_order` (2026-09-24, 브랜치 `feat/T-14-transition-order`)

- `supabase/migrations/0099_transition_order.sql` — **파일 번호 0099는 임시.** DB 담당(서동혁)과 번호 확정 후 이름만 바꾼다. T-53(`refund_channel` 타입 교체)보다 뒤 번호여야 한다 — 이 함수가 그 타입을 쓰므로 먼저 있으면 T-53의 타입 교체가 막힌다. 번호 확정 전에는 dev에 Merge하지 않는다.
- 시그니처는 Architecture "DB 함수" 표 그대로. `SECURITY INVOKER`, anon·authenticated 실행 권한 제거, service_role만 실행.
- 동작: 행 잠금(`FOR UPDATE`) → 없음 `ORDER_NOT_FOUND` → `p_from`이 종료 상태면 `TERMINAL_STATE` → 현재 상태 ≠ `p_from`이면 `STATE_CHANGED` → 상태·시각 갱신(현금 수령 확인은 `paid_at`·`cooking_started_at` 동시) → 취소·환불·만료면 재고 복구 → 이력 1행.
- 허용 전환 쌍은 검사하지 않는다(TS 상태 머신이 단일 원본, DECISIONS #8).
- `tests/integration/transitionOrder.test.ts` 16개: 시각 기록, 재고 복구(같은 메뉴 여러 줄 합산), 환불 경로, 시스템 만료 이력, CAS 실패 시 무변경, 동시 요청 2개 중 1개만 성공(재고 이중 복구 없음), 종료 상태 4종, 없는 주문, anon 호출 거부(42501).
- 현금 주문만 테스트 데이터로 쓴다. 계좌이체 주문은 T-53 전후로 `transfer_method` 컬럼 조건이 달라서다.
- 함수 없음으로 14개 실패 확인 후 구현. 로컬 Supabase(Docker Desktop)에서 `npm run test:integration` 17개 통과, `npm run test` 109개·`typecheck`·`lint` 통과.
- 남은 일: 파일 번호 확정, Supabase 저장소 구현체(`OrderRepository.transition` → rpc + 에러 변환), 이력 조회.
