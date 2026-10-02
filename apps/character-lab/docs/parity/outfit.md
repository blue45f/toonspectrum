# character-lab 패리티 — outfit-physics 영역(헤어·의상 절차 파츠·결정적 XPBD 물리·provider·패널)

상태: **current** (2026-10-01, outfit-physics 작업자 작성). core가 `docs/shaper-parity-checklist.md`로 집계하기 전의 단일 소스이며
열 구조는 체크리스트와 같다. 모든 로직은 순수 TS(`src/domains/outfit/**`, `src/domains/physics/**`)이고 `@babylonjs/*`·DOM을
쓰지 않으므로 Node vitest로 검증했다. 이 컨테이너에는 GPU가 없어 뷰포트 안 동작은 '브라우저 검증' 열에 **미검증**으로 둔다.

- 소유 파일: `src/domains/outfit/**`(hair-styles, hair-builder, garments, follow-body, geometry, fixtures, index + 테스트 4),
  `src/domains/physics/**`(core/chain/cloth/collision/rapier, pbd-chain, builtin/rapier/havok provider, provider-factory, fixtures + 테스트 14),
  `src/app/shell/panels/PhysicsPanel.tsx`(+`.test.tsx`), 이 문서.
- 열 의미: **구현 상태** 구현됨/부분/미구현 · **Node 검증** vitest 파일 · **브라우저 검증** 미검증 또는 `YYYY-MM-DD·기기·backend` · **비고** 베타·사유.

## 1. 조립 규약(humanoid-model·render가 지켜야 할 것)

1. outfit 파츠는 `partId: 0`, `materialId: 0`으로 돌려주고 조립기가 `allocatePartIds`로 재배정한다.
2. 파츠 `jointIndices` 중 `OUTFIT_AUX_BONE_INDEX_BASE`(= 55, `HUMANOID_BONE_NAMES.length`) 이상은 **그 결과의 `bones[index − 55]`**
   를 가리킨다. `buildHair`·`buildGarments` 결과를 합칠 때 `combineOutfitResults([hair, garments])`를 쓰면 두 번째 결과의
   보조 본 인덱스가 자동으로 밀린다. 기본 스켈레톤이 55본이 아니면 `remapAuxiliaryJointIndices(part, 55, 실제 본 수)`.
3. 보조 본은 `auxiliary: true`, 이름은 `hair_<style>_<i>_<j>` / `skirt_<i>_<j>` / `ribbon_<i>_<j>`(귀걸이·세일러 리본·리본 액세서리 공용 카운터).
   루트 보조 본의 parent는 `head`(헤어·리본·귀걸이) / `hips`(스커트) / `chest`(세일러 리본)이며 restTranslation은 추정 피벗
   (`assumedHeadPivot(scalp)` = 머리 중심 − up × 반경, `assumedBodyPivots(body)` = 영역 중심) 기준이다. 실제 rest 본 위치를 아는
   조립기는 `rebaseAuxiliaryRoots(bones, { head, hips, chest }, 추정값)`로 보정한다. 체인 `restPoints`는 모델 공간이라 보정과 무관하다.
4. 체인 예산: 헤어 ≤ 48 + 의상 ≤ 16 → 64체인·1,024입자 안(`outfitChainBudget`). 초과는 physics compile이 `budget-exceeded`로 거부한다.
5. 헤어 파츠는 `param:headSize:±` morph(머리 중심 기준 ±10% 스케일)를 가지며 두피 앵커는 `scalp.radius`를 따른다.
   의상 파츠는 전달받은 `bodyMorphs` 전부를 같은 이름으로 전파한다(이름 집합 동일).

## 2. 항목별 상태

| 항목(SHAPER 대응) | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
|---|---|---|---|---|
| 헤어 7종(short-layered·soft-bob·romance-long·action-pony·hime-cut·wolf-layered + twin-tail) 두피 기준 카드/스트랜드 번들 절차 생성 | 구현됨 | `outfit/hair-builder.test.ts`(7종 `validateMeshPartData` 통과·partId 0·role hair·colorKey hair·앵커 두피 근방·두피 관통 없음·머리 크기 추종) | 미검증(이방성 재질·알파 카드 표시) | 캡(두피 덮개) + 카드(쿼드 스트립, 끝 45% 테이퍼) + 번들(6면 원통 스윕, 헤어 타이 구). 앞 6종 id는 Blender kit HairStyle과 동일 |
| 헤어 구역 데이터(앞·옆·뒷머리·정수리·묶음, 방위/고도/길이/폭/늘어짐/벌어짐/컬/jitter/체인) | 구현됨 | 같은 파일(구역 수 = 스트랜드 수, twin-tail 번들 좌우 대칭) | — | `HAIR_STYLE_SPECS`, 길이·폭은 머리 반경 배수 |
| 헤어 보조 본 `hair_<style>_<i>_<j>` + ChainAnchor(VRMC_springBone 호환 stiffness/damping/gravity) | 구현됨 | 같은 파일(체인 수 = 스펙 예산, 입자 ≤ 16, 본 이름 유일, 루트 parent head, 스킨 인덱스 규약) | 미검증(본 바인딩은 render) | 체인 스타일별 5~28개, 입자 ≤ 308 |
| 헤어 결정성(같은 입력 → 같은 바이트, 시드 반영) | 구현됨 | 같은 파일 | — | `createPrng(seed ^ fnv1a32("hair:<style>"))` jitter |
| 상의 5(tee·hoodie·shirt·blazer·sailor) 체형 케이지 오프셋 셸 + 후드/칼라/라펠/세일러 칼라·리본 | 구현됨 | `outfit/garments.test.ts`(유효 메시·법선 오프셋 > 0·소매 덮임 차이·세일러 리본 파츠) | 미검증(재질 프리셋 표시) | 셸은 선택한 몸 삼각형을 법선으로 밀어낸 사본 + 경계 테두리(rim). 재질: 면·데님·실크 |
| 하의 5(jeans·shorts·pleated-skirt·long-skirt·slacks); 스커트는 플리츠/플레어 튜브 + `skirt_<i>_<j>` 체인 | 구현됨 | 같은 파일(스커트 체인 수 = 스트립 수, 입자 = rows+1, 바지는 체인 없음, 반바지 < 청바지 정점) | 미검증 | 플리츠 12스트립×7입자, 롱 10×11. 열 사이는 인접 스트립 본 2개 블렌드 |
| 신발 4(sneakers·loafers·boots·sandals) 갑피 셸 + 밑창 상자 + 샌들 스트랩 | 구현됨 | 같은 파일(밑창이 발 아래, 부츠 종아리 덮임, 샌들 갑피 없음) | 미검증 | 재질: 플라스틱·가죽 |
| 액세서리 6(glasses·ribbon·cap·earrings·choker·headphones) 절차 프리미티브, 리본·귀걸이 체인 | 구현됨 | 같은 파일(유효 메시, 리본·귀걸이 `ribbon` 체인 2개, 머리 액세서리 높이) | 미검증 | 안경(렌즈 링·브리지·템플), 캡(돔+챙), 헤드폰(밴드 호+컵), 초커(목 링) |
| 몸 정점 스킨 웨이트 상속(셸 항등, 절차 조각 최근접 4 역거리 가중 → 본별 누적 상위 4·정규화) | 구현됨 | `outfit/follow-body.test.ts`(합 1, 최근접 본 포함), `garments.test.ts` | — | 균일 격자 k-NN(동률 인덱스 순)으로 결정적 |
| 체형 morph 델타 전파(같은 매핑, Δu = Σ wₖ Δvₖ) · 어깨 폭 변경 시 상의 정점 이동 · morph 후 관통 ≤ 1% | 구현됨 | `follow-body.test.ts`, `garments.test.ts`(shoulderWidth+ → 바깥 이동 ≥95%, 관통 비율 ≤1%, hip+ → 롱스커트 반영) | — | MB-Lab 프록시 피팅 개념(코드 미열람, 수식 재구현). 삼각형 barycentric 대신 정점 k-NN(두께 보존은 셸 법선 오프셋) |
| `createOutfitBuilder(): OutfitBuilderPort`, 결과 병합·재매핑·피벗 보정·예산 집계 헬퍼 | 구현됨 | `outfit/index.test.ts`(7 헤어 × 의상 조합 합산 예산, 본 이름 유일, 인덱스 범위, 병합 시 인덱스 이동, 피벗 보정) | — | §1 규약 |
| XPBD 체인(거리·굽힘 제약, FTL 정확 길이, 고정 dt 1/120·서브스텝 2, `+ - * / sqrt fround`만) | 구현됨 | `physics/chain/constraint.test.ts`(100스텝 길이 오차 ≤1e-6, 루트 이동, 굽힘, 예산·정합성 실패 코드) | 미검증 | DETERMINISM_SCOPE `cross-engine-f32` |
| 캡슐 SDF 충돌(prev→current 보간, 투영↔거리 재적용을 라운드 관통 0까지 최대 12회 반복·조기 종료, 최종 투영으로 관통 0) | 구현됨 | `physics/collision/capsule.test.ts`(1,000입자 관통 없음·축 위 점 결정적·보간), `chain/settle.test.ts`(캡슐 위 settle 관통 0·길이 ≤1%) | 미검증 | 캡슐 24개 예산. character-physics.md §4.2의 고정 4회를 "수렴까지(상한 12)"로 바꿔 settle 후 길이 오차 ≤1%와 관통 0을 동시에 만족시킨다 |
| 결정성 해시(2회 동일, 입력 셔플 동일, SHA-256 영수증) · 바람 value-noise | 구현됨 | `physics/chain/determinism.test.ts`, `core/noise.test.ts`, `core/vec.test.ts` | 미검증(settle→캡처 PNG 해시 2회 동일) | `PhysicsReceipt{providerId, determinismScope, modelHash, poseHash, steps, dt, stateHash}` |
| 운동 에너지 단조 감소(감쇠만) | 구현됨 | `physics/chain/energy.test.ts` | — | |
| settle(기본 120, 상한 600, maxDelta ≤ 1e-5 m 조기 종료, 미수렴 `settled:false`) | 구현됨 | `physics/chain/settle.test.ts` | 미검증(rAF 분할·150 ms 예산) | |
| 클로스 스트립/그리드(구조·전단·굽힘 XPBD, 핀 추종, 예산 초과 실패 코드) | 구현됨 | `physics/cloth/cloth.test.ts`(핀 정확 추종·수렴·길이 ≤1%, `budget-exceeded`/`cloth-invalid`, 순서 무관 해시) | 미검증(정점 버퍼 갱신은 render) | self-collision v1 비활성 |
| 역산 회전(quatFromUnitVectors, 180° 특이점, 루트→말단) → FK 재구성 말단 오차 ≤ 1e-4 | 구현됨 | `physics/chain/back-solve.test.ts`, `core/vec.test.ts` | 미검증(TransformNode 적용은 render) | |
| builtin-pbd provider(PhysicsProvider 포트, 본 월드 갱신·캡슐 활성·영수증) | 구현됨 | `physics/builtin-provider.test.ts`(fixture 체인 시뮬·settle·영수증 sha256·setBoneWorld 순서 무관 해시·fail-visible) | 미검증 | `createPbdChainSolver` 파사드(`pbd-chain.ts`) |
| rapier provider(`@dimforge/rapier3d-deterministic-compat` 0.19.3 동적 import, Node 실행, 삽입 순서 고정, takeSnapshot SHA-256) | 구현됨 | `physics/rapier-provider.test.ts`(실제 init+step, 삽입 순서 단조, 스냅샷 해시 2회 동일, 로더 실패 → unavailable 사유) | 미검증(Worker 경로 `rapier/rapier-worker.browser.ts`) | 보조 엔진: rest 복원력 없음(중력·감쇠·구형 조인트) |
| rapier Worker 프로토콜(zod, 실패 코드) | 구현됨 | `physics/rapier/rapier-protocol.test.ts` | 미검증(실제 Worker 메시지) | |
| havok provider(항상 unavailable + 사유) · provider factory/카탈로그 | 구현됨 | `physics/havok-provider.test.ts`, `physics/provider-factory.test.ts` | — | `@babylonjs/havok` 미설치(라이선스·lockfile 승인 필요) |
| PhysicsPanel(provider 라디오 → `physics/set-provider`, 상태·사유, settle 스텝·실행, 미리보기 재생) | 구현됨 | `app/shell/panels/PhysicsPanel.test.tsx`(jsdom: 라디오 3·dispatch 1회·상태 표시·엔진 없음 비활성·settle 호출·재생 스케줄러) | 미검증(실제 엔진 settle·rAF) | 스타일 `cl-physics-*`(core CSS) |
| WebGPU compute 체인 커널(`toon-pbd-gpu`) | 미구현 | — | — | 설계만(character-physics.md §5). 입자 > 2,048일 때 권장 항목이며 현재 예산(1,024)은 CPU로 충분 |

## 3. 공개 API 요약

- `outfit/index.ts`: `createOutfitBuilder()`, `combineOutfitResults(results, base?)`, `remapAuxiliaryJointIndices(part, fromBase, toBase, offset?)`,
  `rebaseAuxiliaryRoots(bones, actual, assumed)`, `outfitChainBudget(result)`, `outfitBoneNames(result)`; re-export 아래 모듈.
- `outfit/hair-builder.ts`: `buildHair(style, scalp, context)`, `hairStrands(style, scalp, seed)`, `strandCurve`, `headSizeMorphs`, `assumedHeadPivot(scalp)`,
  `OUTFIT_AUX_BONE_INDEX_BASE`(55), `HEAD_BONE_INDEX`, `HEAD_PIVOT_RATIO`, `HEAD_SIZE_MORPH_SCALE`.
- `outfit/hair-styles.ts`: `HAIR_STYLE_SPECS`, `HAIR_STYLE_IDS`, `hairChainBudget(spec)`, `HairSpec`/`HairZoneSpec`.
- `outfit/garments.ts`: `buildGarments(selection, body, bodyMorphs, context)`, `buildGarmentsWithEnv`, `createGarmentEnv`, `buildTop/buildBottom/buildShoes/buildAccessory(id, env)`,
  `TOP_SPECS/BOTTOM_SPECS/SHOES_SPECS/ACCESSORY_SPECS`, `headFrameFromBody`, `assumedBodyPivots`, `minimumNormalOffset`.
- `outfit/follow-body.ts`: `buildNearestMapping`, `identityMapping`, `inheritSkinWeights`, `propagateBodyMorphs`, `selectBodyVertices`, `extractOffsetShell`,
  `regionBounds`, `regionCentroid`, `penetrationRatio`, `buildVertexGrid`/`nearestVertices`.
- `outfit/geometry.ts`: `MeshAccumulator`, `appendCardStrip`, `appendTube`, `appendSphereShell`, `appendBox`, `circlePoints`, `arcPoints`, `transportFrames`, `computeVertexNormals`, `singleJoint`, `blendJoints`.
- `physics/index.ts`: `compileChainModel`/`createChainState`/`stepChains`/`stepChainsInto`/`settleChains`/`backSolveChainRotations`/`forwardKinematicsFromRotations`,
  `compileCloth`/`buildClothStripLayout`/`stepCloth`, `createCapsuleSet`/`projectParticleOutOfCapsules`, `valueNoise1D`/`windGustFactor`, `createPhysicsReceipt`/`stateHashSync`,
  `createPbdChainSolver`, `createBuiltinPbdProvider`, `createRapierProvider`/`dragForceToLinearDamping`, `createHavokProvider`, `createPhysicsProviderFactory`/`PHYSICS_PROVIDER_CATALOG`,
  `rapierRequestSchema`/`createRapierProtocolHandler`.

## 4. 라이선스·출처

| 항목 | 라이선스 | 사용 방식 |
|---|---|---|
| XPBD(Macklin 2016)·Small Steps(2019)·FTL 헤어(Müller 2012) | 논문 | 수식만 재구현 |
| VRMC_springBone 파라미터(stiffness/dragForce/gravityPower/hitRadius) | 스키마(MIT) | 파라미터 의미만 호환, 코드 미복제 |
| MB-Lab 프록시 피팅(의상 → 바디 최근접 매핑) | AGPL(코드 미열람) | 개념만, 정점 k-NN으로 재설계 |
| `@dimforge/rapier3d-deterministic-compat` 0.19.3 | Apache-2.0 | 직접 번들(동적 import), NOTICE 유지 |
| `@babylonjs/havok` | MIT(바이너리) | 미설치, unavailable 사유만 |

## 5. 남은 위험·브라우저 미검증

- 조립기(humanoid-model, humanoid 작업자)가 §1 규약(보조 본 인덱스 55 기준·`combineOutfitResults`·피벗 보정)을 적용해야 한다. 2026-10-01 현재
  `app/composition.ts`는 `../domains/outfit`의 `createOutfitBuilder()`와 `../domains/physics/provider-factory`의 `createPhysicsProviderFactory()`를 꽂았고
  (`humanoid: null`은 `domains/humanoid/humanoid-model.ts` 제출 후 core가 교체), `COMPOSED_PANELS`에 `PhysicsPanel`은 아직 없다(core가 조립). `cl-physics-*` 스타일 7종은 core CSS에 있다.
- 실제 절차 바디(humanoid)의 영역 라벨·법선 품질에 따라 셸 오프셋·소매 덮임 비율 조정이 필요할 수 있다(지금은 `outfit/fixtures.ts` 바디로 검증).
- 브라우저: settle→캡처 PNG 해시 2회 동일, Worker 경로 Rapier, 헤어 카드 알파·이방성 표시, PhysicsPanel 실제 rAF 미리보기.

## 6. 검증 기록(2026-10-01, outfit-physics 작업자 실측)

| 명령 | 결과 |
|---|---|
| `pnpm exec vitest run apps/character-lab/src/domains/outfit apps/character-lab/src/domains/physics apps/character-lab/src/app/shell/panels/PhysicsPanel.test.tsx` (루트 설정) | 19파일 / 56케이스 통과 |
| `pnpm --filter @toonstudio/character-lab exec vitest run src/domains/outfit src/domains/physics src/app/shell/panels/PhysicsPanel.test.tsx` (앱 설정) | 19파일 / 56케이스 통과 |
| `pnpm exec eslint --max-warnings=0 apps/character-lab/src/domains/outfit apps/character-lab/src/domains/physics apps/character-lab/src/app/shell/panels/PhysicsPanel.tsx apps/character-lab/src/app/shell/panels/PhysicsPanel.test.tsx` | 오류 0 · 경고 0 |
| `pnpm --filter @toonstudio/character-lab typecheck` | 오류 1(`domains/authored/real-packages.test.ts`, vision-authored 소유) · outfit/physics/PhysicsPanel 오류 0 |

- `physics/rapier-provider.test.ts`는 실제 `@dimforge/rapier3d-deterministic-compat` wasm을 Node에서 init·step한다. 실행 중 stderr에 패키지 내부
  wasm-bindgen 경고("using deprecated parameters for the initialization function")가 한 줄 나오며 테스트 결과와 무관하다(패키지 코드라 수정 대상 아님).
- 테스트 파일 수: outfit 4 + physics 14 + PhysicsPanel 1 = 19.
