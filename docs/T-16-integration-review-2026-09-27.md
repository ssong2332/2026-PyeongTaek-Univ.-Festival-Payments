# T-16 관리자 주문 상태 변경 사전 검증 — 2026-09-27

[#54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54)는
[#51](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/51) 기반의 Stacked Draft다.
2026-09-27 현재 #51과 관리자 인증 [#48](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/48)은 미병합이다.
따라서 #54의 base를 `dev`로 바꾸거나 실제 인증 세션 검수를 완료한 것으로 표시하지 않는다.

| 검수 항목 | 현재 근거 | 남은 확인 |
|---|---|---|
| #51 병합 후 base 변경 | 현재 base는 `codex/T-15-dashboard-ui-clean`이며 중복 T-15 변경은 stacked diff로 관리한다. | #51 병합 뒤 #54를 최신 `dev`에 맞추고 base를 `dev`로 변경한 뒤 diff 확인 |
| 인증된 `/admin` 연결 | 별도 [T-15 통합 검증 브랜치](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/tree/codex/T-15-review-integration)에 #48·#51·#54를 조합해 `LiveOrderDashboard`를 보호 페이지에 렌더링했다. | 실제 관리자 계정 로그인 후 API·UI 확인 |
| 현금 주문 | API→PostgreSQL 통합 테스트에서 `pending → cooking`, 결제·조리 시작 시각, 관리자 이력을 확인한다. | 실제 화면에서 전환 전후 서버 상태 대조 |
| 계좌이체 주문 | API→PostgreSQL 통합 테스트에 `pending → paid → cooking → completed`, 시각 필드와 세 단계 이력 검증을 추가했다. | 실제 로그인 세션의 주문으로 전체 흐름 확인 |
| 불허·중복·409 | #60의 API 단위 테스트는 불허 동작과 409를 확인한다. #54의 DB 통합 테스트에 불허 현금 확인, 동시 입금 확인 2건 중 1건만 성공, 이력 1건을 유지했다. UI 테스트는 중복 클릭 차단과 409 발생 시 목록 재조회를 확인한다. | 실제 화면에서 409 후 표시 상태와 DB 상태 대조 |
| 데스크톱·모바일 | `/dev/admin` 목업을 1440×900에서 계좌이체 입금 확인→조리 시작→완료, 390×844에서 현금 수령 확인→조리 완료 버튼과 상태 표시를 확인했다. 모바일 가로 넘침은 없었다(`scrollWidth=clientWidth=390`). | 인증된 실제 `/admin`의 화면 캡처와 동작 기록 첨부 |

T-17의 취소·환불은 #54 완료 조건에 포함하지 않는다. #51·#48 통합 및 실제 계정 검증 전까지 #54는 Draft로 유지한다.

## 2026-09-29 공통 API 결정과 #54 정리 순서

공동팀장 검토 결과 [#60](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/60)을 T-16·T-17의 **단일 상태 전환 API**로 사용한다. #60의 관리자 action 6종 제한과 주문 ID UUID 검증 보완·재검수 후 #60을 먼저 `dev`에 병합한다. 2026-09-29 현재 #60·#51·#48은 미병합이며 #54는 #51 기반 Draft다.

1. #60 병합 후 최신 `dev`를 반영한다. #54의 중복 `src/app/api/admin/orders/[id]/transition/route.ts`와 `tests/unit/api/adminTransitionRoute.test.ts`를 PR diff에서 제거한다. #60의 Route Handler와 요청 DTO가 남는지 확인한다.
2. T-16 관리자 상태 변경 UI(`OrderActionButtons`, `OrderDashboard`, `LiveOrderDashboard`)와 UI 회귀 테스트는 유지한다. [#58](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/58)의 T-17 취소·환불 UI도 같은 API에 연결할 수 있도록 별도의 4종 API를 병합하지 않는다.
3. `tests/integration/t16-admin-transition-route.test.ts`의 **3개 PostgreSQL 통합 테스트는 보존**하고 #60 API를 호출하도록 재검증한다. 계좌이체 입금 확인 → 조리 시작 → 완료, 현금 수령 → 조리중, 불허 전환 및 동시 중복 요청의 200/409·상태 이력 검증을 유지한다.
4. #51 병합 후 #54의 base를 `dev`로 변경하고, diff에 T-15 선행 구현과 중복 API가 남지 않았는지 확인한다. #48 인증 통합 후 실제 관리자 세션에서 API·UI를 검증한다.

## 2026-09-30 공통 API 병합 반영

#60이 `dev`에 병합되어 #54에 최신 `dev`와 #51을 반영했다. 중복된 4종 action Route Handler와 단위 테스트는 제거했으며, #60의 6종 action·사유·환불 경로·UUID 검증 구현을 사용한다. #69의 관리자 주문 ID 검증과 기존 optional 라우트 시그니처도 유지했다.

PostgreSQL 통합 테스트 3개는 그대로 두고 #60 라우트를 호출한다. #51이 아직 미병합이므로 #54의 base는 #51로 유지한다. #51 병합 후 base를 `dev`로 변경해 T-16 UI와 통합 테스트만 남는지 다시 확인한다. 실제 관리자 세션 검증 전까지 Draft를 유지한다.
