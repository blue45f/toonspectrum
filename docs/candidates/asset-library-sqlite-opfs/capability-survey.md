# Asset library SQLite/OPFS capability survey

## 범위와 최소 통과 조건

대상은 `/studio`의 사용자 업로드·AI 생성·3D 생성 로컬 에셋이다. 최소 통과 조건은 원본 바이트
SHA-256 동일성, MIME·크기·권리 메타데이터 보존, 손상·누락 시 전체 요청 fail-closed,
`LEGACY_DATA_MIGRATION=FALSE`, SQLite TEXT/base64 금지다. 이미지의 픽셀 품질은 저장 계층이
재인코딩하지 않으므로 원본 바이트 동등성으로 판정한다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shared `studio-local-v12.db` KV manifest + existing OPFS SHA-256 CAS | 기존 SQLite 권위·CAS dedupe·mark-and-sweep·실패 주입 하네스를 그대로 재사용한다 | 브라우저 OPFS 실성능과 다중 OS 행렬은 별도 측정 필요 | 재인코딩 0, `get(..., verify:true)` 원본 SHA-256 검증 | 이번 slice는 기능 검증만 수행, 미측정 | 개별 복원은 최대 64 MiB로 제한; 브라우저 peak 미측정 | 기존 sqlite-wasm/CAS 외 추가 번들 0 | canonical JSON, 결정적 정렬, content hash | SQLite public domain; OPFS/Web Locks는 웹 표준 | 제품 API가 data URL을 요구해 읽을 때 1회 인메모리 변환 | 공유 CAS 색인의 다중 소비자 운영이 핵심 위험 | **제품 권위** |
| IndexedDB object store에 data URL/Blob 저장 | 브라우저 기본 API, 기존 구현·해시 인덱스가 존재 | SQLite 저널·권리 원장과 분리되고 RMW/복구 정책이 중복된다 | Blob이면 원본 보존 가능, 기존 data URL은 문자열 팽창 | 미측정 | 큰 `getAll()`과 data URL 복사 위험 | 추가 번들 0 | 트랜잭션 범위에서는 결정적 | 웹 표준 | 낮음 | 구형 DB 자동 탐색·이중 권위 위험 | 명시적 legacy import/test seam만 |
| Raw OPFS JSON manifest + blob files | 바이너리 저장이 단순하고 base64가 없다 | 쿼리·트랜잭션·스키마 migration·다중 탭 직렬화를 직접 구현해야 한다 | 원본 보존 가능 | 미측정 | manifest 전체 파싱 | 추가 번들 0 | 직접 canonicalization 필요 | 웹 표준 | 중간 | 별도 DB 엔진을 재발명할 위험 | 비선택 challenger |
| SQLite TEXT에 base64 payload | 단일 파일 백업이 단순해 보인다 | 4/3 팽창, JS 문자열 복사, SQL 페이지 비대화 | 원본 복원 가능하나 품질 이점 0 | 미측정 | 최악 | 추가 번들 0 | 결정적 | SQLite public domain | 낮음 | 용량·메모리·hot read 비용 | **금지** |

## 선택

Shared SQLite/OPFS 조합을 선택했다. SQLite에는 `studio-asset-library-v12/manifest-v1`만 저장하고,
바이너리는 `toonspectrum-studio-assets` CAS에 저장한다. IndexedDB는
`createLegacyIndexedDbStudioAssetLibrary({ indexedDB })`를 호출한 경우에만 열린다.
