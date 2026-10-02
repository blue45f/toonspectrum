# Character Lab 패리티 — export-paint (모델 위 드로잉 · 투명 PNG · 레이어 PSD · 레시피 · GLB)

상태: **current** (2026-10-01). 작업자 `export-paint`(W6)가 소유하는 행만 적는다. core가 `docs/shaper-parity-checklist.md`로 집계한다.
이 컨테이너에는 GPU가 없어 **브라우저 검증 열은 전부 "미검증"**이며, Node(vitest, NullEngine 없이 모의 엔진·결정적 fixture)로 검증한 범위만 "Node 검증" 열에 적는다.

## 1. 기능 행 (SHAPER 항목 × 구현/Node 검증/브라우저 검증)

| SHAPER 항목 | 세부 요구 | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고(베타·사유) |
| --- | --- | --- | --- | --- | --- |
| 모델 위 드로잉 | 부위별 페인트 레이어(1024², RGBA8 straight, top-down) | 구현됨 | `src/paint/paint-layer.test.ts` | 미검증 | `createPaintLayer`, `PAINT_LAYER_DEFAULT_SIZE` |
| 모델 위 드로잉 | 소프트 dab(경도 0 가우시안·1 하드 엣지 AA), alpha = opacity×pressure, 선형 공간 source-over | 구현됨 | `paint-layer.test.ts`(중심 알파 = opacity, 경도 0/1 프로파일, 흰 바탕 50% 검정 ≈ sRGB 188) | 미검증 | Porter-Duff 1984 straight 식, sRGB↔linear LUT |
| 모델 위 드로잉 | spacing 보간(세그먼트 간 carry), UV 랩 최단 경로 | 구현됨 | `uv-stroke.test.ts`(간격 일정·carry·랩 [0,1)) | 미검증 | `interpolateDabs(from, to, brush, size, { wrap, carry })` |
| 모델 위 드로잉 | 타일(64px) undo 토큰, 1 스트로크 = 1 undo, undo 후 바이트 동일 | 구현됨 | `paint-layer.test.ts`, `stroke-session.test.ts`, `paint-session.test.ts` | 미검증 | 역토큰(redo) 반환, 가장자리 타일 잘림, 부위 불일치 throw |
| 모델 위 드로잉 | 뷰포트 포인터 → `engine.pick` → 스트로크 → `engine.updatePaintTexture` → `paint/stroke` dispatch | 구현됨(순수 드라이버) | `paint-bridge.test.ts`(1 토큰, 빈 공간/타 부위 통과 시 세그먼트 분리, cancel 원복, 압력) | 미검증 | `createPointerPaintDriver`는 Babylon을 모른다. ViewportPane(render 작업자)이 `pick/upload/commit` 콜백을 꽂는다. UV v 방향(glTF v=0 첫 행)·Babylon `invertY`는 브라우저 검증 항목 |
| 모델 위 드로잉 | history undo/redo가 페인트 토큰을 레이어·텍스처에 반영 | 구현됨(핸들러) | `paint-bridge.test.ts` | 미검증 | `createPaintUndoHandler(session, upload)` → `createLabStore({ onPaintUndo })`에 연결 필요(§4) |
| 모델 위 드로잉 | PaintPanel: 크기·색·불투명도·경도·간격, 레이어(부위) 선택, UV 랩, 되돌리기, 레이어 비우기 | 구현됨 | `app/shell/panels/PaintPanel.test.tsx`(jsdom) | 미검증 | 되돌리기 = `history/undo` 1회, 비우기 = 전체 타일 토큰을 `paint/stroke`로 dispatch |
| 투명 배경 출력 | 요청 해상도(16..4096) lit 패스 캡처, 뷰포트 크기 유도 금지, settle N스텝 | 구현됨 | `export/export-session.test.ts`(모의 엔진 호출 인자·크기 불일치·settle 실패·패스 실패) | 미검증 | `exportTransparentPng(engine, { width, height, framing, settleSteps })` |
| 투명 배경 출력 | readback → top-down·straight·sRGB 변환(flipY·premultiplied는 backend 상수) | 구현됨 | `export/raster-convert.test.ts`(왕복 알파 극단 0·1·255, 길이 오류) | 미검증 | `toTopDownStraight`, `decodeIdPass`, `decodeMaterialIdPass`, `decodeDepth(f32\|r8\|rgba-packed)` |
| 투명 배경 출력 | 자체 PNG 인코더(IHDR 8bit RGBA, sRGB·gAMA, IDAT deflate(CompressionStream), CRC32, IEND) + 디코더 | 구현됨 | `export/png-encoder.test.ts`(CRC 벡터, `node:zlib.inflateSync` 원본 일치, 필터 none/adaptive 왕복, CRC 손상 거부) | 미검증 | 의존성 0. `MAX_PNG_DIMENSION` 16384 |
| 레이어 PSD | 주선 추출: 휘도·알파 Sobel + depth 불연속 + normal 각도 + partId·materialId 경계, 선폭, 임계값 | 구현됨 | `export/line-extract.test.ts`(검은 평면 내부 0 회귀, 원 경계만, depth 계단 검출·램프 미검출, 크리즈·ID·휘도 채널 분리, 선폭 3 실루엣 내 팽창) | 미검증 | Sobel CPU 참조(연구 numericTarget: GPU Sobel 대비 일치율 ≥99.9%는 GPU 패스 구현 후 측정) |
| 레이어 PSD | tone-split: lit ≈ screen(multiply(flat, 음영), 하이라이트), 재합성 MAE ≤ 2/255 | 구현됨 | `export/tone-split.test.ts`(결정적 패턴·극단값·LCG 랜덤 패턴 MAE ≤ 2) | 미검증 | alpha=0 픽셀 제외, `opaqueMae`로 영수증 기록 |
| 레이어 PSD | 레이어 계획(bottom→top): 참조/깊이·법선(숨김) → 부위 ID 마스크(숨김 그룹) → 밑색(normal) → 음영(multiply) → 하이라이트(screen) → 페인트/<부위>(숨김, UV 공간) → 주선(normal) | 구현됨 | `export/psd-plan.test.ts`(이름·순서·blend·숨김 스냅샷, 건너뜀 사유, 2048 상한·패스 누락·크기 불일치 실패) | 미검증 | `PSD_MAX_DIMENSION` 2048, 영수증(`layerCount`, `groupCount`, `names`, `skippedKo`, `lineArtPixels`, `recomposeMae`) |
| 레이어 PSD | ag-psd `writePsdUint8Array` 조립(루트 imageData = lit, generateThumbnail:false), Node round-trip | 구현됨 | `export/psd-assemble.test.ts`(`readPsd` 왕복: 이름·순서·blend·숨김·크기·픽셀·합성 일치) | 미검증(Photoshop/CSP 열기) | Node는 `testing/psd-canvas-stub`, 브라우저는 `export/psd-canvas.browser.ts`를 ExportPanel이 PSD 직전 1회 등록 |
| 레이어 PSD | ExportPanel 옵션(ID 마스크·참조 패스), 진행·영수증·실패 표시 | 구현됨 | `app/shell/panels/ExportPanel.test.tsx`(jsdom) | 미검증 | 캔버스 등록 실패는 `export-psd-canvas` 사유 |
| 레시피 | 레시피 JSON 저장(키 정렬·결정적 바이트, 페인트 레이어 PNG base64 포함)·불러오기(strict zod, 미래 버전 거부, 손상 사유) | 구현됨 | `export/recipe-file.test.ts`, `export/paint-layer-record.test.ts`, `ExportPanel.test.tsx`(`recipe/load` dispatch·레이어 복원·업로드) | 미검증(파일 선택 UI) | `*.character.json`, 상한 64 MiB, `MAX_RECIPE_FILE_BYTES` |
| glTF/GLB | 엔진 `exportGlb` 호출 → 매직(`glTF`, v2) 검사 → 다운로드 | 구현됨(호출 계약) | `export/export-session.test.ts`(매직 검사·예외 → `export-glb`) | 미검증(Babylon GLTF2Export 실파일 재import) | GLB 내용은 render 작업자(`render/babylon/glb-exporter.ts`) 책임 |
| 다운로드 | Blob URL 생성 → `<a download>` 클릭 → URL revoke **정확히 1회**(성공은 지연, 실패는 즉시) | 구현됨 | `export/save-bytes.test.ts`(포트 주입: 성공·클릭 실패·URL 실패·빈 바이트·파일명 정리) | 미검증 | 브라우저 바인딩은 `export/download.browser.ts`(테스트 import 금지 규칙 준수) |

## 2. 공개 API 요약

### `src/paint/`
- `paint-layer.ts`: `createPaintLayer(part, w=1024, h=w)`, `stampDab(layer, dab, brush, { wrap, snapshots })` → `PaintUndoToken`, `dabMask(d, r, hardness)`, `compositePixelLinear`, `createTileSnapshotSet`/`snapshotTile`/`snapshotAllTiles`/`toUndoToken`/`mergeUndoTokens`, `applyUndoToken(layer, token)` → 역토큰, `clonePaintLayer`, `isPaintLayerEmpty`, `readPixel`, `effectiveRadius`, `wrapUnit`.
- `uv-stroke.ts`: `interpolateDabs(from, to, brush, size, { wrap, carry })` → `{ dabs, carry, lengthPx }`, `spacingPx`, `shortestUvDelta`, `uvDistancePx`.
- `stroke-session.ts`: `createStrokeSession(layer, brush, { wrap })` → `begin/extend/end`(1 스트로크 = 1 토큰).
- `paint-session.ts`: `createPaintSession(options)` → React 밖 스토어(`getState/subscribe/setBrush/setActivePart/setWrap/layer/beginStroke/extendStroke/endStroke/applyToken/replaceLayers/clearLayer/layersForExport`), `clampBrush`, `getDefaultPaintSession()`.
- `paint-bridge.ts`: `createPaintUndoHandler(session, upload)`, `createPointerPaintDriver(session, { pick, upload, commit })` → `down/move/up/cancel`, `clientToNdc(clientX, clientY, rect)`, `normalizePointerPressure(event)`.

### `src/export/`
- `raster-convert.ts`: `toTopDownStraight`, `toCapturedRaster`, `fromTopDownStraight`, `decodeIdPass`, `decodeMaterialIdPass`, `decodeDepth`.
- `png-encoder.ts`: `encodePng(raster, { filter: "none" | "adaptive", srgb })`, `decodePng`, `crc32`, `deflateBytes`/`inflateBytes`, `readPngChunks`, `parseIhdr`, `buildScanlines`, `isPng`, `PNG_MIME`.
- `line-extract.ts`: `extractLineArt(input, opts)` → `Uint8ClampedArray` 마스크, `extractLineArtChannels`(silhouette/luma/depth/crease/partBoundary/materialBoundary/combined), `lineArtToRaster`, `sobelMagnitude`, `countLinePixels`, `DEFAULT_LINE_ART_OPTIONS`.
- `tone-split.ts`: `splitTones(flat, lit)` → `{ shade, highlight }`, `recompose`, `opaqueMae`, `multiplyByte`, `screenByte`.
- `psd-plan.ts`: `planCharacterPsd(capture, paintLayers, { includeIdMasks, includeReferencePasses, lineArt })` → `PlanPsdResult`, `buildIdMaskLayers`, `idMaskColor`, `depthToRaster`, `downsampleRaster`, `PSD_MAX_DIMENSION`, `PSD_LAYER_NAMES`.
- `psd-assemble.ts`: `assemblePsd(plan, { compress })` → `Uint8Array`, `toAgPsd`, `toAgPsdLayer`, `PSD_MIME`. `psd-canvas.browser.ts`: `installPsdBrowserCanvas()`(멱등).
- `export-session.ts`: `exportTransparentPng`, `exportLayeredPsd`, `exportGlb`, `exportRecipe` → `ExportOutcome{ ok, bytes, receipt | failure }`, `buildCaptureRequest`, `validateExportDimensions`, `exportFileName`, `isGlb`, 상수 `MIN_EXPORT_DIMENSION`(16)·`MAX_PNG_EXPORT_DIMENSION`(4096)·`MAX_PSD_EXPORT_DIMENSION`(2048)·`MAX_SETTLE_STEPS`(600).
- `recipe-file.ts`: `serializeRecipe`, `parseRecipeFile`, `recipeFileName`, `embedPaintLayers`, `extractPaintLayers`. `paint-layer-record.ts`: `encodePaintLayerRecord`/`decodePaintLayerRecord`, `bytesToBase64`/`base64ToBytes`.
- `save-bytes.ts`: `saveBytesWith(ports, name, bytes, mime, { revokeDelayMs, now })`, `sanitizeFileName`. `download.browser.ts`: `saveBytes(name, bytes, mime)`, `createDomSavePorts`.

### 패널
- `app/shell/panels/PaintPanel.tsx`(`session` 주입 가능), `app/shell/panels/ExportPanel.tsx`(`session`, `deps: { save, now, readFile, preparePsd }` 주입 가능).

## 3. 수치 목표(연구 numericTargets) 대비

| 목표 | 현재 상태 |
| --- | --- |
| 투명 PNG: 완전 투명 픽셀 RGB=0, 반투명 에지 색 번짐 0 | Node 검증(`unpremultiply` a=0 → RGB 0, premultiply 왕복 오차 ≤ ⌈255/α⌉) |
| 투명 PNG 2048² ≤ 500 ms(readback+un-premultiply+encode) | 미측정(브라우저·GPU 필요). 인코더는 adaptive 필터 + 네이티브 deflate |
| tone-split 재합성 MAE ≤ 2/255 | Node 검증(결정적·랜덤 패턴) + PSD 영수증 `recomposeMae`로 매 출력 기록 |
| 주선: GPU Sobel vs CPU 참조 일치율 ≥ 99.9% | CPU 참조만 구현. GPU 패스는 render 작업자 범위, 비교는 브라우저 검증 |
| PSD 2048² 레이어 ≥ 10, 생성 ≤ 3 s, blendMode·그룹 보존 | 레이어 수는 옵션에 따라 7~10+(ID 마스크 N), Node round-trip 보존 검증. 시간·Worker 생성·CSP/Photoshop 열기는 미검증 |
| 레시피 JSON 왕복 바이트 동일 | Node 검증(`serializeRecipe` 키 정렬) |

## 4. 다른 작업자에게 전달하는 배선·계약 메모

1. **core(`app/composition.ts`)**: `createLabStore({ ..., onPaintUndo: createPaintUndoHandler(getDefaultPaintSession(), (layer) => engineSession.engine()?.updatePaintTexture(layer)) })`. 현재 `onPaintUndo`가 비어 있어 `history/undo`가 페인트 토큰을 레이어에 반영하지 못한다.
2. **render(`ViewportPane`)**: 드로잉 모드(`ui.drawingMode`)에서 `createPointerPaintDriver(session, { pick: (x, y) => engine.pick(x, y), upload: engine.updatePaintTexture, commit: (token) => dispatch({ type: "paint/stroke", undoToken: token }) })`를 만들고 `pointerdown/move/up/cancel`에 `clientToNdc(event.clientX, event.clientY, canvas.getBoundingClientRect())`와 `normalizePointerPressure(event)`를 넘긴다. `setPointerCapture` 권장.
3. **render(`babylon/capture.ts`)**: `texture.readPixels()` 결과는 `toTopDownStraight(rgba, w, h, { flipY, premultiplied })`로 변환한다(backend 상수는 render가 결정, 브라우저 검증 항목). 깊이는 `decodeDepth(f32, w, h, { near, far, flipY })`.
4. **render(`updatePaintTexture`)**: 레이어는 straight alpha·top-down(UV v=0 = 첫 행). Babylon `RawTexture.CreateRGBATexture`는 `invertY`를 명시해야 UV와 행 방향이 맞는다(브라우저 검증 항목).
5. 계약 변경 요청: 없음(`contracts/paint.ts`, `capture.ts`, `events.ts` 그대로 사용).

## 5. 라이선스·출처

| 항목 | 출처 | 라이선스 |
| --- | --- | --- |
| PSD 조립 | `ag-psd` 31.0.1(직접 의존성, `patches/ag-psd@31.0.1.patch`) | MIT |
| PNG 인코더/디코더 | PNG 사양(ISO/IEC 15948) §5.5 CRC, RFC 1950/1951, 필터 Sub/Up/Average/Paeth | 사양 자체 구현(의존성 없음) |
| dab 합성 | Porter & Duff 1984 straight-alpha source-over, sRGB↔linear | 공개 수식 |
| 주선 추출 | Sobel 연산자, Saito & Takahashi 1990(깊이·법선 G-buffer 에지), Bénard & Hertzmann 2019 튜토리얼 | 공개 수식·논문(코드 복제 없음; rtsc/Blender Line Art(GPL) 미열람) |
| tone-split | Photoshop multiply/screen 분리형 블렌드 수식 | 공개 수식 |
| OKLab/색 변환 | `shared/color.ts`(Björn Ottosson 2020) | 공개 |

## 6. 브라우저 미검증 항목(요약)

실제 GPU readback 행 순서·premultiply 상수, 페인트 텍스처의 UV 방향·반영, `<a download>` 저장 동작, ag-psd 브라우저 캔버스 등록 후 PSD를 Photoshop/CLIP STUDIO PAINT에서 열기, PSD 레이어 재합성 MAE 실측, GLB 실파일 재import, 2048² PNG/PSD 처리 시간.
