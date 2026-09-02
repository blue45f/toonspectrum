# ADR-0021: 획 예산(StrokeBudget), `.myb` 설정 disposition 계약, 실행 프로필

- 상태: Accepted
- 날짜: 2026-09-02
- 범위: 동적 브러시·수채·WebGPU 브러시 dab 상한, `.myb` importer와 그 소비자(kpp/krita-bundle/
  브러시 팩 import/에셋 메타데이터), vNext 실행 프로필(Memory64)
- 관련: [ADR-0005](0005-inking-pipeline-staged.md), [ADR-0006](0006-natural-media-hokusai-first.md),
  `docs/studio-browser-native-engine-vnext-2026-07-27.md`,
  [외부 검토 2026-09-02](../architecture/studio-architecture-review-2026-09-02.md) §5·§6·§7

## 맥락

1. `e90aadbe`는 긴 획이 잘리지 않도록 동적 브러시 dab 상한을 4,096 → 32,768, 수채 상한을 16,384 → 32,768로
   올렸다. 고정 상한 증가는 잘림은 막지만 메모리 급증·배열 재할당·pointerup commit spike·undo payload 증가·
   저사양 정지를 다음 병목으로 만든다.
2. `.myb` importer는 존재하지 않는 `dabs_per_radius` 키를 읽어 실제 브러시 전부가 spacing 기본 10%로
   떨어졌고, `smudge`는 `mixing`에 적용하면서 "unmapped"로 보고했다. Hokusai 최종 픽셀은 원본 payload를
   다시 읽어 무사했지만 가져오기 직후 설정 UI, 공통 preview, 검색/분류 metadata, 다른 provider compile 경로,
   미매핑 경고가 틀렸다. `unmappedSettings: string[]` 하나로 네 가지 다른 운명을 표현한 것이 원인이다.
3. vNext 문서는 Memory64가 없으면 writable 프로필이 fail-closed다. Memory64는 4 GiB 주소 공간이 필요할 때
   쓰는 기능이지 더 빠른 기능이 아니며 워크로드에 따라 느려질 수 있다.

## 결정

### A. 획 예산

1. `packages/studio-brush-platform/src/stroke-budget.ts`의 `StrokeBudget { maxResidentBytes,
   maxSamplesPerFrame, maxDirtyTiles, maxCommitWorkMs, spillPolicy: "chunk" | "checkpoint" | "degrade" }`가
   획 자원의 단위다. 프로필은 `pro-webgpu-worker`, `webgpu-worker-lite`(기본), `webgl2-compat`, `cpu-reference`.
2. 기존 dab 상한은 삭제하지 않고 **예산에서 파생**한다: `resolveStrokeDabCapacity({ budget, bytesPerDab })`.
   이번 웨이브는 행동 불변이다 — 파생값이 정확히 32,768임을 테스트가 고정한다. 이후 chunked accepted prefix와
   tile flush(`planStrokeAcceptedPrefixChunks`)가 실제 커밋 경로에 들어가면 상한은 "잘림"이 아니라 "분할"이 된다.
3. 새 브러시 경로는 `maxDabs` 상수를 새로 만들지 않는다. 예산·bytesPerDab로 표현한다.

### B. `.myb` 설정 disposition

1. importer는 `dabs_per_basic_radius + dabs_per_actual_radius`로 spacing을 요약한다(저장소의 CC0 preset
   importer와 같은 식: `1 / (2·(DPAR + DPBR))`). `dabs_per_radius`는 실제 키가 없을 때만 legacy alias로 읽고
   `unsupported`로 보고한다.
2. 설정마다 `MybSettingDisposition` 다섯 가지 중 하나를 붙인다 — `mapped-exact`, `mapped-summary`,
   `provider-native`(Hokusai가 `sourcePayload`에서 직접 읽음), `parsed-inert`, `unsupported`.
   `unmappedSettings`는 호환을 위해 남기되 "`mapped-*`가 아닌 것"의 파생값이다. 적용한 설정을 unmapped로
   표시하는 사례는 0건이어야 한다.
3. provider-native 목록은 Hokusai raster compiler가 실제로 소비하는 목록과 테스트로 묶는다
   (`packages/studio-brush-platform` 쪽 드리프트 가드; format-gateway는 brush-platform을 import하지 않는다).
4. 테스트 fixture는 합성 JSON만 쓰지 않는다. `tests/corpus/brushes/myb/**/*.myb` 전체를 순회하는
   코퍼스 테스트가 spacing·disposition·결정적 순서를 검사한다.

### C. 실행 프로필과 Memory64

1. 기본 프로필은 wasm32 + OPFS windowing이다. Memory64는 capability가 있고 **실제 resident memory가
   4 GiB 논리 오프셋을 필요로 하는 대형 문서**에서만 켠다. Memory64 부재는 writable 프로필의 fail-closed
   조건에서 제외한다(vNext 문서의 해당 조항은 이 ADR로 개정된다).
2. 4 GiB 이상의 논리 문서는 resident heap이 아니라 tile shard와 windowed mapping으로 처리한다.
3. 브러시 Worker와 저장 Worker는 분리해 대형 저장 I/O가 프레임을 막지 않게 한다(로드맵 P2·P3).
4. 프로필은 브라우저 이름이 아니라 capability probe 결과로 고정한다 — `pro-webgpu-worker`,
   `webgpu-worker-lite`, `webgl2-compat`, `cpu-reference`.

## 결과

- 긍정: 확인된 호환성 오류(`.myb`)가 코퍼스 테스트로 닫힌다. 사용자에게 보이는 미매핑 경고가 정확해진다.
  dab 상한이 자원 예산으로 표현돼 이후 chunk 커밋을 붙일 자리가 생긴다. Memory64 미지원 기기가 vNext에서
  잘리지 않는다.
- 부정: `unmappedSettings` 의미가 좁아져 이를 스냅샷하던 테스트가 갱신됐다. 예산 파생 상한은 지금은 값이
  같으므로 성능 이득은 없다(다음 단계의 전제 조건일 뿐이다).
