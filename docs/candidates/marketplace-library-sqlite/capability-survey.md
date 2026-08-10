# Original marketplace package-library persistence survey

제품 경계는 `StudioOriginalAssetMarketplacePanel`의 설치·업데이트·제거 상태다. 패키지 본문은
번들 원본이며 이 레인은 설치 manifest만 저장한다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 공식 `@sqlite.org/sqlite-wasm` + OPFS SAH-pool | transaction, 공유 V12 DB, strict canonical row, 재개방 | Safari/Firefox SAH-pool 실기기 매트릭스 | 해당 없음; 렌더 바이트를 저장하지 않음 | focused repository test에서 기능 검증; 별도 microbenchmark는 계획 문서 참조 | 브라우저 API 미노출로 추정하지 않음 | 기존 공유 SQLite chunk 재사용 | canonical JSON byte-stable | blessing/SQLite public domain; wrapper Apache-2.0 | 낮음 | SAH-pool 단일 owner 유지 필요 | **제품 권위** |
| localStorage JSON envelope | 작은 동기 preference에 단순 | transaction, 비동기 I/O, 큰 quota, 손상 격리 | 해당 없음 | 동기 main-thread I/O라 제품 후보 탈락 | 전체 envelope 문자열 복제 | 추가 번들 0 | 탭 간 last-writer-wins | Web Platform | 낮음 | 데이터 권위 재분산 | 명시적 legacy/test seam만 |
| IndexedDB | 비동기 blob/object store | V12 공유 SQL transaction·canonical KV와 중복 권위 | 해당 없음 | 이 레인 실측 없음 | 미측정 | 브라우저 내장 | callback/event 오류 표면 복잡 | Web Platform | 중간 | 기능별 DB 재도입 | 기각 |

최종 선택은 기존 V12 SQLite handle의 KV namespace
`studio-marketplace-package-library-v12`다. 손상·중복·unknown field·비canonical JSON은 전체 읽기를
거부하고 빈 정상 라이브러리로 바꾸지 않는다.
