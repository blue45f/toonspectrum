# Custom font durable authority — hybrid design

## 제품 흐름

```text
StudioInspectorAside / element.typography
  → StudioCustomFontsPanel (uncontrolled product mode)
  → StudioCustomFontRepository
  ├─ SQLite namespace studio-custom-font-library-v12
  │    └─ strict canonical manifest-v1 metadata
  └─ shared OPFS SHA-256 CAS
       └─ original TTF/OTF/TTC/WOFF/WOFF2 bytes
```

패널은 기존 lazy Inspector의 글자·말풍선 typography 섹션에만 마운트한다. 새 route나 병렬 Studio를
만들지 않는다. repository 모듈은 패널 hydration 시 dynamic import되므로 캔버스 첫 paint 경로에
SQLite를 정적 연결하지 않는다.

## 쓰기 프로토콜

1. 파일 크기 상한을 `arrayBuffer()` 전에 검사한다.
2. 바이트 4-byte magic으로 포맷을 판별하고 canonical 파일명/family를 만든다.
3. 현재 SQLite manifest의 개수·논리 바이트 상한을 확인한다.
4. OPFS CAS에 원본 바이트를 identity codec으로 기록한다.
5. CAS 영수증의 SHA-256·크기·MIME을 입력과 대조한다.
6. `get(hash, { verify:true })`로 다시 읽고 SHA-256과 포맷 서명을 확인한다.
7. old∪new hash를 custom-font owner reference에 먼저 등록한다.
8. SQLite canonical manifest를 마지막에 커밋한다.
9. 실패하면 owner reference를 old 집합으로 롤백한다.
10. 성공 뒤 owner를 new 집합으로 축소하고 bounded orphan sweep을 실행한다.

Manifest가 마지막 정본이다. 중단은 회수 가능한 orphan을 남길 수 있지만, 검증되지 않은 blob을
가리키는 manifest를 공개하지 않는다. 로드는 모든 entry의 stat·SHA-256·magic을 검증한 후에만
목록 전체를 공개하며 하나라도 손상되면 부분 복구하지 않는다.

## UI 동시성 및 장애 의미

- hydration generation과 mutation generation을 분리해 오래 걸린 이전 요청이 최신 repository/UI
  상태를 덮어쓰지 못한다.
- repository 내부 promise queue가 같은 탭의 겹친 save/delete를 호출 순서대로 처리한다.
- 제품 writer는 Web Locks가 없으면 durable write를 거절한다.
- SQLite/OPFS를 처음부터 열 수 없으면 `memory-only`를 명시하고 새로고침 시 소실을 표시한다.
- corrupt/noncanonical/missing/tampered 상태는 memory fallback으로 숨기지 않고 `unavailable`로
  fail-closed한다.
- controlled `fonts/onFontsChange`와 동기 localStorage 함수는 명시적으로 주입한 legacy test/import
  seam일 뿐 제품 기본 경로에서 읽지 않는다. `LEGACY_DATA_MIGRATION=FALSE`이므로 자동 병합도 없다.

## FontFace 품질 경계

제품 repository가 반환하는 객체에는 data URL 대신 `verifiedBytes`가 있다. 패널은 그 바이트를
복사한 `ArrayBuffer`를 `FontFace` 생성자에 직접 전달한다. 따라서 SQLite JSON/base64 변환이나
폰트 재인코딩이 glyph outline, hinting, OpenType table을 바꿀 경로가 없다.

## 실브라우저로 확인한 실행 토폴로지

2026-08-09 Chromium 140 production-build gate는 다음 경로를 그대로 실행했다.

```text
Vite production page
  → module Dedicated Worker
  → createStudioCustomFontSqliteOpfsRepository() (options 없음)
  ├─ acquireStudioLocalDatabase()
  │    → @sqlite.org/sqlite-wasm 3.53.0-build1
  │    → OPFS SAH pool /studio-local-v12.db
  └─ acquireProductStudioAssetCasStore()
       → native OPFS toonspectrum-studio-assets
       → identity blobs/<sha256>.bin
  → Worker close / forced terminate
  → 새 Worker repository.list()의 stat + SHA-256 + magic 검증
  → recovered verifiedBytes를 page로 transfer
  → FontFace(ArrayBuffer) + Canvas2D CJK raster hash
```

프로덕션 산출물은 Worker 313,451 B, SQLite WASM 864,752 B였다. 시스템 폰트는 임시 preview의
same-origin endpoint에서 스트리밍했으며 production asset receipt의 크기·SHA를 전수 대조해 폰트
바이트가 번들에 포함되지 않았음을 고정했다. CAS의 실제 물리 파일은 23,278,008 B와 66,933,080 B
identity blob 두 개였고, SQLite SAH-pool은 별도 253,952 B였다.

장애 실측은 제품 `list()` 앞의 별도 검증기가 아니다. 실제 저장소가 읽는 동일 CAS 물리 파일과
SQLite manifest를 고장 낸 뒤 `list()` 결과를 관찰했다. missing blob, 같은 길이 hash tamper,
metadata size mismatch 모두 부분 목록이나 memory fallback 없이 `corrupt`를 반환했다. committed
manifest 직후 Worker를 닫지 않고 종료한 시나리오도 새 Worker에서 exact SHA/length로 복구됐다.

메모리는 추정하지 않았다. Dedicated Worker의 `performance.memory`와
`measureUserAgentSpecificMemory`는 모두 미노출이라 값은 `null`과 사유를 남겼다. page의 실제
`performance.memory.usedJSHeapSize` 스냅샷은 시작 705,417 B, 완료 185,781,756 B였지만 이는 peak가
아니며, 두 recovered font ArrayBuffer와 canvas evidence가 살아 있는 시점의 스냅샷으로만 해석한다.
