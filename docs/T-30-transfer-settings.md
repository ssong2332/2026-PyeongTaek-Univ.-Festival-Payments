# T-30 운영 계좌(송금 정보) 입력 절차

상태: 운영 절차 — 앱 배포(#50, T-25 ②) 전에 실행한다.
담당: 계좌 입력 — 팀장(박수홍). `seed.sql` 운영 적용과 입력 확인 — 서동혁(DB1). `seed.sql` 작성·유지 — 김 혁(DB2). (DECISIONS #47)

기준: ADR-0004(설정 저장과 실제 값 입력 경로), Architecture 설정 API(`transfer.*`는 200자 이하 문자열, 빈 문자열 = 미입력),
PRD F-44(설정값이 비면 고객 화면에 "입금 안내를 준비 중"), N-05(계좌번호 커밋 금지), `supabase/seed.sql`.

## 기록 금지

- 실제 은행명·계좌번호·예금주는 GitHub(문서·PR·커밋·이슈)·노션·단톡·스크린샷 어디에도 남기지 않는다.
- 이 문서에도 값이나 값 예시를 적지 않는다. 확인 결과는 참/거짓(예: "3개 모두 채워짐")만 공유한다.

## 왜 따로 입력하는가

- `seed.sql`은 `transfer.bank_name`·`transfer.account_number`·`transfer.account_holder`를 빈 문자열로 넣는다(ADR-0004).
  `ON CONFLICT (key) DO NOTHING`이라 seed를 다시 실행해도 값이 채워지지 않고, 입력한 값을 덮어쓰지도 않는다.
- 설정 패널(T-52)이 아직 없어 배포 전 입력 경로는 Supabase Table Editor뿐이다.
  Table Editor는 앱의 입력 검증을 거치지 않으므로 아래 규칙은 사람이 지킨다.
- 3개 중 하나라도 비어 있으면 고객 화면은 계좌 대신 "입금 안내를 준비 중"을 보여 계좌이체를 쓸 수 없다(F-44).
  앱은 앞뒤 공백을 지운 뒤 판단하므로(`settingsService`의 `trim()`) 공백만 넣은 값도 빈 값으로 본다.

## 순서

| 순서 | 할 일 | 담당 |
|---|---|---|
| 1 | 운영 DB에 `seed.sql` 1회 실행(SQL Editor — Architecture 배포 절 "DB·상태 마이그레이션") | 서동혁(DB1) |
| 2 | Table Editor에서 계좌 3개 입력(아래 2) | 팀장 |
| 3 | 값을 보지 않고 채워졌는지 확인(아래 3) | 서동혁(DB1) |
| 4 | 1~3을 앱 배포 전에 끝낸다 | — |

1과 2의 순서가 바뀌어도 값은 보존된다(seed가 이미 있는 키를 건너뛴다). 다만 2를 먼저 하면 3개 행을 직접 새로 만들어야 하므로 1 → 2 순서를 쓴다.

## 2. 입력 (팀장)

1. Supabase 대시보드에서 운영 프로젝트를 열고 **Table Editor → `public.app_settings`**로 간다.
2. `key`가 아래 3개인 행의 `value`만 고친다. `key`는 바꾸지 않고, 다른 설정 행은 건드리지 않는다.

| key | 넣는 것 | 규칙 |
|---|---|---|
| `transfer.bank_name` | 고객 화면에 보일 은행명 | 200자 이하 |
| `transfer.account_number` | 고객이 [계좌번호 복사]로 은행 앱에 붙여 넣을 계좌번호 | 200자 이하, 은행 앱이 받는 형태 그대로 |
| `transfer.account_holder` | 예금주명 | 200자 이하, 은행 앱의 수취인 확인 이름과 같게 |

3. 저장한 뒤 값을 다른 곳에 옮겨 적지 않는다.

## 3. 확인 (DB1 — 값을 보지 않는다)

SQL Editor에서 실행한다. 결과에는 참/거짓만 나온다.

```sql
SELECT key,
       btrim(value, E' \t\r\n') <> '' AS filled,
       char_length(value) <= 200      AS within_limit
FROM public.app_settings
WHERE key IN ('transfer.bank_name', 'transfer.account_number', 'transfer.account_holder')
ORDER BY key;
```

- 기대 결과: 3행, 모든 열 `true`. 단톡에는 "transfer 3개 모두 true"처럼 결과만 공유한다.
- 3행이 아니면 1단계(seed 적용)를 먼저 확인한다. `false`가 있으면 해당 `key` 이름만 팀장에게 알린다.

## 바꿀 때와 행사 후

- 계좌를 바꿔야 하면 2 → 3을 다시 한다. T-52 설정 패널이 생기면 패널이 1차 경로다(ADR-0004).
- 행사 종료 후 계좌 설정 정리 정책은 `T-30-data-purge.md`대로 팀장이 정한다.
