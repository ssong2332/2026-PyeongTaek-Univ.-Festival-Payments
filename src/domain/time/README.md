# domain/time — `kst.ts`(KST 날짜 ↔ UTC 범위 계산), `utcIso.ts`(오프셋이 붙은 시각 → ISO UTC `…Z` 밀리초 표기). 런타임이 UTC이므로 로컬 시간대에 기대지 않는다. 사용처: stats 집계·관리자 주문 목록 기본 날짜(kst), 고객 주문 상태 응답 시각(utcIso).
