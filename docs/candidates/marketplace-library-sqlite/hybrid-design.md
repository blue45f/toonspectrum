# Original marketplace package-library hybrid design

## 데이터 흐름

```text
bundled original package catalog
  -> pure add/update/remove reducer
  -> StudioMarketplaceLibrarySqliteRepository
  -> shared /studio-local-v12.db KV namespace
  -> async hydration + mutation generation fence
  -> installed/update projection in the existing /studio panel
```

SQLite는 설치 manifest의 내구성과 동시 mutation 직렬화를 소유한다. 패키지 검색·권리 검사·충돌
clone ID·버전 비교는 안정된 ToonStudio 모델이 소유한다. 엔진 객체나 렌더 픽셀은 저장하지 않는다.

제품 패널은 optimistic state를 표시하되 SQLite commit 실패 시 직전 상태로 되돌리고 “저장됨”으로
표시하지 않는다. 늦은 hydration이나 앞선 mutation 완료는 generation fence를 통과하지 못한다.
동시 writer에서 현재 SQLite 값을 다시 읽어 새 항목을 병합하고, 제거 ID는 tombstone 성격의
명시 인자로 전달한다. 200개를 넘으면 기존 항목을 자동 축출하지 않고 전체 mutation을 거부한다.

레거시 `loadStudioMarketplaceLibrary`/`saveStudioMarketplaceLibrary`는 순수 호환 테스트 seam에만
남는다. 제품 패널은 해당 함수와 `localStorage`를 import하지 않는다.
