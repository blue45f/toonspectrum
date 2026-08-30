# 유화 계열 라이브 획 — 단계별 해부와 근본 원인

> 목표: "유화계열 등 긴 획이 길어질수록 급격히 느려지는 이슈를 근본적으로 해결"
> 제약: 브러시 품질을 낮추지 않는다. `oil` / `acrylic` 의 최종 픽셀은 바뀌지 않는다.

`stroke-prefix-stability-2026-08-30.md` 가 대브 베드와 캐리어 기하·스테이션을 접두 안정하게
만들었다. 이 문서는 **출하 중인 `oil` / `acrylic`** 에서 이동당 비용이 실제로 어디에 있는지를
재고, 남아 있던 차단자가 사실은 **잘못된 전제 하나**였음을 보인다.

## 1. 왜 유화 계열만 유독 느렸나

`studioOilRibbonProgramsForBrush` 를 덤프하면 갈린다:

| 브러시 | 프로그램 |
| --- | --- |
| `oil`, `acrylic`, `fluid-paint*` | `bristlePhysics` + `bristleLoadDynamics` + `impastoRelief` **전부 on** |
| `oil-impasto`, `oil-filbert`, `oil-flat`, `oil-round`, `gouache` | 없음 |

그리고 캐리어 플래너는 두 프로그램 중 하나라도 켜져 있으면 런 재사용을 0 으로 내렸다
(`reusableStations = dynamics || physics ? 0 : settledStations`). 즉 사용자가 "유화 계열"이라
부르는 **바로 그 프리셋들만** 접두 재사용을 전혀 못 받고 있었다.

## 2. 단계별 실측 (`oil`, 배치 플래너, 이 컨테이너)

`planStudioOilRibbonCarrier` 에 임시 계측을 넣어 잰 값(ms/이동, 10회 평균):

| 단계 | 680 대브 | 2766 대브 | 4096 대브(캡) |
| --- | --- | --- | --- |
| stations | 0.39 | 1.11 | 1.42 |
| loadDynamics | 0.32 | 2.22 | 3.35 |
| bristlePhysics | 1.32 | 4.74 | 9.35 |
| impastoRelief | 5.09 | 5.76 | 8.40 |
| body | 0.23 | 0.36 | 1.63 |
| runBuild | 1.38 | 4.98 | 8.25 |
| banding+weld+shells | 2.41 | 3.97 | 5.02 |
| **합계** | **11.2** | **23.2** | **37.6** |

길이에 따라 **자라는** 항은 physics + runBuild + loadDynamics = 캡에서 **20.95 ms (전체의 56%)**.
나머지 ~15 ms(banding + impasto + body)는 길이와 거의 무관한 바닥이다.

## 3. load dynamics — 인과적이므로 이어 달린다

`planStudioOilBristleLoadDynamics` 는 **엄격하게 인과적인 전진 행진**이다. 스테이션 k 는
`pressures[k]`, `speeds[k]` 와 k−1 이 남긴 상태(`filmDrive`, `flattenDrive`, `speedEma`,
`laneReservoir[]`)만 읽고 앞을 보지 않는다. `stationCount` 는 배열 크기를 정할 뿐이다.

행진 루프를 `marchLoadDynamics` 커널로 뽑아 **배치와 증분이 같은 루프 하나를 공유**하게 했고,
`StudioOilBristleLoadDynamicsPlanner` 가 정착 경계에서 상태를 스냅샷해 다음 프레임이 그 지점부터
이어 달린다. 재사용을 거부하는 조건(전부 테스트로 고정):

- 보관 상태는 **정확히 `marched` 스테이션 뒤의 상태**이므로 그 지점에서만 이어 달릴 수 있다.
  획이 그보다 짧아지면 0 부터 다시 행진한다.
- `sampleSeries` 는 짧은 시리즈를 마지막 값으로 **고정(hold)** 하므로, 이미 행진한 스테이션이
  획이 자라며 다른 값을 읽게 된다 → 시리즈 길이가 스테이션 수 이상이거나 없을 때만 재사용.
- laneCount / seed / initialLoad / depletionRate 가 움직이면 전량 재행진.

## 4. 근본 원인 — `baseRadiusPx` 는 애초에 나눠서 사라진다

`planBristlePhysics` 도 인과적 전진 행진이다. 스테이션 루프는 `stationXs[k]`, `stationYs[k]`,
`pressures[k]` 와 터프트 상태만 읽는다. 전역 입력은 정확히 하나였다:

```ts
baseRadiusPx: meanBy(stations, (station) => station.radiusY)   // 획 전역 평균
```

주석은 이 값이 "움직이니 시뮬 전체가 정당하게 달라진다"고 적어 두었고, 그 한 줄이 유화 계열의
접두 재사용을 통째로 막고 있었다. 실제로 이 값은 획 전체에서 **18.2% 변동**하고 3200 표본에서도
프레임당 0.05–0.07% 씩 계속 움직인다(수렴하지 않는다).

**그런데 그럴 필요가 없었다.** 이 프로그램이 내보내는 모든 스트림은 앵커를 **다시 나눠 없앤다**:

- `laneOffsetRatio = lateral / baseRadiusPx`. `lateral` 은
  `restOffset·radius·splay + splitDrive·splitAmplitude·radius·clumpDirection` 이고 틸트 시프트
  항까지 전부 `radius` 를 인수로 갖는다 → 나누면 사라진다.
- `laneWidthScale = contactRadius / restBristleRadiusPx`. `contactRadius` 는 `bristleRadiusPx`
  를 인수로 갖는데 그게 곧 `restBristleRadiusPx` 다 → 사라진다.
- `laneLoadMultiplier` · `spread` · `splitDrive` · `inkRatio` 는 반경을 아예 읽지 않는다.

즉 주석의 전제가 **사실이 아니었다**.

### 4-1. 그래서 앵커를 얼린다 (`settled-prefix-v2`, 기본값)

상쇄에 기대어 재사용을 켜는 것은 대수적으로는 맞아도 **부동소수 결합 순서에 기대는** 셈이라
적절치 않다. 대신 앵커를 앞 `STUDIO_OIL_PHYSICS_REST_RADIUS_ANCHOR_STATIONS`(256) 스테이션
평균으로 **고정**해 행진을 **정확히 인과적**으로 만든다. 접두는 상쇄가 성립해서가 아니라
**구성상** 정착한다.

물리적으로도 이쪽이 맞다 — 터프트의 정지 폭은 브러시와 그 위의 필압이 정하는 성질이지, 획을
얼마나 더 그었는지의 함수가 아니다. `stroke-mean-v1` 은 명시적 옵트아웃으로 남겨 두었다.

측정은 **한 프로세스 안에서 두 앵커를 라운드마다 번갈아** 돌리고 각 지점의 최소를 취했다
(이 컨테이너는 프로세스 간 편차가 커서 별도 실행 비교는 신뢰할 수 없다):

| 이동당 캐리어 계획 (best-of-5) | `oil` 이전 → 이후 | `acrylic` 이전 → 이후 |
| --- | --- | --- |
| 400 표본 | 7.94 → **5.75 ms** (−28%) | 7.48 → **5.36 ms** (−28%) |
| 800 | 10.11 → **6.15 ms** (−39%) | 10.49 → **7.20 ms** (−31%) |
| 1200 | 13.51 → **7.45 ms** (−45%) | 12.73 → **7.54 ms** (−41%) |
| 1600 | 17.36 → **9.86 ms** (−43%) | 17.79 → **9.61 ms** (−46%) |
| 2000 | 24.39 → **11.61 ms** (−52%) | 22.07 → **12.31 ms** (−44%) |
| 2400 (대브 캡) | 29.64 → 30.20 ms | 29.70 → 28.98 ms |

재사용된 런: 2000 표본에서 0 → **21,824**.

**길이가 자랄수록 벌어지던 항이 사라졌다.** 400→2000 표본에서 이전은 7.9→24.4 ms (3.1배),
이후는 5.8→11.6 ms (2.0배)다. 캡(2400)에서 재사용이 0 으로 돌아가고 이득이 사라지는 것은
설계대로다 — `sampleStations` 가 격자를 전면 재적합하므로 어떤 접두도 살아남지 않는다(별건).

### 4-2. 그리고 시뮬 자체도 이어 달린다

앵커가 얼면 physics 행진도 **정확히 인과적**이므로, load dynamics 와 같은 처리를 할 수 있다.
행진 루프를 `marchPhysicsOil` 커널로 뽑아 배치·증분이 공유하게 하고,
`StudioBristlePhysicsOilPlanner` 가 정착 경계에서 터프트를 스냅샷해 다음 프레임이 이어 달린다.

스냅샷 대상(`BristleBrushCarry`)은 스텝을 가로지르는 것만이다 — 잉크 배열과 스칼라 상태, 그리고
캐리어 쪽의 hold-last 레인 기하(`heldOffset`/`heldWidth`). `contactX/Y/Radius/Alpha` 는 매 스텝
모든 털에 대해 **읽히기 전에 전부 쓰이므로** 경계를 넘지 않고, `layout`/`config`/`clumpDirection`
은 생성 시 고정이라 복사하지 않는다.

**이로써 "이미 그려진 부분의 털 시뮬을 매 프레임 통째로 다시 돌린다"가 사라졌다.**

### 4-3. 병렬로 고친 것 — 털 시뮬 스텝당 낭비

`stepBristles` 는 이동당 4096번 불린다. 그 안에서:

- `capacityTotal` — 레이아웃은 생성 후 변하지 않으므로 **상수**인데 매 스텝 터프트 전체를 다시
  더하고 있었다. 생성 시 같은 순서로 한 번 더해 상태에 둔다.
- 모세관 재분배가 `new Float64Array(count - 1)` 를 **매 스텝 할당**했다. 읽히기 전에 전부
  덮어쓰는 값이라 상태가 소유하는 스크래치로 옮겼다.

## 5. 기존 엔진 검토

리포지토리에는 이미 상용 오픈 엔진 평가 카탈로그가 커밋돼 있다
(`studio-commercial-open-engine-evaluation.ts`, 12개 엔진). `paint-oil` 을 제공하는 항목:

| 엔진 | 라이선스 | 판정 |
| --- | --- | --- |
| **Hokusai** (`packages/studio-hokusai-wasm`) | MIT OR Apache-2.0 | `primary-pin-candidate`. **이미 vendoring 돼 있고** `beginStroke / addSample / dirtyBounds / dirtyFrame` 라는 **완전 증분 API** 를 갖는다 |
| libmypaint / MyPaint | ISC | 수치는 이미 `STUDIO_OSS_OIL_FILM_RECIPE` 로 들어와 있음 |
| Krita (colorsmudge/hairy 등) | GPL-2.0+ | `copyleft-isolate` — 클린룸 재구현만 가능 |
| Mixbox | CC BY-NC | `non-commercial-block` |
| Clip Studio / Rebelle | 독점 | `closed-reference-only` |

즉 **Hokusai 가 정답 후보이고 라이브 워커까지 이미 배선돼 있다**
(`studio-hokusai-live-brush.worker.ts`). 다만 `resolveStudioHokusaiProductLiveAdmission` 이
막고 있고 `STUDIO_HOKUSAI_PRODUCT_PROMOTED_PRESETS` 는 **빈 배열**이다 — 정책 주석대로
"committed full-size comparison does not pass visual parity or the 1.2x throughput gate".

따라서 유화를 Hokusai 로 갈아타는 것은 성능 수정이 아니라 **프리셋별 품질 승격 리시트를 만드는
제품 결정**이고, 기존 게이트가 그 절차를 이미 정의해 두었다. 이번에는 그 게이트를 우회하지 않고
현재 캐리어의 알고리즘을 고쳤다(4절). Hokusai 전환을 원하면 그 게이트가 요구하는 것은 프리셋별
시각 패리티 + 1.2x 처리량 리시트다.

## 6. 칠(paint) 단계를 증분화하려던 시도 — 측정으로 기각

이동당 칠 비용은 JS 경로 추적 0.7–5.7 ms(+ 래스터화)다. 더티 사각형 재칠을 구현했다: 바뀐
사각형만 지우고 그 안에 걸치는 런만 같은 순서로 다시 그리면(레인당 한 번의 `stroke()` 규칙 유지)
전체 재칠과 픽셀 동일하다 — 단 **플랜의 "칠 정체성"(레인 수·레인별 lineWidth/opacity/loadBand·
bodyOpacity)이 그대로일 때만** 성립한다.

성장하는 획 599 프레임에서 그 정체성이 유지된 프레임: **0 건 (0.0%)**.

- `lineWidth` 가 500 프레임 중 488 에서 변함
- `bodyOpacity` 는 `meanStationOpacity` — 획 전역 평균이라 431 프레임에서 변함
- 레인 opacity 는 밴드 평균, 밴드 경계는 관측 min/max 로드 스팬 — 역시 전역

즉 칠이 O(N)/프레임인 것은 낭비가 아니라 **플랜의 색조가 획 전체의 함수라서**다. 절대 타지 않을
죽은 코드이므로 트리에 넣지 않았다. 4절과 달리 이쪽 전역성은 실제로 그림을 정하므로, 열려면
밴딩/`bodyOpacity` 의 색조 모델 자체를 바꿔야 한다 — 그건 픽셀이 바뀌는 결정이다.

## 7. 픽셀 불변 검증

- **플랜 비교 70건 전부 동일**: `oil`/`acrylic` × 획 모양 5종 × 길이 7종(대브 캡까지), 그리고
  틸트를 준 베드 1건에서 `settled-prefix-v2` 와 `stroke-mean-v1` 의 플랜이 바이트 동일.
- **CanvasKit 실제 래스터화 대조**: `oil`/`acrylic` × 모양 3종 × 길이 2종에서
  **maxDelta 0/255, meanDelta 0.000**.
- **`main` 대비 다이제스트** (배치 5길이 + 증분 플래너 70프레임을 이어붙인 SHA-256) 가 6개
  프리셋 전부 동일 — 앵커 고정, 런 재사용, load dynamics 재개, physics 재개, 털 모델 스텝
  정리를 **모두 적용한 상태에서**:

```
oil                    d1a2b494136c098ee158fdb518d9eb78
acrylic                c1d9662cace925308982e194635bf437
oil--filbert-ribbon    daf6c900a76a9c2cfff0ca8d6e00a341
oil--impasto-ribbon    18b6eeec67f330491859f3ec6f2da3a9
oil-impasto            3aa349662d6ad1a7b0228c1934cc6d71
gouache                3aa349662d6ad1a7b0228c1934cc6d71
```

- 앵커 창(256 스테이션)에 못 미치는 짧은 획은 v1 과 **같은 값을 같은 순서로** 더하므로 정의상
  비트 동일하다.

## 8. 남은 항목

| 항목 | 이득(캡 기준) | 재개 조건 |
| --- | --- | --- |
| 대브 캡에서의 격자 전면 재적합 | 캡에서 ~27 ms/이동 | `sampleStations` 가 접두를 보존하도록 — 별건 |
| impastoRelief | ~5–8 ms/이동 | 길이와 거의 무관한 상수 비용. 길이 의존 문제가 아님 |
| 더티 사각형 재칠 | 칠 O(N)→O(꼬리) | 밴딩/`bodyOpacity` 색조 모델 정리 = 픽셀이 바뀌는 결정 |
