# ADR-0004: 설정값 저장 — 환경변수 vs 설정 테이블

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

F-44(송금 정보 — 은행명·계좌번호·예금주·카카오페이 URL·토스 URL — 코드 하드코딩 금지, 값 변경 시 코드 수정 없이 반영, 비어 있으면 "준비 중" + 경고), F-17(만료 10분 — 설정값), F-24(자동 완료 ON/OFF·N분 — 관리자 설정 화면에서 변경), N-05(계좌번호·URL은 리포지토리 커밋 금지). 2차 F-36(임계값 N)도 설정값이다.

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 전부 환경변수(Vercel 프로젝트 설정) | 저장소 없음, 읽기 코드 1줄 | F-24는 관리자가 화면에서 바꾸는 값 — 환경변수로는 불가(재배포 필요). 송금 정보 변경도 재배포. 값을 Vercel 설정에 넣는 사람이 개발자로 한정 |
| B. 전부 `app_settings` 테이블(key/value) | 관리자 화면에서 변경 즉시 반영, 재배포 없음, 값이 리포지토리에 없음(N-05 충족), 2차 설정 추가 시 행만 추가 | 테이블·API·읽기 캐시 필요. 값이 DB 백업에 남음(계좌번호는 고객 화면에 공개되는 값이라 시크릿이 아님 — N-05) |
| C. 혼합: 송금 정보=환경변수, 운영 설정=테이블 | — | 같은 성격(운영값)이 두 곳 — 팀원이 어디를 볼지 매번 판단 |

## 결정

**B.** 결정적 이유: F-24가 관리자 화면 변경을 요구하므로 테이블은 어차피 필요하고, 한 곳으로 통일하면 "설정값은 `app_settings`"라는 규칙 하나로 끝난다.

규격:

| key | 타입(문자열 저장) | 기본값(시드) | 공개 범위 |
|---|---|---|---|
| `payment.expire_minutes` | int | `10` | 관리자 |
| `auto_complete.enabled` | `true`/`false` | `false` | 관리자 |
| `auto_complete.minutes` | int | `15` | 관리자 |
| `transfer.bank_name` | text | `''` | 고객(공개) |
| `transfer.account_number` | text | `''` | 고객(공개) |
| `transfer.account_holder` | text | `''` | 고객(공개) |
| `transfer.kakaopay_url_template` | text, `{amount}` 자리표시자 선택 | `''` | 고객(공개) |
| `transfer.toss_url_template` | text, `{amount}` 자리표시자 선택 | `''` | 고객(공개) |

- 시드(`supabase/seed.sql`)에는 기본값·빈 문자열만 — 실제 계좌·URL은 절대 커밋하지 않는다(N-05). 실제 값 입력은 (1) 관리자 대시보드 설정 패널(`PUT /api/admin/settings`) 또는 (2) Supabase 대시보드 Table Editor — 절차는 T-30 문서.
- `{amount}` 자리표시자: T-34 실기기 검증에서 금액 파라미터가 동작하는 수단만 템플릿에 `{amount}`를 넣는다. 템플릿에 `{amount}`가 없으면 고객 화면은 자동으로 폴백(금액 크게 표시 + "직접 입력" 안내)을 렌더링한다 — 코드 분기가 아니라 데이터로 결정(F-42 폴백).
- 고객 API `GET /api/settings/transfer`는 `transfer.*` 키만 화이트리스트로 노출. 다섯 값 중 선택한 하위 수단에 필요한 값이 비어 있으면 응답 `configured=false` + 서버 로그 `warn settings.transfer.missing`(F-44).
- 서버 읽기 캐시 없음(요청마다 조회 — 200건/일 규모). 변경 즉시 반영.
- 환경변수로 남는 것은 인프라 시크릿뿐: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, (2차) `PHONE_ENCRYPTION_KEY`. 새 변수 도입 시 `.env.example` 플레이스홀더 갱신은 implementer 몫(T-02·T-49).

## 결과 (트레이드오프 포함)

- 얻는 것: F-44·F-24·F-17·(2차)F-36을 같은 테이블·같은 API로 처리. 재배포 없이 축제 당일 계좌 변경 가능.
- 감수하는 것: 설정 오타(예: `auto_complete.minutes`에 문자)를 막기 위해 `PUT /api/admin/settings`가 키별 zod 검증을 한다. Table Editor로 직접 넣을 때는 검증이 없으므로 T-30 절차에 형식 예시를 적는다.
