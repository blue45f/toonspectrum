# 스트로크 전수 감사 — 브러시 통합 · 라이브/커밋 패리티 · 장스트로크 성능 (2026-08-22)

사용자 지시: (1) 질감·알고리즘이 비슷한 브러시를 통일해 종류를 줄일 것, (2) 그리는 중(라이브)과
커밋된 선의 모습이 달라지는 경우를 전수 확인할 것(유화 팔레트 나이프 특기), (3) 획이 길어질수록
느려지는 브러시를 전수 확인해 질감·품질 저하 없이 최적화할 것.

---

## 1. 브러시 통합 — 2026-08-22 제2차 로스터 축소 (242 → 238 listed)

2026-08-21 웨이브와 동일한 기계적 기준(`studioBrushRuntimeExecutionSignature` 공유 = 페인트
시점 실행 경로 동일, 남는 차이는 슬라이더로 재현 가능한 굵기·농도뿐)으로 4개를 격리 원장에
추가했다 (`studio-brush-quarantine.ts` A′·D′·H′ 클러스터). 격리는 노출 제거일 뿐이고 저장된
문서는 원래 브러시로 계속 재생된다(`USED_PRESET_DATA_PRESERVED`).

| id | 이름 | 공유 서명 | 남긴 대안 |
| --- | --- | --- | --- |
| `ballpoint` | 볼펜 | causal-ink:round | fineliner(2.2) · pen(6) 사이 중간값 |
| `felt-tip` | 펠트펜 | causal-ink:round | pen(6/1.0) · marker(16/0.6) 사이 중간값 |
| `ink-wash` | 수묵 번짐 | watercolor-dabs:diffuse | watercolor(28/0.55)와 같은 결. 수묵은 `ink-wash--sumi-core` 등 노출 레인 5종이 유지 |
| `acrylic` | 아크릴 물감 | oil-ribbon:bristle-lanes | oil(22/0.92)과 같은 결. 변주는 filbert/flat/impasto 등 유화 레인이 유지 |

연동 갱신: 스타터 키트(`STUDIO_BEGINNER_BRUSH_IDS`)에서 ballpoint·felt-tip 제거, 익스프레시브
키트에서 ink-wash 제거, 코어 셸프 라이프사이클 테이블 동기화, 매니페스트 테스트의 고정 목록
갱신, 장부 내 "대안" 상호 참조 정리. 서브툴 팔레트는 격리 필터가 자동 적용된다.

의도적으로 남긴 것: 네 가지 실제 펜촉 기하(calligraphy/fountain-pen/parallel-pen/brush-pen),
고유 알파맵 모티프 프로팩 68종, dry-media 5재료(crayon/chalk/charcoal/pastel/oil-pastel — 팁
형태·시드·spacing이 실제로 다름), web-* 25종(각자 고유 engineVariant 렌더 분기 보유), ◆ 실험
핀 레인. 근거 없는 추정 병합은 하지 않았다 — unpinned 프로브의 "중복" 판정은 하네스 아티팩트였던
선례 3회(p95 0.00000 철회 건 포함)가 있다.

## 2. 라이브 vs 커밋 외관 불일치 — 전수 감사 결과

두 경로는 의도적으로 같은 플래너/캐리어를 공유한다("live prefix, committed replay and SVG
export therefore consume the same immutable polygons" — professional-shelf 캐리어 헤더).
그럼에도 발견된 불일치 메커니즘:

### 2-1. 유화/아크릴: wet-into-wet이 커밋에만 적용됨 (확인된 실재 갭)
- 라이브(`studio-live-retained-media-overlay.ts` `paintOilSuffix`)는
  `paintStudioOilRibbonCarrier(..., skipDestinationReadback: true)`로 그린다 → wet-into-wet
  픽셀 패스 없음. 커밋(Konva `StudioDrawNode`)은 destination 리드백과 함께 wet-into-wet을
  적용한다(`studio-oil-ribbon-carrier.ts:1915-1994`). 따라서 기존 페인트 위를 겹쳐 그릴 때
  커밋 후 색 피업/혼합이 생기며 라이브와 달라진다.
- 부수 발견: 라이브의 자체 wet-mix(`wetMixPoints`)는 매 프레임 getImageData/putImageData를
  했지만 직후 `clearCanvas`가 그 결과를 전부 버렸다 — 순수 낭비였고 이번에 제거했다(§3-1).
  즉 라이브 외관은 변경되지 않았다.
- 완결 수정 경로(후속): 커밋 시점 단일 wet 패스를 문서 언더레이 합성 버퍼 위에서 수행해 라이브
  최종 프레임에도 동일 적용. 언더레이(다른 요소) 접근이 필요해 오버레이 단독으로는 불가 —
  별도 작업 필요.

### 2-2. 팔레트 나이프(`oil--knife-edge`, dynamic-dabs:palette-knife-blade)
- 라이브는 causal deposit 파이프라인(v2/v3)의 접증분 렌더, 커밋은 같은 상태에서 커버리지 마크
  생성 — 동일 플래너 계약이라 기하 패리티는 유지된다.
- 다만 프로팩 형제 `palette-knife-edge`(전문 쉘프)는 §2-4의 전체 프리픽스 리플레이 비용 문제와
  §2-3의 Konva 폴백 노출면에 걸린다.

### 2-3. Konva 유지 폴백: perfect-outline(G펜 계열)·레거시 수채·버전드 페인트 모델
직접 라이브 면이 스타일을 거절하면 Konva draft(`StudioDrawNode` sceneFunc)가 매 포인터 프레임
전체 스트로크를 재계획·재칠한다(`studio-live-retained-media-overlay.ts` 헤더: "90–140ms long
task"). 커밋 렌더와 같은 플래너라 최종 모양은 같지만, 프레임 도중에는 스무딩 창이 꼬리만 바뀌어도
전체가 다시 계산된다.

### 2-4. professional-shelf / competitor-specialty 리본 캐리어(팔레트 나이프 프로, paint-tube,
hard-airbrush, erodible-pencil, bristle 4종): 교차 셀프 오버랩(획이 스스로 겹칠 때 라이브만
진해지는 현상) 방지를 위해 매 프레임 accepted 프리픽스 전체를 정규 플래너로 재계획해 두 표면을
교체한다(`studio-live-dynamic-brush-overlay.ts:1626-1682`). 패리티는 설계대로지만 O(N)/프레임.

### 2-5. 레거시 다이내믹 스냅샷(`appendCanonicalFrom`)도 매 append마다 `exactPlan`(전체 재계획).

### 2-6. 연필/캘리그래피 이음매
suffix 칠이 `paintedSourceSegments - 1` 세그먼트까지 겹쳐 칠한다(시작 캡 연속성 보장). 커밋은
단일 패스라 이음매 셀이 살짝 진해질 수 있다. 육안 수준의 미세 차이 — 후속: seam 셀 alpha 정확화.

### 2-7. WebGPU 타일 플래닝(비피드 스트로크)
피드 토큰이 없는 스트로크는 매 플래닝 패스마다 전체 포인트 서명/지문 문자열 O(N) 생성 +
residual-spacing(V3) 재계획(`studio-webgpu-tile-plan.ts:186-382`), 타일별 O(T·N) startsWith
비교. 에포크 거절·디바이스 로스 시 커밋 스트로크 전체가 이 비용을 낸다.

## 3. 장스트로크 성능 — 이번에 적용한 최적화 (픽셀 불변)

### 3-1. 유화 라이브 오버레이(`studio-live-retained-media-overlay.ts`)
1. **버려지던 wet-mix 리드백 제거**: `applyStudioOilWetIntoWetStroke`는 순수 함수(모듈 상태
   없음)인데 그 출력이 직후 clearCanvas로 폐기됐다. 매 프레임 getImageData/putImageData
   스톨 제거. `paintOilSuffix`만 해당 — 커밋 경로의 wet-into-wet(§2-1)은 그대로다.
2. **반경 평균 O(N)→O(1)**: 매 프레임 전체 dab `reduce` 대신 left-to-right 누적합 확장.
   부동소수 덧셈 순서가 같아 결과가 비트 동일.
3. **이중 할당 제거**: `pairsFromElement`+`flatPairs`(오브젝트 배열→flat 재할당)를 단일
   `flatFinitePoints`로 통합(동일 유한 검증 시맨틱). dab→point 매핑도 길이+소스 키 캐시.
- 남는 O(N)/프레임: 캐리어 재계획+전체 재칠. 오일 캐리어 다각형이 스테이션 인과(current+previous
  station)임을 이용한 접증분 칠이 후속 후보(§2-4와 동일 패턴).

### 3-2. 테스트 계약 갱신
`studio-live-retained-media-overlay.test.ts`: "mixes only the growing oil suffix…" 테스트는
폐기되던 리드백의 getCalls 증가를 고정하고 있었다. 새 계약: **라이브 오일 경로의 destination
읽기 0회**(근해 주석에 폐기 사실 명시). 통과 확인.

## 4. 확인된 초선형(hotspot) 전수 목록 — 우선순위 (후속 작업)

> **2026-08-30 갱신**: 아래 표는 재감사되어
> [`stroke-prefix-stability-2026-08-30.md`](./stroke-prefix-stability-2026-08-30.md) §1 로 대체되었다.
> #3·#4·#7 은 해소, #2 는 계획 단계만 해소(칠 단계는 전역 밴딩에 막혀 있음), #1·#5·#6 은 유효.
> 목록 전체의 상류 원인이던 "나란한 필압 저널을 정규화 진행률로 되읽는 왕복"은 같은 문서 §2 에서
> 제거되었다.

| # | 위치 | 스케일 | 영향 캐리어 |
| --- | --- | --- | --- |
| 1 | Konva 유지 폴백 sceneFunc 전체 재계획·재칠 (`StudioDrawNode`) | O(N²) | perfect-outline(G펜), 레거시 수채, 버전드 페인트 |
| 2 | 오일 라이브 캐리어 전체 재계획+clear+전체 재칠 (`paintOilSuffix`) | O(N²) | oil/acrylic |
| 3 | 형광펜 전체 리플레이 (`paintHighlighterSuffix`) | O(N²) | highlighter 계열 |
| 4 | 연필/캘리 전체 곡선 재계획 (칠은 증분) | O(N²) CPU/GC | pencil/calligraphy |
| 5 | professional-shelf·competitor 리본 전체 프리픽스 리플레이 + 레거시 exactPlan | O(N²) | 팔레트나이프 프로, paint-tube, hard-airbrush, erodible-pencil, bristle 쉘프 |
| 6 | WebGPU 타일 서명/지문 O(N) 문자열 + V3 재계획 | O(T·N)/프레임 | 비피드 라이브 에포크, 커밋 스트로크 |
| 7 | 포인터 경로 immutable append(12배열 복사)·예측 전체 클론 | O(N²) | 직접 면 미소유 폴백 |

이미 증분인 것(회귀 금지): causal-ink Canvas2D, stamp-dabs 워커, causal-v2/v3 dynamic-dabs,
wet-ink 수채, 지우개, GPU pinned journal→feed→타일, FxOilDabPlanner 계획 자체.

## 5. 검증

- `tsc -p tsconfig.json`: 변경 파일 클린(유일한 오류는 기존 VRM 테스트 파일 것, cad86049).
- 관련 단위 테스트 전부 통과: creative-ux(10)·catalog lifecycle(11)·manifest(16)·catalog
  core/contract(91)·sub-tool palette·library panel/sheet/tray·loader(99)·retained overlay/
  integration(8)·brush+live 디렉터리 스윕(기존 실패 제외 전부 통과).
- 기존(HEAD에서도 적색) 실패, 이번 변경과 무관: `studio-long-stroke-per-move-cost.test.ts`
  13건, `studio-brush-browser-evidence.test.ts` 1건(production receipt가 카탈로그 변경으로
  이미 stale — verify:studio-brushes가 continuous-policy 4건으로 재생 불가한 상태, manifest
  테스트 주석 참조).
