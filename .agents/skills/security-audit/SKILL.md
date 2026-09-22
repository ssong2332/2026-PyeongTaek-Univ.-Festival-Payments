---
name: security-audit
description: 보안 취약점 감사 가이드. OWASP Top 10 점검, 시크릿 하드코딩 탐지, 입력값 검증, 안전한 인증/인가 구현을 확인할 때 사용.
---

# Security Audit Guide

이 스킬은 코드 작성 및 리뷰 단계에서 치명적인 보안 결함을 사전에 탐지하고 방어 코드를 작성하도록 안내합니다.

## 핵심 감사 체크리스트

### 1. 시크릿 및 인증 정보 노출 방지
- [ ] API 키, DB 비밀번호, JWT Secret, 비대칭키가 소스 코드에 하드코딩되어 있지 않은가?
- [ ] `.env`, `.env.local` 등 민감 파일이 `.gitignore`에 등록되어 있는가?
- [ ] 에러 메시지나 로그에 비밀번호, 세션 토큰, 개인정보(주민번호/이메일/카드번호 등)가 출력되지 않는가?

### 2. 주입 공격 방어 (Injection Prevention)
- [ ] **SQL Injection**: 모든 데이터베이스 쿼리에 Parameterized Query (PreparedStatement 또는 ORM 매개변수 바인딩)를 사용하는가? 문자열 연결(`+` 또는 f-string)로 쿼리를 조립하지 않았는가?
- [ ] **Command Injection**: `exec`, `eval`, `child_process`, `os.system` 등에 검증되지 않은 사용자 입력을 직접 전달하지 않는가?
- [ ] **XSS (Cross-Site Scripting)**: 사용자 입력 텍스트를 HTML로 렌더링할 때 적절한 이스케이프(Sanitization) 처리를 하였는가?

### 3. 인증 및 인가 (Auth & Authorization)
- [ ] 사용자의 신원(Authentication)뿐만 아니라 해당 리소스에 접근할 권한(Authorization)을 서버 측에서 매 요청마다 검증하는가? (IDOR 취약점 방지)
- [ ] 비밀번호는 bcrypt, argon2 등 단방향 솔트 해시 알고리즘으로 안전하게 저장되는가?
- [ ] JWT 토큰의 만료 시간(Expiration)이 적절히 짧게 설정되어 있고, 서명 검증이 누락되지 않았는가?

### 4. 입력값 유효성 검사 및 에러 처리
- [ ] 모든 API 엔드포인트에서 입력값의 타입, 길이, 정규식 포맷, 허용 범위(White-listing)를 검증하는가?
- [ ] 서버 내부 스택 트레이스(Stack Trace)나 DB 에러가 클라이언트 응답으로 직접 노출되지 않는가?
