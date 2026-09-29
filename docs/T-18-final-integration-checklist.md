# T-18 최종 통합 검증 준비 (2026-09-27)

T-18 서비스·API [Draft PR #52](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/52)의 리뷰 완료 기준과 실행 순서다. 이 문서는 운영 적용이나 T-18 완료 판정이 아니다.

## 지금 확인한 근거

| 완료 기준 | 현재 근거 | 최종 확인 |
|---|---|---|
| 9분 59초/10분 경계·설정값 반영 | `tests/integration/sweep_expire.sql`: 기본 10분, 20분 변경, 다음 호출 즉시 반영 | 운영과 같은 마이그레이션 조합으로 재실행 |
| 현금 만료·송금 신고 제외 | 위 SQL: 현금·계좌이체 경계, 신고된 송금 주문 제외 | 관리자 화면에서 상태 확인 |
| 만료 직전 입금 확인 | `tests/integration/sweep_expire_transition.sql`: 실제 `transition_order`로 먼저 입금 확인한 주문은 스윕에서 제외 | 관리자 API와 스윕의 동시 요청 검증 |
| 재고 복구·system 이력 | 위 SQL: 실제 T-14 함수로 재고 1회 복구, `actor_type='system'`·`actor_id IS NULL`·`closed_at` 확인 | 운영용 테스트 주문으로 재확인 |
| 실제 관리자 세션·반복 호출 | `tests/unit/api/adminSweepRoute.test.ts`는 인증·RPC·오류를 모의 검증 | T-13 병합 뒤 실제 세션으로 401/200/반복 0건 확인 |
| pg_cron·대시보드 폴백 | `0015_pg_cron.sql`과 CI의 `tests/integration/pg_cron.sql`, T-16 `useSweepHeartbeat` Draft | 배포 DB에서 잡 실행 이력, 관리자 대시보드 30초 폴백 확인 |

## pg_cron 확인 및 적용 순서

2026-09-27 Supabase **2026-PyeongTaek-Univ.-Festival-Payments** Free 프로젝트의 읽기 전용 SQL 결과: `pg_available_extensions`에 `pg_cron` **1.6.4**가 있고, `shared_preload_libraries`에도 포함돼 있다. `installed_version`은 **NULL**이며 대시보드에는 **Install integration**이 표시된다. 따라서 **설치 가능 상태로 보이나 아직 설치·스케줄 등록되지 않았다.** 운영 DB에 기능 마이그레이션이 아직 적용되지 않아 여기서 확장을 설치하지 않았다.

1. T-14·T-17·T-32 및 `0011`·`0012`의 운영 적용과 스키마·함수 검증을 마친다.
2. 별도 파일 `0015_pg_cron.sql`을 적용한다. 환경에 확장이 없으면 NOTICE만 남기고 스케줄은 생기지 않는다. 지원 환경에서는 `sweep-orders`를 1분 주기로 등록하며 같은 이름 재실행 시 갱신한다.
3. `SELECT jobname, schedule, command, active FROM cron.job WHERE jobname='sweep-orders';`로 등록을, `cron.job_run_details`의 최근 결과로 실제 실행 성공을 확인한다. 작업 실행 오류 시 원인을 고친다.
4. 관리자 대시보드를 열고 T-16의 30초 `POST /api/admin/sweep` 폴백을 실제 세션으로 확인한다. pg_cron 미지원·미설치일 때는 이 폴백이 유일한 실행 경로이므로 대시보드가 닫히면 스윕도 멈춘다.

최종 검증 전에는 PR #52를 Draft로 유지한다. 원작업 T-18의 완료 판정은 팀장 검수 후 진행한다.

## 2026-09-29 재검수 후 남은 실환경 검증

`0015_pg_cron.sql`, CI의 잡 등록 검사, 실제 `transition_order`를 사용한 입금 확인 후 스윕 제외 테스트는 자동 검증 근거로 확인했다. 2026-09-29 현재 [#48](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/48) 인증과 [#51](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/51) 대시보드는 미병합이며, [#54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54)는 #51 기반 Draft다. 아래 항목은 **미검증**으로 유지한다.

| 항목 | 최종 검증 방법과 기록할 결과 |
|---|---|
| 실제 관리자 인증 | #48 통합 후 테스트 관리자 세션으로 `POST /api/admin/sweep`를 호출해 200 및 `{expired, completed}` 값을 확인한다. 비로그인 요청은 401인지 확인한다. 같은 시각에 반복 호출해 추가 전환이 0건인지도 확인한다. 테스트 환경·시각·응답 상태만 기록하고 세션 정보는 남기지 않는다. |
| 대시보드 30초 폴백 | #51 대시보드와 #54의 `useSweepHeartbeat`를 실제 인증 화면에 연결한다. 화면을 연 동안 약 30초 간격으로 요청이 발생하고, 스윕 결과에 전환이 있으면 주문 목록이 갱신되는지 확인한다. 탭 종료와 재진입 시 타이머 및 중복 요청 동작도 확인한다. |
| 배포 DB의 pg_cron | 선행 마이그레이션 적용 후 `0015_pg_cron.sql`을 배포 DB에 적용한다. `cron.job`에서 `sweep-orders`가 1분 주기·활성 상태이고 명령이 `SELECT public.sweep_order_timeouts()`인지 확인한다. 1분 이상 지난 뒤 `cron.job_run_details`의 해당 작업 실행 시각·상태·오류를 확인한다. CI의 잡 등록 검사는 배포 DB 실행 성공의 근거로 대신하지 않는다. |
| pg_cron 미지원·미설치 | 확장과 잡이 없는 격리된 테스트 환경에서 대시보드를 열어 인증된 30초 폴백으로 만료 주문이 전환되고 목록이 갱신되는지 확인한다. 운영 DB에서 확장을 제거해 이 경우를 만들지 않는다. |
| 입금 확인과 스윕의 동시 요청 | 격리된 실제 PostgreSQL 테스트 DB에서 만료 경계의 주문에 관리자 입금 확인과 스윕 요청을 겹쳐 실행한다. 최종 상태가 한 번만 전환되고 `order_status_history`가 그 상태와 일치하는지, 재고가 정확히 한 번만 복구되는지 확인한다. 스윕을 반복해도 추가 복구가 없는지 확인하고 요청 순서·최종 상태·이력·재고 전후 수량을 기록한다. |

실환경 결과가 채워지고 선행 PR이 통합되기 전까지 [#52](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/52)는 Draft이며 T-18 완료로 표시하지 않는다.
