# Studio 상용 기능 Clean-room 레이더 — 2026-07-28

## 목적

ToonSpectrum Studio가 무료·오픈소스 라이브러리의 공통분모에 머물지 않도록, 상용 창작 도구가
제공하는 고유한 작업 흐름을 정기적으로 재감사한다. 이 문서는 상용 소스 코드·프리셋·에셋·UI를
복제하기 위한 목록이 아니다. 공식 매뉴얼과 공개된 제품 동작에서 **사용자가 해결하려는 문제와
검증 가능한 결과**만 추출하고, ToonSpectrum의 canonical document와 provider 계약 위에 독립적으로
구현한다.

## Clean-room 규칙

1. 입력은 공식 매뉴얼, 공개 사양, 논문, 특허, 합법적으로 관찰 가능한 제품 동작으로 제한한다.
2. 상용 바이너리 디컴파일, 비공개 소스·프리셋·에셋 반입, 라이선스 또는 접근 통제 우회는 금지한다.
3. 기능 명세는 브랜드 명칭 대신 입력·출력·상태 전이·오차 허용치·취소/복구 조건으로 다시 쓴다.
4. 구현자는 원본 내부 구조를 전제하지 않고 canonical command, immutable artifact, capability receipt,
   deterministic replay 경계로 구현한다.
5. 화면이 비슷해 보이는 것으로 완료하지 않는다. CPU 기준 결과, GPU 결과, 저장 재생, Undo/Redo,
   Worker 취소, device-loss, 모바일 입력을 각각 검증한다.

## 정기 재감사 절차

- 월 1회 또는 주요 버전 발표 시 공식 변경 로그와 매뉴얼의 기능 분류를 다시 읽는다.
- 새 기능은 `관찰됨 → 명세됨 → 코어 구현 → provider 구현 → Studio 연결 → 브라우저 검증` 여섯
  단계로 추적한다.
- 단순 프리셋 수보다 새로운 표현력을 만드는 엔진 파라미터를 먼저 구현한다.
- 번들 크기와 정적 요청 수는 관찰 지표로만 남기고, 품질·입력 지연·대형 문서 안정성·결정론을
  승격 기준으로 사용한다.
- 상용 제품보다 나은 차별점은 브라우저 협업, 의미 단위 버전 관리, 로컬 AI, 원격 서버 비용이 없는
  Worker/WebGPU 실행, 웹툰 출고 preflight를 결합해 만든다.

## 2026-07-28 공식 근거와 독립 구현 목표

| 제품군 / 공개 근거 | 관찰한 사용자 가치 | ToonSpectrum 독립 구현 계약 | 현재 단계 |
| --- | --- | --- | --- |
| [Clip Studio Paint — Dual brush](https://help.clip-studio.com/en-us/manual_en/810_subtools/Number.htm) | 두 팁의 크기·간격·텍스처·분사와 결합 모드를 한 획에서 조절 | 두 팁의 독립 station schedule, 8개 mask family, **deposition별 flow/opacity 합성**, CPU↔WebGPU 픽셀 기준 | 상위 exact v2 brush-pack provider 단위 검증과 하위 v2 runtime의 실제 Chromium RGBA16F readback 동등성 검증 완료. production/UI 연결은 다음 수직 통합 단계 |
| [Clip Studio Paint — Color mixing](https://help.clip-studio.com/en-us/manual_en/240_brushes/Blending_tools.htm) | 기존 안료를 끌고 새 안료를 더하는 Blend/Running color/Smear | stroke-local pickup well, optical-density pigment, 색 끌기 거리, blur radius, 결정적 타일 replay | 코어 구현, GPU/Studio 연결 확대 중 |
| [Clip Studio Paint — Reference layers](https://help.clip-studio.com/en-us/manual_en/180_layers/Reference_layers.htm) | 선화와 채색 레이어를 분리한 채 경계를 참조해 넘침 없이 채색 | 다중 reference snapshot, vector path boundary, gap close, anti-overflow, selection/fill 공통 mask | 코어·UI 지원, tiled 부분 갱신 보강 대상 |
| [Procreate — Dual Brush](https://help.procreate.com/procreate/handbook/5.0/brushes/dual-brush) | 서로 다른 두 브러시를 독립 편집하고 결합 결과를 즉시 미리보기 | provider-neutral dual descriptor, 동일 입력의 preview/commit parity, 조합별 회귀 이미지 | CPU authority·WebGPU exact v2·저장/replay artifact 구현 및 브라우저 검증 완료 |
| [Procreate — Stabilization](https://help.procreate.com/procreate/handbook/5.4/brushes/brush-studio-settings) | 브러시별 smoothing, speed-aware stabilization, motion filtering | raw/coalesced/predicted sample 분리, 지연 예산이 명시된 stabilizer, release endpoint 보존 | 제품 연결 및 오차 측정 지원 |
| [Corel Painter — Brush controls](https://product.corel.com/help/Painter/540219480/Main/EN/Win-Documentation/Corel-Painter-Exploring-Panels.html) | bristle, rake, grain, particles, impasto, watercolor를 공통 dynamics로 조합 | canonical dynamics graph, analytic bristle lowering, particle force field, height/roughness material channel | bristle·wet-media 코어 지원, height/particle GPU 확대 대상 |
| [Corel Painter — Water controls](https://product.corel.com/help/Painter/540215550/Main/EN/Win-Documentation/Corel-Painter-Water-controls.html) | wetness·pickup·dry rate·wind·paper texture가 실제 매체처럼 상호작용 | sparse wet tile, mobile/fixed pigment conservation, absorbency, backrun, edge pool, wind vector | 코어 구현, Worker/WebGPU 계산 provider 대상 |
| [Corel Painter — Impasto controls](https://product.corel.com/help/Painter/540219480/Main/EN/Win-Documentation/Corel-Painter-Adjust-and-create-Impasto-brush.html) | 색·깊이를 따로 그리며 종이/텍스처 휘도, 음의 깊이, 기존 깊이를 미는 plow, 압력·속도 표현식을 조합 | color/height 분리 tile, signed depth, height-conserving plow displacement, dynamics expression, depth jitter smoothing | signed Float32 height·색·roughness, add/excavate/erase/flatten, 질감·표현식·보존형 plow CPU oracle 구현 |
| [Corel Painter — Impasto lighting](https://product.corel.com/help/Painter/540215550/Main/EN/Win-Documentation/Corel-Painter-Impasto-lighting-and-depth.html) | 여러 색 조명과 광택·반사로 두꺼운 획의 표면을 전역 또는 장면별로 다시 조명 | ordered multi-light rig, height normal, ambient/diffuse/specular/reflection, HDR-linear cache와 canvas gizmo | signed height/roughness/metalness/normal map, 방향·점·스폿 광원, 감쇠·Schlick Fresnel·에너지 분할 specular CPU oracle과 전용 Worker 경계 구현 |
| [Corel Painter — Particle brushes](https://product.corel.com/help/Painter/540215550/Main/EN/Win-Documentation/Corel-Painter-General-Particle-controls.html) | count·chaos·damping·force·flow map으로 유기적인 다중 흔적 생성 | seeded particle stream, bounded force integrator, deterministic replay, audio 없이도 expression mapping | generic orbital·flow·spring-net, fixed arc/timestep, flow field, smoothed chaos, exact append/rebuild CPU oracle과 전용 Worker 경계 구현 |
| [Corel Painter — Flow maps](https://product.corel.com/help/Painter/540111155/Corel-Painter-en/Corel-Painter-Apply-adjust-flow-maps.html) | 종이보다 큰 relief로 물감과 입자 흐름을 유도하고 기존 종이 질감과 함께 사용 | 독점 스캔 없는 절차적 relief·fiber·weave·pore, 전역 좌표 height gradient, absorbency·grain·flow 채널, 타일 seam parity | full-frame↔tile/halo byte parity와 주기 seamless flow를 갖춘 절차적 media-surface CPU oracle과 전용 Worker 경계 구현 |
| [Rebelle — Real media](https://www.escapemotions.com/products/rebelle/about) | 안료 혼색, 수채 확산·건조·기울기·바람, 개별 bristle, impasto, 큰 출력 | 사용자 제공 400–700nm 반사율, Kubelka–Munk K/S 혼합, 유한 두께 two-flux 층, fiber bundle, water field, paper height/absorbency, impasto height tile, out-of-core export | 스펙트럼 혼색·개별 섬유 bristle·안료·수분·signed height 코어와 브리슬 Worker, BigInt 기반 초대형 out-of-core export 코어 구현 |
| [Wyman·Sloan·Shirley — CIE XYZ analytic fits](https://research.nvidia.com/labs/rtr/publication/wyman2013simple/) | 표 데이터 반입 없이 스펙트럼을 검증 가능한 XYZ 관찰자 근사로 변환 | 31개 파장 sample, analytic CIE 1931 2° fit, illuminant white normalization, unbounded scene-linear RGB와 별도 clamped preview | renderer-neutral 스펙트럼 혼색 provider에 구현 |
| [Adobe Fresco — Live brushes](https://helpx.adobe.com/fresco/using/live-brushes.html) | 물 흐름과 안료 흐름을 분리하고, 문서를 다시 열어도 젖은 수채 상태를 보존하며 유화 두께·혼색을 계속 편집 | 저장 가능한 water/pigment/height tile, 무안료 혼색, barrel-roll 방향, background simulation epoch, deterministic reopen replay | water/pigment/wetness/stain/paper 바이너리 영속 코덱 구현, height·barrel-roll 확대 대상 |
| [Toon Boom Harmony — Textured vector brush](https://docs.toonboom.com/help/harmony-24/advanced/drawing/create-textured-brush.html) | 벡터 획의 편집성과 비트맵 팁·종이 질감을 결합하고 변형 뒤 질감을 다시 샘플링 | editable centerline/outline + immutable texture seed, transform-aware rerasterization, source-resolution receipt, lossless vector export와 raster appearance 분리 | 하이브리드 벡터 잉크 provider와 결정적 transform replay 구현 |
| [Toon Boom Harmony — Weighted deformation](https://docs.toonboom.com/help/harmony-24/premium/deformation/about-weighted-deformations.html) | 뼈·곡선·점·envelope 여러 영역의 거리를 혼합해 텍스처가 찢어지지 않는 고품질 변형 | mixed point/curve/envelope source, normalized distance weights, texture-coordinate preserving deformation, cache/quality receipt | 2D/3D CPU oracle·UV 보존과 전용 Worker transfer/backpressure/abort/timeout/epoch fail-closed 경계 구현 |
| [Adobe Photoshop — Smart Filters](https://helpx.adobe.com/photoshop/using/applying-smart-filters.html) | 원본을 보존하면서 필터 순서·마스크·수치를 계속 수정 | immutable appearance graph, node mask, color-space declaration, cached dirty-tile evaluation | 기존 effect stack을 WebGPU/OpenCV provider로 확대 |
| [Affinity Photo — Live displacement](https://affinity.help/photo2ipad/en-US.lproj/pages/Filters/filter_displace.html) | 외부 이미지뿐 아니라 아래 레이어를 변위 맵으로 사용하고 결과를 비파괴로 계속 조절 | layer-derived input edge, displacement-space declaration, live node parameter, dependency dirty-region propagation | immutable recipe·same/separate height·bilinear displacement CPU oracle 구현, appearance graph 연결 대상 |
| [Affinity Photo — Live lighting](https://affinity.help/photo2ipad/English.lproj/pages/Filters/lighting_effects.html) | 이미지 높이에서 bump를 만들고 여러 점·방향·스폿 조명을 화면 핸들로 편집 | height/normal derivation, ordered multi-light rig, HDR-linear evaluation, canvas gizmo artifact, non-destructive node | directional/point 단일 조명 CPU oracle 구현, multi-light·gizmo·graph 연결 대상 |
| [Adobe Substance 3D Painter — Features](https://helpx.adobe.com/substance-3d-painter/features.html) | smart material/mask, UV reprojection, UV tile, sparse virtual texture, custom shader | BVH surface hit, UV/world/triplanar projection, material channel stack, sparse texture tile, bake receipt | 3D texture paint 기초 지원, BVH/glTF provider 추가 중 |
| [Live2D Cubism — Deformer](https://docs.live2d.com/en/cubism-editor-manual/deformer/) | 부모-자식 deformer로 2D 캐릭터를 비파괴 변형 | mesh/warp/rotation deformer graph, parameter keyform, deterministic interpolation, physics as optional provider | puppet/warp 코어와 통합 설계 대상 |
| [Moho — Smart Bones](https://www.lostmarble.com/manual/13.5/Moho%20Users%20Manual.pdf) | 관절 회전을 보정 action과 연결해 찌그러짐, 원근, 표정 변형을 재사용 | driver curve → corrective keyform graph, multi-driver conflict policy, onion preview, deterministic bake/export | renderer-neutral corrective-driver graph 코어·검증·결정적 bake 구현 |
| [Clip Studio Paint — Mesh/Puppet transform](https://help.clip-studio.com/en-us/manual_en/360_transform/Types_of_transformations.htm) | raster·vector·mask를 격자 또는 삼각 메시로 직접 변형하고 여러 제어점을 함께 이동·회전·확대 | canonical control mesh, multi-pin selection, constrained handles, ARAP/harmonic solve, preview/commit/reopen parity | 기존 liquify/puppet displacement를 공통 control-mesh provider로 통합 대상 |

## 첨부 마스터플랜 교차 감사

2026-07-28에 제공된 마스터플랜, 브라우저 네이티브 드로잉 아키텍처, 3D DCC 비교,
브러시·필터 전수 정리와 997개 기능 체크리스트를 현재 코드와 다시 대조했다. 체크리스트의
`공개 문서상 미확인`은 곧바로 `미구현`을 의미하지 않는다. 따라서 기능 수를 그대로 완료율로
사용하지 않고 아래처럼 증거 단계를 분리한다.

| 첨부 자료의 우선 요구 | 현재 코드 증거 | 판정과 다음 닫힘 조건 |
| --- | --- | --- |
| 타일 대형 캔버스·부분 렌더·GPU/CPU/디스크 계층 | tiledoc geometry/store/residency/persistence, WebGPU tile runtime·compositor, OPFS storage Worker | 코어·저장 provider는 존재한다. `1,600×100,000px·300레이어` 실전 fixture와 장시간 메모리 계측이 남음 |
| Worker 기반 렌더·분석·저장 | OpenCV, weighted deformation, xatlas, bristle, multi-light 전용 Worker와 tile storage Worker | 기능별 취소·timeout·epoch·no-fallback 경계는 확대했다. 실제 Chromium Worker 번들과 Studio consumer 연결을 기능별로 승격해야 함 |
| 입자·리본·패턴·듀얼·자연매체 브러시 | exact dual-tip WebGPU v2, hybrid textured vector, wet-ink codec, spectral pigment, signed impasto, individual-fiber bristle | 엔진 표현력의 CPU/GPU 기준선은 확장 중이다. Brush Studio schema·preview/commit/reopen·공식 자체 프리셋 연결 전에는 UI 완료로 표시하지 않음 |
| 초대형 세로 원고와 고해상도 출고 | BigInt/decimal 좌표와 lazy tile iterator를 쓰는 out-of-core export provider | renderer/sink 독립 코어와 재개·무결성·메모리 backpressure를 구현. PNG/TIFF/PSD sink와 실제 장시간 중단 재개 검증이 남음 |
| 비파괴 레이어·라이브 필터·dirty dependency | adjustment stack/layer runtime, tiledoc dirty/composite plan, live-surface CPU oracle | 각각의 코어는 있으나 하나의 immutable appearance graph와 Studio inspector·저장·PSD 손실 보고로 수직 연결해야 함 |
| 3D import·Picking·Boolean·UV·표면 페인팅 | glTF-Transform, three-mesh-bvh, manifold-3d, xatlas Worker provider | 라이브러리 격리와 typed-array artifact는 확보. Outliner·surface snap·material layer·3D→2D 독립 패스의 실제 UI 연결이 남음 |
| 텍스트·SVG·식자 정확도 | HarfBuzz shaping + resvg WASM provider | shaping/raster core만으로 전문 식자가 끝난 것은 아님. 세로쓰기·루비·금칙·말풍선 reflow·PSD 왕복 fixture를 닫아야 함 |
| 로컬 AI·서버 비용 절감 | ONNX Runtime Web registry/provider와 OpenCV Worker | 모델 provenance·예산·epoch 경계는 존재. selection mask artifact와 실제 채우기/선화 보조 command로 연결해야 함 |

이번 교차 감사에서 바로 승격한 항목은 초대형 out-of-core export, 브리슬·다중 조명 Worker,
물리 파티클 브러시, 전역 좌표 기반 절차적 종이·흐름 표면이다. 반대로 첨부 문서에 기능명이
있더라도 현재 코드에 consumer·저장·Undo·브라우저 증거가 없으면 `Studio 연결 완료`로 올리지 않는다.

### 첨부 문서의 상태 정정

- OPFS journal/checkpoint/lease/복구, `.toonproject.zip` 무손실 하위집합, 214종 브러시 catalog,
  Brush Studio·필터 dialog, Room Builder·surface snap·측정·section·shot pass, 기본 VRM pose,
  Yjs presence/cursor/outbox는 현재 코드에 존재하므로 greenfield 항목으로 다시 계획하지 않는다.
- 자동 raster publication은 검증 surface가 있어도 배포 opt-in이며, pointer live ink도 rollout
  조건에 따라 Canvas2D authority를 사용하므로 새 엔진 전체 전환 완료로 표시하지 않는다.
- PSD는 128 MiB·30,000px 경계와 loss manifest가 있는 부분 호환이고 PSB는 의도적으로 차단돼 있다.
  `.clip`·`.sut`·`.ai` 직접 왕복, editable PDF/SVG import, 전문 text/vector/mask 왕복도 열려 있다.
- 협업은 CRDT·presence·lease·chat·screen share·review role까지 제품 경로가 있으나 semantic
  layer/character/balloon/task lock, 익명 만료 review link, 창작 문서 branch/merge, 50인 부하 증거는
  닫히지 않았다. 음성은 선택 기능이며 서버비용 우선순위에서 제외한다.
- 3D는 import·pose·Room Builder 쪽이 제품화됐지만 GLB/VRM export와 외부 DCC roundtrip,
  provider별 Undo·저장·협업·출력 수직 통합은 별도 완료 조건으로 남긴다.
- 따라서 다음 품질 파동은 새 기능 수보다 `권위 raster publication → 공개 입력/브러시/filter
  golden corpus → PSD/PSB 왕복 → semantic collaboration → 3D/DCC 왕복` 순서로 평가한다.

## 이번 provider 파동

| Provider | 맡는 역할 | 권위 경계 |
| --- | --- | --- |
| Raw WebGPU | RGBA16F brush, composite, filter compute | canonical stroke/tile command를 소비하며 문서 상태를 소유하지 않음 |
| PixiJS | 선택·hover·transform용 별도 GPU scene overlay | 독립 투명 surface만 소유, 브러시 픽셀과 document state를 소유하지 않음 |
| Konva | 성숙한 Transformer·텍스트·말풍선과 migration oracle | 지원되지 않은 장면의 제한된 fallback; 새 brush authority 금지 |
| Paper.js | SVG path parse, smooth, simplify, boolean geometry | 작업마다 격리된 project, plain-data artifact만 반환 |
| RBush | 대형 장면 point/area 후보 검색 | ID·bounds의 private copy만 보유, 정확 hit-test는 상위 provider가 수행 |
| HarfBuzz + resvg | OpenType shaping과 결정적 SVG raster | font/SVG 입력 예산, opaque handle 반환 금지, 명시적 해제 |
| OpenCV.js | morphology, connected component, contour, perspective | Worker-only typed-array 작업, 큰 입력의 main-thread fallback 금지 |
| ONNX Runtime Web | 로컬 segmentation·pose·line/color assist | model hash/schema/size 검증, WebGPU 우선·WASM fallback, epoch 취소 |
| three-mesh-bvh | raycast, lasso, surface snap/paint | canonical mesh ID와 hit artifact만 반환 |
| glTF-Transform | GLB/glTF normalize/inspect/write | import artifact를 canonical asset로 변환, scene authority 금지 |
| manifold-3d | robust boolean, cut, section | bounded mesh input/output, topology receipt, 실패 시 원본 보존 |
| xatlas | 자동 UV unwrap/pack | 단일 전용 Worker 내부 direct WASM/Comlink loopback, nested Worker 없음, plain typed-array 경계, epoch·예산·timeout/abort hard terminate·명시적 atlas 해제 |
| Hybrid textured vector ink | editable centerline/outline과 R8 팁·종이 질감을 함께 보존 | document-space texture phase, transform 재샘플링, seeded append/rebuild와 품질 receipt |
| Wet-ink persistence | 물·이동 안료·젖음·고정 얼룩·종이장을 결정적 바이너리로 저장/복원 | sparse tile의 private copy, SHA-256/digest 검증, 손상·버전·예산 fail-closed, reopen simulation parity |
| Corrective driver graph | 뼈·표정 scalar를 재사용 가능한 보정 변형에 연결 | 다중 driver activation, 명시적 충돌 정책, onion preview, 포맷 독립 channel과 결정적 Float32 bake |
| Weighted deformation | point/curve/envelope 변형원을 거리 기반으로 혼합 | 2D/3D 대응 polyline, compact normalized weights, UV 불변, 전용 Worker transfer, backpressure, stale epoch, abort·timeout hard terminate, no-main-thread-fallback receipt |
| Live surface effects | 레이어/별도 height로 변위하고 같은 높이장을 다시 조명 | 불변 recipe, 서로 다른 해상도 height, bilinear 경계 3종, height normal, directional/point light, 선형 RGBA CPU oracle |
| Spectral pigment mixing | RGB 평균 대신 안료 반사율과 도막 두께로 혼색 | proprietary 측정값 없는 caller-owned 31-sample spectrum, K/S 혼합, two-flux substrate layer, analytic observer, deterministic hash·epoch·budget |
| Signed impasto height | 두꺼운 물감의 추가·파내기·평탄화와 재조명을 위한 재질 높이장 | signed Float32 height와 선택적 color/roughness, paper/texture·pressure/velocity·seeded jitter, mass-neutral bounded plow, 보존 오차 receipt |
| Multi-light surface | signed height 재질을 여러 광원으로 비파괴 재조명 | height/roughness/metalness/normal map, canonical light-ID evaluation, directional/point/spot, inverse-square/smooth-range, cone falloff, exact alpha, tiled CPU oracle와 전용 Worker transfer/backpressure/abort/timeout/epoch |
| Individual-fiber bristle | 한 팁 이미지가 아니라 섬유별 접촉·휘어짐·안료 잔량으로 획 생성 | seeded ellipse/fan/flat topology, fixed arc-length station, pressure/tilt/speed dynamics, paper dropout, dry-out/reload/pickup, exact retained-sample rebuild와 전용 Worker 경계 |
| Out-of-core export | 브라우저 캔버스·32비트 좌표·상주 메모리보다 큰 원고를 타일 단위로 출고 | BigInt/decimal dimensions, lazy row/Morton iterator, exact halo crop, renderer/sink provenance, resume revalidation, bounded concurrency, rolling manifest hash |
| Physics particle brush | 한 획 중심에서 움직이는 다중 입자·탄성 연결·흐름장을 표현 | generic orbital/flow/spring-net, fixed arc spawn/timestep, pressure/speed/tilt expression, global/local smoothed chaos, optional flow height, connector/deposition artifact, exact append/rebuild, 전용 Worker no-fallback |
| Procedural media surface | 유료 종이 스캔 없이 브러시 grain·수채·입자에 공통 표면 제공 | seeded relief/fiber/weave/pore/speckle, height·absorbency·grain·RG flow, global coordinates, tile+halo byte parity, optional seamless period, 전용 Worker typed-array 경계 |

## 수직 통합 우선순위

첨부 문서와 현재 production consumer를 대조한 결과, 다음 파동의 기준은 `새 provider 수`가 아니라
`consumer가 없는 provider를 실제 Studio 문서 생명주기로 연결하는 것`이다. provider 단위 목록은
아래 세부 승격 순서로 유지하되 실행 파동은 다음과 같이 고정한다.

1. 통합 실브라우저 품질 게이트를 상시 실행해 pointer→live→commit→Undo→save→reload→export의
   지연·유실·픽셀 parity를 하나의 journey로 측정한다.
2. Engine vNext 대표 브러시 6~8종을 실제 Brush Library와 settled render에 연결하고, 같은 canonical
   stroke recipe를 live·commit·reopen·export가 소비하게 한다.
3. 기존 tile authority·render Worker·WebGPU tile provider를 settled document의 권위로 승격하고
   Konva full-page raster 의존을 단계적으로 줄인다.
4. 기존 OPFS v2 backend/Worker/bridge를 autosave journal·checkpoint·tile source-of-truth에 연결한다.
   현재 localStorage·IndexedDB 경로는 metadata·fallback·migration으로 남긴다.
5. adjustment-layer·canonical GPU filter·OpenCV·surface Worker를 기존 Smart Filter UI와 Layer panel에
   연결해 직접 그린 획·그룹·페이지에 4MP page-composite 제한 없이 비파괴 적용한다.
6. Paper/RBush/HarfBuzz/resvg를 현재 말풍선·세로쓰기·루비 UI의 backend로 연결해 node editing,
   precise hit-test, SVG/PDF/PSD 출력까지 같은 authority를 사용한다.
7. Brush Studio·ABR 변환·즐겨찾기·공유·팀 버전을 하나의 catalog와 compact inspector로 통합한다.
8. raster CRDT의 현재 opt-in publication을 tile authority·OPFS·수렴 soak test가 통과한 문서부터
   점진적으로 기본화한다.
9. 3D는 새 scene graph를 만들지 않고 현재 R3F/Three scene을 renderer adapter 뒤에 두어 WebGPU
   우선·WebGL fallback으로 전환한 뒤 linked multipass layer와 Edit/Modifier/Cloner를 연결한다.
10. out-of-core exporter는 tile authority와 OPFS가 연결된 뒤 현재 publish·PSD·package UI의 renderer와
    sink로 채택해 crash/restart resume와 다운로드 재열기까지 검증한다.

## provider별 다음 승격 순서

1. 완성된 exact dual-tip provider를 브러시 UI의 preview/commit/reopen 회귀 묶음으로 승격한다.
2. OpenCV Worker provider의 morphology, connected components, contour, perspective artifact를 실제 선택 도구에 연결한다.
3. ONNX local segmentation 결과를 같은 selection mask artifact로 변환해 AI와 수동 도구가 동일한
   Undo/Redo·저장 경계를 사용하게 한다.
4. BVH surface snap/paint와 glTF normalize를 3D import·배경 배치 경로에 연결한다.
5. height/roughness tile과 wet-media compute provider를 추가해 impasto·paper granulation을
   비파괴 appearance channel로 만든다.
6. particle/rake/multi-tip dynamics를 canonical brush schema의 versioned extension으로 승격한다.
7. 하이브리드 벡터 잉크를 centerline·outline·texture seed로 분리해 변형 뒤에도 질감이 같은 규칙으로
   다시 생성되도록 하고, 원본 해상도와 현재 배율의 품질 receipt를 노출한다.
8. water/pigment/height tile을 문서에 영속화해 저장 후 재개, 무안료 혼색, background dry simulation을
   Undo/Redo와 협업 replay에 포함한다.
9. 완성된 displacement·lighting CPU oracle에 ordered multi-light·Worker/WebGPU provider를 추가하고
   appearance graph의 레이어 의존 node로 연결해 dependency dirty-region만 다시 계산한다.
10. 완성된 corrective-driver 코어를 2D deformer·VRM·일반 glTF morph channel adapter에 연결한다.
11. 완성된 point/curve/envelope CPU oracle과 Worker 경계를 mesh/puppet 제어망 adapter에 연결하고,
    profile 결과가 필요한 구간만 WebGPU로 승격해 bitmap·vector·texture 좌표가 같은 변형장을 사용하게 한다.
12. 완성된 signed height와 plow 보존 법칙을 wet-media tile·브러시 commit에 연결하고
    multi-light live surface node로 같은 높이장을 다시 조명한다.
13. 스펙트럼 혼색 provider를 brush pickup well·mixing palette·wet pigment tile에 연결하고,
    사용자가 직접 측정·제작한 pigment library만 import/export하도록 provenance를 보존한다.
14. 개별 섬유 deposition을 exact brush-pack lowering과 연결해 live/commit/reopen RGBA16F parity를
    검증하고, signed height·spectral pickup을 같은 섬유 상태에 결합한다.

## 완료 정의

- 동일 canonical command의 live preview, commit, reopen replay 결과가 허용 오차 안에서 일치한다.
- GPU 기능은 CPU oracle 또는 독립된 golden image와 비교하며 device-loss 후 같은 결과를 재생한다.
- Worker/WASM 기능은 취소, stale epoch, 크기 예산, malformed input, explicit destroy를 테스트한다.
- 상용 제품 이름을 UI 기능명이나 자산 이름으로 사용하지 않으며 자체 프리셋과 미리보기만 제공한다.
- 기능별 Studio UI, 키보드/펜 입력, 모바일 화면, 저장·Undo, 협업 전파, 내보내기까지 닫혀야
  `Studio 연결` 단계로 표시한다.
