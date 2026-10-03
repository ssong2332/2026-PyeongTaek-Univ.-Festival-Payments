# T-29 k6 부하 검증 (Load Testing)

본 디렉터리는 **T-29 (k6 부하 검증)** 및 **PRD N-06 성능 요구사항**을 검증하기 위한 부하 테스트 스크립트와 데이터 정리 유틸리티를 포함합니다.

---

## 1. 요구사항 및 검증 기준 (PRD N-06)

| 항목 | 기준 | 설명 |
| :--- | :--- | :--- |
| **목표 처리량** | **30 RPS** | 축제 예상 피크치(10 RPS)의 3배 부하 조건에서 주문 생성 |
| **안정성 / 실패율** | **0% (rate < 0.01)** | 30 RPS 부하 상황에서 주문 생성 및 조회 HTTP 실패율 0% |
| **응답시간 (p95)** | **1초 (1000ms) 이내** | 고객 화면 핵심 API 3종의 95 백분위수 응답시간 1초 이내 |
| **대상 API 3종** | 고객 화면 API | 1. `GET /api/menu`<br>2. `POST /api/orders`<br>3. `GET /api/orders/[token]` |
| **데이터 정리** | 사후 자동/수동 정리 | 운영/스테이징 DB에 남은 테스트 주문은 실행 직후 안전하게 일괄 정리 |

---

## 2. 파일 구성

- **`order-create.js`**: k6 부하 테스트 스크립트
  - 고객 3대 API 시나리오 흐름(`메뉴 조회` -> `주문 생성` -> `주문 상태 조회`)
  - `constant-arrival-rate` executor를 사용한 정확한 30 RPS 부하 발생
  - RFC 4122 v4 규격 준수 테스트 식별 멱등키 생성 (`00000000-0000-4a29-...`)
  - 자동 요약 리포트(`tests/load/summary.txt`, `summary.json`) 출력 및 PRD N-06 합격/불합격 판정
- **`cleanup.mjs`**: 테스트 주문 정리 스크립트
  - 부하 테스트용 멱등키 패턴을 추적하여 생성된 테스트 주문을 일괄 삭제
  - 연관된 `order_items`, `order_status_history`는 ON DELETE CASCADE로 자동 정리
  - 차감된 메뉴 재고(`menu_items.stock`) 복구 지원

---

## 3. 실행 방법

### 사전 요구사항
- [k6](https://k6.io/) 설치
  - Windows: `winget install GrafanaLabs.k6` 또는 `https://github.com/grafana/k6/releases`

### 1) 로컬 개발 서버 대상 실행
```bash
# 1. 로컬 개발 서버 또는 프로덕션 빌드 서버 실행 (포트 3000)
npm run build && npm start

# 2. k6 부하 테스트 실행 (기본 30 RPS, 30초)
npm run test:load

# 옵션 사용자 지정 실행 (예: 10초간 실행)
k6 run -e DURATION=10s -e RATE=30 tests/load/order-create.js
```

### 2) 원격/배포 환경 대상 실행 (Cloudflare Workers / Staging)
```bash
# Cloudflare Workers 프로덕션/스테이징 주소 대상 실행
k6 run -e BASE_URL="https://your-worker.your-subdomain.workers.dev" -e RATE=30 -e DURATION=30s tests/load/order-create.js
```

---

## 4. 환경 변수 옵션

| 환경 변수 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `BASE_URL` | `http://localhost:3000` | 대상 서버 주소 |
| `RATE` | `30` | 목표 초당 요청 수 (RPS) |
| `DURATION` | `30s` | 부하 테스트 지속 시간 |
| `VUS` | `50` | 사전 할당 가상 사용자 수 |
| `MAX_VUS` | `150` | 최대 가상 사용자 수 |

---

## 5. 테스트 데이터 정리 (Cleanup)

부하 테스트 수행 후 생성된 테스트 주문들을 DB에서 정리합니다.

```bash
# 드라이 런 (대상 건수만 확인, 실제 삭제 안 함)
node --env-file-if-exists=.env.local tests/load/cleanup.mjs --dry-run

# 실제 정리 실행 (주문 삭제 및 차감 재고 복구)
npm run test:load:cleanup

# 재고 복구 없이 주문만 삭제
node --env-file-if-exists=.env.local tests/load/cleanup.mjs --no-restore-stock
```
