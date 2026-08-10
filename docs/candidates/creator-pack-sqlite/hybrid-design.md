# Creator Pack SQLite 하이브리드 설계

## 제품 데이터 흐름

```text
Creator Pack JSON / Marketplace record
  → validateStudioCreatorPack (권리·shape·byte/runtime budget)
  → kind별 materializer
      brush  → StudioSavedBrush[] → BrushLibraryRepository.putMany
      filter → Effect preset[]     → FilterLibraryRepository.putMany
  → V12 SQLite package receipt (brush version/fingerprint)
  → library-changed event
  → 열린 SQL keyset UI가 현재 로드 깊이만 재조회
```

브러시 ID는 `creator-pack:<packageId>:<entryId>`로 결정적이다. 같은 항목을 업데이트해도
사용자의 `createdAt`, 고정 상태, 최근 사용 시각은 보존한다. 필터는 자체 SQL 레코드에
package version/fingerprint가 있으므로 별도 영수증이 필요 없다.

## 일관성과 장애 계약

현재 공개 brush repository는 `putMany`와 KV 영수증을 하나의 호출자 트랜잭션으로 묶는 API를
제공하지 않는다. 따라서 순서는 “행 commit → 영수증 commit”이다.

- 행 일부/전부만 존재하면 상태는 `repair-required`다.
- 영수증이 손상되면 설치 완료로 처리하지 않고 오류를 표면화한다.
- 동일 버전·다른 fingerprint는 `conflict`, 더 오래된 입력은 `downgrade-blocked`다.
- repair는 같은 결정적 ID에 재-upsert한 뒤 영수증을 다시 쓴다.
- 자동 localStorage fallback이나 기존 Studio 데이터 import로 성공을 가장하지 않는다.

이 모델은 중단 뒤 재시도가 안전하지만 완전한 단일 SQL transaction은 아니다. 향후 repository가
`commitPack(entries, receipt)`를 제공하면 같은 DB의 `BEGIN IMMEDIATE` 안으로 합치는 것이 교체
조건이다.

## UI 소비

설치/제거가 완료되면 V12 brush/filter 변경 이벤트를 발행한다. 브러시 패널은 전체 카탈로그를
읽지 않고 사용자가 이미 펼친 깊이만 재조회하며, 초기 256개 이후에는 keyset “더 불러오기”를
사용한다. 필터 다이얼로그도 선택 엔진별 128개 keyset 페이지를 사용한다. 저장 수량에는 상한이
없고 UI 페이지 크기는 용량 상한이 아니다.
