# T-15 관리자 대시보드 통합 사전 검증 — 2026-09-27

이 문서는 #51의 최종 완료 판정이 아니다. `codex/T-15-review-integration`은
`dev` 기준의 [T-13 #48](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/48),
[T-15 #51](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/51),
[T-16 #54](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/54),
[T-18 #52](https://github.com/ssong2332/2026-PyeongTaek-Univ.-Festival-Payments/pull/52)를
별도로 조합한 검증 브랜치다. 원본 PR과 `dev`에는 병합하지 않았다.

| 리뷰 항목 | 2026-09-27 확인 결과 | 최종 검수에서 필요한 근거 |
|---|---|---|
| 인증된 `/admin` 연결 | T-13 보호 레이아웃의 페이지에서 `LiveOrderDashboard`를 렌더링한다. 통합 빌드 통과. | #48 병합 후 #51을 최신 `dev`에 맞춰 실제 배포 경로에서 확인 |
| 로그인·비로그인 차단 | T-13 레이아웃 단위 테스트에서 세션 없음은 `/admin/login`으로 리다이렉트하고, 세션 있음은 자식 화면을 렌더링한다. 실제 계정 세션은 검증하지 못했다. | 관리자 계정으로 로그인·로그아웃·직접 URL 접근 확인 |
| 신규 주문 Realtime 3초 이내 표시 | `0013_realtime.sql`이 `orders`를 publication에 추가하고, `useOrdersFeed`가 INSERT 시 주문 상세를 다시 읽는다. 실측 기록은 없다. | 테스트 주문 생성 시각과 관리자 화면 표시 시각을 동일 환경에서 측정 |
| 주문 확인은 결제 상태 유지 | UI 테스트에서 확인 후 `결제대기`가 유지되고 미확인 건수만 감소한다. API 저장소는 `acknowledged_at`과 `acknowledged_by`만 수정한다. 실제 DB 행 검증은 남았다. | 확인 전후 `status`, `acknowledged_at`, `acknowledged_by` 확인 |
| 목록 밖 픽업 번호 검색 | UI 테스트에서 목록에 없는 번호를 서버 검색으로 넘기고 0건을 표시한다. 잘못된 번호는 요청 없이 거절한다. API 저장소는 픽업 번호 검색 시 날짜 제한을 적용하지 않는다. | 실제 오래된 주문·빈 검색·서버 오류 화면 확인 |
| #52 스윕 heartbeat | #51의 훅이 30초마다 `POST /api/admin/sweep`를 호출하고 변경이 있으면 목록을 다시 읽는다. #52의 인증 API와 DB 스윕 구현을 이 검증 브랜치에 합쳤다. 단위 테스트는 지연 응답 중복 방지도 확인한다. | 배포 환경에서 만료 주문 생성 후 호출·상태 갱신 확인 |
| 데스크톱·모바일 | `/dev/admin` 목업을 1440×900, 390×844 브라우저에서 확인했다. 모바일에서 상세 선택·확인 처리 후 결제 상태 유지, 미확인 2→1, 가로 넘침 없음(`scrollWidth=clientWidth=390`)을 확인했다. | 인증된 실제 `/admin`의 데스크톱·모바일 캡처 첨부 |

로컬 검증: Vitest 234개, TypeScript 검사, ESLint, Next.js 16 webpack 빌드 통과.
빌드에서 T-13 `middleware.ts`의 `proxy.ts` 전환 경고가 표시된다.

최종 연결은 #48·#52가 `dev`에 병합된 뒤 #51을 최신 `dev`에 맞추고,
실제 Supabase 관리자 세션·주문·Realtime·스윕·화면을 다시 검증한다.
#51은 그때까지 Draft로 유지한다.
