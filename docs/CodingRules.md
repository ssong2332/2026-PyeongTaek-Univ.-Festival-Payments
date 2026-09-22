# CodingRules — 2026-PyeongTaek-Univ.-Festival-Payments

> 소유자: 사용자 | 최종 수정: 2026-09-22

## 금지

- 기존 코드 스타일과 다른 새 스타일 도입 금지 (주변 코드를 따른다).
- 요청 범위 밖 파일 수정 금지.
- 주석으로 변경 이력·자기 설명 남기기 금지 (코드가 못 보여주는 제약만 주석으로).
- 테스트 없이 "동작 확인됨" 보고 금지.
- **코드 교체 시 주변 변수/문맥 소실 금지**: `replace_file_content` 사용 시 교체 범위(`StartLine`~`EndLine`)를 변경 대상 전후 1~2줄 이내로 외과적으로 한정하며, 상하위 필수 변수 선언문이나 import문이 함께 삭제되지 않도록 반드시 확인한다.
- **CSS `!important` 남용 및 무분별한 트랜지션 덮어쓰기 금지**: 기존 `transition`이 적용된 속성(`transform`, `opacity` 등)을 리셋할 때는 단일 속성 강제 주입 대신 상태 클래스(`.is-settled`) 분리 또는 `transition: none` 사전 지정을 필수로 한다.
- **`setTimeout` 다중 체이닝을 통한 UI 시퀀스 제어 금지**: 레이스 컨디션 및 유저 클릭 중복 방지를 위해 Web Animations API(`animation.finished`)나 `transitionend` Promise, 혹은 유한 상태 기계(FSM)로 상태 전이를 제어한다.

## 규칙

| 항목 | 규칙 |
|---|---|
| 네이밍 | TypeScript: 변수·함수·메서드는 `camelCase`, 타입·인터페이스·컴포넌트는 `PascalCase`, 상수(불변)는 `UPPER_SNAKE_CASE`. DB 테이블·컬럼은 `snake_case`. DB ↔ TS DTO 변환 시 명시적 매핑 함수(`toDomain`, `toAdminOrderDto`)를 사용하며 스프레드 연산자 무분별한 사용 금지. |
| 포맷터/린터 | ESLint + TypeScript ESLint. `src/domain` 및 `src/services`는 `next/*`나 `supabase/*` import 절대 금지 (순수 도메인 분리). 클라이언트 컴포넌트(`src/components`, `src/features`, `src/app/(customer)`)에서 `SUPABASE_SERVICE_ROLE_KEY` import 절대 금지. 순환 참조 금지(`import/no-cycle`). |
| 에러 처리 | 도메인 표준 에러는 `AppError(code, message, status, details)` 사용. API 응답 형식은 `{ error: { code: string, message: string, details?: unknown } }` 규격 준수. 적절한 HTTP 상태 코드(400, 401, 403, 404, 409, 429, 500) 사용. |
| 로깅 | `src/lib/logger.ts` 사용. 고객 개인정보(전화번호 등)나 계좌 정보는 로그 출력 전 `[redacted]`로 마스킹 처리하여 평문 노출 방지. |
| 테스트 작성 기준 | 단위 테스트는 `tests/unit/`, 통합 테스트는 `tests/integration/`, E2E는 `tests/e2e/`. 단위 테스트는 Fake/Mock 객체 활용(순수 TS). Red-First(실패 먼저 확인) 원칙 준수, 정상 1 + 경계 2 + 예외 2 이상 케이스 작성. |
| 디렉토리 배치 | `domain/`(순수 도메인), `services/`(유즈케이스), `infra/`(Supabase 연동·SQL/RPC), `app/api/`(Route Handler), `components/`(표현 컴포넌트), `features/`(화면 훅). 모든 데이터 접근은 `app/api/` 경유 (ADR-0001). |
| 설정 및 상수 | 수치·타이머·속도 제한 등 마이크로 요구사항은 코드 내 하드코딩하지 않고 상수 객체(예: `src/domain/order/rateLimit.ts`) 또는 `app_settings` 테이블(ADR-0004)로 단일 진실화(Single Source of Truth)한다. |

## 검증된 명령어

성공한 원문 그대로 기록하고, 이후 변형 없이 재사용한다. 팀원은 새 행을 추가할 수 있으며 기존 명령을 완전히 교체해야 하면 옛 행을 지우지 말고 ~~취소선~~ 처리 + 교체 사유 한 줄을 남기고 새 행을 추가한다. 행 삭제는 팀장만 한다.

| 용도 | 명령 (원문) | 검증일 |
|---|---|---|
| 빌드 | (T-01 완료 후 등록) | |
| 실행 | (T-01 완료 후 등록) | |
| 테스트 | (T-01 완료 후 등록) | |

### T-01 로컬 검증 (2026-09-22)

위의 미등록 행은 유지하며 실제 성공한 명령을 아래에 추가한다.
Node 20.20.2 환경에서 검증했다. `.nvmrc`를 지원하는 도구로 버전을 맞춘 뒤 `npm ci`로 설치한다.

| 용도 | 명령 (원문) | 검증일 |
|---|---|---|
| 빌드 | `npm run build` | 2026-09-22 |
| 개발 서버 | `npm run dev -- --hostname 127.0.0.1 --port 3100` | 2026-09-22 |
| 단위 테스트 | `npm run test` | 2026-09-22 |
| 브라우저 기본 동작 검사(E2E) | `npm run test:e2e` | 2026-09-22 |
| 코드 규칙 검사 | `npm run lint` | 2026-09-22 |

개발 서버는 Playwright가 위 명령으로 시작하고 종료한다. 일반 개발용 `npm run dev`(기본 포트 3000)는 별도 실행 가능하다.
E2E 최초 실행 전 `npx playwright install chromium`이 필요하다. 현재 스모크는 DB 없이 실행된다.
`customer-ios`도 설계의 Chromium 기반 기기 에뮬레이션이며 실제 Safari 검증을 뜻하지 않는다.
`npx supabase start`는 팀원 전원 Docker 설치 불가 결정 때문에 검증하지 않았으며 성공 명령으로 등록하지 않는다. 통합 테스트와 Supabase 자동 검사 작업은 T-02에서 추가한다.
