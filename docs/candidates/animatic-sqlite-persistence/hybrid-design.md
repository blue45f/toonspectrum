# Animatic SQLite persistence hybrid design

## 결정

애니매틱 제품 기본 저장 권위는 V12 공유 SQLite OPFS 파일 하나다.

```text
StudioAnimaticDocument
  → exportStudioAnimaticDocument (validate + normalize + canonical JSON)
  → createStudioAnimaticSqlitePersistence
  → StudioLocalDatabase.kvSet("studio-animatic-v12", scoped-key, json)
  → SQLite 3.53.0 WASM
  → OPFS SAH-pool /studio-local-v12.db
```

로드는 역방향으로 `kvGet → importStudioAnimaticDocument`를 반드시 거친다. JSON parse,
schema, 총 duration/frame/text/export 한도를 통과하지 못한 값은 `document: null`,
`status: "invalid"`로 fail-closed 한다. 부분 segment나 임의 복구 문서를 반환하지 않는다.

## 역할 분담

- **SQLite OPFS**: 제품 기본 영속 권위, 재개방, shared V12 DB migration, fail-closed load.
- **localStorage adapter**: 명시적으로 주입한 test/embed seam만 유지한다. 제품 기본 fallback,
  기존 Studio namespace 자동 읽기, 자동 migration에는 사용하지 않는다.
- **memory-only**: 단위 테스트와 fault injection만 허용한다. durable 제품 결과로 표시하지 않는다.

## 권위와 폐기 경계

- 논리 파일명은 오직 `/studio-local-v12.db`다.
- OPFS SAH-pool directory는 `toonspectrum-studio-sqlite`다.
- 애니매틱 namespace는 `studio-animatic-v12`다.
- `LEGACY_DATA_MIGRATION=FALSE`: `/studio-local.db`나 옛 localStorage 애니매틱을 자동으로
  읽지 않는다.
- `DISCARD_EXISTING_STUDIO_DATA=TRUE`: 승인된 V12 cutover 파괴 절차 외에는 이전 데이터를
  병합하지 않는다.

## Worker 경계

실측 하니스는 Vite production build로 생성된 module Dedicated Worker에서 제품 persistence와
제품 DB open 함수를 실행한다. COOP `same-origin`, COEP `require-corp`, CORP `same-origin`, CSP
`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'`를 적용한다. 120번의 799,973B 문서 저장과
120번의 로드는 Worker에서 수행되며 main page에는 최종 JSON receipt만 전달된다.

## 의미 보존 게이트

1. 최대 180 segments와 segment당 16 camera keyframes를 유지한다.
2. cue 수를 이진 탐색해 다음 cue가 800KB export gate에서 실패하는 경계까지 채운다.
3. 각 sequential edit를 제품 `save()`로 저장한다.
4. 저장 직전 canonical JSON과 SQLite raw bytes/digest를 비교한다.
5. DB를 닫고 같은 OPFS 파일을 재개방한다.
6. 제품 `load()` 후 다시 export한 bytes/digest가 완전히 같은지 비교한다.
7. 별도 work-scope key에 손상 JSON을 넣고 invalid/null을 확인한다.
8. 손상 probe 이후 주 문서가 그대로인지 재확인한다.

## 오류와 fallback

OPFS, WASM, SAH-pool 설치 또는 DB open이 실패하면 `SqliteUnavailableError`/unavailable 상태를
표면화한다. memory나 localStorage로 조용히 내려가지 않는다. 호스트가 test/embed adapter를
명시적으로 주입하는 것은 별도 결정이며 제품 성공으로 간주하지 않는다.

## 교체 조건

다른 저장 provider는 동일 799,973B corpus에서 canonical bytes/digest exact, corruption
fail-closed, 명시 close/reopen, legacy open 0, 120개 raw save/load sample을 모두 통과해야 한다.
그 후 p95 또는 배포 비용을 유의미하게 개선할 때만 challenger가 된다. 메모리-only 결과나
UI thread synchronous 측정만으로 SQLite OPFS를 교체하지 않는다.
