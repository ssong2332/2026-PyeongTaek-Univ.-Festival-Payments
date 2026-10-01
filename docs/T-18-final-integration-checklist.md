# T-18 pg_cron 최종 통합 검증 체크리스트

이 문서는 #52에서 분리한 `0019_pg_cron.sql`의 적용·운영 검증을 기록한다. #52의 관리자 스윕 API가 병합되어도 자동 만료가 바로 실행되는 것은 아니다. 실행 경로인 0019 cron 또는 #54의 30초 대시보드 heartbeat 연결이 필요하다.

## 사전 조건

- 운영 DB의 적용 순서: `0016` → `0017` → `0018`(#62) → `0019`. `0019`는 #62 병합 및 운영 적용 뒤에 `supabase db push`로 적용한다.
- `0011`·`0012`의 `sweep_order_timeouts` 함수와 선행 T-17·T-32의 실제 동작을 확인한다.
- #52의 인증된 `POST /api/admin/sweep`와 #54의 30초 heartbeat는 별도 통합 대상으로 기록한다.

## 확인 근거와 남은 검증

| 항목 | 자동 검증 | 배포 환경에서 확인할 결과 |
|---|---|---|
| pg_cron 가용성 | `0019_pg_cron.sql`이 미지원 환경에서는 NOTICE 후 종료 | 운영 Supabase에서 확장 설치 가능 여부와 설치 상태 |
| 잡 등록·중복 방지 | CI의 `tests/integration/pg_cron.sql`이 1분 주기 `sweep-orders` 잡 1개를 확인 | `cron.job`의 활성 상태·주기·명령; 재적용 시 잡 1개 유지 |
| CI 정리 | 검증 뒤 `cron.unschedule('sweep-orders')` 실행·잔여 잡 0개 확인 | 해당 없음 |
| 실제 실행 | 자동 테스트는 잡 등록까지만 확인 | `cron.job_run_details`의 실행 시각·성공 상태·오류 |
| 폴백 | #52 API와 #54 heartbeat는 각각 별도 검증 | pg_cron 미지원·미설치 환경에서 인증된 30초 heartbeat가 주문을 갱신하는지 확인 |
| 동시 전환 | `tests/integration/sweep_expire_transition.sql`에서 입금 확인 후 스윕 제외 확인 | 관리자 입금 확인과 스윕 동시 요청에서 이중 전환·중복 재고 복구가 없는지 확인 |

2026-09-27 읽기 전용 조회에서 운영 Supabase Free 프로젝트의 `pg_cron` 1.6.4는 사용 가능하고 `shared_preload_libraries`에도 포함돼 있었으나 `installed_version`은 NULL이었다. 이 결과는 현재 설치·실행 성공의 근거가 아니므로 `0019` 적용 뒤 다시 확인한다.

위 운영 검증과 선행 PR 통합 전까지 이 PR은 Draft로 유지한다.
