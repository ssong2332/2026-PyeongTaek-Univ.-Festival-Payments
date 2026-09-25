# CHANGELOG — 2026-PyeongTaek-Univ.-Festival-Payments

> 소유자: docs | 형식: [Keep a Changelog](https://keepachangelog.com/ko/) 축약. 최신이 위.

## [Unreleased]

### Changed
- 2026-09-25 관리자 화면(FE2) 김 혁 배정 및 일정·역할 조율 (Tasks.md):
  - 김 혁: DB2 + FE2(관리자 화면) 겸임 (09-27 T-15·16 연결, 09-29 T-17 화면, 09-30 T-23·27 화면, 10-01 T-52 패널, 10-03 T-19 UI·T-28 수기 주문 및 여력 관리 화면; T-26 집계는 10-03 여력으로 이동)
  - 김희진: FE1(고객 화면) 전담 (T-20 메뉴/재고 수정 및 T-35 고객 취소 요청 승인/거절 화면 유지)
  - 신우석(BE1): T-07을 09-26으로 이동하여 T-08과 병행 진행, 09-27 작업 없음(버퍼), T-16 결제 확인/상태 수동 변경 API는 유은조(BE2)가 담당
  - 데이터 파기: T-30 주문 데이터 파기 절차 문서를 김 혁(DB2)이 전담
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
