# 브러시 고도화 로드맵 — 문헌·레퍼런스 구현 기반 (2026-08-22)

사용자 지시: 사실적인 질감(손맛)을 유지하면서 상용 프로그램 대비 우위가 될 때까지 브러시 품질과
성능을 계속 고도화할 것. 브러시 관련 논문과 다른 소스코드를 참고할 것.

판제약(제약): ADR-0010 — 품질·필압 충실도는 성능보다 우위이며 성능은 veto로만 쓴다. 저장된
문서는 반드시 원래대로 재생된다(USED_PRESET_DATA_PRESERVED). 그러므로 모든 구조 변경은
버전 핀(dynamics pin / carrier version field)으로 새 스트로크에만 적용하고, 기존 스트로크는
기존 경로로 재생한다. 이 문서의 모든 항목은 그 계약을 전제로 한다.

측정 북스타: `studio-long-stroke-per-move-cost.test.ts` (2026-08-21 의도적 RED 게이트).
성장비(GROWTH)와 절대 천장(PER_MOVE_CEILING_MS)을 함께 요구한다.

## 0. 이미 몸체에 들어와 있는 레퍼런스

| 레퍼런스 | 반영 위치 |
| --- | --- |
| david.li Fluid Paint (웹 데모/강의 노트) | `studio-oil-wet-into-wet.ts` + `studio-wet-mix.ts` — 픽셀 습식 혼합(spectral WGM, libmypaint paintMode 0.88) |
| libmypaint / MyPaint 스탬프 엔진 | stamp-dabs 레인 전반(간격·속도 동역학), CC0 샘플러 |
| Perfect Freehand (Steve Ruiz, MIT) | `studio-perfect-freehand` — perfect-outline/G펜 아웃라인 |
| Curtis et al. 1997, Computer-Generated Watercolor (SIGGRAPH) | wet-ink 수채 레인의 습윤 확산 참조 모델 |
| Chu & Tai 2004, Moxi: Real-Time Ink Dispersion in Absorbent Paper (CGF) | ink-wash(수묵) 섬유 페더링·입상 레인의 논리적 다음 단계 |

## 1. calligraphy — 진행률 표본화의 구조적 한계 (게이트 x8.8 · 35.9ms)

`buildCalligraphySegments`(studio-brush.ts:1262)는 세그먼트 i의 필압을
`progress = (i - 0.5) / (pointCount - 1)`로 전체 스트로크 길이에 정규화해 샘플링한다. 포인트가
하나 늘면 pointCount가 변해 **모든** 세그먼트의 폭·팁각이 다시 결정된다 — 접증분 캐싱이 원리적으로
불가능하고, 그려지는 동안 앞부분 선의 굵기도 미세하게 흔들린다(live→commit 수렴은 하되 중간
프레임이 최종과 다름).

**근원 공유 확인(2026-08-22 오후)**: 같은 진행률 정규화가 연필(`studio-retained-media-pressure.ts:212`,
`position = progress × (pressures.length - 1)`)과 형광펜 계열의 필압 경로(`planStudioFxBrushPressurePath`)
에도 있다. 즉 게이트의 pencil-path x7.6 · family:highlighter x7.8 · family:calligraphy x8.8 은
**하나의 근원 문제(진행률 정규화 필압 표본화)의 세 가지 증상**이다. v2 인과 샘플링 핀 하나의
설정를 세 레인이 공유하면 세 게이트를 함께 녹일 수 있다.

- **고도화(v2 핀)**: `pressureSampling: "per-segment-v1"` dynamics 핀(명칭 예시) — 필압·스타일러스를
  세그먼트 인덱스에서 직접 샘플링(인과). 접증분 계획 O(suffix), 중간 프레임=최종 프레임.
  참고: MyPaint/libmypaint의 per-dab pressure 연결 방식이 동일 원리. 완료 기준: 세 게이트 green.
- **재생**: 무핀 스트로크는 현행 진행률 경로 그대로.

## 1a. 레거시 다이내믹 스냅샷 — 상류 가드 확인

`appendCanonicalFrom` 앞 호출자가 이미 `total === consumedSourcePoints`를 noop으로 처리한다
(studio-live-dynamic-brush-overlay.ts:1196-1203). 따라서 산란 브러시(glitter/swarm 등 web kit)
의 zero-dab 프레임은 재계획을 유발하지 않는다 — 남는 비용은 새 샘플당 exactPlan 1회로 순수하다.

## 2. highlighter (x7.8 · 11.0ms) — §1의 근원 공유

`resolveStudioFreehandRenderPath → planStudioFxBrushPressurePath → planStudioHighlighterWashRibbon`
전부 전체 경로 재계획이지만, 필압 매핑이 진행률 정규화라는 점은 §1과 동일 근원이다(§1 참조).
와시 폴리곤 자체는 세그먼트 인과이므로 공용 v2 인과 샘플링 핀이 이 레인도 함께 해결한다.

## 3. oil-ribbon — 최악 위반자 (x18.5 · 34.1ms)

`planStudioOilRibbonCarrier`는 (a) 전역 `averageOpacity`(모든 스테이션 평균)를 bodyOpacity로
쓰고 (b) body를 전체 스테이션 걸침(weld)으로 만든다 → 접증분 조립 불가. 라이브 오버레이는 매
프레임 clear+전체 재칠이 강제된다. dab bed(FxOilDabPlanner)는 증분이지만 FX_OIL_DAB_CAP 도달 시
sampleStations 전체 refit이 설계상 정확한 동작이라 "가장 느린 단계"가 병목이다.

**2026-08-22 캐리어 해부(구현 착수 전 정밀 판정)**:
- 기하는 이미 유한 창이다 — `smoothGeometry` 가중 이동평균 r=3/4/6, `tangentAt` ±2,
  `variableWidthBody` 정점은 스테이션 인과(first/last cap만 끝점 의존). 즉 **기하 프리픽스는
  안정**(안정 접두길이 = N − 8).
- 접증분 칠을 막는 것은 기하가 아니라 **알파 집계 3건**(planBristleLanes :794-982 해부):
  1. bodyOpacity = quantize(전역 평균)(:1671, :1702).
  2. 로드 밴드 경계가 **전역 min/max 스팬**(:880-881, :887-888)에서 나온다 — append 한 번으로
     모든 run의 밴드 소속이 뒤집힐 수 있다.
  3. 밴드 타깃 = 밴드 run 평균의 accumulatedOpacity(:912-918), 셸 델타는 그 위의 누적 접증
     (:941-953) — 새 run이 밴드에 합류하면 기존 픽셀의 알파가 변한다.
- 커밋 Konva 경로에는 스냅샷 증분 wet-mix(`paintStudioOilRibbonCarrierIncremental`)가 이미
  있으나 플랜은 여전히 전체 재계획 — 게이트가 재는 체인(FxOilDabPlanner.plan →
  planStudioOilRibbonCarrier)은 페인트가 아니라 이 재계획이 지배한다.

- **고도화(v2 캐리어 설계, 버전 핀 옵트인)**:
  1. 고정 앵커 밴딩 — 전역 min/max 스팬 대신 고정 [0,1] 정규화로 run의 밴드 소속을 국소
     결정(대비 스트레칭 포기 → 톤 변화 있음 → 품질 게이트 필수).
  2. run 단위 알라 베이킹 — 밴드 평균/셸 델타 대신 각 run이 생성 시점의 양자화 알파를 소유
     (텔레스코핑 접증체계 유지 방안: 셸은 좌표 공유만 하고 알파는 run 고정).
  3. bodyOpacity — 인과 창 평균 또는 body 국소 세그먼트 분할.
  4. cap 포화 레짐 — sampleStations 재배열(reflow) 대신 append-only 스테이션 배치(전진 적응
     간격). 참고: Baxter et al., IMPaSTo (NPAR 2004) 부하 모델이 depletion 확장 방향.
  5. 라이브 오버레이 — suffix 폴리곤 조립 + append-only 칠(clear 제거), 안정 접두(N−8) 재사용.
  완료 기준: gate oil-ribbon green + v1 재생 바이트 동일(pixel 테스트 스냅샷 유지) +
  verify:studio-brush-media/planner-quality 통과(ADR-0010 품질 veto).
  규모 판정: 1·2·3이 톤 분포를 바꾸는 의도적 품질 변경이라 단일 세션 구현 불가 — 다음
  세션에서 1번(고정 앵커 밴딩)부터 프로토타이핑하고 brush-media/planner-quality로 검증.

## 4. perfect-outline / capsule-outline (x7.2 · x8.6)

측정 체인은 `sourceMetrics(O(N)) → buildStudioPerfectFreehandOutline → pathData 문자열(O(N)) →
freezeOutline` 전부다. perfect-freehand 아웃라인 자체는 유한 스무딩 창(±1 이웃)이라 기하 프리픽스는
안정이지만, **게이트가 재는 함수가 O(N) pathData 문자열 생성을 포함**하므로 기하만 접증분화해도
게이트 비율은 그대로다. Konva sceneFunc 폴백도 매 프레임 전체 문자열을 다시 그린다.

- **현실적 고도화(2단)**: (1단) `planStudioPerfectFreehandRender`에 캐시 인지 API를 얹어
  metrics/기하를 안정 프리픽스 캐시로 — StudioDrawNode 실측 개선, 게이트는 pathData가 지배.
  (2단) sceneFunc가 캐시된 Path2D를 재사용하고 suffix 윤곽만 추가하는 경로(문자열 재생성 제거).
  출력 동일이므로 버저닝 불필요. SVG export는 전체 재생 유지(커밋 1회 비용).

## 5. WebGPU 타일 서명 (비피드 스트로크)

`signatureStudioGpuStroke`/`fingerprintStudioGpuStroke`(studio-webgpu-tile-plan.ts)가 매
플래닝 패스마다 O(N) 문자열 생성 + 타일별 startsWith O(T·N). 다항 롤링 해시(포인트 스트림
append-only digest)로 교체하면 append가 O(1), 타일 diff 비교가 O(T). 피드 토큰 경로는 이미
O(1)이므로 비피드 에포크만 동등물로 승격. 게이트 causal-ink 잔여 성장분 해소.

## 6. 포인터 경로 폴백

직접 면 미소유 시 immutable append(12배열 복사)/예측 전체 클론. 배치 변이 경로(:3887)를 지원
레인 전반으로 확장해 폴백이 실질적으로 발동하지 않게 한다. 게이트 대상 아님(오버헤드 상수).

## 7. 이미 착지한 것 (2026-08-22)

- 오일 라이브 오버레이: 결과가 폐기되던 wet-mix getImageData/putImageData 리드백 제거,
  반경 평균 O(N)→O(1) 비트동일 누적합, 이중 할당 제거 (`stroke-audit-2026-08-22.md` §3).
- dynamic-dabs 전체 프리픽스 리플레이(팔레트나이프 프로·paint-tube·bristle 쉘프): dab 미발생
  프레임의 exactPlan 생략 가드 — 느린 정밀 스트로크(이동 많음·dab 적음) 구간의 전체 재계획 제거.
- 브러시 통합 2차 웨이브(242→238 listed): 실행 서명 중복 4종 delist.
- §3 캐리어 해부 완료(같은 날 오후): 기하 창 유계 확인(r=6 평활·±2 탄젠트), 알파 집계 차단자
  3건 특정(전역 bodyOpacity·전역 스팬 밴딩·밴드 평균 타깃/셸 델타), 커밋 경로 증분 wet-mix
  선행 사례 확인.
- **§3-1·2 v2 고정 앵커 밴딩 착지**(`bristleBanding: "fixed-anchor-v2"` 옵트인): 밴드를 [0,
  0.62] 고정 앵커로 정규화(0.62 = 플래너 스테이션 opacity 상한), 레인 디포짓을 밴드 앵커의
  순함수로, 폭을 절대 자 버킷으로. `studio-oil-ribbon-carrier.fixed-anchor.test.ts`가 핵심
  계약을 고정 — **append가 기존 레인의 loadBand/lineWidth/opacity를 절대 변경하지 않음**
  (디포짓 순수성). 좌표는 weld 확장으로 합법적 변동(유니온 계열)이며 이는 칠 단계에서 해당
  레인만 재칠하면 된다. v1 기본 경로는 기존 pixel 테스트로 바이트동일 유지 확인. 톤 분포는
  관측 스팬 스트레치가 없어 v1과 다름 — 셸 포기로 밴드 간 자기교차 접힘이 생김 → **프로덕션
  배치 전 knot/품질 게이트 평가 필수(미연결 옵트인 상태)**.

## 9. 다음 세션 실행 큐 (청사진 — 바로 착수 가능)

> **§9.1 실행 기록(2026-08-23)**: `scripts/probe-studio-brush-sweep.mjs` 착지, 전체
> 238종 1차 스윕 완주(37.7분) — `live-vs-committed-sweep-2026-08-23.md`. 실측: pen
> p95 18.7ms·highlighter p95 68.3ms(longtask 539건, max 1133ms). **미해결**: calligraphy
> 근처에서 브라우저 탭 크래시("Target crashed")로 잔여 종목 전부 실패 — 크래시 원인
> 격리(메모리 누적 vs highlighter 레인)와 크래시 후 새 페이지로 이어가는 복원이 다음
> 수정. 지우개 선택은 `${name} 선택` 버튼 부재로 타임아웃(선택 패턴의 eraser 분기 필요).

1. **전수 스윕 프로브** `scripts/probe-studio-brush-sweep.mts` (.mjs dev-server 패턴 — stale-dist
   면역):
   - 페이지 내 `import("/src/domains/creator/brush/studio-brush-catalog.ts")`로 listed 238종 열거.
   - 브러시 선택: 카탈로그 대화 searchbox에 preset.name fill → `${name} 선택` 버튼 클릭
     (verify-studio-brushes.mts:963-967 패턴 복사).
   - 드로잉: route 헬퍼 좌표에 mouse.down → moves(600 샘플) 중간(다운 상태) canvas clip 스크린샷
     = LIVE, mouse.up 후 300ms 뒤 = COMMITTED. 두 dataURL을 페이지 내 캔버스에 올려
     getImageData diff(변경 픽셀 수·최대 채널差) — 노드 측 PNG 디코더 불필요.
   - 장획 성능: 같은 브러시로 3200 샘플 제스처. in-page rAF 프레임 간격 샘플러 + longtask
     PerformanceObserver로 배치별 프레임시간 p50/p95·longtask 수집, pageerror/console.error
     카운트 = 버그 감지, 최종 캔버스 투명도 = 무출력 버그 감지.
   - 결과: results JSON + 최악 20종 표를 docs/perf/live-vs-committed-sweep-<날짜>.md로.
2. **전역 버벅임 근본 개선 후보 우선순위** (품질 미변경): (a) Konva 폴백 sceneFunc 재계획 캐시
   1단(roadmap §4), (b) pointermove draft flushSync 배치(경계 테스트와 협의), (c) §5 WebGPU 롤링
   해시, (d) settled 재생 비용 캐시. 각각 착지 전 runtime-commit-gate로 회귀 방지.
3. **§3-3 bodyOpacity 인과화 + 라이브 suffix 조립**: v2 밴딩 위에 오일 라이브 append-only
   칠 완성 → gate oil-ribbon 도전.

## 8. 순서와 완료 기준

1. §3 오일 v2 캐리어 (최악 위반자, 사용자 직접 언급 계열) — gate: oil-ribbon green + 커밋 패리티
   픽셀 스냅샷 유지(v1 재생).
2. §1 공용 인과 필압 샘플링 v2 핀 (calligraphy+pencil+highlighter 동시) — gate: 세 레인 green.
3. §4 perfect-outline 2단 캐시 — 실측 개선 확인(게이트는 pathData 지대로 별도 판정).
4. §5 롤링 해시 — gate: causal-ink/wet-dabs/particle-fx 잔여 성장비 개선 확인.
각 단계 끝에 `pnpm run build && pnpm verify:studio-brushes`(전수) + 해당 `verify:studio-*`
품질 게이트를 통과해야 병합한다(ADR-0010: 품질 veto).
