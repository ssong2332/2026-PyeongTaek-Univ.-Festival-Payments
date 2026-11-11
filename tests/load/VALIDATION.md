# T-29 검증 기록 (2026-10-06)

- 최신 dev `3a52fe7`를 일반 merge(`82d1a6c`)로 반영. force push/PR merge 없음.
- 단위 테스트: 122개 파일, 1,267개 통과.
- typecheck 통과, production build 통과.
- lint: 오류 0, 기존 dev의 `src/app/api/admin/settings/route.ts` unused `_request` 경고 1.
- PGlite 0.5.8 격리 PostgreSQL 엔진에서 실제 schema + T-51 + cleanup SQL 실행 통과: dry-run, 실제 주문 혼입 abort, 삭제 실패 후 재고 변경 rollback, 카운터/상태/재고 변경 abort, terminal 상태 재고 중복복구 방지, 1,500건 처리, 재실행, 없던/기존 pickup 기준값 복원, anon/authenticated 권한 거부.
- native PostgreSQL 동시 cleanup 검증은 새 `T-29 isolated cleanup SQL` CI에서 수행한다.
- k6 2.3.0 로컬 HTTP mock 10초 smoke: 60개 client IP, 301개 고유 주문, IP당 최대 6건, 오류 0%, threshold 통과. **mock 결과이므로 실제 N-06 성능 통과 근거가 아니다.** 원격 URL 거부도 확인.
- 로컬 T-51 통합 테스트 실행은 로컬 Supabase 설정/스택이 없어 setup 안전 가드에서 중단됨(테스트 본문 미실행). 원격 DB로 대체하지 않았다. PR CI의 로컬 Supabase 통합 테스트 결과를 별도로 확인한다.

## Ready 전 남은 확인

1. 새 head의 CI(unit/build/Worker build, Supabase integration, sweep, cleanup SQL) 완료 결과.
2. 실제 격리 Supabase + 로컬 production app에서 30초/합산 30 RPS를 실행하고 summary를 보관. mock 측정으로 대체하지 않는다.
3. README 절차대로 앱을 정지하고 dry-run → cleanup → 재실행 후 재고와 pickup 기준값을 확인한다.

운영/공용 DB에는 부하 테스트·cleanup·SQL 설치를 실행하지 않았다. 실제 부하 근거가 나오기 전까지 Draft 유지 권장.

