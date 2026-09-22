# ADR-0008: 전화번호 암호화(2차 조건부) — 애플리케이션 계층 AES-256-GCM, 키는 환경변수, 컬럼은 2차 마이그레이션

> 상태: 승인 (2026-09-22, 사용자)
> 날짜: 2026-09-22

## 맥락

N-17(전화번호는 애플리케이션 계층에서 암호화 저장, 평문 컬럼 없음, 키는 환경변수 시크릿, 관리자만 열람, 로그 평문 0건), N-15(2026-11-08 파기, 파기 후 전화번호 값 0건), F-12 2차(동의 시각 기록), F-39(배달 주문에서만 수집), T-49. 1차 범위에서는 전화번호를 수집하지 않는다(N-05).

## 검토한 대안

| 대안 | 장점 | 단점 |
|---|---|---|
| A. Node `crypto` AES-256-GCM, 키 `PHONE_ENCRYPTION_KEY`(base64 32바이트) 환경변수, 암호문·IV·태그를 하나의 문자열로 컬럼 저장 | N-17 문구("애플리케이션 계층") 그대로. DB 덤프·Table Editor로는 원문 불가. 의존성 0 | 키 분실 시 복호화 불가(파기 목적엔 오히려 무해). 검색 불가(요구 없음) |
| B. `pgsodium`/`pgcrypto`로 DB 안에서 암호화 | SQL로 완결 | 키가 DB 쪽에 있어 "DB 직접 조회 시 원문 노출 없음"(F-39 AC)이 약해짐. N-17 "애플리케이션 계층" 문구와 불일치 |
| C. 해시(단방향) | 가장 안전 | 관리자가 번호를 읽어야 함(배달 연락) — 사용 불가 |

컬럼 도입 시점:

| 대안 | 장점 | 단점 |
|---|---|---|
| S1. 1차 스키마에 nullable 컬럼 미리 추가 | 2차 마이그레이션 1개 절약 | 1차 배포 DB에 "전화번호" 컬럼이 존재 — N-05 1차 "저장하지 않음"을 스키마로 증명하기 어려움, 고지문(F-12 1차 "수집 항목 없음")과 어긋나 보임 |
| S2. 2차(T-49) 마이그레이션으로 추가 | 1차 DB에 개인정보 컬럼 0개 — 고지문과 스키마가 일치 | 2차에 `ALTER TABLE` 1개 |

## 결정

**A + S2.** 결정적 이유: N-17이 애플리케이션 계층 암호화를 지명했고, 1차 스키마에 개인정보 컬럼이 없어야 F-12 1차 고지문("수집 항목 없음")이 스키마로 증명된다.

규격(T-49에서 구현):
- 모듈 `src/infra/crypto/phoneCipher.ts`: `encryptPhone(plain): string`, `decryptPhone(cipher): string`. 저장 형식 `v1:{iv_b64}:{tag_b64}:{ct_b64}`(버전 접두사로 키 교체 대비). 키는 `PHONE_ENCRYPTION_KEY`(서버 전용, `NEXT_PUBLIC_` 금지) — `.env.example`에 플레이스홀더 추가(implementer).
- 2차 마이그레이션: `orders.phone_encrypted text NULL`, `orders.phone_consented_at timestamptz NULL`, CHECK `(phone_encrypted IS NULL) OR (phone_consented_at IS NOT NULL)` (동의 없는 저장 거부, F-12 2차).
- 복호화 경계: `GET /api/admin/orders/{id}/phone`(관리자 세션 필수) 한 곳에서만 복호화. 목록 DTO·Realtime 행·CSV·고객 DTO에는 `phone_encrypted`를 절대 매핑하지 않는다(`toAdminOrderDto`가 필드를 명시적으로 나열 — 스프레드 금지). `authenticated` SELECT 정책은 컬럼 수준으로 `phone_encrypted`를 제외한다(RLS는 행 단위이므로 `REVOKE SELECT (phone_encrypted) ON orders FROM authenticated` 사용 — Realtime 페이로드에도 안 실림. 컬럼 REVOKE와 Realtime 페이로드 동작은 추정 — T-49에서 확인).
- 로그: `src/lib/logger.ts`는 허용 필드 화이트리스트만 직렬화 — `phone`, `phone_encrypted`, `phonePlain` 키는 직렬화 전에 `[redacted]`로 치환(단위 테스트: 로그 출력에 평문 0건).
- 파기: `supabase/scripts/purge_2026-11-08.sql`이 `orders`를 삭제하면 컬럼 값도 사라진다(CASCADE). 검증 쿼리 `SELECT count(*) FROM orders WHERE phone_encrypted IS NOT NULL` = 0. 절차는 T-30.

## 결과 (트레이드오프 포함)

- 얻는 것: F-39 AC "DB 직접 조회 시 원문 노출 없음", N-17 로그·열람 제한을 코드 경계 2곳(cipher 모듈·phone 엔드포인트)으로 좁힘.
- 감수하는 것: 키 관리 = Vercel 환경변수 1개. 키를 바꾸면 기존 값 복호화 불가(축제 2일 운영에선 교체 계획 없음).
