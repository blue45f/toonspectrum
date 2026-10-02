# Character Lab 패리티 — vision-authored (참고 이미지 추천 · 사진/카메라 포즈 인식 · Blender 제작 패키지 레인)

상태: **current** (2026-10-01). 작업자 `vision-authored`(W7)가 소유하는 행만 적는다. core가 [`../shaper-parity-checklist.md`](../shaper-parity-checklist.md)로 집계한다.
이 컨테이너에는 GPU·브라우저·네트워크(모델 CDN)가 없어 **브라우저 검증 열은 전부 "미검증"**이며, Node(vitest: 순수 로직은 node 환경, 패널은 jsdom + 가짜 로더·포트 주입)로 검증한 범위만 "Node 검증" 열에 적는다.
실제 제작 패키지 2종(`public/assets/characters/`, 커밋됨)은 Node `fs` 포트로 끝까지 로드해 GLB 실측 SHA-256·능력 판정·매핑을 대조했다(§3).

## 1. 기능 행 (SHAPER 항목 × 구현/Node 검증/브라우저 검증)

### 1.1 Blender 제작 패키지 레인 (`src/domains/authored/`)

| SHAPER 항목 | 세부 요구 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고(베타·사유) |
| --- | --- | --- | --- | --- | --- |
| 제작 패키지 | 실제 manifest(`toonstudio.character-lab.authored-character/1`) + `slot-mapping.json` → 계약 manifest(`toonstudio.character-package`) 변환·zod 검증 | 구현됨 | `authored-character-manifest.test.ts`, `real-packages.test.ts` | 미검증 | `parseAnyCharacterManifest`는 계약 형식·실제 형식 둘 다 받고, 알 수 없는 형식은 `package-manifest-unknown-format` |
| 제작 패키지 | 15슬롯 능력 판정(사유 한글): 얼굴 5슬롯은 ± shape key 쌍 커버리지, irises·hair·body·의상 4슬롯은 메시 역할·본, expression은 FACS 유닛 수(≥8 available), pose·hand-pose는 필수 15본·손가락 30본 | 구현됨 | `package-capability.test.ts`(규칙 6케이스), `real-packages.test.ts`(실제 2종) | 미검증 | `slot-mapping.json` 선언이 있으면 규칙을 덮어쓰고 `basis`(rule/declared)·`compareCapabilities` 불일치 목록으로 노출. 다른 프리셋으로 바꿔치기하지 않는다 |
| 제작 패키지 | shape key → `MorphTargetName` 매핑(face.py 24종 `BLENDER_SHAPE_KEY_ALIASES`, ARKit 52·VRM 1.0 `FACS_SHAPE_KEY_ALIASES`, VRM 0.x 프리셋·`ts` 접두·대소문자·`<mesh>:<key>` 보조 규칙) | 구현됨 | `shape-key-mapping.test.ts` | 미검증 | 규약 밖 이름은 `unmapped[]`에 한글 사유. `invertShapeKeyMap`·`faceParamPairCoverage`·`facsUnitsInMap` |
| 제작 패키지 | 본 이름 매핑(VRM 정식명·Mixamo·Blender Rigify `DEF-`·VRoid `J_Bip`), `humanoidBones[]` override 우선, 역방향 유일 | 구현됨 | `bone-name-mapping.test.ts`(Orion 67 joint 전부·필수 15/손가락 30 커버) | 미검증 | 끝 본(End)·규약 밖 이름은 사유와 함께 `unmapped[]` |
| 제작 패키지 | 메시 역할 분류(`TS_AuthoredHair_<style>_LOD<n>`, `_Outline`, Babylon `_primitive<i>` 분할, Body/Face/Brow/Eye/Pupil 키워드) + 헤어 LOD 선택·삼각형 예산 | 구현됨 | `mesh-role-mapping.test.ts` | 미검증(실제 Babylon 로드 후 가시성) | `selectHairLod`는 선호 LOD 이하 중 가장 가까운 것, 외곽선 셸은 본체를 따른다 |
| 제작 패키지 | SHA-256 검증(실제 GLB 바이트 해시 = manifest·index 값)·바이트 수·품질 게이트(`quality.passed`, `score ≥ minimumScore`)·`AuthoredPackagePlan` | 구현됨 | `package-plan.test.ts`, `package-load-flow.test.ts`(404·형식 오류·SHA 불일치·품질 미통과·SHA 계산 실패), `real-packages.test.ts`(node:crypto 실측) | 미검증(crypto.subtle) | 브라우저는 `shared/hash.sha256Hex`(crypto.subtle), Node 테스트는 `node:crypto` 주입 |
| 제작 패키지 | `index.json` 로더(계약 `packages[]` + 실제 `authored-character-index/1` 두 형식) + 브라우저 fetch 바인딩 | 구현됨 | `package-index.test.ts`, `package-load-flow.test.ts` | 미검증(fetch·HTTP 캐시) | `package-index.browser.ts`·`package-loader.browser.ts`는 얇은 바인딩(테스트 import 금지 규칙 준수) |
| 제작 패키지 | VRMC_vrm(1.0)·VRM(0.x) meta/humanoid/expressions 순수 파서(GLB JSON 청크만) — **베타** | 구현됨 | `glb-json-chunk.test.ts`, `vrm-extension-parser.test.ts`, `real-packages.test.ts`(실제 GLB에 VRM 확장 없음·노드 이름 67+) | 미검증(실제 VRM 파일) | MToon·스프링본은 범위 밖. 사양 본문 복제 없이 키 이름만 사용 |
| 제작 패키지 | PackagePanel: 목록(index.json)·라이선스·SHA·품질·능력표(선언/규칙·불일치)·격차·헤어 LOD·본/shape key 커버리지·VRM 메타, 로드 = `source/set`, 엔진이 있으면 `reloadSource` | 구현됨 | `app/shell/panels/PackagePanel.test.tsx`(jsdom + fs 로더, 실제 2종) | 미검증 | index 404·SHA 불일치는 사유 그대로 표시하고 `source/set`을 보내지 않는다 |

### 1.2 참고 이미지 추천 · 사진/카메라 포즈 인식 (`src/domains/vision/`)

| SHAPER 항목 | 세부 요구 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고(베타·사유) |
| --- | --- | --- | --- | --- | --- |
| 참고 이미지 추천 | MediaPipe 지연 로더: `@mediapipe/tasks-vision` 동적 import, wasm은 패키지 서브패스 `?url` 번들, 모델 파일만 계약 `MEDIAPIPE_MODELS` CDN URL, byteLength·SHA-256 검증(고정 모델)/관측 SHA(미고정), 15 s timeout, 실패는 `VisionStatus.failed` + 사유 | 구현됨(순수 부분 Node 검증) | `model-assets.test.ts`(고정/미고정·404·네트워크·타임아웃·SHA 계산 불가·`withDeadline`) | 미검증(CDN 다운로드·wasm 초기화·추론) | `mediapipe-loader.browser.ts`는 테스트 import 금지. 델리게이트는 생성 전 고정(CPU 기본), 실패 시 다른 델리게이트 자동 시도 없음 |
| 참고 이미지 추천 | 모델 세션: 모델별 idle/loading/ready/failed, 한 번만 시도·자동 재시도 없음·`retry`만 재시도, 동시 요청 공유, `useSyncExternalStore` 구독 | 구현됨 | `vision-session.test.ts` | 미검증 | imageEmbedder·poseLandmarker 상태는 계약 `vision/status` 이벤트, 손 모델은 패널 내부 추적(§5 계약 변경 요청) |
| 참고 이미지 추천 | 코사인 유사도·L2 정규화·안정 정렬 Top-K | 구현됨 | `similarity.test.ts` | — | 길이 불일치는 throw(무음 0 금지), 영벡터는 0 |
| 참고 이미지 추천 | 프리셋 썸네일 임베딩(LabState.thumbnails ready 래스터, cacheKey LRU 캐시, 투명 썸네일 제외) vs 참고 이미지 임베딩 → 슬롯별 상위 3 추천 + coverage(후보/전체/제외 사유) | 구현됨 | `recommend.test.ts`, `reference-recommender.test.ts` | 미검증(실 임베딩 품질) | 썸네일이 없는 프리셋은 추천 불가 사유로 노출, 빈 슬롯은 빈 배열 |
| 참고 이미지 추천 | 결정적 OKLab k-means 팔레트(k-means++ mulberry32 고정 시드, Lloyd, 빈 군집 재배치, 알파 필터, 결정적 stride 표본) → 레시피 색 추천(피부·헤어·눈썹·눈동자·상의·하의·신발·액세서리 휴리스틱) | 구현됨 | `kmeans-palette.test.ts`(시드 동일성·빈 군집·투명·표본 상한·linear-srgb), `recommend.test.ts`(색 배정) | 미검증 | 조건에 맞는 군집이 없으면 그 키는 비워 둔다(임의 기본색 대체 금지) |
| 참고 이미지 추천 | 래스터 축소(박스 필터)·불투명 비율 | 구현됨 | `image-sampling.test.ts` | — | 팔레트는 긴 변 160px로 축소 후 추출 |
| 사진 포즈 인식 | 33 랜드마크 → 본 로컬 회전: 세그먼트 방향 swing, 부모 역변환, swing-twist 분해로 twist 제거, `JOINT_LIMITS_DEG` 클램프, 엉덩이·머리 3점 프레임, 스코프(`full/upper/arms-hands`)·거울·가시성 임계 | 구현됨 | `landmarks-to-pose.test.ts`(T-pose 항등 ≤0.5°, 팔 내림 90°, 왼팔 전방, 거울, 가시성 건너뜀, 스코프, 머리 요, 클램프, 기저→쿼터니언) | 미검증(실 사진) | 머리 중립 보정 `HEAD_FORWARD_REST_PITCH_DEG`=6°(근사). 어깨·척추·목은 방향 정보가 없어 항등 |
| 사진 포즈 인식 | 랜드마크 공간 변환(월드 m / 이미지 정규화+비율 보정, y·z 반전, 거울 = 좌우 교환 + x 반전) | 구현됨 | `landmark-space.test.ts` | — | `POSE_MIRROR_INDEX` |
| 사진 포즈 인식 | 21 손 랜드마크 → 손가락 15본 굴곡(측면 축 투영으로 벌림 분리, 엄지 원시 각, 95° 클램프) — **베타(굴곡만)** | 구현됨 | `hand-landmarks-to-pose.test.ts`(펼침 0°, 주먹 90°, DSL 축 일치, 클램프, 거울·NaN) | 미검증 | 벌림·엄지 대립은 2D 사진에서 신뢰할 수 없어 미적용(결과 `notesKo`) |
| 사진 포즈 인식 | 원본 사진 위 오버레이 계획(정규화→픽셀, MediaPipe 공개 토폴로지 연결선 33/21점, contain 맞춤) | 구현됨 | `landmark-overlay.test.ts` | 미검증(SVG 실제 배치) | 오버레이는 항상 원본 기준(거울 무관) |
| 사진 포즈 인식 | VisionPanel: 모델 상태 행(SHA 고정/미고정·베타 배지, 다시 시도), 참고 이미지 파일 → 추천 카드(`slot/apply` 1회)·팔레트 칩(`color/set`)·1순위 전체 적용, 사진 파일/카메라(getUserMedia) → 오버레이 → 범위·거울·셀피·가시성·좌표계 → `pose/set`, 손별 측 선택 → 손 `pose/set` | 구현됨 | `app/shell/panels/VisionPanel.test.tsx`(jsdom, 가짜 로더·디코더 5케이스) | 미검증(파일 디코드·카메라·실 모델) | 브라우저 API는 `VisionPanelDeps`로 분리. 카메라 미지원·실패는 정직 표시 |

## 2. 공개 API 요약

### `src/domains/authored/`
- `authored-character-manifest.ts`: `parseAnyCharacterManifest(json, slotMappingJson?, now?)` → `{ ok, format, manifest, conversion }`, `convertAuthoredCharacterManifest(source, slotMapping?, now?)`, `parseAuthoredSlotMapping`, `detectManifestFormat`, 스키마 `authoredCharacterManifestSchema`·`authoredSlotMappingSchema`, 상수 `AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID`·`AUTHORED_SLOT_MAPPING_SCHEMA_ID`·`AUTHORED_MANIFEST_FILENAME`·`AUTHORED_SLOT_MAPPING_FILENAME`, 타입 `AuthoredManifestConversion{ manifest, source, slotMapping, gaps, jointNodes, meshNodes, morphTargetNames, qualityIssues }`.
- `package-capability.ts`: `capabilitiesFromManifest(manifest)` → `SlotCapabilityMap`(스펙 API), `judgeCapabilities(manifest, mappings?)` → `CapabilityJudgement{ capabilities, ruleOnly, declared, basis, mappings, facsUnits }`, `judgeByRules`, `mappingsFromManifest`, `compareCapabilities(rule, declared)` → `{ agreeing, divergent }`, `hairPresetCapability(manifest, presetId)`, 상수 `IDENTITY_SLOT_AXES`·`EXPRESSION_AVAILABLE_MIN_UNITS`(8).
- `shape-key-mapping.ts`: `mapShapeKeys(names, override?)`(스펙 API), `classifyShapeKeys` → `{ mapped, unmapped, overridden }`, `resolveShapeKeyAlias`, `splitShapeKeyName`, `stripTsPrefix`, `invertShapeKeyMap`, `faceParamPairCoverage`, `facsUnitsInMap`.
- `bone-name-mapping.ts`: `mapBoneNames(names, override?)`(스펙 API), `classifyBoneNames` → `{ mapped, unmapped, overridden, required, fingers, all }`, `guessHumanoidBone`, `normalizeBoneName`, `invertBoneMap`.
- `mesh-role-mapping.ts`: `mapMeshRoles(names, override?)`(스펙 API), `classifyMeshRoles` → `{ entries, roles, unknown, outlines }`, `classifyMeshName`, `selectHairLod(names, preferredLod)` → `{ style, lods, chosen, visible, hidden }`, `chooseLodForTriangleBudget`.
- `package-plan.ts`: `buildPackagePlan(manifest, baseUrl, { glbSha256, glbBytes }, options?)` → `AuthoredPackagePlan | LabFailure`(스펙 API), `buildPackagePlanDetailed` → `{ plan, judgement, hairLod }`, `joinPackageUrl`.
- `package-index.ts`: `parseCharacterPackageIndex(json, now?)` → `{ index, entries: AuthoredIndexEntry[] }`(계약 `packages[]`·실제 `authored-character-index/1`), `AUTHORED_INDEX_SCHEMA_ID`.
- `package-load-flow.ts`(순수, 포트 주입): `loadPackageIndexFlow(port, url?, now?)`, `loadAuthoredPackageFlow(port, entry, { sha256, preferredLod?, now? })` → `{ plan, detail: { judgement, hairLod, conversion, gaps, warnings, glbBytes, observedSha256 } }`, `createFetchPackagePort(fetch)`, `DEFAULT_PACKAGE_INDEX_URL`.
- `package-index.browser.ts`: `loadCharacterPackageIndex(url?)`. `package-loader.browser.ts`: `loadAuthoredPackage(entry, { preferredLod? })`(crypto.subtle SHA-256).
- `glb-json-chunk.ts`: `readGlbJsonChunk(bytes)`, `isGlbBytes`. `vrm-extension-parser.ts`: `parseVrmFromGlb(bytes)` → `{ info: VrmcVrmInfo | null, nodeNames }`, `parseVrmcVrmFromGltfJson`, `vrmHumanoidToBoneMap`.

### `src/domains/vision/`
- `vision-ports.ts`: `VisionModelKey`(계약 2종 + `handLandmarker`), `VisionLoaders`, `LoadedModel<Port>{ port, observedSha256, pinned, bytes, license, delegate, dispose }`, `PoseDetectorPort`, `HandDetectorPort`, `VisionModelStatus`, `toContractVisionStatus`, `resolveHandSide(reported, { selfie })`, `VISION_MODEL_LABELS_KO`.
- `model-assets.ts`: `VISION_MODEL_SPECS`, `HAND_LANDMARKER_MODEL`, `fetchModelAsset(port, spec, { sha256, timeoutMs?, now? })`, `verifyModelBytes`, `withDeadline`, `createFetchModelPort`, `isModelSpecPinned`.
- `mediapipe-loader.browser.ts`: `createMediaPipeLoaders({ delegate?, fetchImpl?, timeoutMs? })` → `VisionLoaders`(ImageEmbedder `l2Normalize`, PoseLandmarker `numPoses 1`, HandLandmarker `numHands 2`, runningMode IMAGE).
- `vision-session.ts`: `createVisionSession({ loaders, onStatus?, now? })` → `{ status, statuses, ensure(key), retry(key), dispose, subscribe }`.
- `similarity.ts`: `cosine`, `dot`, `norm`, `l2Normalize`, `toEmbedding`, `rankBySimilarity(query, candidates, k?)`.
- `recommend.ts`: `recommendPresets(queryEmbedding, thumbnailEmbeddings, catalog, k=3)` → `{ recommendations(슬롯별), coverage }`, `recommendColors(palette)` → `Partial<RecipeColors>`, `isSkinLike`, `summarizeRecommendationsKo`.
- `reference-recommender.ts`: `recommendFromReference({ queryEmbedding, thumbnails, catalog, embedRaster, cache, k?, onProgress? })`, `embedThumbnails`, `createThumbnailEmbeddingCache(limit=512)`.
- `kmeans-palette.ts`: `extractPalette(rgba, { k=5, seed=1, iterations=16, space="oklab", alphaMin=128, maxSamples=4096 })` → `PaletteEntry[]{ hex, weight, oklab, count }`, `samplePixels`, `oklabChroma`, `oklabHueDeg`. `image-sampling.ts`: `downsampleRgba(image, maxSide)`, `rasterToRgbaImage`, `validateRgbaImage`, `opaqueRatio`.
- `landmark-space.ts`: `toModelSpace`, `preparePoseLandmarks(landmarks, { space?, aspectRatio?, mirror? })`, `POSE_MIRROR_INDEX`, `clampVisibility`, `segmentDirection`, `midpoint`, `angleBetweenDeg`.
- `landmarks-to-pose.ts`: `landmarksToPose(landmarks, { scope, mirror?, visibilityMin?, space?, aspectRatio?, clampToJointLimits? })` → `{ pose, scope, appliedBones, skippedBones[{ bone, reasonKo }], clampedBones, mirrored }`, `controllableBones(scope)`, `POSE_SEGMENTS`, `quatFromBasis`, `HEAD_FORWARD_REST_PITCH_DEG`.
- `hand-landmarks-to-pose.ts`: `handLandmarksToPose(landmarks, { side, mirror?, space?, aspectRatio?, clampToJointLimits? })` → `{ side, pose, curlDeg, appliedBones, skippedBones, clampedBones, notesKo }`, `fingerCurlQuat`, `thumbCurlQuat`.
- `landmark-overlay.ts`: `poseOverlayPlan(landmarks, w, h, { visibilityMin? })`·`handOverlayPlan` → `{ viewBox, points, segments }`, `POSE_CONNECTIONS`, `HAND_CONNECTIONS`, `fitImageInBox`.
- `landmark-fixtures.ts`(테스트 전용): `tPoseBody`, `armsDownBody`, `leftArmForwardBody`, `fistHandLandmarks`, `openHandLandmarks`, `toImageLandmarks(body, aspectRatio?)`, `toWorldLandmarks(body)`.

### 패널
- `app/shell/panels/VisionPanel.tsx`: `VisionPanel({ deps?: VisionPanelDeps })`, `createBrowserVisionDeps()`, `VisionPanelDeps{ createLoaders, decodeImage, rasterToImage, openCamera?, captureVideo?, now? }`, `DecodedImage`.
- `app/shell/panels/PackagePanel.tsx`: `PackagePanel({ loader?, autoLoadIndex?, preferredLod?, now? })`, `browserPackageLoader`, `PackagePanelLoader{ loadIndex, loadPackage }`.

## 3. 실제 제작 패키지 2종 능력 판정 결과 (`real-packages.test.ts` 실측)

| 패키지 | GLB | SHA-256(실측 = manifest = index) | 본 매핑 | shape key | 헤어 | 격차 |
| --- | --- | --- | --- | --- | --- | --- |
| `avatar-orion-authored` (primary, CC0-1.0) | 4,045,664 B | `7a2bfd8d2a8a…` | 53/55(필수 15/15 · 손가락 30/30, Mixamo + `TS_OrionEye.L/R`) | 의미 기반 24종 전부 `param:` 매핑, viseme → FACS 유닛 ≥8 | `short-layered` LOD 0/1/2(3752/1788/960 tris), 표시 LOD0 | `hair-outline-not-in-glb` 등 |
| `reference-character` (baseline, CC0-1.0) | 903,016 B | `17b879a7b7af…` | 0(스켈레톤 없음) | 의미 기반 24종, 표정 키 없음(FACS 유닛 0) | `soft-bob` LOD 0/1/2(3952/1928/960 tris) | — |

| 슬롯 | Orion 최종(선언) | Orion 규칙 판정 | reference 최종(선언) | reference 규칙 판정 |
| --- | --- | --- | --- | --- |
| face-shape | available | available | available | available |
| eyes | available | available | available | available |
| irises | partial(irisSize shape key 없음, 색·시선만) | partial | unavailable | unavailable |
| nose | available | available | available | available |
| mouth | available | available | partial | **available**(불일치) |
| ears | partial | **available**(불일치) | partial | **available**(불일치) |
| hair | partial(교체형 헤어 없음, 1종) | partial | partial | partial |
| body | partial(본 스케일 근사) | partial | unavailable | unavailable |
| top / bottom / shoes | unavailable | unavailable | partial / unavailable / unavailable | partial / unavailable / unavailable |
| accessory | partial(본 노드 부착) | **unavailable**(불일치) | unavailable | unavailable |
| expression | available | available | unavailable | unavailable |
| pose | available | available | unavailable(스켈레톤 없음) | unavailable |
| hand-pose | available | available | unavailable | unavailable |

불일치는 Blender 레인 선언(`slot-mapping.json`)이 최종값이며 PackagePanel 능력표의 "출처" 열에 `선언 (규칙 판정: …)`으로 함께 보여 준다. 선언이 더 보수적인 이유(귀·입 축의 시각 변화가 작음, 액세서리는 메시 없이 본 부착)는 [`../authored-asset-pipeline.md`](../authored-asset-pipeline.md) §6의 격차 목록과 같다.

## 4. 수치 목표(연구 numericTargets) 대비

| 목표 | 현재 상태 |
| --- | --- |
| 손 포즈 21 랜드마크 → 15 손가락 본 변환 ≤ 5 ms | 순수 TS, 입력 21점 1회 변환(투영·acos 15회). Node에서 ms 미만(측정 하네스는 없음, 브라우저 측정 항목) |
| PoseLandmarker lite IMAGE 모드 ≤ 100 ms/장 | 미측정(브라우저·wasm·델리게이트 필요). 델리게이트는 CPU 기본, GPU는 선택·미검증 |
| 임베딩 ≤ 300 ms/장, 추천 상위 3 ≤ 50 ms | MediaPipe ImageEmbedder(MobileNet V3 small, 계약 고정)로 CLIP 대신 경량 대안 채택. 추천은 N×코사인(N = ready 썸네일 수)이며 LRU 캐시로 재계산 0. 시간은 미측정 |
| 프리셋 인덱스 ≤ 2,000 썸네일 | 빌드 시 정적 인덱스 대신 런타임 LabState.thumbnails(엔진 RTT) 임베딩 + cacheKey LRU(512). 정적 인덱스는 썸네일 결정성이 브라우저 검증된 뒤 후속 |
| 1€ 필터 랜드마크 안정화 | 미구현(IMAGE 단일 프레임 모드라 시간축이 없음; VIDEO 모드 도입 시 적용) |
| 랜드마크 → IkGoal(two-bone + 폴 벡터) 리타게팅 | 세그먼트 방향 swing 회전(FK) 채택. IK 목표 생성은 animation 작업자 `ik-apply`와의 연결이 필요해 후속(§5) |

## 5. 다른 작업자에게 전달하는 배선·계약 메모

1. **core(`app/composition.ts`)**: `COMPOSED_PANELS`에 `VisionPanel`·`PackagePanel`을 추가한다(`LabPanels`에 슬롯은 이미 있다). 두 패널 모두 props 없이 마운트 가능하며 브라우저 의존성(`createBrowserVisionDeps`, `browserPackageLoader`)은 내부 기본값이다.
2. **core(CSS)**: `cl-vision-*`·`cl-package-*` 공통 클래스는 있으나 패널이 쓰는 세부 클래스(`cl-vision-model-list`, `cl-vision-badge--pinned/--beta/--partial/--unavailable`, `cl-vision-swatches`, `cl-vision-overlay`, `cl-package-capabilities`, `cl-package-badge--available/--partial/--unavailable/--primary`, `cl-package-facts`)는 기본 스타일만 받는다. 오버레이 배치(`position: relative/absolute`)만 인라인 스타일이다.
3. **계약 변경 요청(core, 추가만)**: `contracts/vision.ts`의 `MEDIAPIPE_MODELS`에 `handLandmarker`(`HAND_LANDMARKER_MODEL`과 같은 URL·Apache-2.0·bytes/sha256 null) 추가 → `VisionModelId`가 손 모델을 포함하면 `vision-ports.ts`의 `VisionModelKey` 확장과 `toContractVisionStatus`의 null 분기를 제거할 수 있다. 첫 브라우저 검증 시 pose·hand 모델의 bytes·sha256을 고정한다(현재 UI에 "SHA 미고정·베타").
4. **render(`render/babylon/package-loader.ts`)**: `AuthoredPackagePlan.meshRoles`(Babylon `_primitive<i>` 분할 이름 포함)·`hairLodPolicy.preferredLod`·`shapeKeyMap`(`<mesh>:<key>`와 bare 키 모두)·`boneMap`을 그대로 쓴다. 헤어 LOD 가시성은 `selectHairLod(meshNames, preferredLod).visible/hidden`으로 다시 계산할 수 있다.
5. **animation**: 손가락 굴곡 축 규약(`fingerCurlQuat`·`thumbCurlQuat`)은 `animation/presets/rotation-dsl.ts`와 같은 식이며 테스트로 고정했다(`hand-landmarks-to-pose.test.ts`). 손목·발목 IkGoal 생성은 `ik-apply` 입력 형식이 확정되면 `landmarks-to-pose`에 추가한다.
6. **통합 담당(빌드)**: `vite build` 시 `dist/assets`에 `vision_wasm_internal-*.wasm`·`vision_wasm_internal-*.js`가 별도 파일로 나오고 `@mediapipe/tasks-vision` 청크가 패널 청크와 분리되는지 확인(브라우저 검증 항목).

## 6. 브라우저 미검증 항목(정직 표기)

- `@mediapipe/tasks-vision` 동적 import·wasm `?url` 번들 해석·`FilesetResolver` 없이 `{ wasmLoaderPath, wasmBinaryPath }` 직접 지정 동작.
- 모델 CDN 다운로드(CORS·크기·SHA 일치), `imageEmbedder` 고정 SHA `bbbb4c51…` 실측, pose·hand 모델 관측 SHA.
- ImageEmbedder/PoseLandmarker/HandLandmarker 실제 추론 품질(랜드마크 좌표계·가시성 분포·손 handedness 보고), GPU 델리게이트.
- `createImageBitmap`·canvas 디코드, `getUserMedia` 카메라·`<video>` 캡처, Blob URL 미리보기.
- SVG 오버레이가 `<img>` 위에 정확히 겹치는지(`preserveAspectRatio` + contain).
- `crypto.subtle` SHA-256(`shared/hash`)와 GLB 4 MB fetch, 브라우저 HTTP 캐시가 엔진 재요청을 흡수하는지.
- Babylon이 실제로 `meshRoles`·`shapeKeyMap`·`boneMap`대로 메시/morph/본을 찾는지(render 작업자 NullEngine 하네스 + 브라우저).

## 7. 검증 명령(실행 기록은 작업 보고)

```bash
pnpm exec vitest run apps/character-lab/src/domains/authored apps/character-lab/src/domains/vision apps/character-lab/src/app/shell/panels/VisionPanel.test.tsx apps/character-lab/src/app/shell/panels/PackagePanel.test.tsx   # 루트 설정
pnpm --filter @toonstudio/character-lab exec vitest run src/domains/authored src/domains/vision src/app/shell/panels/VisionPanel.test.tsx src/app/shell/panels/PackagePanel.test.tsx   # 앱 로컬 설정
pnpm --filter @toonstudio/character-lab typecheck
pnpm exec eslint --max-warnings=0 apps/character-lab/src/domains/authored apps/character-lab/src/domains/vision apps/character-lab/src/app/shell/panels/VisionPanel.tsx apps/character-lab/src/app/shell/panels/VisionPanel.test.tsx apps/character-lab/src/app/shell/panels/PackagePanel.tsx apps/character-lab/src/app/shell/panels/PackagePanel.test.tsx
```

## 8. 라이선스·출처

| 항목 | 출처 | 라이선스 |
| --- | --- | --- |
| MediaPipe Tasks Vision | `@mediapipe/tasks-vision` 0.10.35(직접 의존성, wasm 번들) | Apache-2.0 |
| 모델 파일 | `mobilenet_v3_small.tflite`(ImageEmbedder), `pose_landmarker_lite.task`, `hand_landmarker.task` — 공식 CDN `storage.googleapis.com/mediapipe-models`, 런타임에만 받음 | Apache-2.0(모델 카드 기준, 배포 전 재확인 항목) |
| 랜드마크 토폴로지 | MediaPipe 공개 Pose 33점·Hand 21점 인덱스 쌍(사실) | 공개 |
| k-means++ | Arthur & Vassilvitskii 2007(D² 가중 초기화), Lloyd 1982 | 공개 수식(자체 구현, `shared/prng` mulberry32) |
| OKLab | Björn Ottosson 2020(`shared/color.ts`) | 공개 |
| swing-twist 분해·최소 회전 | 공개 수식(`shared/math.ts`) | 공개 |
| VRM 본 이름·확장 키 | VRM 1.0 humanoid/meta/expressions 키 이름(사실만, 본문 복제 없음) | 사양 저장소 LICENSE 미확인 → 사실만 사용 |
| Mixamo·Rigify·VRoid 명명 규칙 | 리그 관례(사실) | — |
| 실제 패키지 | `public/assets/characters/avatar-orion-authored`(primary), `reference-character`(baseline) — `index.json`·`manifest.json`의 `license` | CC0-1.0 |
