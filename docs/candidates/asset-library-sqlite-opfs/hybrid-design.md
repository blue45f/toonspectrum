# Asset library SQLite/OPFS hybrid design

## 권위 분리

```text
/studio saveAsset(input data URL)
  → bounded decode + MIME validation
  → OPFS CAS put(SHA-256)
  → stat/get(verify=true) hash·size·MIME 재검증
  → old∪new owner refs 보호
  → shared SQLite canonical manifest commit (authority, last)
  → owner refs를 new로 축소
  → grace-aware mark-and-sweep
```

SQLite manifest entry는 `id/name/contentHash/byteSize/mimeType/width/height/createdAt/kind/rights`만
포함한다. `dataUrl`, base64, Blob, 엔진 객체는 들어가지 않는다. 권리 정보는 source, license,
attribution, 확인 여부를 정확한 필드 집합으로 저장하며 unknown을 허가로 승격하지 않는다.

## 원자성 및 복구

- 신규 blob은 manifest보다 먼저 기록하고 실제 bytes SHA-256을 다시 검증한다.
- manifest 이전 owner refs는 기존·신규 hash의 합집합이다. 커밋 실패 시 이전 refs로 되돌린다.
- SQLite `kvSet` 성공 시 manifest가 유일한 목록 권위다. 이후 owner 축소나 sweep 실패는 데이터
  손실이 아니라 회수 가능한 orphan으로 남고 다음 `list/cleanupOrphans`가 정리한다.
- list/query는 manifest 전체를 strict canonical 검증한 뒤 요청된 blob만 순차 검증한다. 하나라도
  없거나 hash·size·MIME가 다르면 일부 목록을 반환하지 않는다.
- 동일 탭 mutation은 promise-tail queue, 제품 탭 간 mutation은 Web Locks exclusive lock으로
  직렬화한다. Web Locks가 없으면 durable write를 성공으로 표시하지 않는다.

## 경계와 상한

- 항목 1,000개, 개별 원본 64 MiB, 논리 총량 1 GiB, manifest 8 MiB.
- 이름 160 code point, kind 80, 권리 텍스트 2,000, 안전한 ASCII ID만 허용한다.
- manifest-side 검색과 keyset pagination은 페이지당 최대 200개다.
- content identity 조회는 hash 32개, hash당 후보 8개, 총 후보/문자/UTF-8 예산을 기존 계약과
  동일하게 유지한다.

## 제품 배선

기존 무인자 `saveAsset/listAssets/deleteAsset/renameAsset/find...` API는 동적 import로
`getProductStudioAssetLibraryRepository()`를 사용한다. `StudioPage`는 hydration generation과
mutation generation을 따로 fence하고 UI mutation을 직렬화한다. OPFS/SQLite 불가·quota는
검증된 현재 mutation만 탭 메모리에 유지하며 새로고침 시 사라진다는 오류를 표시한다. corrupt,
torn, missing blob은 memory merge 없이 fail-closed한다.
