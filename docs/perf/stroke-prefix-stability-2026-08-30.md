# 장스트로크 성능 전수 재감사 — 접두 안정성 결함과 오일 캐리어 증분화 (2026-08-30)

사용자 지시: "획이 길어질수록 엄청 끊긴다. **브러시 품질을 낮추지 말고** 성능 문제를 전수 확인해
수정할 것."

`stroke-audit-2026-08-22.md` §4 의 초선형 목록 7건을 현재 트리에서 하나씩 재측정하고, 그 과정에서
**목록 전체의 상류 원인**이었던 결함 하나를 찾아 고쳤다. 이 문서는 그 재감사 결과와 착지 내역이며,
2026-08-22 문서의 §4 표를 대체한다.

---

## 1. 재측정 — §4 목록 7건의 현재 상태

`studio-long-stroke-per-move-cost.test.ts` 게이트(21 레인)는 **전부 통과**한다. 즉 2026-08-22
문서가 적어 둔 "13건 적색"은 이미 해소된 상태였다. 남은 성장 레인은 세 개뿐이고 셋 다
`DOCUMENTED_GLOBAL_REPLAN_LANES` 에 사유와 함께 핀되어 있다.

| # (구 §4) | 위치 | 2026-08-30 실측 판정 |
| --- | --- | --- |
| 1 | Konva 유지 폴백 sceneFunc 재계획 (perfect-outline 계열) | **여전히 유효.** 게이트 x8.3 · 3.4ms(계획만). perfect-freehand 의 taper 가 전체 길이를 읽어 기하가 전역 함수 — 로드맵 §4 의 2단(Path2D 캐시)이 남은 경로 |
| 2 | 오일 라이브 캐리어 전체 재계획+clear+전체 재칠 | **부분 해소 — 이번 착지(§3).** 계획 단계는 증분화, 칠 단계는 여전히 전체(§4-1) |
| 3 | 형광펜 전체 리플레이 | **해소됨.** 게이트 `family:highlighter` x1.4 flat (wash-ribbon 증분 빌더) |
| 4 | 연필/캘리 전체 곡선 재계획 | **해소됨.** `pencil-path` x0.5 · `family:calligraphy` x1.0 flat |
| 5 | professional-shelf·competitor 리본 전체 프리픽스 리플레이 | **여전히 유효**(§4-2). dab 미발생 프레임 생략 가드만 착지 상태 |
| 6 | WebGPU 타일 서명 O(N) 문자열 | **여전히 유효하나 상시 경로 아님**(§4-3) |
| 7 | 포인터 경로 immutable append | **실질 해소됨.** 소유권 토큰 + 배치 변이 경로로 지원 레인은 O(1) 추가 |

## 2. 근본 원인 — 나란한 필압 저널을 진행률로 되읽던 왕복 (전수 4곳)

증분 플래너들은 하나같이 "직접 유도한 표본을 바이트 단위로 비교해 재사용 가능한 접두를 정한다"
는 방식으로 안전을 확보한다. 그런데 네 곳의 리더가 표본 `i` 의 필압을 **정규화 진행률**
`i / (n - 1)` 로 가져온 뒤 `pressures.length - 1` 을 다시 곱해 되돌리고 있었다.

점 배열과 필압 배열이 나란한 경우(라이브 획은 항상 이 형태다) 이 왕복은 정확히 `i` 로 돌아와야
하지만, 이진 부동소수에서는 돌아오지 않는다. n = 800 일 때 `(357 / 799) * 799` 는
`356.99999999999994` 라서 리더가 이웃 표본을 한 조각 섞어 넣는다.

값 오차는 ~1e-15 로 화면에서 보이지 않는다. **문제는 오차가 아니라 의존성이었다**: 이미 확정된
앞쪽 표본의 유도값이 획이 자랄 때마다(= `n` 이 커질 때마다) 미세하게 달라졌고, 그래서 모든 증분
플래너가 접두 검증을 수백 표본 지점에서 멈추고 나머지 전체를 이동마다 다시 세웠다. 게이트가 잡으려
하는 바로 그 O(n²) 형태가, 재계획을 의도한 플래너가 아니라 반올림 아티팩트를 통해 들어와 있었던
것이다. `FxOilDabPlanner` 의 헤더 주석은 이 현상을 이미 "`sanitizePoints` 가 `i / (pairCount - 1)`
로 필압을 재표본화하므로 앞선 표본도 흔들릴 수 있다"고 **정확히 기술해 두고 검증으로 우회**하고
있었다 — 이번에는 우회 대신 원인을 제거했다.

측정(1600 표본 오일 스윕, `FxOilDabPlanner` 재사용 대브 수):

| | 재사용 / 전체 |
| --- | --- |
| 이전 | 357 / 1458 (24%) |
| 이후 | 1456 / 1458 (99.9%) |

수정한 리더 4곳 — 나란한 저널이면 그 슬롯을 직접 읽고, 길이가 어긋난 저널(레거시 문서·재표본화·
대칭 미러 시리즈)은 정규화 경로를 그대로 쓴다:

- `studio-fx-brush.ts` `sanitizePoints` (오일·파스텔·글리터 등 fx 플래너 공통 입구)
- `studio-fx-brush.ts` `sanitizeFxPressurePathPoints` (배치)와 증분 fx 압력 경로 빌더 —
  두 경로가 같은 값을 내게 되어 **라이브/커밋 ulp 격차가 문서화 대상에서 사라졌다**
- `studio-brush.ts` `resampleStrokePressures`
- `studio-retained-media-pressure.ts` `resolveStudioRetainedMediaPressureAt`

계약 고정: `studio-aligned-pressure-journal.test.ts`. 네 리더 각각에 대해 "접두의 유도값은 그
접두만으로 얻든 그것으로 시작하는 더 긴 획에서 얻든 동일하다"를 정확 비교로 못 박고, 나란하지 않은
저널이 여전히 보간되는 것도 함께 고정한다. 수정을 되돌리면 4건이 적색이 된다(확인함).

## 3. 오일 리본 캐리어 증분화 — `StudioOilRibbonCarrierPlanner`

§2 로 스테이션 격자가 접두 안정해지면서 비로소 가능해진 작업이다.

캐리어의 단계별 실측(4096-대브 베드, 이동 1회):

```
normalize 0.11  collect 2.65  extras 0.29  body 1.72  lanes 24.73
                                                       └ plannedBuild 8.99 · banding 3.47 · gauges 14.84
```

**증분화한 것** — 각 단계가 유계 창만 읽는다는 사실에서 나온다:
`smoothGeometry` 가중치 ±6, `tangentAt` ±2, 런은 자기가 지나는 스테이션과 index 0 캡만 읽는다.
따라서 바이트 동일 대브 접두 `identical` 에 대해 기하는 `identical − 6`, 스테이션은
`identical − 8` 까지 확정이다(2026-08-22 해부의 N−8 과 동일). 런은 **클램프되지 않은** 끝 인덱스가
그 스테이션 접두 안에 있는 동안 확정이며, 이 조건이 마지막 스테이션의 끝 캡도 자동으로 배제한다.
검증은 필드 비교가 아니라 **대브 배열의 객체 동일성**이다 — `FxOilDabPlanner` 가 자기 검증 접두를
같은 객체로 돌려주므로 가장 싸면서 필드 비교보다 강하다. 증명하지 못한 것은 전부 다시 세우므로
잘못된 재사용은 표현 자체가 불가능하다.

**증분화하지 않은 것(설계상 전역)**: 밴딩·밴드 평균·텔레스코핑 셸 델타는 관측 min/max 스팬에서
나오므로 append 한 번이 모든 런을 재밴딩할 수 있다. 이 단계(`planBristleLanesFromRuns`)는 항상
전량 수행하며, 그래서 **반환 플랜은 배치 플래너와 바이트 동일**하다(증분 근사가 아니다). 전역 집계
자체를 없애는 것은 톤이 바뀌는 별도 작업(`fixed-anchor-v2`, 로드맵 §3)이다. v1 load-dynamics /
bristle-physics 프로그램은 `baseRadiusPx` 가 스테이션 반경의 **획 전역 평균**이라 시뮬 전체가
정당하게 달라진다 — 그래서 이 두 프로그램이 켜진 획은 런을 재사용하지 않는다(기하·스테이션은 재사용).

부수적으로 같은 파일에서 픽셀 불변 할당 제거: `Math.min(...stations.map(...))` 스프레드 3곳,
`mean(x.map(f))` 중간 배열 5곳(`meanBy` — 같은 순서로 더하므로 비트 동일), 런 양자화 메모를
호출당 `Map` 에서 모듈 `WeakMap` 으로(프레임을 가로질러 유지).

배선: 라이브 리테인드 미디어 오버레이의 활성 획(`ActiveRetainedStroke.oilCarrierPlanner`)과
`StudioDrawNode` 의 활성 초안(요소 id + 대칭 변형 인덱스로 키). 커밋·정착·SVG 내보내기는 배치
플래너를 그대로 쓴다.

실측(이동당 계획 비용, 동일 컨테이너·최소값):

| 대브 | 배치 | 증분 | 재사용 런 |
| --- | --- | --- | --- |
| 1458 | 6.7–9.4ms | 5.0–6.3ms | 9653 |
| 2906 | 14.6–18.8ms | 9.2–13.0ms | 19306 |
| 4096 (캡 포화) | 24.6–27.9ms | 23.8–27.3ms | 0 |

계약 고정: `studio-oil-ribbon-carrier.incremental.test.ts` 13건. 성장하는 획의 **매 단계**에서
플랜이 배치와 구조적으로 같음을 확인하며, 플레인·flat-ribbon·filbert(physics)·impasto(physics+
relief)·load-dynamics·bodyOnly·fixed-anchor-v2 일곱 프로그램, 대브 캡 통과, 획 도중 옵션 교체,
같은 인스턴스의 무관한 획, 축소(드래그 중 되돌리기), `reset()` 을 모두 포함한다.

## 4. 남은 것 — 사유와 재개 조건

### 4-1. 오일 라이브 칠 단계 (구 §4 #2 의 나머지)
계획은 증분이지만 오버레이는 여전히 매 프레임 활성 캔버스를 지우고 전체를 다시 칠한다. append-only
칠은 이미 칠해진 픽셀의 알파가 변하지 않아야 성립하는데, §3 의 전역 밴딩이 정확히 그것을 바꾼다.
**재개 조건**: `fixed-anchor-v2` 밴딩이 knot/품질 게이트를 통과해 기본 경로가 되는 것(로드맵 §3-3).
4096-대브 베드는 26개 레인 × 27,313 런을 칠하므로, 실사용 프레임 비용의 지배항은 이제 칠 단계다.

### 4-2. professional-shelf · competitor-specialty 리본 (구 §4 #5)
`studio-live-dynamic-brush-overlay.ts` 의 `requiresWholePrefixRibbonReplay` 경로가 dab 이 발생한
프레임마다 accepted 프리픽스 전체를 정규 플래너로 재계획한다. 이유는 §2-4 와 동일한 교차 셀프
오버랩 방지(스트로크 유니온)다. dry-media 는 같은 문제를 `DryMediaUnionAccumulator` 로 풀었다 —
선행 dab 하나를 씨앗으로 접미 폴리곤을 계획해 O(1) append 하고 접미만 칠한다. **재개 조건**: 이
두 캐리어가 선행 dab 씨앗 접미 계획을 지원하도록 확장. 잘못 하면 자기교차부가 진해지므로(=품질
저하) 이번 세션 범위에서 제외했다.

### 4-3. WebGPU 타일 서명 (구 §4 #6)
`operationForStudioGpuStroke` 가 비피드 스트로크마다 O(N) 문자열을 네 개 만들고, 타일별
`startsWith` 가 O(T·N) 이다. 다만 이 경로는 **에포크 거절·디바이스 로스 때만** 도는 폴백이며 상시
프레임 경로가 아니다(피드 토큰 경로는 이미 O(1)). 접두 다이제스트 사다리로 O(1) 비교를 만드는
로드맵 §5 안은 유효하지만, 사용자가 보고한 상시 끊김의 원인은 아니므로 우선순위를 내렸다.

### 4-4. perfect-outline / G펜 (구 §4 #1)
perfect-freehand 의 시작·끝 taper 가 획의 **총 길이**를 읽어 아웃라인이 점 배열의 전역 함수다. 캡슐
엔진은 이미 증분(`capsule-outline` x0.5)이지만 perfect-freehand 엔진은 외부 커널을 배열 통째로
소비한다. 게이트 x8.3 · 3.4ms 는 계획만의 값이고, 실사용에서는 Konva `Path` 가 매 프레임 O(N)
pathData 문자열을 다시 파싱하는 비용이 더 크다. **재개 조건**: 로드맵 §4 2단(sceneFunc 가 캐시된
Path2D 를 재사용) — 출력 동일이라 버저닝이 필요 없는 작업이다.

## 5. 검증

- `studio-aligned-pressure-journal.test.ts` 6건, `studio-oil-ribbon-carrier.incremental.test.ts`
  13건 신규 — 전부 통과.
- `studio-long-stroke-per-move-cost.test.ts` 21건 통과(수정 전후 동일 — 게이트의 oil-ribbon 프로브는
  n=3200 에서 대브 캡이 포화하는 구간을 재며, 그 구간은 `sampleStations` 가 격자를 전면 재적합해
  어떤 접두도 남지 않는 것이 설계상 정확한 동작이다. 이번 개선은 캡 이하 구간의 것이다).
- `src/domains/creator/brush` · `src/domains/creator/live` 및 관련 파일 스윕: 3622/3623 통과.
- 유일한 실패는 **변경 전 HEAD 에서도 동일하게 적색**인
  `studio-brush-dynamics.test.ts > pins byte-identical capped redistribution output` 의 인라인
  스냅샷(airbrush·ink-particle 다이제스트). 같은 digest 로 재현되며 이번 변경과 무관하다 —
  `git stash` 후 동일 실패를 확인했다.
