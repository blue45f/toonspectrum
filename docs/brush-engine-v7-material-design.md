# Brush Studio V7 — Material Physics & Brush Production Design

## 1. 목표

V7의 목표는 브러시 수를 단순히 늘리는 것이 아니라 같은 획이라도 재료와 바탕의 물리적 상호작용이 달라지는 시스템을 만드는 것이다.
Clip Studio Paint의 brush tip, spray, stroke, texture, dual brush, watercolor edge, input dynamics를 기본 경쟁선으로 둔다.
ToonSpectrum은 다음 세 축을 핵심 차별점으로 사용한다.

1. 문서 좌표에 고정된 다채널 표면 미세구조(microstructure)
2. 건식·습식·유화·마커가 동일 표면을 서로 다르게 해석하는 material-contact solver
3. 결정론적 seed와 품질 게이트를 이용한 대량 브러시 생산 파이프라인

## 2. 호환성 원칙

- 기존 V6 surface ID의 tooth 계산식과 저장된 획 재생 결과를 유지한다.
- V7 전용 `surface-v7-*` 노드에서 absorbency, fiber angle, anisotropy 채널을 활성화한다.
- 같은 seed와 입력은 같은 material marks를 재생해야 한다.
- 외부 엔진은 라이선스에 따라 native, adapter, research-only 경로를 분리한다.
- provider fallback 없이 명시적인 실행 경로를 유지한다.
## 3. V7 Surface Field

표면 샘플은 `(documentX, documentY, seed)`만으로 결정되며 viewport zoom, stroke index, mutable RNG와 독립적이다.
각 샘플은 다음 네 채널을 반환한다.

- `tooth`: 국소 표면 높이와 접촉 난이도
- `localAbsorbency`: 국소 액체 흡수성
- `fiberAngle`: 섬유 또는 릿지의 주 방향
- `anisotropy`: 방향성이 획에 미치는 강도

현재 V7 표면은 Hot-press Satin, Rough Watercolor, Laid Paper, Kozo Washi,
Sanded Pastel, Vellum Skin, Brushed Gesso, Heavy Canvas, Newsprint Pulp,
Kraft Fiber, Wood Grain, Stone Grit의 12종이다.

표면은 비트맵 텍스처를 단순 반복하지 않는다. 저주파 basin, 고주파 grain, periodic ridge,
fiber warp, grit sparkle 등을 조합하여 확대/축소에 강하고 seed 기반으로 재현 가능한 미세구조를 만든다.

## 4. 매체별 접촉 모델

- Dry media: 압력과 tooth로 접촉률을 계산하고 fiber 방향으로 grain mark를 늘리거나 회전한다.
- Wet media: local absorbency로 유효 흡수성을 계산하고 anisotropy로 모세관 확산 축을 바꾼다.
- Marker/ink: 섬유 방향, tooth, 흡수성으로 bleed, aspect, edge darkening을 조절한다.
- Oil/relief: tooth가 drag와 relief gain을 바꾸고 fiber ridge가 임파스토 방향을 일부 유도한다.
## 5. 외부 엔진과 연구 활용 전략

현재의 하이브리드 그래프를 유지하고, 각 엔진의 강점을 provider 단위로 사용한다.

| 소스 | 활용 영역 | 제품 통합 원칙 |
| --- | --- | --- |
| libmypaint | dab dynamics, natural media behavior | ISC 범위에서 native/provider 활용 |
| Google Ink Stroke Modeler | low-latency smoothing, prediction, mass/friction input model | Apache-2.0 범위에서 input/motion 계층 활용 |
| p5.brush | vector-field brush, hatching 아이디어 | MIT 범위에서 패턴/토폴로지 참고 및 provider 활용 |
| Krita engines | bristle, color smudge, hatching 등 폭넓은 엔진 분화 | GPL 코어 복사 없이 adapter와 상호운용 경로로 분리 |
| WetBrush research | bristle + near/far hybrid fluid representation | 알고리즘 개념을 독립 구현한 bristle/oil 계층에 반영 |
| Curtis watercolor | shallow-water / pigment optics 사고방식 | wet/porous/pigment 모델 설계 참고 |
| Mixbox | artist-friendly pigment mixing | 비상업 라이선스 경계를 유지하고 상용 경로와 분리 |

엔진 전체를 Unity 같은 범용 게임 엔진으로 교체하지 않는다. 현재 병목은 scene/game loop가 아니라
stroke contact, material transport, pigment optics, deterministic replay이므로 WebGPU/CPU hybrid를 직접 최적화하는 편이 낫다.

## 6. V7 시그니처 브러시 팩

V7 기본 단계에서는 12개 표면에 대해 24개의 수작업 시그니처 레시피를 추가했고, V7.1에서는 고급 물리/토폴로지 24종을 추가해 V7 계열을 총 48개 시그니처 브러시로 확장했다.
각 레시피는 단순 이름/색상 변형이 아니라 carrier, tip, deposition, pigment, physics, finish를 다르게 조합한다.

대표 계열: 정밀 흑연, 잉크 글레이즈, 광물 과립 수채, 드라이 과슈, 콩테 해칭,
레터프레스 잉크, 화지 수묵, 갈필, 벨루어 목탄, 소프트 파스텔, 색연필,
세필 잉크, 젯소 스크레이프 오일, 캔버스 임파스토, 뉴스프린트 마커,
크라프트 흑연, 우드그레인 드라이브러시/스테인, 스톤 그릿 파스텔/스페클.

## 6.1 V7.1 고급 물리·토폴로지 확장

V7.1은 기존 저장 포맷을 바꾸지 않고 physics/pattern/finish 노드 조합으로 다음 기능을 추가한다.

- `physics-backrun-capillary`: 반건조 경계에서 모세관 역침투가 일어난 것처럼 문서 좌표·seed·resampled dab index에 고정된 cauliflower/backrun lobe를 생성한다.
- `physics-pigment-sedimentation`: tooth와 국소 흡수성에 따라 무거운 광물 안료가 valley에 가라앉는 grain contact를 분리한다.
- `physics-bristle-split-merge`: 강모를 cluster 단위로 묶고 마찰·점도·필압·이동 거리에 따라 splay/merge를 변화시키며 일부 cluster는 두 번째 branch contact를 생성한다.
- `finish-directional-relief`: 공통 material mark의 height와 진행 방향을 고정된 사광 방향에 투영해 Canvas/SVG 모두 동일한 ridge highlight/shadow를 갖게 한다.
- `pattern-vector-flow / vortex / contour`: document-space vector field에서 짧은 capsule segment의 방향을 직접 얻는다.
- `pattern-textile-satin / twill`: warp/weft 교차 순서와 height를 가진 직조 contact를 생성하고 directional relief와 결합한다.

이 기능들은 V1 저장 receipt를 재생할 때 활성화되지 않는다. 새 노드를 명시적으로 선택한 live/V2 program만 enhanced adapter 경로를 사용한다. 따라서 이미 저장된 작품의 픽셀 결과는 변경하지 않는다.

V7.1 시그니처 24종은 backrun 3, sediment/hybrid 4, bristle split/merge 6, directional impasto 4, vector-field 4, textile 3으로 구성된다.

## 7. 브러시 양산 규칙

향후 프리셋 수를 늘릴 때는 `surface × medium × tip × topology × dynamics`의 조합 공간을 사용하되,
모든 조합을 기계적으로 노출하지 않는다. 후보 생성 후 다음 게이트를 통과한 프리셋만 제품에 포함한다.

1. 동일 카테고리 기존 프리셋과 spatial signature가 충분히 다를 것
2. 압력 0.2/0.5/0.9, tilt 0/0.5/1에서 최소 두 개 이상의 시각 특성이 달라질 것
3. 90° 방향 전환에서 fiber/anisotropy 반응이 의도대로 보일 것
4. seed를 바꾸어도 브러시 정체성은 유지되고 반복 타일 느낌만 달라질 것
5. 250px 기준 QA stroke에서 mark budget을 초과하지 않을 것
6. 작은 브러시가 과도한 dab 밀도로 굵은 솔리드 선처럼 뭉개지지 않을 것
7. thumbnail에서 구분되고 실제 캔버스 100% 확대에서도 미세구조가 남을 것

추천 생산 단위는 표면당 `signature 2 + utility 2 + experimental 1`이다.
12개 V7 표면만으로도 60개 고유 프리셋을 만들 수 있고, 신규 표면은 같은 규칙으로 확장한다.
프리셋 파생형은 단순 opacity/size 변형이 아니라 접촉 모델 또는 topology가 최소 하나 달라야 한다.

## 8. 성능 예산

- 표면 샘플러: shipping guard <= 1.50x CPU cost, stretch target <= 1.25x; 절대 처리량 >= 750 samples/ms
- 250px QA stroke: 일반 브러시 8,000 marks 이하 권장, micrograin pencil은 12,000 이하, 특수 입자 브러시는 별도 budget
- 입력 처리: 실제 사용자 input event당 생성 mark 수를 제한하고 teleport/sparse segment는 LOD 적용
- WebGPU provider는 geometry/particle 대량 처리, CPU는 deterministic contact와 fallback-independent reference에 집중
- surface field는 document anchored procedural sampling으로 텍스처 업로드/메모리 압력을 최소화
- quality mode는 preview/live/export를 분리해 export에서만 고비용 sample density를 허용

최종 QA에서 V7 표면 샘플러는 약 948 samples/ms, legacy 대비 1.417x였다. shipping guard 1.50x 안에는 들지만
stretch target 1.25x에는 미달하므로 tile/contact cache와 field fusion을 후속 최적화 항목으로 유지한다.
초기 24개 V7 QA stroke는 총 52,502 marks였다. V7.1 24종을 더한 최신 48개 visual matrix는 총 89,040 marks이며, 신규 24종이 약 36,538 marks를 추가한다. CPU timing은 같은 머신의 동시 빌드 부하에 따라 크게 흔들리므로 raw metrics JSON을 보존하고 mark budget과 전체 품질 게이트를 우선적인 회귀 기준으로 사용한다.
## 9. 품질 게이트와 시각 검증

최종 제품 품질 게이트는 기존/신규를 합친 114개 레시피를 실제 Chromium pen input으로 재생했고 0 failures였다.
V7.1 전용 테스트는 신규 24종 모두에 대해 normal coalesced streaming에서 `clippedDabs === 0`, per-push marks < 512를 검증하며 backrun/split 대표 브러시의 sparse/dense resampling 결정성도 고정한다.

`brush-studio-v7-surface-library.test.ts`가 다음 계약을 고정한다.

- V7 표면 12종과 V7/V7.1 시그니처 레시피 48종이 모두 등록됨
- 기존 V6 surface의 scalar tooth field가 이전 수식과 소수점 14자리 수준으로 일치
- 모든 V7 채널이 deterministic / finite / bounded
- 12개 표면의 공간 시그니처가 서로 다름
- dry와 wet material solver가 표면 차이를 실제 mark geometry로 반영

`generate-studio-brush-v7-evidence.mts`는 실제 contact solver 출력을 사용해 QA matrix를 만든다.
따라서 화면용 가짜 texture mock이 아니라 실제 runtime mark를 SVG로 직렬화한 결과를 검토한다.
생성물은 `qa-results/studio-brush-v7/` 아래 HTML, PNG, metrics JSON으로 남는다.

시각 QA는 surface swatch뿐 아니라 pressure/tilt/twist가 동시에 변하는 동일 경로를 모든 레시피에 적용한다.
이 방식으로 서로 다른 브러시가 같은 입력에서 얼마나 다른 결과를 내는지 직접 비교한다.

`generate-studio-brush-v7-blind-ab.mts`는 후보/기준 브러시의 이름을 숨기고 A/B 좌우 순서를 seed 기반으로 뒤섞는다. 동일한 색·크기·불투명도에서 실제 contact solver 결과를 렌더하고 별도 `blind-ab-key.json`에만 정답을 저장한다. 현재 backrun, sediment, split bristle, impasto lighting, vector field, satin/twill의 12쌍을 기본 blind matrix로 사용한다.

## 10. 다음 고도화 우선순위

V7.1에서 backrun, sedimentation, split/merge, directional relief, vector/textile topology의 제품 경로를 연결했으므로 다음 단계는 양적 확장보다 물리 해상도와 GPU 상태장을 강화한다.

1. 현재 deterministic contact-level backrun을 active-region wetness/velocity field와 결합해 시간에 따른 wet-on-wet 충돌을 구현
2. pigment별 입자 크기·비중·staining coefficient를 분리해 cobalt/ultramarine/earth 계열의 침전 차이를 색상 모델과 연결
3. bristle cluster의 reservoir를 공유/분리하여 split 이후 각 묶음의 독립적인 paint depletion과 재병합을 구현
4. directional relief를 WebGPU normal field와 self-shadow/specular lobe로 승격해 고해상도 임파스토 조명을 구현
5. vector-field를 curl/noise/artist-authored field texture까지 확장하고 textile에 knit, herringbone, basket, lace topology 추가
6. 자동 후보 생성 + perceptual duplicate rejection + blind A/B human QA를 묶어 60~120개 단위로 팩 생산
7. 실제 Apple Pencil/Windows Ink 장치에서 latency, pressure curve, tilt response를 회귀 측정

## 11. 경쟁 기준

Clip Studio의 강점은 세밀한 brush tip/stroke/texture/dual-brush와 입력 dynamics이며,
Krita의 강점은 bristle, color-smudge, hatching, MyPaint 등 독립 엔진의 폭이다.
V7은 이 기능을 단순 체크리스트로 복제하기보다 표면 미세구조가 여러 물리 매체에 공통으로 작용하는 축을 강화한다.
경쟁 우위 평가는 프리셋 개수만이 아니라 재질 구별성, 입력 반응, 반복 패턴 억제, 성능, 재현성의 다섯 지표로 계속 검증한다.
## 12. 참고 소스

- Clip Studio Paint User Guide — Brush customization / Texture / Dual brush
  - https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm
- Krita Manual — Brush Engines / Texture / Color Smudge / Bristle
  - https://docs.krita.org/en/reference_manual/brushes/brush_engines.html
- libmypaint — https://github.com/mypaint/libmypaint
- Google Ink Stroke Modeler — https://github.com/google/ink-stroke-modeler
- p5.brush — https://github.com/acamposuribe/p5.brush
- WetBrush: GPU-based 3D Painting Simulation at the Bristle Level, SIGGRAPH Asia 2015
- Xu et al., Advanced Design for a Realistic Virtual Brush, Computer Graphics Forum 2003 — hierarchical bristle/bundle modeling
- Curtis et al., Computer-Generated Watercolor, SIGGRAPH 1997, DOI 10.1145/258734.258896

이 문서는 현재 구현 기준의 living design이다. 신규 surface/provider/physics를 추가할 때
회귀 테스트, visual evidence, license profile을 같은 변경 세트에서 함께 갱신한다.