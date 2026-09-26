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

## P1 실기기 QA 시작 조건

1. T-13 충돌 해결·병합 후 인증된 `/admin` 페이지에서 T-15 대시보드 렌더링.
2. T-15 #51 병합 후 T-16 #54의 base를 `dev`로 정리하고 API·UI 연결 재검증.
3. T-09 주문 화면과 T-11 고객 상태 화면 연결, T-25 배포 URL 확보.
4. 테스트 메뉴·재고·관리자 계정을 준비한 뒤 [P1 QA 시나리오](P1-QA-Scenario.md) QA-P1-01~16을 실기기에서 순서대로 실행하고 결과를 기록.

위 조건 전에는 P1 완료나 실기기 QA 통과로 표시하지 않는다.
