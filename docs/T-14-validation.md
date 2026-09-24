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
