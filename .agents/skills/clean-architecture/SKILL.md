---
name: clean-architecture
description: 클린 아키텍처 및 계층 분리 가이드. 모듈 경계, 단방향 의존성, DTO/Entity 분리, 인터페이스 기반 설계를 준수할 때 사용.
---

# Clean Architecture Guide

이 스킬은 비즈니스 로직과 프레임워크/외부 인프라를 분리하여 변경에 유연하고 테스트하기 쉬운 계층형 아키텍처를 설계·구현하도록 안내합니다.

## 핵심 계층 구조 (Standard Layering)

```
[ Domain / Entity ] ◀── [ Use Case / Service ] ◀── [ Interface / Controller ] ◀── [ Framework / External ]
```

1. **Domain (엔티티 / 핵심 비즈니스 규칙)**
   - 프레임워크나 외부 라이브러리에 의존하지 않는 순수 비즈니스 객체 및 값 객체(VO).
2. **Use Case / Service (애플리케이션 비즈니스 규칙)**
   - 시스템의 유즈케이스 흐름을 제어. 도메인 객체를 조작하며 비즈니스 워크플로우 수행.
   - 외부 저장소나 외부 API와의 통신은 인터페이스(Repository Interface)로만 추상화.
3. **Interface / Adapters (컨트롤러, DTO, 리포지토리 구현체)**
   - 외부 요청을 처리하는 Presentation 계층(HTTP 핸들러, CLI, GraphQL).
   - 영속성 계층(DB ORM, SQL 매퍼) 구현체.
   - 요청/응답 데이터 전송 객체(DTO)와 도메인 엔티티 간의 변환(Mapping) 전담.

## 설계 및 구현 규칙

1. **의존성 역전 원칙 (DIP)**
   - 고수준 모듈(Service)은 저수준 모듈(DB/HTTP 클라이언트)에 직접 의존하지 않는다.
   - Service는 Repository 인터페이스를 참조하고, 실제 구현체는 의존성 주입(DI)으로 제공받는다.

2. **계층 간 데이터 누출 금지 (Strict DTO Boundary)**
   - DB 엔티티나 ORM 모델을 Controller/API 응답으로 직접 반환하지 않는다.
   - 항상 RequestDTO → Domain Entity → ResponseDTO 변환 과정을 거친다.

3. **단일 책임 원칙 (SRP)과 파일 배치**
   - 하나의 파일/클래스는 단 하나의 변경 이유만 가져야 한다.
   - 파일 크기가 300줄을 넘어가기 시작하면 책임 분리(Service 분할, Helper 분리)를 검토한다.

## 아키텍처 검증 체크리스트
- [ ] 비즈니스 로직(Service) 내에 특정 웹 프레임워크(Express, FastAPI, Spring 등)의 Request/Response 객체가 직접 유입되지 않았는가?
- [ ] SQL 쿼리나 DB 연결 코드가 도메인/서비스 계층이 아닌 Repository 구현체에만 위치하는가?
- [ ] 각 모듈 간의 순환 참조(Circular Dependency)가 없는가?
