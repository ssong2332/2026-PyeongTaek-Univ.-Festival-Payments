# P1 현금 주문 흐름 사전 점검 — 2026-09-27

이 문서는 [P1 QA 시나리오](P1-QA-Scenario.md)의 실행 전 준비 상태를 기록한다. **실기기 QA 통과 기록이 아니다.** 기준은 2026-09-27 `dev` 커밋 `c062e00` 및 아래 PR 상태다.

## 현재 확인된 범위

| 시나리오 | 현재 상태 | 근거 |
|---|---|---|
| QA-P1-01~04 메뉴·옵션·장바구니·현금 선택 | 화면 검수 미실행 | `dev`의 `src/app/(customer)` 및 고객 컴포넌트에는 README만 있다. 주문 화면 T-09 연결이 필요하다. |
| QA-P1-05~06 주문 생성·재고 차감 | API/DB 자동 검증, 화면 검수 미실행 | T-07·T-08 [PR #46](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/46)은 `dev`에 병합됐다. 주문 화면과 배포 환경에서의 수동 확인은 남았다. |
| QA-P1-07 관리자 로그인 | 차단 | T-13 [PR #48](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/48)이 미병합이며 `mergeable_state=dirty`다. |
| QA-P1-08~09 주문 표시·확인 | 화면 연결 대기 | T-15 [PR #51](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/51)은 CI 통과한 Draft다. 인증된 `/admin` 페이지 연결이 남았다. |
| QA-P1-10~11 현금 수령·완료 | API/DB 자동 검증, 화면 검수 미실행 | T-16 [PR #54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54)는 #51 기반 Draft다. [CI](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/actions/runs/36265618177)에서 실제 PostgreSQL 전환·이력 통합 테스트가 통과했다. |
| QA-P1-12~13 고객 상태·잘못된 토큰 | 화면 검수 미실행 | 고객 상태 화면 T-11이 `dev`에 없다. |
| QA-P1-14~15 재고 부족·중복 주문 | API/DB 자동 검증, 화면 검수 미실행 | PR #46의 통합 테스트 근거가 있으나 고객 화면 오류 안내·연타 동작은 검수 전이다. |
| QA-P1-16 새로고침 유지 | 화면 검수 미실행 | 고객 상태 화면 T-11 연결 후 확인 가능하다. |

배포 경로 T-25 [PR #50](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/50)도 미병합이므로 배포 URL·실기기 검수는 아직 시작하지 않았다.

## T-13 병합 충돌 사전 분석

`git merge-tree origin/dev origin/feat/T-13-admin-auth` 결과 충돌은 다음 두 파일의 add/add다.

- `src/infra/supabase/session.ts`: 양쪽 구현은 같고 주석 한 줄만 다르다.
- `tests/unit/infra/supabase/session.test.ts`: 양쪽이 같은 세션 동작을 서로 다른 방식으로 테스트한다.

T-13 고유의 로그인·보호 레이아웃·로그아웃 파일은 이 분석에서 충돌하지 않았다. 충돌 해결 시 `dev`의 세션 구현과 테스트를 기준으로 T-13 고유 파일을 합친 뒤, 인증 라우트 테스트·전체 CI를 다시 실행하면 된다. **이 문서는 T-13 담당자의 PR 브랜치를 수정하거나 병합하지 않는다.**

### 임시 통합 리허설

별도 [참고 브랜치](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/tree/codex/P1-integration-check)에서 최신 `dev`에 T-13을 위 방식으로 병합하고 T-15·T-16 Draft 브랜치를 합쳤다. T-13의 인증된 `/admin` 자리표시자 페이지에 `LiveOrderDashboard`를 렌더링하도록 연결한 뒤 **단위 테스트 231개, ESLint, Next webpack 빌드가 로컬에서 통과**했다. 이는 코드 조합 가능성을 확인한 결과이며 실제 관리자 계정 로그인이나 배포 환경 검증은 아니다. 세 원본 PR의 브랜치는 변경하지 않았다.

참고 브랜치의 GitHub Actions에서도 [CI 단위·빌드 및 Supabase 통합 작업](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/actions/runs/36266340063)과 [PostgreSQL sweep 검증](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/actions/runs/36266340054)이 모두 통과했다.

빌드에서는 T-13의 `src/middleware.ts`가 Next 16에서 `proxy.ts`로 대체된다는 사용 중단 경고가 나왔다. 최종 연결 PR에서 현재 Next 가이드에 맞춰 정리하고 재검증해야 한다.

## P1 실기기 QA 시작 조건

1. RLS [#43](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/43)의 12개 테이블 모두에 연결된 fixture를 보완하고, 실제 데이터가 있는 상태에서 접근 정책을 검증한 뒤 최종 검수를 마친다.
2. T-13 인증 [#48](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/48)을 통합하고, 실제 관리자 로그인 및 비로그인 차단을 확인한다. 인증된 `/admin` 페이지에 T-15 대시보드를 연결한다.
3. T-15 [#51](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/51) 병합 후 T-16 [#54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54)의 base와 중복 변경을 정리한다. [#60](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/60)과 #54의 중복 transition API를 단일 구현으로 확정하고 관리자 UI와 연결해 검증한다.
4. T-09 고객 주문 화면과 T-11 고객 상태 화면을 `dev`에 통합한다. T-11 [#61](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/61)의 API 병합과 고객 상태 화면 연결은 각각 확인한다.
5. T-25 [#50](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/50)의 테스트 배포 URL에서 접속과 DB 연결을 확인하고, 관리자 계정·테스트 메뉴·재고를 준비한다.
6. 준비 완료 후 [P1 QA 시나리오](P1-QA-Scenario.md) QA-P1-01~16을 실제 배포 환경과 기기에서 순서대로 실행하고 결과를 별도로 기록한다.

위 조건 전에는 P1 완료나 실기기 QA 통과로 표시하지 않는다.

## 2026-09-28 재점검

- P1 QA 시나리오의 장바구니 금액 기대식을 `(메뉴 가격 + 옵션 추가 금액) × 수량`으로 바로잡았다. 기존 식은 메뉴 가격에 수량을 곱하지 않아, 수량이 2 이상일 때 잘못된 합계를 정답으로 판정할 수 있었다. `tests/integration/createOrder.test.ts`의 3,000원 메뉴 + 500원 옵션 × 2개 = 7,000원 검증과 일치한다.
- T-13 인증 [#48](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/48)과 T-25 배포 [#50](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/50)은 여전히 미병합이다. T-15 [#51](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/51), T-16 [#54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54)는 Draft다. T-09 고객 주문 화면과 T-11 고객 상태 화면은 현재 P1 참고 브랜치에 없다.
- 따라서 QA-P1-01~16의 실제 고객·관리자 연속 조작, 배포 URL 및 실기기 검수는 실행할 수 없다. 09-27 참고 브랜치의 관리자 코드 조합 검증은 유효한 사전 근거이지만 P1 완료 판정 근거는 아니다.

## 2026-09-29 재점검

| 선행 작업 | 확인된 상태 | P1에서 추가로 확인할 내용 |
|---|---|---|
| T-11 주문 상태·대기인원 API [#61](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/61) | 신규 PR이 올라왔고 CI는 통과했으나 미병합이다. API 구현 근거이며 고객 상태 화면의 통합·검수 근거는 아니다. | API를 `dev`에 통합하고 고객 상태 화면에서 실제 주문 조회·대기인원 표시·잘못된 토큰·새로고침을 검증한다. |
| RLS 검증 [#43](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/43) | 12개 테이블의 fixture 보완 요청과 최종 검수가 남아 있다. | 모든 테이블에 연결된 fixture로 정책을 재검증하고 최종 검수 결과를 확인한다. |
| T-16 공통 API [#60](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/60)·[#54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54) | 같은 transition API의 중복 구현 정리가 남아 있다. | 단일 API를 확정하고 관리자 상태 변경 UI가 해당 API를 호출하는지 확인한다. |
| T-25 테스트 배포 [#50](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/50) | PR 문서의 예정 URL은 `https://ptu-festival-payments.workers.dev`이나, 실제 테스트 배포 접속 및 운영 데이터 준비는 확인되지 않았다. | URL 접속·DB 연결, 관리자 계정 로그인, 메뉴·재고 준비 상태를 확인한다. |

현재 `dev`에는 T-09 고객 주문 화면과 T-11 고객 상태 화면이 통합되지 않았다. 따라서 고객 주문 생성부터 관리자 완료 처리까지 연속 조작할 수 없다. **QA-P1-01~16은 모두 미실행/Blocked**로 유지한다. API·DB 자동 테스트와 CI 결과는 사전 검증 근거로만 기록하며, 위 시작 조건을 충족한 뒤 실제 QA 결과를 별도로 남긴다.
