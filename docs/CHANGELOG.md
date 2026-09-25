# CHANGELOG — 2026-PyeongTaek-Univ.-Festival-Payments

> 소유자: docs | 형식: [Keep a Changelog](https://keepachangelog.com/ko/) 축약. 최신이 위.

## [Unreleased]

### Changed
- 2026-09-25 주문 생성 제한 초기값을 공용 IP 환경을 고려해 5건/분에서 100건/분으로 상향(F-47, T-51, DECISIONS #44)
- 2026-09-25 노션 스프린트 보드: 담당자별 파트 진행 속성(진행중 담당·완료 담당·파트 진행)·"내 파트" 보기 추가, 진행 카드 44개 본문 최신화(담당·일정·마이그레이션 번호·호스팅) — Tasks 변경 이력
- 2026-09-25 DECISIONS #35(Vercel Hobby) 폐기 표시, #43 Cloudflare Workers 호스팅 추가 — T-50 결과가 결정 로그에만 누락돼 있던 것 정정
- 2026-09-25 FE2(관리자 화면) 김 혁(DB2 겸임) 이관 — Tasks 역할 약어·09-26 이후 일정 표 재배치(DECISIONS #42)
- 2026-09-25 마이그레이션 번호 배정 표·규칙 추가(Architecture 2-1절, DECISIONS #41) — 0002·0004~0006 결번, 신규 0010부터. README·supabase/migrations/README 갱신
- 2026-09-24 BE1 일정 조율 — T-07을 09-26으로, T-16 API를 BE2로 이관(Tasks)
- 2026-09-24 AppError 형식 `AppError(code, httpStatus, details?)`로 통일(CodingRules, PR #31, DECISIONS #40)
- 2026-09-24 P3 착수 기준 시각을 10-03 18시 → 10-04 18시로 변경(PRD 성공 기준·README·Tasks 배정 표)
- 2026-09-24 결제수단을 현금·계좌이체 두 가지로 축소(PRD Open Question #40, DECISIONS #39):
  - 간편결제(카카오페이·토스 개인 송금) 제외, "송금 하위 수단" 개념 삭제
  - PRD F-06·F-15·F-19·F-21·F-29(CSV 10컬럼)·F-42(계좌이체 안내)·F-44·F-48(계좌 설정 3개) 갱신
  - Architecture·ADR-0002·ADR-0004(설정 키 6개)·DECISIONS #14(폐기)·#20(CSV 13컬럼)·README·P1-QA-Scenario 갱신
  - Tasks: T-53 신설(간편결제 제외 스키마 마이그레이션, DB1), T-07 선행에 T-53 추가

### Added
- 2026-09-22 팀장 의사결정 반영:
  - Open Question #38: 팀원 전원 Docker Desktop 설치 불가 판정에 따른 GitHub Actions CI 기반 통합 테스트 검증 체계 확정
  - Open Question #39: 주문 속도 제한(5건/분) 상수로 분리 정의
  - Open Question #35: Vercel 호스팅 배포 진행 확정
- 2026-09-22 문서 체계 실무 정돈:
  - CodingRules.md 규칙 테이블 작성 (네이밍, 린터, 에러 규격, 로깅, 테스트 기준 등)
  - GitWorkflow.md, DefinitionOfDone.md, Tasks.md, Architecture.md 내 레거시 하네스 참조 정리
- 2026-09-22 요구사항 및 설계 승인:
  - PRD (요구사항 F-01~F-48, 비기능 N-01~N-17), Architecture, DECISIONS (38건), ADR (0001~0009)
  - 작업 목록 (Tasks T-01~T-52) 및 팀 역할 분담 (FE1/FE2/BE1/BE2/DB1/DB2/팀장) 확정
- 2026-09-22 프로젝트 초기화 및 디렉터리 골격 구성
