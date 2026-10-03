# T-38 추천 메뉴 DB 계약

F-35 / Open Question #25(a)(c): 관리자가 메뉴별 추천을 켜고 끈다. 고객 화면의 추천 라벨은 ko/en으로 표시한다. DB1 범위는 추천 플래그 스키마이며, 관리 UI는 김 혁(#97), 고객 노출은 FE1 담당이다.

## 스키마와 연결

- `0101_menu_recommendation.sql`: `public.menu_items.is_recommended boolean NOT NULL DEFAULT false`.
- 기존 메뉴와 추천 값을 생략한 신규 메뉴는 OFF. 추천은 메뉴별 독립 값으로 여러 개 또는 0개를 허용한다.
- 추천 변경은 가격·재고·활성·수동 품절 상태를 바꾸지 않는다. 품절 및 활성 여부에 따른 고객 노출은 기존 메뉴 표시 규칙과 함께 판단한다.
- 기존 메뉴 RLS·GRANT 유지: anon 접근 불가, authenticated 조회만, 쓰기는 관리자 인증을 통과한 서버의 service_role. 관리자 메뉴 PATCH API에서 boolean 입력을 검증하고 `is_recommended`만 갱신한다.
- DB 필드 `is_recommended`는 API에서 명시적으로 `isRecommended` 등 DTO 필드에 매핑한다. 고객 메뉴 조회 DTO·추천 라벨과 관리자 메뉴 API 연결은 후속 작업이며 이 PR은 기존 응답 계약을 바꾸지 않는다.
- #97의 `onSave`를 T-20 메뉴 수정 API에 연결한다. 실제 화면 통합 완료는 T-20 및 FE1 연결 이후에 판단한다.

## 검증

`tests/integration/t38-menu-recommendation.test.ts`는 CI 독립 PostgreSQL에서 다음을 검증한다.
1. 추천 값을 생략한 신규 메뉴 기본 OFF.
2. ON/OFF 전환 시 가격·재고·활성·수동 품절 불변.
3. 여러 추천 메뉴 및 추천 0개.
4. INSERT/UPDATE NULL 거부(23502), 기존 값 보존.
5. anon 조회·변경 거부, authenticated 조회 허용·직접 변경 거부(42501).

구현 전 커밋 `32d92c3cb49890394e407176187b2d5285cd4a84`의 [CI](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/actions/runs/37132162622)에서 새 5개 테스트가 미구현 컬럼(42703/PGRST204)으로 실패했고 기존 114개 통합 테스트는 통과했다. 이후 마이그레이션을 추가했다. 실제 화면 변경은 없으므로 UI 수동 검증은 이 DB PR에 해당하지 않는다. Tasks·Notion 상태는 팀장이 판정한다.

## 운영 반영

팀장 리뷰·병합 후 DB1이 최신 dev의 마이그레이션 이력과 pending 목록을 확인하여 적용한다. 예약 순서는 `0018 → 0019 → 0100 → 0101`. 아직 병합되지 않은 앞 번호를 건너뛰어 운영 적용하지 않는다. 현재 운영 적용 이력을 직접 확인한 기록은 이 PR에 없다.

적용 후 관리자 인증 경로에서 추천 값 조회 및 ON/OFF 저장·재조회, 고객 표시를 각 연결 담당자와 확인한다. DB 스키마 병합만으로 T-38 전체 완료를 판정하지 않는다.
