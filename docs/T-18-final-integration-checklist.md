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
| pg_cron·대시보드 폴백 | `0015_pg_cron.sql`과 T-16 `useSweepHeartbeat` Draft | 배포 DB에서 잡 실행 이력, 관리자 대시보드 30초 폴백 확인 |

## pg_cron 확인 및 적용 순서

2026-09-27 Supabase **2026-PyeongTaek-Univ.-Festival-Payments** Free 프로젝트의 읽기 전용 SQL 결과: `pg_available_extensions`에 `pg_cron` **1.6.4**가 있고, `shared_preload_libraries`에도 포함돼 있다. `installed_version`은 **NULL**이며 대시보드에는 **Install integration**이 표시된다. 따라서 **설치 가능 상태로 보이나 아직 설치·스케줄 등록되지 않았다.** 운영 DB에 기능 마이그레이션이 아직 적용되지 않아 여기서 확장을 설치하지 않았다.

1. T-14·T-17·T-32 및 `0011`·`0012`의 운영 적용과 스키마·함수 검증을 마친다.
2. 별도 파일 `0015_pg_cron.sql`을 적용한다. 환경에 확장이 없으면 NOTICE만 남기고 스케줄은 생기지 않는다. 지원 환경에서는 `sweep-orders`를 1분 주기로 등록하며 같은 이름 재실행 시 갱신한다.
3. `SELECT jobname, schedule, command, active FROM cron.job WHERE jobname='sweep-orders';`로 등록을, `cron.job_run_details`의 최근 결과로 실제 실행 성공을 확인한다. 작업 실행 오류 시 원인을 고친다.
4. 관리자 대시보드를 열고 T-16의 30초 `POST /api/admin/sweep` 폴백을 실제 세션으로 확인한다. pg_cron 미지원·미설치일 때는 이 폴백이 유일한 실행 경로이므로 대시보드가 닫히면 스윕도 멈춘다.

최종 검증 전에는 PR #52를 Draft로 유지한다. 원작업 T-18의 완료 판정은 팀장 검수 후 진행한다.
