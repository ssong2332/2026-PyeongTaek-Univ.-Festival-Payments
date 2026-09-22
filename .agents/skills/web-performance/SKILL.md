---
name: web-performance
description: 웹 프론트엔드 성능 및 접근성 최적화 가이드. Core Web Vitals, 불필요한 리렌더링 방지, 이미지 최적화, a11y 접근성 표준을 준수할 때 사용.
---

# Web Performance & Accessibility Guide

이 스킬은 웹 애플리케이션의 렌더링 성능 최적화와 웹 접근성(a11y) 표준을 충족하는 코드를 작성하도록 안내합니다.

## 1. 프론트엔드 성능 최적화 (Core Web Vitals)

### LCP (Largest Contentful Paint - 로딩 속도)
- [ ] 중요한 이미지(Hero Image 등)에 `priority` 또는 `preload` 속성이 적용되었는가?
- [ ] 무거운 라이브러리(차트, 에디터 등)는 초기 번들에서 제외하고 Dynamic Import(코드 분할)로 지연 로딩하는가?
- [ ] 이미지는 WebP/AVIF 최신 포맷을 사용하며, 반응형 크기(`srcset`/`sizes`)가 지정되었는가?

### INP / FID (Interaction to Next Paint - 반응성)
- [ ] 메인 스레드를 50ms 이상 차단하는 무거운 동기 연산이 없는가? (필요 시 Web Worker 또는 `setTimeout` 분할)
- [ ] 검색/입력 이벤트 리스너에 Debounce 또는 Throttle이 적절히 적용되었는가?

### CLS (Cumulative Layout Shift - 시각적 안정성)
- [ ] 모든 `<img>`, `<video>`, `<iframe>` 요소에 명시적인 `width`와 `height` 또는 `aspect-ratio`가 설정되어 레이아웃 밀림이 없는가?
- [ ] 폰트 로딩 시 `font-display: swap` 또는 `optional`을 적용하여 FOIT/FOUT 깜빡임을 방지하였는가?

### 렌더링 최적화 (React / Vue / DOM)
- [ ] 반복 렌더링되는 리스트의 `key`에 배열 인덱스(`index`) 대신 고유 ID를 사용하였는가?
- [ ] 부모 컴포넌트 렌더링 시 불필요하게 모든 자식 컴포넌트가 재렌더링되지 않도록 상태(State)의 위치를 적절히 격리(State Colocation)하였는가?

## 2. 웹 접근성 (a11y) 필수 체크리스트
- [ ] 모든 이미지에 의미 있는 `alt` 텍스트가 제공되는가? (장식용 이미지는 `alt=""` 명시)
- [ ] 모든 버튼과 링크는 키보드(`Tab`, `Enter`, `Space`)로 포커스 및 실행이 가능한가?
- [ ] 텍스트와 배경색 간의 명도 대비(Contrast Ratio)가 최소 4.5:1 (큰 텍스트는 3:1) 이상인가?
- [ ] 폼 입력 컨트롤(`<input>`, `<select>`)에 연동된 `<label>`이 명시적으로 연결되어 있는가?
- [ ] 시각적 의미만 있는 아이콘 버튼에 `aria-label`이 제공되는가?
