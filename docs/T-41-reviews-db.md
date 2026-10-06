# T-41 후기·별점 DB 계약

F-37 / Open Question #27 확정: 완료 주문의 고객이 별점 1~5와 선택 후기 텍스트를 제출한다. 주문당 1건, 텍스트 최대 200자, 관리자만 열람하고 고객 메뉴판에는 노출하지 않는다. 숨김 기능과 개인정보 필드는 추가하지 않는다.

## DB1 구현

`0102_reviews.sql`:
- `reviews.order_id`: 주문 FK이자 PK. 동시 제출도 하나만 저장한다. 주문 파기 시 CASCADE로 후기도 함께 삭제한다.
- `rating`: integer NOT NULL, 1~5 CHECK.
- `text`: nullable, 빈 문자열 허용, PostgreSQL `char_length` 기준 200자 CHECK(한글·이모지 각각 한 문자).
- `created_at`: timestamptz NOT NULL DEFAULT now().
- 완료 주문 검사 트리거: INSERT와 order_id 변경 시 주문 상태를 읽고 FOR SHARE로 잠근다. 완료 외 상태는 23514, 없는 주문은 FK 23503으로 거부한다.
- RLS: anon 조회·쓰기 불가, authenticated SELECT만, 쓰기는 서버의 service_role. 기존 정책처럼 회원가입은 꺼져 있고 authenticated 계정은 운영 관리자라는 전제다.
- 트리거 함수는 SECURITY INVOKER, search_path=pg_catalog. PUBLIC/anon/authenticated EXECUTE를 회수한다.

## API·화면 후속 계약

후기 제출 API는 고객 URL의 주문 토큰을 검증해 주문 ID를 서버에서 결정한 뒤 INSERT한다. 클라이언트가 보낸 order_id를 신뢰하지 않는다. 이 DB PR은 토큰 검증 API나 고객 폼을 구현하지 않는다.

API 입력에서도 별점 정수·1~5와 선택 텍스트 200자를 검증한다. 글자 수는 Unicode 코드 포인트 기준으로 DB와 맞춘다(JS UTF-16 length와 차이가 있다). 완료 외 상태 거부, 없는 토큰·불일치 토큰의 비노출 응답, 중복 제출(23505)의 충돌 응답은 API 담당 연결 시 검증한다. 기존 후기를 덮어쓰는 upsert를 사용하지 않는다.

고객은 후기 목록 SELECT 권한을 얻지 않는다. 자기 후기 제출 완료 표시가 필요하면 토큰 검증 후 서버가 최소 정보만 반환한다. 관리자 목록은 관리자 인증 후 픽업 번호·별점·텍스트·시각을 명시적으로 매핑하며, 별점 평균은 후속 통계 연결 범위다. 고객 폼 제출 후 비활성화와 등록 완료 문구는 FE1 담당이다.

## 검증

`tests/integration/t41-reviews.test.ts`를 독립 로컬 Supabase CI에서 실행한다.
- 정상 제출·생성 시각·선택 텍스트 생략.
- 별점 1·5, 빈 텍스트·NULL·한글/이모지 200자 허용.
- 별점 0·6·NULL·소수와 한글/이모지 201자 거부.
- 동시·반복 제출 한 건 유지.
- 완료 외 모든 6개 상태와 없는 주문 거부, order_id 변경에도 완료 검사.
- anon 조회·쓰기 거부, authenticated 조회만 허용.
- 주문 파기 시 후기 삭제.

구현 전 커밋 `abc1ddf1168cc9c456bdd52d01b399927ad9e635`의 [CI](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/actions/runs/37133345245)에서 새 7개 테스트가 후기 테이블 없음(PGRST205)으로 실패했고 기존 143개 통합 테스트는 통과했다. 이후 마이그레이션을 추가했다. 실제 UI 변경은 없으므로 이 PR의 화면 검수는 해당 없음이다. T-41 전체 완료는 API·고객 폼·관리자 조회 연결 이후 팀장이 판정한다.

## 운영 반영

최신 dev의 마이그레이션 pending 목록과 실제 운영 이력을 확인한 뒤 DB1이 적용한다. 예약 순서는 `0018 → 0019 → 0100 → 0101(T-38 #101) → 0102`. 앞 번호가 미병합이면 건너뛰어 적용하지 않는다. API·고객 폼 연결 전에는 고객 기능을 켜지 않는다. 운영 DB·Tasks·Notion 상태는 이 구현에서 변경하지 않는다.
