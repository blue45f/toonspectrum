# 외부 검증 도구 3종 적합도 평가 (2026-08-30)

레포에 없던 실재 도구 3종을 실측 검토했다. 두 개는 채택했고, 하나는 근거를 남기고
보류했다. 세 패키지 모두 npm 레지스트리에 실재하며 명시된 버전이 `latest` 다.

| 도구 | 판정 | 결과물 |
| --- | --- | --- |
| `@typescript/analyze-trace@0.11.1` | **채택** | `pnpm run typecheck:trace:report` |
| Khronos `gltf-validator@2.0.0-dev.3.10` | **채택** | `pnpm run verify:studio-glb-export` |
| `wgsl-test@0.2.33` | **보류** | 아래 §3 |

---

## 1. `@typescript/analyze-trace@0.11.1` — 채택

`pnpm run typecheck` 는 루트 `tsc -p tsconfig.json` 하나가 `src/**`, `components/**`,
`lib/**`, `**/*.mts` 를 전부 물고 도는 단일 프로그램이라 느리다. 어디가 느린지에 대한
가설을 세울 수단이 지금까지 없었다. `--generateTrace` 는 tsc 가 내장으로 제공하지만
산출물이 20MB 대의 Chrome trace JSON 이라 사람이 읽을 수 없고, analyze-trace 는 그
trace 를 "어느 파일의 어느 타입이 몇 초를 먹었는지" 로 환원해주는 유일한 실재 도구다.

```console
pnpm run typecheck:trace          # .tstrace/trace.json + types.json 생성
pnpm run typecheck:analyze-trace  # hot spot 리포트
pnpm run typecheck:trace:report   # 둘을 이어서
```

`--incremental false` 를 명시한다. 루트 tsconfig 는 `incremental: true` 라, 워밍된
`.tsbuildinfo` 가 있으면 trace 가 실제 작업의 일부만 담아 조용히 오해를 부른다.

`.tstrace/` 는 `.gitignore` 에 넣었다 — 매번 재생성되는 산출물이다.

## 2. Khronos `gltf-validator` — 채택

`scripts/verify-studio-glb-export.mjs` 를 추가했다 (`pnpm run verify:studio-glb-export`).

동기: `studio-hybrid-dcc-glb-export.ts` 는 GLB 2.0 컨테이너를 손으로 쓴다 — 청크 헤더,
버퍼 뷰, accessor min/max, 정렬 패딩까지. 기존 유닛 스위트는 그 바이트 배치를 **우리
리더로** 검증하기 때문에, 스펙을 양쪽이 똑같이 잘못 읽으면 그대로 통과한다. 이 게이트는
그 고리를 두 개의 독립 구현으로 끊는다:

1. **Khronos `gltf-validator`** — 공식 웹 밸리데이터와 같은 Dart 구현. 바이트가 합법적인
   glTF 2.0 인지에 대한 규범적 판정자.
2. **`@gltf-transform/core`** (이미 레포 의존성) — 독립 파서. 우리 `metrics` 와 어긋나면
   둘 중 하나가 틀린 것이다.

픽스처 4종(단위 큐브 / 단일 삼각형 / 오각형 팬 / 분리된 쿼드 2개)에 대해 결정성(같은
메시를 두 번 export 해 바이트 동일), 컨테이너 헤더, accessor 경계, 인덱스 범위,
`asset.generator` 를 검증하고, 차단 경로(`sourceHash` 불일치)가 부분 바이트를 내지
않는지도 확인한다.

실측 결과 — 4종 전부 Khronos 에러 0 / 경고 0 / info 0:

```
  ok  unit-cube               12 tri     24 vtx     3380 B  idx=UNSIGNED_INT  validator: 0E/0W/0I  losses=0
  ok  single-triangle          1 tri      3 vtx     2188 B  idx=UNSIGNED_INT  validator: 0E/0W/0I  losses=0
  ok  pentagon-fan             3 tri      5 vtx     2320 B  idx=UNSIGNED_INT  validator: 0E/0W/0I  losses=0
  ok  two-disjoint-quads       4 tri      8 vtx     2504 B  idx=UNSIGNED_INT  validator: 0E/0W/0I  losses=0
  ok  blocked-export       hash mismatch refused: source-hash-mismatch
```

게이트가 실제로 무는지 변이 테스트로 확인했다. 정상 출력은 0 에러, JSON 청크를 손상시킨
같은 파일은 4 에러(`GLB_CHUNK_LENGTH_UNALIGNED`, `GLB_CHUNK_TOO_BIG`)를 낸다.

`asset.generator` 는 파싱된 Document 가 아니라 **원본 JSON 청크**에서 읽는다.
`@gltf-transform/core` 는 자신이 만드는 모든 Document 에 자기 `generator`
(`"glTF-Transform v4.4.2"`)를 찍기 때문에, Document 경유로 읽으면 우리 exporter 가 아니라
glTF-Transform 을 검증하게 된다. (이 게이트를 처음 돌렸을 때 실제로 걸린 함정이다.)

## 3. `wgsl-test@0.2.33` — 보류

패키지는 실재하고(wesl-js 팀, `github:webgpu-tools/wesl-js`), `peerDependencies.vitest`
`^4.1.0` 은 레포의 vitest 4.1.9 와 맞는다. 그럼에도 "레포 WGSL 코퍼스에 가장 잘 맞는
발견"이라는 전제는 실측과 두 군데서 어긋난다.

**(a) 대상 규모가 다르다.** WGSL 106개가 아니다:

| 위치 | 개수 | 성격 |
| --- | --- | --- |
| `tests/corpus/wgsl-variants/` | 35 | **생성물** — `wgsl-variants-corpus.test.ts` 가 방출·드리프트 게이트 |
| `tests/corpus/wgsl-variants-negative/` | 17 | 생성물(음성 코퍼스) |
| `crates/vendor/wgpu-toon/src/util/` | 1 | 벤더된 wgpu 소스 |
| `packages/studio-engine-registry/src/wesl/` | 7 `.wesl` | **유일한 손으로 쓰는 셰이더 소스** |

즉 `.wgsl` 53개 중 52개가 손으로 쓰지 않는 생성 코퍼스이고, 사람이 작성하는 셰이더는
`.wesl` 7개다.

**(b) 그 52개는 이미 전수 검증된다.** `crates/studio-engine-vello/tests/wgsl_variant_validation.rs`
가 코퍼스 전체를 `naga::front::wgsl` 로 파싱하고 `naga::valid::Validator`(ValidationFlags::all,
WebGPU 베이스라인 Capabilities)로 검증하며, 매니페스트↔디렉터리 집합 일치까지 본다.
음성 코퍼스는 `wgsl_variant_negative_validation.rs` 가 맡는다. `.wesl` 7개 쪽은
`packages/studio-engine-registry/src/__tests__/wesl-compile.test.ts` 가 35종 전 조합의
링크 산출을 구조적으로 게이트하고, 실행 동등성은 옵트인 Playwright Chromium 프로브가 본다.

**wgsl-test 가 실제로 더하는 것**은 정적 검증이 아니라 `.wesl` 소스 안의 `@test` /
`@snapshot` 어노테이션을 **실제 GPU 디바이스에서 실행**하고 PNG 스냅샷을 비교하는
것이다(`wesl-gpu`, `runCompute`, `toMatchImage`, `DeviceCache`). 도입 비용은 두 가지다:

1. 7개 `.wesl` 모듈에 `@test` 어노테이션을 새로 작성해야 한다 — 도구를 켠다고 기존
   자산이 자동으로 커버되지 않는다.
2. `webgpu@^0.3.8`("WebGPU for node", 네이티브 Dawn 바인딩)이라는 **두 번째 GPU 런타임**이
   들어온다. 레포의 GPU 검증은 현재 전부 Playwright Chromium 실디바이스 경계
   (`real-chromium-webgpu-device-boundary`)로 통일돼 있고, CI 에 GPU 도 없다.

**채택 조건.** 아래가 참이 되면 재평가할 가치가 있다 — (1) `.wesl` 모듈에 단위 수준
수치 단언을 붙이고 싶은 요구가 실제로 생기고, (2) 그 실행을 기존 Chromium 프로브로
표현하기 어렵다고 판명되고, (3) 네이티브 Dawn 을 CI 에서 돌릴 수 있을 때. 그 전까지는
Chromium 프로브를 확장하는 쪽이 스택을 하나로 유지한다.
