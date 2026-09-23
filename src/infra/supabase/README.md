# infra/supabase — `server.ts`(service_role, 서버 전용 — 클라이언트 컴포넌트 import 금지), `session.ts`(@supabase/ssr 쿠키 세션 + requireAdmin()), `browser.ts`(관리자 Auth·Realtime 전용), `database.types.ts`(`supabase gen types` 생성물, 수정 금지). Task: T-02, T-13.


T-02: `createServiceClient()`는 서버 전용이며 세션 저장·자동 갱신을 사용하지 않는다. `createAdminBrowserClient()`는 관리자 로그인·Realtime용 공개 키 클라이언트다. 설정값은 호출 시 검증하므로 환경변수가 없는 빌드에서도 모듈을 가져올 수 있다.
`session.ts`와 `requireAdmin()`의 인증·쿠키 갱신은 T-13에서 추가한다. `database.types.ts`는 T-03 이후 실제 스키마로 생성한다.
