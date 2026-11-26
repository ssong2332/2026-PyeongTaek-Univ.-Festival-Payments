# T-39 옵션 템플릿 DB·API 계약 초안

> 상태: **DB1·API 담당 확정 전 제안** (2026-11-26). 이 문서는 #172의 고객 화면 사전 준비를 실제 데이터에 연결하기 위한 검토안이다. 마이그레이션 실행, `dev` 병합, 운영 적용을 승인하지 않는다.

## 1. 범위와 선행 순서

- 고객용 템플릿은 **한 메뉴의 옵션 선택지 묶음**이다. 메뉴 가격이나 주문 원장에 템플릿 ID를 저장하지 않는다. 고객이 1탭 적용하면 기존 `optionIds` 선택과 `create_order`의 가격·재고 검증을 그대로 쓴다.
- 현재 `dev`에는 `0107_pending_cycle_revert.sql`까지 있다. #158의 재고 사진 `0108`이 먼저 확정·병합된다는 전제로 T-39 마이그레이션 번호를 **`0109_option_templates.sql` 후보**로 둔다. DB1이 최종 번호와 순서를 확인한다. `0108` 없이 `0109`만 운영 DB에 적용하지 않는다.
- #172는 DTO·고객 UI 준비 PR로 유지한다. DB 스키마, 서버 조회, 관리자 CRUD와 실제 DB 통합 검증은 후속 변경으로 나눌 수 있으나, 최종 기능 완료 판정에는 모두 필요하다.

## 2. 저장 구조 제안

| 테이블 | 주요 컬럼·제약 | 목적 |
|---|---|---|
| `option_templates` | `id uuid PK`, `menu_item_id uuid NOT NULL FK menu_items`, `name_ko text NOT NULL`, `name_en text NULL`, `is_active boolean NOT NULL DEFAULT true`, `sort_order integer NOT NULL DEFAULT 0`, `created_at`, `updated_at` | 메뉴별 템플릿과 ko/en 이름. 이름은 공백 제거 후 1~40자. `name_en`이 없거나 공백이면 고객 en 응답에서 ko로 폴백한다. |
| `option_template_options` | `(template_id, option_id) PK`, `template_id FK option_templates ON DELETE CASCADE`, `option_id FK options ON DELETE RESTRICT`, `sort_order integer NOT NULL`, `UNIQUE(template_id, sort_order)` | 옵션 ID 중복을 DB에서 막고 응답 순서를 고정한다. 옵션을 실제 삭제하려면 참조 템플릿부터 고쳐야 한다. |

- 메뉴·그룹·옵션이 다른 메뉴를 가리키지 않도록 **DB 트리거 또는 동일하게 원자적인 제약**으로 각 연결의 `option_groups.menu_item_id = option_templates.menu_item_id`를 확인한다. API 검사만으로 끝내지 않는다.
- 생성·수정은 템플릿 행과 연결 행을 **한 트랜잭션**에서 저장한다. Supabase의 연속 `insert`/`delete` 호출로 부분 저장하지 않도록 `service_role` 전용 RPC를 사용한다. 메뉴 ID는 생성 뒤 변경하지 않는다.
- 저장 시 현재 활성 메뉴·그룹·옵션만 허용하고, 옵션 ID 중복·타 메뉴 옵션·그룹별 `min_select`/`max_select` 위반을 거부한다. 메뉴당 최대 10개, 템플릿당 옵션 최대 20개를 API와 DB 함수에서 같은 값으로 검사하는 안이다. 빈 옵션 묶음은 허용하지 않는다.
- 관리자가 나중에 옵션·그룹을 비활성화하거나 그룹 한도를 변경하면 기존 템플릿이 오래될 수 있다. DB가 그 편집을 막지는 않는다. 고객 응답은 매번 **현재 메뉴의 활성 옵션과 그룹 제한으로 다시 검사**하여 사용할 수 없는 템플릿을 제외한다. 관리자 조회에는 오래된 템플릿도 보여 수정·삭제할 수 있어야 한다.
- `name_ko`/`name_en` 두 컬럼은 현 지원 언어 `ko`/`en`에 맞춘 제안이다. 기존 메뉴 번역 테이블 방식으로 통일하고 싶다면 DB1이 ko 필수·en 폴백을 동일하게 보장하는 대안을 확정한다.

## 3. 권한과 쓰기 계약

- 두 테이블에 RLS를 켜고 `PUBLIC`, `anon`, `authenticated`의 직접 권한을 철회한다. 읽기·쓰기 모두 서버 Route Handler의 `service_role`을 거친다. 관리자 라우트는 다른 메뉴 API와 같이 **`requireAdmin()`을 먼저 실행**한다.
- 생성·수정 RPC는 `SECURITY INVOKER`, 고정 `search_path`를 사용하고 `PUBLIC`/`anon`/`authenticated` EXECUTE를 철회한 뒤 `service_role`에만 허용한다. DB1은 함수 권한과 실제 호출을 격리 DB에서 확인한다.
- 관리자 삭제는 템플릿 행을 삭제한다. 주문에는 템플릿 ID가 남지 않으므로 기존 주문의 선택 옵션·가격은 변하지 않는다. 없는 메뉴·템플릿은 `404 NOT_FOUND`, 잘못된 이름·옵션 조합은 `400 VALIDATION_ERROR`, 인증 실패는 기존 관리자 API의 `401/403` 계약을 따른다. 내부 DB 오류 원문은 응답에 넣지 않는다.

## 4. API·DTO 제안

| 경로 | 요청/응답 | 조건 |
|---|---|---|
| `GET /api/menu?lang=ko|en` | 각 메뉴의 선택적 `optionTemplates: [{ id, name, optionIds }]`. 템플릿이 없으면 `[]`; 예전 서버의 필드 누락도 #172 DTO가 읽는다. | 활성 템플릿만. 현재 활성 옵션·그룹 한도에 맞는 것만. `sort_order, id` 순. en 이름 없으면 ko. 고객에게 관리용 필드는 보내지 않는다. |
| `GET /api/admin/menus/{menuId}/option-templates` | `{ templates: [{ id, menuItemId, translations: { ko: { name }, en?: { name } }, optionIds, isActive, sortOrder }] }` | 비활성·오래된 템플릿도 표시. `Cache-Control: private, no-store`. |
| `POST /api/admin/menus/{menuId}/option-templates` | `{ translations: { ko: { name }, en?: { name } }, optionIds: uuid[], sortOrder?: number }` → `201` 템플릿 | 메뉴당 상한과 옵션 유효성 검사. 생성은 단일 DB 트랜잭션. |
| `PATCH /api/admin/option-templates/{id}` | `translations?`, `optionIds?`, `isActive?`, `sortOrder?` → 수정된 템플릿 | 보낸 필드만 변경. 연결 옵션 교체와 이름 수정은 단일 트랜잭션. |
| `DELETE /api/admin/option-templates/{id}` | `204` | 템플릿과 연결만 삭제. 주문·옵션 원본은 보존. |

관리자 화면은 위 CRUD가 연결되기 전까지 완료로 표시하지 않는다. 서버 조회가 새 테이블을 참조하기 시작하면 **DB 마이그레이션이 앱 배포보다 먼저** 적용돼야 한다.

## 5. 격리 DB 통합·E2E 검증 계획

1. 최종 `dev`의 전체 마이그레이션을 격리 DB에 순서대로 적용한다. #158이 선행된다면 `0106 → 0107 → 0108 → 0109`를 확인하고, T-39 테이블·FK·RLS·RPC 권한을 SQL로 검증한다. 운영 DB는 사용하지 않는다.
2. 실제 메뉴·그룹·옵션 fixture로 관리자 생성→목록→수정→삭제를 호출한다. ko/en 이름과 en 누락 시 ko 폴백, 정렬, 템플릿 0개·레거시 필드 누락을 확인한다.
3. 중복·없는 옵션·다른 메뉴 옵션·비활성 옵션/그룹·그룹 최소/최대 위반을 저장 단계에서 거부하고, 실패 뒤 템플릿·연결 행이 **전부 롤백**됐는지 확인한다.
4. 저장 후 옵션 비활성화·그룹 한도 변경으로 오래된 템플릿을 만들고, 관리자 목록에는 남지만 고객 `GET /api/menu`에서는 빠지는지 확인한다. 정상 템플릿은 유지한다.
5. 실제 고객 메뉴 응답을 받은 뒤 1탭 적용→옵션 선택 상태·추가 가격·장바구니 합계→`create_order`의 서버 계산까지 검증한다. 템플릿 삭제 뒤 이미 만들어진 주문의 옵션·가격은 그대로여야 한다.
6. `anon`/`authenticated`의 직접 테이블 읽기·쓰기 및 RPC 실행 차단, 비로그인 관리자 API 차단, `service_role` 경로 성공을 확인한다. ko/en 고객 화면에서 실제 조회·탭 적용까지 E2E로 확인한다.

## 6. 확정할 사람과 병합 게이트

- **DB1:** `0109` 번호, 테이블/연결 무결성, 원자적 RPC, RLS·권한, 마이그레이션 순서 확정.
- **API 담당:** 고객 조회 매퍼와 관리자 CRUD 요청·응답·오류 계약 확정. 기존 `GET /api/menu`와 관리자 메뉴 API의 번역·권한 규칙에 맞춘다.
- **FE2/QA:** #172 고객 선택 동작, 관리자 관리 화면과 ko/en 실화면, 실제 DB E2E 검증.
- 확정 전 #172는 Draft다. 최신 `dev` 동기화 및 위 통합 테스트 성공 후에만 Ready·병합 재검토를 요청한다. 운영 DB 적용과 앱 배포는 별도 승인 대상이다.
