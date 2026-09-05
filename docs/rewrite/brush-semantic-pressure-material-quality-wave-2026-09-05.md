# 브러시 네이밍·필압·재질 품질 고도화 — 2026-09-05

## 1. 목적

브러시 품질을 프리셋 이름이나 한 장의 미리보기로 판정하지 않는다. 사용자가 실제로 받는 결과를 다음 네 계약으로 분리해 검증한다.

1. **정체성 계약** — 이름·설명·UI가 실제 실행 엔진, 촉, 질감, 입력 동역학, paint/erase 동작과 일치해야 한다.
2. **필압 계약** — 낮은 압력과 높은 압력만 달라지는 것으로 끝내지 않고, 스타일러스 전 구간에서 연속적이고 충분히 세분된 반응을 가져야 한다.
3. **재질 계약** — 서로 다른 이름의 대표 브러시는 간격·산포·누적·팁·그레인·듀얼팁 응답에서 실제 차이가 있어야 한다.
4. **호환성 계약** — 감사 계층을 추가하더라도 기존 저장 문서의 브러시 id, 렌더러 선택, 스트로크 픽셀과 재생 결과는 바뀌지 않아야 한다.

이 문서는 타사의 에셋이나 비공개 수치를 복제하기 위한 문서가 아니다. 공식 문서에 공개된 **조절 축과 사용자 기대**를 비교 기준으로 삼고 ToonStudio의 자체 결정적 플래너와 품질 영수증으로 대응한다.

## 2. 경쟁 제품 비교 기준

| 제품 | 공식 기능에서 확인한 기준 | ToonStudio 대응 |
| --- | --- | --- |
| Procreate | 브러시 설정별 압력 곡선, 기울기와 Apple Pencil Pro barrel roll 연결, 실시간 Drawing Pad, 속도 의존 안정화, 압력에 따른 size/opacity/flow/bleed | 10단계 실제 플래너 필압 곡선, tilt/angle 런타임 동역학 표기, 시나리오·픽셀 벤치 유지 |
| Clip Studio Paint | 브러시 팁·다중 팁, plot별 텍스처, dual brush, watercolor edge, stabilization/taper correction, 각 설정에 pressure/tilt/velocity/random 연결과 필압 그래프 | 실제 tip/texture/dynamics 계약 표기, 20축 재질 응답, 웻/방향성/입자/망점 주장 감사 |
| Photoshop | Texture Each Tip, pressure/tilt 기반 texture depth, dual-tip spacing/scatter/count, Mixer Brush 계열 wet response, smoothing·spacing·복잡도에 따른 응답성 비용 | tip/grain/material alpha와 dual-tip을 재질 지문에 포함, 성능을 품질과 분리해 기존 long-stroke/latency 게이트로 관리 |
| Krita | pressure, pressure-in, X/Y tilt, tilt direction/elevation, speed, drawing angle, rotation, distance, time, fuzzy, tangential pressure 등 폭넓은 센서 | 현재 지원하는 pressure/tilt/speed/angle/seed 축을 정확히 표시하고, 지원하지 않는 센서를 이름으로 과장하지 않음 |
| ibisPaint | GPU 가속 대규모 브러시, 선 보정, 14.0의 브러시별 필압 그래프·브러시 잠금·커서, 14.1 예정 기능으로 predictive drawing·새 보정·잉크 번짐 표현 발표 | 런타임 영수증 기반 UI, 전 구간 필압 감사, 기존 샘플 주기 정규화·속도 적응 보정 유지, wet claim을 실제 wet-edge 근거와 대조 |

### 공식 근거

- Procreate Handbook — Brush Studio / Brush Studio Settings 5.3: <https://help.procreate.com/procreate/handbook/5.3/brushes/brush-studio>, <https://help.procreate.com/procreate/handbook/5.2/brushes/brush-studio-settings>
- Clip Studio Paint User Guide — Customizing brush tools / Brush tip / Texture / Pen pressure: <https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm>, <https://help.clip-studio.com/en-us/manual_en/810_subtools/B.htm>, <https://help.clip-studio.com/en-us/manual_en/810_subtools/T.htm>, <https://help.clip-studio.com/en-us/manual_en/240_brushes/Adjusting_pen_pressure.htm>
- Adobe Photoshop Help — Textured and dual brushes / painting performance: <https://helpx.adobe.com/photoshop/using/creating-textured-brushes.html>, <https://helpx.adobe.com/photoshop/kb/optimize-painting-and-cloning.html>
- Krita Manual 5.3 — Tablet sensors: <https://docs.krita.org/en/reference_manual/brushes/brush_settings/tablet_sensors.html>
- ibisPaint official product and notices: <https://ibispaint.com/greeting/>, <https://ibispaint.com/information.jsp?lang=ja>

## 3. 발견한 실결함

### 3.1 실제 촉과 UI 표기가 달랐다

`brush`의 런타임 계약은 다음과 같다.

- engine: `angled-ribbon`
- tip: `angled-ribbon`
- texture: `none`
- dynamics: `ribbon-pressure`

기존 활성 브러시 요약은 카탈로그 `previewStyle`만 보고 위 브러시를 `원형 촉`으로 표시했다. 프리뷰 스타일은 UI용 축약 표현이지 렌더러 권위가 아니므로 의미가 어긋났다.

이번 변경부터 활성 요약은 `studio-brush-runtime-contract.ts`를 권위로 사용한다. 프로 브러시는 카탈로그 id와 generic runtime carrier를 분리해 `heart-stamp → ink-particle`처럼 실제 실행 경로도 숨기지 않는다.

### 3.2 기존 중복 기준은 재질 응답 전체를 보지 않았다

기존 listed uniqueness key는 저장·검색 호환성을 위해 runtime, tip motif/alpha, layer shape, 각도 버킷을 사용한다. 이 계약은 유지해야 하지만 간격, 산포, 유량, 누적, 그레인 분산이 빠져 있어 이름만 다른 비슷한 손맛을 품질 대표군에 다시 넣을 수 있다.

따라서 기존 키를 바꾸지 않고 `studio-brush-material-distinctness.ts`에 별도 **실제 재질 거리**를 추가했다.

### 3.3 low/high 필압 차이만으로는 스위치형 곡선을 놓친다

기존 전수 테스트는 낮은 압력과 높은 압력의 플래너 출력이 다른지 증명한다. 이는 필압이 완전히 죽은 브러시를 잘 잡지만, 90% 구간 동안 반응하지 않다가 마지막에 갑자기 바뀌는 프리셋도 통과할 수 있다.

이번 변경은 0.02~0.98 구간을 10단계로 샘플링해 distinct state 수와 한 구간의 response path 점유율을 함께 측정한다.

## 4. 구현 계약

### 4.1 런타임 의미 영수증

`studio-brush-semantic-quality.ts`

- catalogue id와 runtime carrier를 함께 보존한다.
- 실제 `operation / engine / engineVariant / canonicalId / tip / texture / dynamics`를 반환한다.
- UI 한국어 라벨을 한 곳에서 관리한다.
- 이름·shortName·hint·alias·품질 포트폴리오 label을 NFKC 정규화해 한·영 의미를 감사한다.

하드 오류:

- runtime contract 누락
- catalogue operation과 runtime operation 불일치
- 지우개 이름인데 paint 또는 erase인데 지우개 의미가 없는 경우

경고:

- 수채/수묵/번짐 이름인데 wet-edge 또는 충분한 wetness 근거 없음
- 연필/목탄/파스텔/그레인 이름인데 grain 근거 없음
- 강모/필버트 이름인데 bristle 근거 없음
- 평붓/치즐/리본 이름인데 방향성 tip/tilt 근거 없음
- 입자/스프레이/글리터 이름인데 particle/scatter 근거 없음
- 네온/글로우 이름인데 halo/soft optical 근거 없음
- 망점/해칭/격자 이름인데 global pattern 근거 없음
- 필압 반응 또는 필압 무시 설명과 실제 플래너 반응이 반대인 경우

재질 언어는 alpha map 자체가 근거가 될 수 있어 자동 rename하지 않고 warning receipt로 남긴다. 동작 모순만 merge를 막는다.

### 4.2 20축 결정적 재질 거리

`studio-brush-material-distinctness.ts`

- geometry: spacing 평균/분산, size 평균/분산, scatter
- deposition: opacity ceiling, dab opacity, flow, 4/16 overlap alpha, 과도한 진해짐 억제량
- texture: tip alpha 평균/분산, grain 평균/분산, 최종 material alpha 평균/분산, 점유율
- dual tip: blend mode, size ratio

기본 폭을 정규화해 단순 크기 슬라이더 차이는 같은 재질로 보고, 기본 opacity와 누적은 손맛 일부로 유지한다. 기존 id나 identity string은 거리 벡터에 넣지 않는다.

기본 48개 품질 대표군에서 behavior fingerprint가 완전히 같으면 CI가 실패한다. 근접하지만 동일하지 않은 쌍은 거리순으로 영수증에 남겨 사람이 흡수/분리 여부를 판단한다.

### 4.3 10단계 필압 곡선

`studio-brush-pressure-curve-quality.ts`

동일한 경로·속도·seed에서 압력만 바꿔 실제 dynamic dab planner를 실행한다.

측정값:

- dab count
- 평균 size / authored width
- opacity, flow, opacity×flow
- spacing / width
- scatter / width와 실제 source offset / width
- roundness
- angle의 sin/cos

판정값:

- `responsive` — 전체 response path가 0보다 큰가
- `distinctStateCount` — 연속 입력이 몇 개의 실제 상태를 만드는가
- `coarseResponse` — responsive인데 4개 미만 상태인가
- `maxStepShare` — 한 압력 구간이 전체 반응 이동량의 몇 %를 차지하는가
- `abruptResponse` — 한 구간 점유율이 90%를 넘는가
- `continuityScore` — 균등한 연속 반응에 가까운가
- `reversalRatio` — low→high 직선보다 얼마나 되돌아 움직이는가

`milli-pen-uniform`, `web-pressure-flat`, `screentone--sparse-grid`, `pencil--side-shade`는 이름과 설계가 명시한 고정 필압 control이다. 이들은 반응하면 실패하고, 나머지 dynamic preset은 고정·coarse·abrupt이면 실패한다. reversal은 역방향 spacing/scatter가 의도일 수 있어 review warning으로만 남긴다.

## 5. UI 변화

`StudioActiveBrushSummary`는 다음을 실제 런타임 계약에서 표시한다.

- 매체 + 실제 촉
- 실제 질감 + 실제 입력 동역학
- title의 설명과 엔진 영수증
- `data-studio-brush-runtime-id`
- `data-studio-brush-runtime-engine`
- `data-studio-brush-runtime-tip`
- `data-studio-brush-runtime-texture`
- `data-studio-brush-runtime-dynamics`
- `data-studio-brush-semantic-source`

프로 메타데이터가 아직 lazy loading 중일 때는 기존처럼 `정보 불러오는 중`을 보여준다. generic carrier를 추측하지 않는다. 로딩이 끝난 뒤에만 runtime contract를 표시한다.

## 6. 안정성·성능 경계

현행 엔진에는 이미 다음 계약이 있다.

- 이벤트 샘플 주기 정규화
- 속도 적응 안정화
- precision trailing
- pointerup endpoint correction
- 장획 입력 기하 기준 point/path completeness
- sampler 재시도 전 rAF와 PerformanceObserver 정리
- 전수 long-stroke, scenario, pixel, latency, dry-media cache 검증

이번 변경은 이 렌더 경로를 교체하지 않는다. 특히 보정을 단순 EMA로 통일하거나 저사양 모드에서 질감을 임의로 삭제하지 않는다. Photoshop 공식 가이드가 보여주듯 smoothing, 낮은 spacing, 복잡한 tip은 실제 비용 축이므로, 품질을 훼손하는 자동 다운그레이드보다 측정 receipt와 명시적 예산을 우선한다.

## 7. CI 영수증

신규 workflow `.github/workflows/studio-brush-semantic-quality.yml`은 다음을 실행한다.

1. semantic/material/pressure/UI/lazy-boundary 단위 테스트
2. 전체 listed catalogue 네이밍·재질 감사
3. 전체 dynamic catalogue 10단계 필압 감사
4. 변경면 ESLint
5. 전체 TypeScript typecheck
6. production build
7. JSON/Markdown 영수증 14일 업로드

생성 파일:

- `brush-semantic-quality-audit.json`
- `brush-semantic-quality-audit.md`
- `brush-pressure-curve-audit.json`
- `brush-pressure-curve-audit.md`

## 8. 호환성 및 주장 한계

- 카탈로그 id를 바꾸지 않는다.
- 저장 payload를 바꾸지 않는다.
- 기존 렌더러·version pin·과거 문서 재생을 바꾸지 않는다.
- 타사 기본 브러시와의 픽셀 동일성을 주장하지 않는다. 공개된 기능 축과 사용자 기대를 기준으로 자체 결과를 계측한다.
- 브라우저 자동화와 결정적 플래너는 회귀를 강하게 잡지만, Apple Pencil/Wacom의 실제 마찰감·hover·barrel roll·OS 드라이버 지연까지 대신하지는 못한다. 따라서 실물 장치 QA 없이 “타사와 필기감 완전 동급”이라고 표기해서는 안 된다.
