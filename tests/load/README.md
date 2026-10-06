# T-29: 로컬 격리 환경 전용 부하 검증

N-06은 **여러 클라이언트 합산 주문 생성 30 RPS**, HTTP 오류율 **0%**, 주문 생성 성공률 **100%**, 메뉴·주문·상태 API 각각 **p95 < 1000ms**이다. 429도 실패다. `checks=100%`, dropped iterations=0, 예정 주문 수와 상태 조회 완료 수까지 검사한다. 기본 30초면 주문 900건 + 메뉴/상태 조회가 발생한다(전체 HTTP 30 RPS가 아님).

## 허용 환경과 사전 준비

이 도구는 **전용 로컬 폐기 가능 Supabase + 로컬 프로덕션 빌드**에서만 실행한다. 원격/공용/운영 URL에는 예외 옵션이 없다. localhost 포트가 운영 DB로 터널링/프록시되지 않았는지도 확인한다. 실제 고객, 관리자, cron/sweep, 다른 테스트 프로세스를 차단한다.

1. 별도 로컬 Supabase에 최신 dev 마이그레이션(특히 0018 T-51)과 시드를 적용한다. 기존 주문이 하나라도 있으면 prepare가 중단된다. 공용 DB의 데이터를 복사하지 않는다.
2. **로컬 DB에만** `tests/load/local-only.sql`을 설치한다. 배포 마이그레이션 폴더에 넣지 않는다. RPC는 SECURITY INVOKER이며 service_role만 실행할 수 있다. 일반 고객에게는 권한이 없다.
3. 로컬 재고를 기록한 뒤 메뉴당 `30 × 실행초 + 여유분` 이상으로 준비한다. prepare가 테스트 재고와 pickup_number를 DB에 저장한다. cleanup은 그 기준값으로 복구한다. 시험용 증량 전 값까지 자동으로 낮추지는 않는다. 최종적으로 로컬 DB를 폐기/재시드한다.
4. 환경 파일을 자동으로 읽지 않는 cleanup 전용 변수와 앱 변수를 명시한다. `.env.local`/`.env.production*`이 원격 DB를 가리키면 사용하지 않는다. 로컬 URL을 설정한 상태에서 **새로 build**한다. 이전 운영 빌드를 재사용하지 않는다.

```sh
# POSIX shell 예시. PowerShell에서는 $env:NAME='value' 형태로 설정한다.
export LOAD_TEST_ISOLATED=YES
export LOAD_TEST_RUN_ID=$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))")
export LOAD_TEST_SUPABASE_URL=http://127.0.0.1:54321
export LOAD_TEST_SERVICE_ROLE_KEY='<로컬 service role key>'
export NEXT_PUBLIC_SUPABASE_URL="$LOAD_TEST_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY='<로컬 anon key>'
export SUPABASE_SERVICE_ROLE_KEY="$LOAD_TEST_SERVICE_ROLE_KEY"
export BASE_URL=http://127.0.0.1:3000

# 앱/작업 프로세스가 중지된 상태에서 기준값 저장
npm run test:load:cleanup -- --prepare
npm run build
npm start -- --hostname 127.0.0.1
```

동일한 환경 변수를 설정한 별도 터미널에서 실행한다. 서비스 키는 k6에 전달할 필요가 없다.

```sh
npm run test:load
# 1..120초 지원, RATE는 30 고정
k6 run -e DURATION=10s tests/load/order-create.js
```

k6는 주문을 보내기 전에 `/api/load-test/preflight`에서 **앱이 실제 사용하는 DB URL** 및 준비된 run ID를 대조한다. 앱의 격리 플래그, 로컬 DB, 준비 RPC 중 하나라도 없으면 중단한다. Cloudflare 헤더가 있으면 거부하며 redirect도 따라가지 않는다. URL과 run ID는 출력하지만 키는 출력하지 않는다.

60개의 고정 benchmark IP(`198.18.0.1..60`)를 iteration 순서로 `x-forwarded-for`에 분산한다. 클라이언트당 약 30건/분이므로 T-51 100건/60초 안쪽이다. 테스트 직전 기존 rate-limit window가 없도록 새 DB를 쓰거나 마지막 실행 후 최소 60초 기다린다. IP 제한 자체는 기존 `t51-rate-limit.test.ts`의 100/101번째 요청 테스트로 별도 검증한다. **cf-connecting-ip 위조, 운영 제한 해제/우회는 금지**한다.

## 정리 및 실패 복구

k6 종료 후 앱과 sweep/관리자 프로세스를 중지하고 in-flight 요청이 끝난 것을 확인한다. 같은 로컬 URL·키·run ID로 실행한다.

```sh
npm run test:load:cleanup -- --dry-run
npm run test:load:cleanup
# 재실행은 alreadyCleaned로 반환하며 재고를 더하지 않는다.
```

단일 RPC 트랜잭션 안에서 테이블 잠금 → run 키 확인 → 상태/재고/카운터 검증 → pending 재고 복구 → 주문 CASCADE 삭제 → pickup 기준값 복원 → 완료 표식을 수행한다. UUID는 text로 변환해 정확한 run 패턴을 검사한다. REST 페이지 제한과 관계없이 모든 행을 처리한다.

- 실제/다른 run 주문, 수동 주문, 누락 주문, 예상 밖 상태(paid/cooking/completed), 재고 편집, 메뉴 추가/삭제, 카운터 변경이면 **전체 abort**한다.
- cancelled/refunded/expired는 기존 transition_order에서 복구됐으므로 다시 가산하지 않는다. 재고 기준값 검증도 통과해야 한다.
- pickup_number가 원래 없었으면 행을 제거하고, 있었으면 저장된 값을 복원한다. 중간 빈 번호나 실제 주문 혼입은 복원을 허용하지 않는다.
- 잠금 timeout, deadlock, DELETE/UPDATE 실패는 전체 rollback된다. 개별 단계만 재시도하거나 baseline을 수동 수정하지 않는다. 실행 프로세스를 정지하고 원인을 확인한다. 응답 유실 시 같은 run으로 재호출할 수 있다.
- prepare/cleanup과 주문 실행은 동시에 진행하지 않는다. 새 부하 실행에는 새 run ID 및 새 prepare가 필요하다.

## 운영 Cloudflare 검증은 별도 작업

이 스크립트와 cleanup은 운영에서 실행하지 않는다. 운영 p95 확인이 필요하면 별도 승인된 관측 절차에서 실제 클라이언트 IP 및 **IP당 100건/60초 미만**을 지키고, 가능하면 기존 트래픽의 관측 지표를 사용한다. 단일 IP 저속 p95 측정은 N-06 합산 30 RPS 통과 근거가 아니다. 운영에서 x-forwarded-for 분산으로 제한을 우회하지 않는다.

## 검증

- `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`
- 격리 Supabase에서 `npm run test:integration` (T-51 포함)
- 별도 폐기 DB에서 `tests/load/cleanup.test.sql`: 실패 rollback, dry-run, 재실행, 혼입, 상태별 복구, 1000건 초과, baseline 복원
- `tests/load/summary.json`과 `summary.txt` 보관. mock/smoke 결과를 실제 N-06 성능 통과로 보고하지 않는다.
