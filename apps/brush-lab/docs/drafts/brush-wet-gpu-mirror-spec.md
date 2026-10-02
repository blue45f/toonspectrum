# 습식 매체 GPU 미러 명세 (수채·수묵·구아슈 LBM 물 스텝 + 유화 층)

작성 2026-10-02(brush-wet 작업자). 대상 독자: `engine/gpu/**` 소유자(engine-gpu). 상태: **CPU 참조 구현·Node 테스트 완료, GPU 미러 미구현, 브라우저 미검증.**

- 이 문서의 단일 원천은 `apps/brush-lab/src/engine/wet/**`의 CPU 참조 코드다. 수식은 요약이며 충돌하면 코드가 맞다. 섹션마다 대응 CPU 함수를 적었다.
- 구분: **[계약]** = CPU 동작이라 GPU가 반드시 같아야 하는 것, **[제안]** = 구현 자유도가 있어 권장안만 적은 것.
- 기존 GPU의 `wet_step`(`WET_KERNEL` 상수, 4방향 비율 확산 + 단일 층 모델)은 **레거시 계약**이다. `WET_KERNEL`은 그대로 남겨 두었다(`wet/params.ts`). 레거시를 쓰는 동안 습식 프리셋의 GPU 픽셀은 CPU와 달라지며(§9.3), 이 명세대로 교체하면 패리티 대상이 된다.
- 수정하지 않은 것: `WET_CH` 12채널의 인덱스·순서(= `layout.ts` `WET_CHANNELS = 12`, `WET_FLOATS_PER_TILE`), `Surface`의 공개 시그니처(`beginStroke`/`addDabs`/`endStroke`/`toLabImage`/`toLinear` 불변, `flattenWet()`만 추가).

## 1. GPU가 바꿔야 하는 것 (체크리스트)

| # | 항목 | 요약 | 절 |
| --- | --- | --- | --- |
| A | 새 상태 버퍼 | 확장 풀 `wet_ext_pool`(23채널), 스냅샷 `wet_snap`(20채널), 종이 풀정밀 `paper_wet`(f32 3채널), 유화 창 스크래치 | §2 |
| B | 수채 계열 패스 교체 | `wet_snapshot → wet_edge_delta → wet_step_water → wet_retire/expand`(서브스텝당) | §3 |
| C | 유화 패스 교체 | 창 gather 밀기·붓 색 픽업·침착·Bingham 레벨링·건조 | §4 |
| D | 표시 합성 | 수채 층 → 유화 층 → 릴리프 조명을 **표시 시점**에 비파괴 합성. **`endStroke`에서 bake하지 않는다**(지속 레이어) | §5 |
| E | 스탬프(래스터) 계약 3건 | `wetOnly`(획 레이어에 안 씀), 안료 질량 × `grainResp`, 임파스토 색은 획 레이어에 안 씀 | §6 |
| F | 파라미터 | `WaterKernel` 33개 f32 + 섬유 파라미터 + `WET_PHYSICS` 상수 | §7 |
| G | 시험 | `engine/testing/wet-scenes.ts` 장면을 GPU에서 재생해 읽어 오는 패리티 시험 | §9 |

레거시 상수 유지: `WET_CHANNELS = 12`, `SLOT_NONE`, `SLOT_RESERVED`, `BAKE_MASS_TO_ALPHA = 3`(= `layer-composite.ts` `BAKE_MASS_TO_ALPHA`), 임파스토 dab 레코드 상수. 바뀐 export: `IMPASTO_PUSH`는 이제 **`DEFAULT_WET_PARAMS.oilDepth`(0.5)** 에서 파생된 상수이며, 실제 밀기 양은 프로그램별 `program.wet.oilDepth·(1 − viscosity)`(호스트가 계산해 dab 레코드로 올린다, §4.2).

## 2. 상태 버퍼

모든 풀은 **타일 슬롯**(`wet_slots[tile]`)을 공유한다. CPU는 코어 풀과 확장 풀의 슬롯 번호가 따로지만(`state.ensureExt(tile)`이 둘을 함께 할당), GPU는 같은 슬롯 번호로 두 풀을 인덱싱해도 동작이 같다 [제안]. 타일 1개 = 16×16 = 256셀. 채널 `c`의 셀 `i`(= `ly·16 + lx`) 위치 = `slot·(채널수·256) + c·256 + i` (SoA, f32).

### 2.1 코어 풀 `wet_pool` — 12채널, 변경 없음 [계약]

| ch | 이름 | 의미(수채 계열) | 의미(유화) |
| --- | --- | --- | --- |
| 0 | water | 표면층 물 ws | — |
| 1, 2 | velocityX/Y | 흐름층 거시 속도 u (ρ=0이면 0) | — |
| 3..6 | pigment r,g,b,mass | 부유 안료 g (색 × 질량 가중) | — |
| 7 | height | — (수채는 쓰지 않음) | 총 높이 H = 마른 릴리프 B + 물감 부피 V |
| 8..11 | fixed r,g,b,mass | 침착(재습윤 가능) 안료 d | — |

### 2.2 확장 풀 `wet_ext_pool` — 23채널 신설 [계약: 채널 인덱스]

CPU: `WET_EXT_CH`(`wet/state.ts`), `WET_EXT_CHANNELS = 23`. 확장 풀은 습식이 처음 필요할 때 만든다(건식 전용 표면은 0바이트).

| ch | 이름 | 의미 |
| --- | --- | --- |
| 0..8 | lbm f0..f8 | 흐름층 속도 분포(충돌 후, D2Q9) |
| 9 | rho | 흐름층 물 밀도 ρ = Σ f_i (파생값이지만 저장) |
| 10 | capillary | 모세관층 포화 s |
| 11 | glue | 아교(수묵). **현재 CPU 커널은 쓰지 않는다**(핀닝의 아교항은 같은 셀의 `gm + dm + hard`로 계산). 슬롯만 예약 |
| 12 | cure | 건조 후 경과 스텝(경화 카운터, 정수값을 f32로 저장) |
| 13..16 | hard r,g,b,mass | 경화되어 고정된 안료 D(재습윤 불가) |
| 17..19 | oilR,G,B | 유화 색 × 부피 |
| 20 | oilWet | 유화 젖은(이동 가능) 부피 m |
| 21 | oilBase | 유화 마른 릴리프 높이 B |
| 22 | wetBlur | 젖음 마스크의 헬름홀츠 블러 B(안료 에지 이동용) |

방향 규약(`wet/lbm-d2q9.ts`): `LBM_CX = [0,1,0,-1,0,1,-1,-1,1]`, `LBM_CY = [0,0,1,0,-1,1,1,-1,-1]`(**y는 아래가 +**, 인덱스 2 = 아래/S), `LBM_OPP = [0,3,4,1,2,7,8,5,6]`, `LBM_W = [4/9, 1/9×4, 1/36×4]`. 링크 클래스(`LBM_LINK_CLASS = [0,0,1,0,1,2,3,2,3]`): 전방 링크 E(1)→0, S(2)→1, SE(5)→2, NE(8)→3. 링크의 κ는 **소유 셀**에 저장한다: 전방 링크(E, S, SE, NE)는 그 링크의 **출발 셀**, 후방 링크는 이웃(상류) 셀 쪽 값을 쓴다(`LBM_LINK_OWNER_IS_UPSTREAM`).

### 2.3 스냅샷 `wet_snap` — 20채널, 서브스텝마다 만든다 [계약: 읽기는 전부 이전 상태]

모든 이웃 읽기는 **서브스텝 시작 시점의 상태**여야 한다(타일 순회·스레드 순서와 무관한 gather, `buildPaddedSnapshots`). 구현은 (a) 스냅샷 복사본 또는 (b) 코어·확장 풀 핑퐁(`wet_parity`) 중 편한 쪽 [제안]. 스냅샷 채널(`PCH`, `wet/padded.ts`):

| snap ch | 이름 | 출처 |
| --- | --- | --- |
| 0..8 | f0..f8 | ext 0..8 |
| 9 | rho | ext 9 |
| 10 | ws | core 0 |
| 11 | s | ext 10 |
| 12..15 | g r,g,b,mass | core 3..6 |
| 16, 17 | ux, uy | core 1, 2 |
| 18 | delta Δ | 파생(§3.2) |
| 19 | b | ext 22 |

**유효성 규칙(벽) [계약]:** 셀(gx, gy)은 (1) 타일 격자 안(`0 ≤ gx < tilesX·16`, `0 ≤ gy < tilesY·16`; 캔버스 크기가 16의 배수가 아니면 마지막 타일의 캔버스 밖 셀도 **유효**하다), (2) 그 셀의 타일이 이번 서브스텝 활성 목록에 있고 슬롯이 할당됨 — 둘 다 만족하면 유효. 무효 셀은 **벽**이다: 플럭스 0(no-flux, LBM은 no-slip bounce-back), 스냅샷 읽기 값은 **0**(가드 없이 읽는 경우 포함: Δ·ux·uy 이웃 읽기가 0을 돌려줘야 한다). 종이 파생 `h`는 무효 셀에서도 **전역 좌표 함수로 계산된다**(타일 격자 밖 좌표는 종이 텍스처의 wrap 샘플).

### 2.4 종이 파생 필드 `paper_wet` [계약: 값, 제안: 저장 방식]

CPU: `buildTilePaper`(`wet/paper-wet.ts`). 타일당 18×18(1셀 헤일로), 모두 **전역 셀 좌표의 순수 함수**라 타일 경계에서 연속이다.

- 입력: `PaperField`의 **f32 원본 3채널**(`bump`, `absorb`, `direction`, 256², wrap) + `PaperSpec`(`scale`, `rotationRad`, `filter`, `seed`). 현재 GPU `paperTex`는 `rgba8unorm`이라 **방향(2π/255 ≈ 0.025 rad)·요철 양자화가 κ 오차로 번지므로 쓰면 안 된다.** f32 storage 버퍼 `paper_wet`(256²×3 f32 = 768 KiB)을 따로 올리고, `samplePaper`/`sampleChannel`(wrap, bilinear은 `fx = tx − 0.5` 규약, `direction`은 항상 nearest)을 WGSL로 손수 미러한다(하드웨어 샘플러 금지).
- 종이 없음(`program.paper.enabled = false`, CPU `field: null`): `h = 0.5`, `absorb = 0.5`, `capBase = capacityBase + capacitySpan·0.5 = 0.7`, 모든 κ = `min(κmax, k0)`.
- 산출(타일 18×18, 핀닝용 `kbar`만 16×16):
  - `h = bump`, `absorb`, `capBase = capacityBase + capacitySpan·absorb`.
  - 섬유각 `cs = detCos(dir)`, `sn = detSin(dir)` — **`Math.sin/cos`가 아니라 `wet/det-math.ts`의 11차 테일러(`detSin`/`detCos`)를 WGSL에 그대로 옮긴다**(WGSL `sin/cos`는 정밀도 비보장이라 섬유 필드 해시가 갈라진다).
  - 섬유 줄무늬 `fib = rough > 0 ? valueNoise2D((gx·cs + gy·sn)/fiberLengthPx, (−gx·sn + gy·cs)/fiberWidthPx, seed) : 0.5` (`value_noise_2d`는 `WGSL_MIRROR_FUNCTIONS`에 이미 있다). `mod = max(0.05, 1 + rough·(2·fib − 1)·1.2)`.
  - 전방 링크 클래스 c ∈ {E, S, SE, NE}의 단위 방향 d_c = (1,0), (0,1), (√½, √½), (√½, −√½): `dot = d·(cs, sn)`, `d6 = (dot²)³`(**pow 금지, 곱셈 3회**), `κ_c = clamp(1 − (1 − (κ⊥ + (κ∥ − κ⊥)·d6))·mod, 0, κmax)`. `(κ∥, κ⊥) = fiberLinkBlocking(k0, aniso)`(호스트에서 계산해 uniform으로 전달).
  - `kbar(셀) = (κE(p) + κE(p−1) + κS(p) + κS(p−PAD))/4` (E, S 클래스만; p는 18×18 인덱스).
- 저장 방식 [제안]: (1) 매 서브스텝 `wet_step_water` 안에서 18×18을 즉시 계산(워크그룹 공유 메모리 7×324×4 B ≈ 9 KB, 하지만 기본 `maxComputeWorkgroupStorageSize` 16 KB라 다른 공유 배열과 합치기 빡빡함) 또는 (2) `paper_wet_build` 패스로 슬롯별 풀 `paper_derived`(7×324 + 256 f32 ≈ 10 KB/slot)에 캐시. **캐시 키는 CPU `paperCacheKey`와 같다**: (종이 필드 id, `scale`, `rotationRad`, `filter`, `seed`, `fiberBlocking`, `fiberAnisotropy`, `fiberRoughness`) 중 하나라도 바뀌면 전체 무효화.

### 2.5 유화 창 스크래치 [제안]

dab 1개의 창(`loadOilWindow`)은 최대 `MAX_TILES_PER_DAB`(4096타일) = 1024² px. 창 상태 6채널(H, B, m, Cr, Cg, Cb) + dab 스크래치(amount, dep, weight, dir 패킹, mv) + 이중 버퍼를 `창 셀 수 × 약 16 f32`로 잡으면 최대 64 MiB. 창이 이보다 크면 CPU처럼 dab를 건너뛰고 overflow로 센다.

### 2.6 메모리·바인딩 예산

| 버퍼 | f32/slot | B/slot | 512 slot | 비고 |
| --- | --- | --- | --- | --- |
| wet_pool(코어) | 12·256 = 3072 | 12288 | 6.0 MiB | 기존 |
| wet_ext_pool | 23·256 = 5888 | 23552 | 11.5 MiB | **신설** |
| wet_snap | 20·256 = 5120 | 20480 | 10.0 MiB | 신설(핑퐁이면 불필요) |
| paper_derived(선택) | ≈ 2524 | ≈ 10096 | ≈ 4.9 MiB | 선택 |

- `maxStorageBufferBindingSize` 기본 128 MiB: 확장 풀은 약 5698슬롯, 코어 풀은 약 10922슬롯이 상한이다. `DEFAULT_WET_CAPACITY_TILES = 512`는 안전하다. 2048² 전면 습식(16384타일)은 기본 한도로 불가능하다 — 한도 상향 요청 또는 `SLOT` 상한 + `StrokeBudgetExceededError`(CPU와 동일)로 막는다.
- **스토리지 바인딩 한도(스테이지당 8)**: 현재 group 0·1·2에서 dabs, bins, refs, table, strokePool, wetPool, document, indirect = 8이 이미 찼다. 새 버퍼(ext, snap, paper_wet, oil 스크래치)는 **습식 전용 파이프라인의 별도 레이아웃(group 3 신설)** 에 넣고, 그 파이프라인은 dabs/bins/refs/strokePool/document를 바인딩하지 않는다(`wet_*` 커널은 table(활성 목록·슬롯) + wetPool + ext + snap + paper만 필요). `maxBindGroups` 기본 4이므로 group 0..3이 가능하다.

## 3. 수채 계열 서브스텝 (watercolor·sumi·gouache)

CPU 진입: `stepWet`(`wet/wet-reference.ts`) → `stepWaterMedia`(`wet/step-water.ts`). 프레임 = `WET_FRAME_MS = 1000/60`, 서브스텝 수 `max(1, floor(params.substeps))`(수채·수묵·구아슈 2), `hMs = frameMs/substeps`. 서브스텝마다:

```
활성 목록 오름차순(sortedActive)
  ensureExt(타일)                      // 코어·확장 슬롯 동시 할당
  wet_snapshot        (§2.3)
  wet_edge_delta      (§3.2)           // 스냅샷 전체가 끝난 뒤
  wet_step_water      (§3.3)           // 타일당 stepTile, 활성 타일 간접 디스패치
  wet_retire          (§3.4)           // keep 아닌 타일을 활성 목록에서 제거(retireDriedTiles)
  wet_expand          (§3.4)           // 경계 물이 있는 활성 타일의 이웃 활성화(expandActive)
state.timeMs += frameMs
```

활성 목록이 비고 `oilTiles`도 비면 서브스텝 루프를 즉시 끝낸다(`stepWet`의 조기 종료). 획 끝 정착(`settleWet`): 활성 타일이 0이 될 때까지 최대 `WET_DRY_STEPS_MAX = 240`프레임(수채 계열) / `WET_OIL_SETTLE_FRAMES = 48`(유화) 전진(§5).

### 3.1 `wet_snapshot` — 워크그룹 16×16, 활성 타일당 1개 (`buildPaddedSnapshots`)

§2.3 표대로 복사. 스냅샷 읽기 헬퍼 `snap_read(gx, gy, ch)` = 무효 셀이면 0, 아니면 해당 타일 슬롯의 값.

### 3.2 `wet_edge_delta` (`computeEdgeDelta`)

`Δ(셀) = 0` (ws + ρ ≤ `rhoMin` 이면), 아니면 `0.125 × #{8이웃 중 유효하고 ws + ρ ≤ rhoMin 인 셀}`. 결과를 snap ch 18에 쓴다. 이웃 타일의 Δ는 그 셀의 전역 유효 규칙으로 계산한 값과 같으므로(CPU의 2단계 헤일로 교환과 동치) GPU는 스냅샷 전체 완료 후 셀 단위로 독립 계산하면 된다.

### 3.3 `wet_step_water` — 워크그룹 16×16, 활성 타일당 1개, 셀당 1스레드 (`stepTile`)

**쓰기는 전부 자기 셀**(f0..f8, ρ, s, B, cure, hard, ws, g, d, vel)이라 스레드 간 충돌이 없다. 자기 셀의 `d`·`cure`·`hard`는 풀에서 제자리로 읽고(이웃이 읽지 않는 채널), 나머지는 스냅샷에서 읽는다. 아래 번호는 CPU 코드 주석의 (0)~(10)과 같다. 수식의 `P[ch][셀]`은 스냅샷 읽기, `s0 = P.s[p]`, `ws0 = P.ws[p]`, `rho0 = P.rho[p]`.

**경로 분기(성능 최적화, 비트 동치).** `near`(전체 경로)이면 모두 수행, 아니면 가벼운 경로(모세관 확산·증발·경화만, B = 0). `wetFlag(셀) = (ws + ρ > 0) || (g.mass > 0) || (B ≥ wetBlurWake)`이고 `near = 자신 또는 8이웃 중 wetFlag`. 가벼운 경로는 전체 경로와 같은 결과를 내도록 만든 최적화이며 CPU에서 해시 동치를 확인했다. GPU는 (a) 항상 전체 경로로 돌리거나 (b) 같은 게이트를 두어도 된다. (a)가 단순하다.

**(0) 젖음 블러 B:** `wd = ws0 + rho0`, `wI = min(1, wd/wetBlurFull)`, `sumB = Σ_{4면} (유효 ? P.b[이웃] : P.b[자기])`, `kB = wd > rhoMin ? wetBlurKeepWet : wetBlurKeepDry`, `bNew = (1 − kB)·wI + kB·0.25·sumB`, `bNew < wetBlurWake`이면 0. ext 22에 쓴다.

**(1) LBM 스트리밍 + 다공성 부분 bounce-back.** `FIN[0] = P.f0[p]`. q = 1..8: 상류 셀 `y = p − c_q`, `fo = P.f_opp(q)[p]`. `y`가 무효면 `v = fo`. 아니면 링크 기본 κ `kp = κ_flat[클래스(q)][소유 셀]`(소유 셀 = `UPSTREAM[q] ? y : p`), `x = min(1, ((rho0 + P.rho[y])/2)/rhoFull)`, `φ = x·(1 − sT + sT·x)`(sT = `surfaceTension`), `κ = 1 − (1 − kp)·φ`, `v = (1 − κ)·P.f_q[y] + κ·fo`. `rho1 = fround(Σ FIN)`, `jx = Σ cx·FIN`, `jy = Σ cy·FIN`.

**(2) 체적 가속.** 4면 이웃의 포화율 `sc = (유효 ? P.s[n]/(capBase[n]·capScale) : sc0)`(`sc0 = s0/cap`, `cap = capBase[p]·capScale`, `capScale = 0.5 + absorptivity`):
`ax = −kc·(scE − scW)/2 − khFlow·(hE − hW)/2 + etaEdge·(ΔE − ΔW)/2 + gAx`, `ay`도 같게(S는 +y). `hE` 등은 종이 `h`(무효 셀 포함), Δ는 스냅샷 값(무효 = 0). `|a| > accelMax(0.05)`이면 크기를 accelMax로 클램프.

**(3) 속도.** `rho1 > 1e-7`이면 `ux = jx/rho1 + 0.5·ax`(이류·핀닝용), `uex = jx/rho1 + tau·ax`(평형용), 각각 `|u| > uMax(0.2)`이면 uMax로 정규화. 아니면 0.

**(4) BGK 충돌.** `usq = 1.5·(uex² + uey²)`, `cu = 3(cx·uex + cy·uey)`, `feq = w_q·rho1·(1 + cu + 0.5·cu² − usq)`, `FEQ_q = FIN_q − (FIN_q − feq)/tau` (tau = `lbmTau` = 1 → `FEQ = feq`).

**(5) 모세관층 확산 + 링크 유량 JIN.** q = 1..8, 이웃 `qn`이 유효할 때: `capN = capBase[qn]·capScale`, `cbar = (cap + capN)/2`. `max(s0, sN) > thetaC·cbar`일 때만: `kk = κ_flat[클래스(q)][소유 셀]`, `j = dc·LW[q]·(1 − kk)·cbar·(sN/capN − s0/cap)`, `LW = {면 2/3, 대각 1/6}`. 한도: `j > 0 → j ≤ 0.1·sN`, `j < 0 → j ≥ −0.1·s0`. `s1 = s0 + Σ j`, `JIN[q] = j`(유입 +). 조건 불충족이면 `JIN[q] = 0`.

**(6) 표면층.** `ws > surfaceCap(1.2)`이면 초과분을 `flowAdd`로. `ws > 0`이면 `room = cap − s1`, `frac = clamp(alpha·absorb[p]·(1 − s1/cap)·hf, 0, 1)`, `seep = ws·frac`, `beta > 0 && seep·beta > room`이면 `seep = room > 0 ? room/beta : 0`. `ws −= seep`, `s1 += beta·seep`, `flowAdd += (1 − beta)·seep`.

**(7) 증발.** 전선 `front = max_{4면 유효}(1 − (ws+ρ)[이웃]/(wtx + 1e-6))`(wtx = ws0 + rho0 > rhoMin일 때만), `boost = 1 + edgeBoost·front`. 표면 `evS = min(ws, es·boost + ws·dryTail)`, 흐름 `evF = min(rhoTot, ef·boost + rhoTot·dryTail)`(rhoTot = rho1 + flowAdd), 모세관은 `ws ≤ 0 && 증발 후 ρ < rhoMin && s1 > 0`일 때만 `evC = min(s1, ec·boost + s1·dryTail·0.5)`. **잔량 접힘:** `ws + rhoTot + s1 < waterEps`이면 셋 다 0으로(합을 증발 장부에 더함). 분포 쓰기: 접힘이면 f = 0, ρ = 0; 아니면 `scaleF = rho1 > 0 ? (rho1 − min(evF, rho1))/rho1 : 0`, `f_q = FEQ_q·scaleF`, `f_0 += flowAdd − max(0, evF − rho1)`, ρ = rhoTot. ext 10 = s1, core 0 = ws.

**(8) 안료 수송(gather).** q = 1..8, 이웃 유효일 때. `wetX = ws0 + rho0 > rhoMin`, `wetN`은 이웃의 같은 판정.
- 확산 `diff = (wetX && wetN) ? dp·LW[q]·(1 − kk)·invGref : 0`, `invGref = 1/max(0.03, 1 − k0)`.
- 이류(나가는 `adv` / 들어오는 `advIn`): 모세관 운반 `JIN[q] > 0 → advIn += lambda·jq/(wn + 1e-6)`(wn = 이웃 ws+ρ+s), `JIN[q] < 0 → adv += −lambda·jq/(ws0 + rho0 + s0 + 1e-6)`.
- **4면(q ≤ 4)만:** 면 속도 `uf = (u_old[p] + u_old[qn])/2`(스냅샷 ux, uy), `un = uf·c_q`, `un > 0 → adv += lambda·un` 아니면 `advIn −= lambda·un`. 에지 이동(`edgeDrift > 0 && wetX && wetN`): `de = edgeDrift·(B[p] − B[qn])`(스냅샷 B), `de > 0 → adv += de` 아니면 `advIn −= de`. 그래뉼레이션(`grainDrift > 0 && wetX && wetN`): `dh = grainDrift·(h[p] − h[qn])`, 같은 부호 규칙.
- 링크 상한: `cap_q = q ≤ 4 ? faceOutMax(0.125) : diagOutMax(0.05)`. 나가는 `oOut = min(diff + adv, cap_q)`(`g0 = P.g.mass[p] > 0`일 때만 `outTotal += oOut`), 들어오는 `oIn = min(diff + advIn, cap_q)`(`P.g.mass[qn] > 0`일 때만 `gr, gg, gb, gm += oIn·P.g[qn]`). 최종 `g += (1 − outTotal)·P.g[p]`(g0 > 0 부분만 의미).
- 합산 순서는 q = 1..8 오름차순(f32 합산 순서를 CPU와 맞춘다).

**(9) 침착·재부유.** `wdepth = ws + rhoTot`, `catchDepth = dryBrush > 0 ? max(rhoMin, dryBrush·h[p]·dryBrushDepth) : rhoMin`.
- `wdepth < catchDepth`(마른 곳): `gm > 1e-9 && cure > cureLimit`이면 `cure = 0`; **부유 안료 전부를 침착으로 이동**(g → d).
- 아니면 `wetness = min(1, wdepth/depthRef)`. 재부유: `dm > 1e-9 && omegaK > 0`이면 `lf = min(0.5, omegaK·wetness)`로 d의 `lf`배를 g로 옮김(장부 `lifted += dm·lf`). 침착: `gm > 0`이면 `glue = min(2, gm + dm + hardMass)`, `thin = 1 − wetness`, `spd = min(1, hypot(ux, uy)/pinSpeedRef)`(ux, uy는 (3)의 **클램프 후 거시 속도**, ρ = 0이어도 0으로 만들기 전의 값), `dep = min(0.9, rhoK·(1 + gran·(1 − h[p]))·(1 + thinBoost·thin) + pin·hf·kbar[i]·(1 + glueGain·glue)·(pinStaticFraction + (1 − pinStaticFraction)·spd))`, `d += g·dep`, `g −= g·dep`.
- 쓰기: core g, d, `velocity = rhoTot > 0 ? (ux, uy) : 0`.

**(10) 경화.** `wdepth ≥ rhoMin`이면 `cure = 0`. 아니면 `dm > 1e-9 && cure ≤ cureLimit`일 때 `cure += 1`; `cure > cureLimit`이 되는 순간 `hard += (1 − rewet)·d`, `d = rewet·d`(r, g, b, mass). ext 12에 cure 저장. 타일 **keep**: 셀 하나라도 (`bNew > 0`) 또는 (`ws + rhoTot + s1 ≥ waterEps` 또는 `gm > 1e-9` 또는 `dm > 1e-9 && cure ≤ cureLimit`)이면 true(가벼운 경로는 `s > 0` 또는 경화 대기). 워크그룹 리덕션 후 `wet_keep[tile]`에 기록.

> 수치 규약: CPU는 중간 계산을 f64로 하고 **f32 저장 지점에서만 반올림**한다(`Float32Array` 쓰기 + `rho1 = fround(Σ)`). GPU는 f32 중간 계산이므로 §9의 허용오차가 필요하다. `pow`는 쓰지 않는다(CPU도 곱셈만). 사칙·`sqrt`·`min/max/clamp`·`exp`(합성)만 쓴다.

### 3.4 `wet_retire` / `wet_expand` (`retireDriedTiles`, `expandActive`)

1. **retire**: 이번 서브스텝에서 처리한 타일 중 `keep = false`인 타일을 활성 목록에서 뺀다(풀 슬롯은 유지: 마른 안료는 d·hard에 남아 있다).
2. **expand**: 남은 활성 타일 각각에 대해, 가장자리 행/열(4면)에 `ws + ρ > WET_EPS(1e-4)`인 셀이 있으면 그 면의 이웃 타일을, 모서리 셀(0, 15, 240, 255번)에 있으면 대각 이웃을 활성화(코어·확장 슬롯 함께 할당, 값 0). 캔버스 밖 타일은 건너뛴다. 새로 활성화된 타일은 **다음 서브스텝부터** 처리된다.
3. dab 스탬프 직후 활성화(`activeTilesAfterDeposit`, CPU는 `StrokeLayer.accumulate`와 `wasm-surface`가 호출): dirty 타일 + 8이웃(1링)의 코어·확장 슬롯 할당. 기존 GPU는 `bin-scan.wgsl.ts`의 습식 슬롯 할당이 이를 미러하므로 **확장 풀 슬롯을 같은 위치에서 함께 할당**하면 된다.

## 4. 유화 (medium = "oil")

CPU: `wet/oil-layer.ts`(상태·밀기·레벨링·건조·합성), `raster/fine-raster.ts` `applyImpastoDabs`(dab 순서 처리). 유화는 **LBM을 쓰지 않는다**: 수채 코어 상태(ws, g, d, f, …)는 건드리지 않고 `H(코어 7)`, ext 17..21만 쓴다. `stepWet`는 유화이면 `stepOil` → `retireDriedTiles`(keep = 레벨링 이동이 남은 타일)이고 `expandActive`는 부르지 않는다.

### 4.1 상태 의미

`V = max(0, H − B)`(물감 부피), `m ≤ V`(젖은 이동 가능 부피), `C = V × 색`(색 = C/V, 선형 반사율). 건조 시 `m`만 줄고 `B`는 `flatten`에서 `H`로 굳는다.

### 4.2 dab 순서 처리 — `applyImpastoDabs` (dab 1개 = 순차 단계, 이전 dab의 결과를 본다)

호스트가 계산해 dab 레코드(또는 uniform)로 올리는 값: `visc = clamp(viscosity, 0, 1)`, `push = oilDepth·(1 − visc)`, `passes = 1 + floor((1 − visc)·2)`, `oilMixing`, `oilPickup`. 기존 `IMPASTO_PUSH` 상수 하나로는 부족하다.

1. **창 경계**: `x0 = max(0, floor(dab.x − extent))`, `x1 = min(W−1, ceil(dab.x + extent))`(y 동일), 전단 여유로 `passes`칸 확장한 창 `[wx0, wx1]×[wy0, wy1]`(캔버스로 클램프). 타일 수가 `MAX_TILES_PER_DAB` 초과면 dab 전체를 건너뛴다.
2. **셀별 입력**(`shadeDabPixel` 미러, 창 안쪽 `x0..x1`만): `cm = cov·mask`, `amount = fround(cm·push)`, `weight = fround(cm)`, `dep = fround(cm·grain·dab.flow·max(IMPASTO_MIN_MASS(0.25), dab.pigmentMass))`. 방향: `lat = clamp((−(x + .5 − dab.x)·s + (y + .5 − dab.y)·c)/max(1e-3, dab.ry), −1, 1)`, `vx = c − OIL_SIDE_GAIN·lat·s`, `vy = s + OIL_SIDE_GAIN·lat·c`, `|vx| ≥ |vy|`이면 x축(부호 vx) 아니면 y축(부호 vy) 한 칸. `c, s = cos/sin(dab.angle)`(`prepareDabShade`의 `prep.c/prep.s`, 호스트에서 계산해도 된다).
3. **밀기 `pushOilWindow` × `passes`회**: 각 pass는 (i) 셀별 이동량 `mv = fround(m·min(1, amount))`(`m > OIL_EPS(1e-6)`이고 목표 칸이 창 안일 때만, 아니면 0), 목표 = 방향 한 칸 (ii) **gather**: 셀 o의 새 값 = 자기 유출 후 잔량 + 4면 이웃 중 목표가 o인 셀의 유입. 유입 색은 이웃의 `C/V`, 자기 색과 `t = q/(q + mixing·(m_자기_잔량 + 이미 도착한 양) + 1e-9)`로 `kmMixRgb`(자기 잔량 + 도착량이 `OIL_EPS` 이하면 도착 색으로 대체). 이웃 순서는 (−1,0), (+1,0), (0,−1), (0,+1). 출력 `H = B + (V_잔량 + 유입)`, `m`, `C = 색·V_new`. **창 전체를 한 번에 읽고 한 번에 쓴다**(pass 사이 동기화·이중 버퍼). `push > 0`일 때만 수행.
4. **붓 색 픽업 `updateOilCarry`**: 붓 색 `carry`(획마다 `newOilCarry`, 첫 dab에서 dab 색으로 로드). 창 전체 `weight`로 `mu = Σ w·m`, `Σ w·m·C/V`(젖은 부피가 `OIL_EPS` 초과인 셀만)를 **리덕션**해 `wMix = pickup·mu/(mu + depTotal + 1e-9)`로 `kmMixRgb(carry, 평균색, wMix)`, 이어서 `kmMixRgb(c, dabColor, OIL_RELOAD(0.03))`. `depTotal = Σ dep`. 리덕션 합산 순서가 결과에 영향하므로 [제안] 고정 순서 트리 리덕션 + f32 허용오차(§9). `carry`는 GPU 상태(획 동안 유지)다(기존 `smudge_carry` 레코드와 같은 방식).
5. **침착 `depositOilWindow`**: `dep > 0`인 셀에서 아래 젖은 물감이 있으면(`V0 > eps && m0 > eps`) `t = dV/(dV + mixing·m0 + 1e-9)`로 기존 색과 새 색을 `kmMixRgb`, 아니면 새 색 그대로. `H += dV`, `m += dV`, `C = 색·(V0 + dV)`.
6. **쓰기 `storeOilWindow`**: 창 셀을 풀에 되쓴다. 셀 하나라도 `H ≠ 0 || B ≠ 0`이면 그 타일을 할당하고 `oilTiles`에 올린다(순서 무관). GPU는 dab 창이 덮는 타일을 미리 할당해 두어도 동치다(빈 타일은 아무 영향이 없다).

`dab.impasto`인 dab는 타일 래스터(`rasterizeTile`)에서 **건너뛴다**(§6). dab 순서 의존성 때문에 dab 1개 = 1회 디스패치 묶음(기존 `impasto_move`/`impasto_apply` 구조)이 자연스럽다.

### 4.3 서브스텝 `stepOil` (레벨링 + 건조)

- **레벨링**(활성 타일, 이전 상태 스냅샷에서 gather): `rate = OIL_LEVEL_RATE(0.12)·(1 − viscosity)·(hMs/(1000/60))`, `yieldH = oilYield·OIL_YIELD_SCALE(1.2)`. 4면(순서 W, E, N, S) 이웃이 유효할 때(활성 타일 안·캔버스 안): 유출 `dOut = H − Hn − yieldH`, `dOut > 0 && m > eps`이면 `out += min(rate·dOut, 0.25·m)`; 유입 `dIn = Hn − H − yieldH`, `dIn > 0 && mn > eps`이면 `fl = min(rate·dIn, 0.25·mn)`, 색 `C_n/max(Vn, eps)`을 `fl` 가중으로 합산. 새 값: `H = H − out + inV`, `m = m − out + inV`, `C = C − out·(C/V) + inC`. 이동량 합 `moved > 1e-5`인 타일만 keep.
- **건조**(**모든 `oilTiles`**, 활성 여부 무관): `decay = 1 − min(1, hMs/max(1, dryingMs))`, `m > 0`이면 `m·decay < OIL_EPS ? 0 : fround(m·decay)`.
- 유화 프리셋은 `substeps = 1`.

## 5. 표시 합성·평탄화

### 5.1 지속 레이어 계약 [계약, 기존 GPU 동작에서 바뀜]

CPU `Surface`: **`endStroke`는 습식 층을 문서에 굽지 않는다.** 획 끝에서는 (a) 스트로크 레이어를 문서에 합성(`compositeTile`, 습식 획은 `wetOnly`라 획 레이어가 비어 있다), (b) 습식을 `settleWet`(활성 타일 0 또는 상한 프레임)까지 전진만 한다. 습식 층은 문서와 별개로 남아 다음 같은 매체 획과 상호작용한다(재습윤·백런·젖은 물감 밀기). **GPU의 기존 `endStroke`(`bake_stroke` → `bake_wet` → `composite_all`)는 이 계약을 어긴다.** 새 순서:

```
endStroke: bake_stroke(문서 ← 획 레이어) → (습식이면) settle 루프 → composite_all(표시 합성) → 영수증
beginStroke: 이전 습식 층 종류와 이번 획 종류가 다르면 flatten_wet 먼저 (종류: 수채 계열 "water", 유화 "oil", 건식 null)
flatten_wet(= Surface.flattenWet): 수채 층이 있으면 settle(최대 240프레임) → bake_wet; 유화 층이 있으면 flatten_oil
```

표시 문서: `displayDocument()` = `document` 복사 → `composite_wet`(수채 층이 있을 때) → `composite_oil`(유화 층이 있을 때) → (`hasHeight`이면) 릴리프 조명. 표시 시점 조합이므로 문서 버퍼는 읽기 전용으로 두고 present 입력용 별도 버퍼(또는 composite_all 출력)에 쓴다 [제안]. `Surface.waterLayer/oilLayer/hasHeight`는 호스트 플래그(Params `wet_enabled`, `has_height`와 같은 방식).

### 5.2 `composite_wet` (`compositeWaterLayer`, `bakeWet`은 같은 식 + 층 비우기)

풀의 **모든 할당 타일**(활성 여부 무관) 셀마다: `mass = g.mass + d.mass + hard.mass`, `mass ≤ 0`이면 건너뜀. 색 `(g.rgb + d.rgb + hard.rgb)/mass`. `alpha = fround(1 − exp(−mass·BAKE_MASS_TO_ALPHA))`. `km`(= 마지막 습식 획의 `colorDynamics.kmMixing`, `wet.render.km`)이고 바탕 `da > 0`이면 바탕 색 `doc.rgb/da`와 `kmMixRgb(바탕색, 안료색, alpha)`로 색을 만든다. 합성: `doc.rgb = c·alpha + doc.rgb·(1 − alpha)`, `doc.a = alpha + da·(1 − alpha)`(선형 premultiplied). `bake_wet`은 같은 계산 후 g, d, hard 12채널을 0으로 만든다(**`hard`(ext 13..16) 포함** — 기존 `bake_wet`은 12채널만 알았다).

### 5.3 `composite_oil` / `flatten_oil` (`compositeOilLayer`, `flattenOil`)

`oilTiles`의 셀마다: `V = max(0, H − B)`, `V ≤ OIL_EPS`이면 건너뜀. `alpha = fround(OIL_OPACITY_K·V/(1 + OIL_OPACITY_K·V))`(K = 4), 색 = `C/V`, `doc.rgb = 색·alpha + doc.rgb·(1 − alpha)`, `doc.a = alpha + doc.a·(1 − alpha)`. `flatten_oil`은 이어서 `B = H`, `m = 0`, `C = 0`(높이는 남아 릴리프 조명이 계속 적용된다).

### 5.4 릴리프 조명

변경 없음: `reference-renderer.ts` `displayDocument` 후반(`impastoLighting`, `impastoSpecular`, `impastoSpecularFlat`, `IMPASTO_LIGHT = [-0.5,-0.5,1]`, `IMPASTO_RELIEF_GAIN`, `IMPASTO_SPECULAR`)과 `common.wgsl`의 `impasto_factor`/`impasto_specular`. 입력 높이는 코어 ch 7(H). **합성 순서가 바뀌었다**: 이제 조명은 수채 층·유화 층이 문서에 합성된 **뒤**에 곱해진다(`alpha`로 가중되는 하이라이트 항이 합성 결과의 alpha를 쓴다).

## 6. 스탬프(래스터) 계약 변경 — `rasterizeTile` (`raster/fine-raster.ts`)

[계약] 기존 GPU `raster_tile`과 달라지는 3가지:

1. **`wetOnly`**: `dab.deposition === "wet-flow"`이고 습식 상태(`wet_enabled`)가 있으면 **획 레이어에 아무것도 쓰지 않는다.** 색은 습식 층의 안료 질량이 들고 있다. 습식 상태가 없으면(= `wetView == null`) 종전처럼 획 레이어에 쓴다. (CPU wasm 표면은 이미 이 동작을 미러한다.)
2. **안료 질량에 그레인 응답**: `mass = fround(dab.pigmentMass·cov·m·grainResp)`(m = 팁 마스크, grainResp = `shade.grain`). 물은 `water += dab.wet·cov`로 **그대로**(m·grainResp 없음). 색 채널은 `pr·mass`(비곱셈 색 = `dab.rgb/dab.a`).
3. **임파스토**: `dab.impasto`이면 타일 래스터에서 `continue`(획 레이어에 색을 쓰지 않음). 색·부피는 §4.2가 처리한다. 타일 래스터의 `wetFactor`(`1 − 0.6·wet`)는 `wet-flow`에서만 적용(획 레이어를 쓰는 경우에만 의미).

## 7. 파라미터

### 7.1 `WET_PHYSICS` 상수(`wet/params.ts`, WGSL `const`로 템플릿 삽입)

```
lbmTau 1, uMax 0.2, rhoFull 0.02, rhoMin 0.002, waterEps 1e-4, surfaceCap 1.2, nominalStepMs 4.1666667,
kappaMax 0.985, fiberLengthPx 9, fiberWidthPx 1.3,
wetBlurKeepWet 0.985, wetBlurKeepDry 0.9, wetBlurFull 0.05, wetBlurWake 0.01,
edgeDriftScale 1, edgeFlowScale 0.06, edgeBoostScale 2, heightFlowScale 0.05, gravityScale 0.01, accelMax 0.05,
pigmentDiffusionScale 0.06, faceOutMax 0.125, diagOutMax 0.05, thinBoost 1.5, depthRef 0.15,
dryBrushDepth 0.4, pinSpeedRef 0.05, pinStaticFraction 0.25, grainDriftScale 1.5, granulationGain 1.2,
cureFraction 2/3, capacityBase 0.4, capacitySpan 0.6
```

유화 상수(`oil-layer.ts`): `OIL_OPACITY_K 4`, `OIL_YIELD_SCALE 1.2`, `OIL_LEVEL_RATE 0.12`, `OIL_SIDE_GAIN 0.6`, `OIL_RELOAD 0.03`, `OIL_EPS 1e-6`; `IMPASTO_MIN_MASS 0.25`(`fine-raster.ts`), `BAKE_MASS_TO_ALPHA 3`.

### 7.2 서브스텝 상수 `WaterKernel` — 호스트 계산, uniform 업로드 [계약: 값]

`makeWaterKernel(params, hMs)`(`wet/step-water.ts`, **이번에 export했다**; 이전 이름 `makeKernel`은 비공개였다)이 단일 원천이다. 필드 33개(모두 f32로 전달, `cureLimit`은 정수값): `surfTension, alpha, beta, capScale, dc, thetaC, kc, es, ef, ec, dryTail, edgeBoost, etaEdge, khFlow, gAx, gAy, dp, invGref, grainDrift, edgeDrift, lambda, rhoK, omegaK, pin, gran, glueGain, dryBrush, rewet, cureLimit, sWake, hf, omegaLbm, tau`. 이 중 `hf = hMs/nominalStepMs`, `cureLimit = max(1, round(cureFraction·dryingMs/hMs))`. 섬유 파라미터는 별도로: `(κ∥, κ⊥) = fiberLinkBlocking(fiberBlocking, fiberAnisotropy)`, `fiberRoughness`, `spec.seed`, `fiberBlocking`(= 평탄 경로 κ와 `invGref`의 k0).

현재 `Params`의 `wet_diffusion`·`wet_evaporation`·`wet_capillary`·`wet_edge_darkening`·`wet_granulation`·`wet_absorptivity`·`wet_drying_ms`·`wet_viscosity`·`substep_dt_ms`는 위 `WaterKernel`로 대체된다. 별도 uniform 블록(`wet_kernel`, 16 B 정렬 f32 배열) [제안]을 두면 `PARAMS_SCALARS` 변경이 필요 없다.

### 7.3 매체 프리셋 값(`wetMediumPreset`, `wet/params.ts`)

| 파라미터 | watercolor | sumi | gouache | oil |
| --- | --- | --- | --- | --- |
| diffusion | 0.25 | 0.4 | 0.05 | 0 |
| evaporation (/ms) | 0.0007 | 0.00096 | 0.00096 | 0 |
| capillary | 0.05 | 0.12 | 0.04 | 0 |
| edgeDarkening | 1 | 1 | 0.15 | 0 |
| granulation | 0.5 | 0.17 | 0 | 0 |
| viscosity | 0.1 | 0.1 | 0.1 | 0.6 |
| surfaceTension | 0.2 | 0.3 | 0.4 | 0.2 |
| dryingMs | 3000 | 1500 | 2250 | 20000 |
| substeps | 2 | 2 | 2 | 1 |
| fiberBlocking (k0) | 0.35 | 0.55 | 0.4 | — |
| fiberAnisotropy | 0.3 | 0.7 | 0.2 | — |
| fiberRoughness | 0.25 | 0.65 | 0.15 | — |
| seepSplit β | 0.4 | 0.3 | 0.3 | — |
| capillaryDiffusion | 0.05 | 0.2 | 0.02 | — |
| wetThreshold θc | 0.6 | 0.15 | 0.7 | — |
| capillaryForce kc | 0.02 | 0.03 | 0.01 | — |
| evapFlowRatio / evapCapillaryRatio | 0.667 / 0.333 | 0.75 / 0.25 | 0.75 / 0.25 | — |
| depositRate ρk | 0.05 | 0.004 | 0.12 | — |
| liftRate ωk | 0.05 | 0.005 | 0.01 | — |
| pigmentMobility λ | 0.85 | 0.7 | 0.9 | — |
| pinning | 0.04 | 0.015 | 0.05 | — |
| rewet | 0.5 | 0 | 0.05 | — |
| glueGain | 0 | 1.2 | 0 | — |
| dryBrush | 0 | 0.3 | 0.1 | — |
| oilYield / oilPickup / oilMixing / oilGloss / oilDepth | — | — | — | 0.25 / 0.3 / 0.6 / 0.6 / 0.5 |

프리셋 오버라이드(`presets/catalog.ts`): `watercolor-wet` = watercolor + `diffusion 0.35`, `depositRate 0.04`; `watercolor-dry` = watercolor + `diffusion 0.1, evaporation 0.0012, capillary 0.1, edgeDarkening 0.5, granulation 0.7, dryingMs 1500, dryBrush 0.6`; `sumi-ink-wet`(family `"sumi"`, 신설) = sumi 그대로; `gouache` = gouache 그대로; `oil-impasto` = oil + `oilYield 0.15`. 값의 단일 원천은 `wetMediumPreset(medium, overrides)`다.

## 8. CPU 대응 함수 표

| GPU 커널/함수(제안명) | CPU 대응 | 파일 |
| --- | --- | --- |
| `wet_snapshot`, `snap_read` | `buildPaddedSnapshots`, `fillRegion` | `wet/padded.ts` |
| `wet_edge_delta` | `computeEdgeDelta` | `wet/padded.ts` |
| `wet_step_water` (0)~(10) | `stepTile`(+`makeWaterKernel`) | `wet/step-water.ts` |
| `paper_wet_build` / 인라인 종이 | `buildTilePaper`, `fiberLinkBlocking`, `fiberConductanceRatio`, `samplePaper` | `wet/paper-wet.ts`, `texture/paper-grain.ts` |
| `det_sin`, `det_cos` | `detSin`, `detCos` | `wet/det-math.ts` |
| `value_noise_2d`(기존) | `valueNoise2D` | `core/rng.ts` |
| `lbm_equilibrium`(함수) | `lbmEquilibrium`, `lbmMoments` | `wet/lbm-d2q9.ts` |
| `wet_retire`, `wet_expand` | `retireDriedTiles`, `expandActive`, `activeTilesAfterDeposit` | `wet/step-dry.ts`, `wet/active-tiles.ts` |
| 프레임 루프 | `stepWet`, `Surface.settleWet` | `wet/wet-reference.ts`, `raster/reference-renderer.ts` |
| `oil_shade` | `applyImpastoDabs`(셀 입력부), `shadeDabPixel` | `raster/fine-raster.ts` |
| `oil_push`(× passes) | `pushOilWindow` | `wet/oil-layer.ts` |
| `oil_carry` | `updateOilCarry` | `wet/oil-layer.ts` |
| `oil_deposit` | `depositOilWindow` | `wet/oil-layer.ts` |
| `oil_store` / 타일 할당 | `loadOilWindow`, `storeOilWindow` | `wet/oil-layer.ts` |
| `oil_level_dry` | `stepOil` | `wet/oil-layer.ts` |
| `composite_wet`, `bake_wet` | `compositeWaterLayer`, `bakeWet` | `wet/layer-composite.ts` |
| `composite_oil`, `flatten_oil` | `compositeOilLayer`, `flattenOil` | `wet/oil-layer.ts` |
| 릴리프 조명 | `impastoLighting`, `impastoSpecular`, `Surface.displayDocument` | `wet/impasto.ts`, `raster/reference-renderer.ts` |
| `raster_tile` 습식 쓰기 | `rasterizeTile`(`wetOnly`, `grainResp`) | `raster/fine-raster.ts` |
| `km_mix`(기존) | `kmMixRgb` | `pigment/kubelka-munk.ts` |

새로 export된 이름(barrel `engine/index.ts`에 포함): `makeWaterKernel`, `WaterKernel`(step-water), `PCH`, `PAD_CHANNELS`, `buildPaddedSnapshots`, `computeEdgeDelta`(padded), `fiberLinkBlocking`, `fiberConductanceRatio`, `buildTilePaper`, `FIBER_ANGLE_POWER`(paper-wet), `detSin`, `detCos`(det-math), `lbm*`(lbm-d2q9), `compositeWaterLayer`, `bakeWet`(layer-composite), `stepOil`, `compositeOilLayer`, `flattenOil` 외(oil-layer), `WET_EXT_CH`, `WET_EXT_CHANNELS`(state). 제거: `./wet/step-pigment`(삭제됨).

## 9. 패리티

### 9.1 허용오차 [제안, 미측정]

설계 §3 기준(f16 저장 `max|Δ| ≤ 2e-3`, 8비트 합성 `≤ 1/255`(p99), 지표 `≤ 0.5%`)을 상속하되, 이 명세는 **f32 저장**을 전제로 더 엄격한 값을 제안한다. CPU는 f64 중간 계산이라 GPU(f32)와 단일 스텝에서도 1e-7 상대 오차가 있다.

| 항목 | 허용오차 |
| --- | --- |
| 단일 서브스텝(같은 f32 상태에서 시작): ws, ρ, s, g, d, B, f_q | `max|Δ| ≤ 1e-5`(절대; 값 범위 0..~1) |
| 문턱 분기(`max(s0,sN) > θc·cbar`, `wetFlag`, `wd > rhoMin`) 뒤집힘 | 한 스텝 셀의 0.1 % 이내, 영향은 위 오차 안 |
| 60프레임(120 서브스텝) 궤적, f32 저장 | `max|Δ| ≤ 5e-4`, 상대 L2 `≤ 1e-3`(f16 저장이면 `≤ 2e-3`) |
| 질량 장부(물·안료, 증발 분리) | 상대 `≤ 1e-4`(f16 `≤ 5e-4`) — CPU 참조 장부는 `1e-5` 이내(`wet-physics.test.ts`) |
| 대칭 입력(좌우·상하 미러) | CPU는 **비트 동일**, GPU `≤ 1e-3`(설계 §3) |
| 종이 파생 κ, h, absorb, capBase(`paper_wet`) | `max|Δ| ≤ 2e-6`(f32 저장 vs CPU f32 저장; 같은 알고리즘이면 비트 동일 가능) |
| 유화 한 dab(밀기·침착·붓 색 carry·레벨링) | H, m, C `max|Δ| ≤ 2e-6`; 붓 색 carry는 리덕션 순서 때문에 `≤ 1e-5` |
| 유화 부피 보존(`ΣH`) | 상대 `≤ 1e-5`(설계 §3 `oil-volume`) |
| 8비트 합성(sRGB RGBA8) | `|Δ| ≤ 1/255` p99, `≤ 3/255` 최대 |
| 지표(§9.3) | 상대 `≤ 0.5 %` |
| 같은 장치·드라이버 반복 | **비트 동일**(gather 전용·원자 없음·합산 순서 고정) |

### 9.2 시험 시나리오 (CPU 장면 재사용)

`engine/testing/wet-scenes.ts`가 결정적 장면을 만든다: `newScene`, `depositDisc`, `fillWaterFilm`, `stepFrames`, `runUntilDry`, `captureSeries`, `runEdgeScene`, `runFilmDiffusionScene`, `runBackrunScene`, `runGranulationScene`, `uniformFiberPaper`(상수: `SCENE_SIZE 128`, `FILM_SCENE_SIZE 64`, `SCENE_FRAME_MS = 1000/60`). 같은 입력(상태 초기값을 `wet_pool`/`wet_ext_pool`에 업로드)을 GPU에 넣고 프레임별 읽기 → `bench/metrics/family-metrics.ts`의 순수 함수로 비교:

1. 단일 서브스텝 상태 비교(§9.1 첫 행): 장면별 시작 상태를 CPU가 JSON 픽스처로 내보내고 GPU가 1스텝 후 읽어 비교.
2. 시간축 지표: `diffusionRadiusSlopeOf`, `fiberAnisotropyRatioOf`, `edgeDarkeningRatioOfField`, `granulationContrastOfField`, `backrunBoundaryRatioOf`, 임계값 `WET_TIME_TARGETS`(§9.3).
3. 질량 보존·대칭·결정성(2회 실행 해시 동일), 활성 타일 수면(sleep) 후 비활성 확인.
4. 유화: 점도별 밀기 거리 단조, 부피 보존, KM 혼색, 시임(타일 경계) 회귀(`oil-layer.test.ts`).
5. 프리셋 픽셀 해시: GPU 해시는 CPU와 달라도 된다. CPU 해시와의 차이를 `≤ 1/255`(p99)로 본다.

### 9.3 기준값 (CPU 참조, 2026-10-02 실측)

**프리셋 픽셀 해시**(fnv1a64, sRGB RGBA8, `zigzagStroke(size, {durationMs: 600})`, seed 1, 빈 문서; `raster/wet-presets.snapshot.test.ts`, `raster/surface.test.ts`):

| 프리셋 | 크기 | 새 해시 | 이전(HEAD) |
| --- | --- | --- | --- |
| watercolor-wet | 256² | `e2eeedfaad6bccd9` | `9ad1211d759334e5` |
| watercolor-wet | 512² | `21d19d4a9bb0d714` | `45b7061a83d36c41` |
| watercolor-dry | 256² | `b6d335e0fe02b6c1` | (스냅샷 없음) |
| sumi-ink-wet | 256² | `24da89b5d863913d` | (신설 프리셋) |
| gouache | 256² | `70fcf8e9c1dedaec` | (스냅샷 없음) |
| oil-impasto | 256² | `1d1437eb6d4ebc42` | `1dcf7d4244c5b6a8` |
| oil-impasto | 512² | `b4f8ae7943dbd81f` | `75860a06df6f470d` |

**비습식 프리셋은 변하지 않았다**: ink-g-pen 256² `3e66c6a4278fa07a`/512² `03435916d2ffa584`, pencil-hb `0de059d99a399575`/`eb724959d583f0b2`, marker-alcohol `c7a58dfe8d0e9d04`/`d1f86555b1222d52`, airbrush `73cb000b3ed8e29e`/`bb52144130033daf`.

**시간축 지표 실측 / 임계(설계 §4, 완화하지 않음)**:

| 지표 | 장면 | 실측 | 임계 |
| --- | --- | --- | --- |
| 에지 다크닝 비 | 수채 | 1.586 | 1.3–1.8 |
| | 수묵 | 1.242 | 1.1–1.4 |
| | 구아슈 | 0.906 | ≤ 1.1 |
| 그래뉼레이션 대비 | 수채 granulation 0.5 | 0.214 | 0.15–0.35 |
| | granulation 0 | 0.006 | ≤ 0.05 |
| | 구아슈 | 0.001 | ≤ 0.05 |
| 확산 반경–시간 log-log 기울기 | 수채 θ=0 / π/2 | 0.504 / 0.500 | 0.45–0.55 |
| | 수묵 θ=0 / π/2 | 0.505 / 0.491 | 0.45–0.55 |
| 섬유 이방비 `1 − R⊥/R∥` | 수채(0.3) θ=0 / π/2 | 0.283 / 0.299 | aniso ±10 % |
| | 수묵(0.7) θ=0 / π/2 | 0.674 / 0.705 | aniso ±10 % |
| | 수묵 거칠기 0 | 0.7000 | 닫힌 형식 정확 |
| 백런 경계 비 | 수채(재습윤) | 1.426 | ≥ 1.25 |
| | 수묵 / 구아슈 | 0.998 / 1.004 | (고정되어 링 없음, 판정은 반대) |

참고: 섬유 이방비의 이산화 한계는 aniso ≈ 0.757이다(그 이상은 반경 비가 포화). 섬유가 격자 대각이면 이방비가 약해진다(`wet/paper-wet.test.ts` 참조).

## 10. 결정성·정밀도 지침

1. **gather 전용, 원자 없음**: 모든 쓰기는 자기 셀. 이웃 읽기는 스냅샷. 활성 타일 처리 순서가 결과에 영향을 주면 안 된다(CPU `tileOrder: "descending"` 테스트가 보장).
2. **합산 순서 고정**: `q = 1..8`, 유화 이웃 `(−1,0), (+1,0), (0,−1), (0,+1)`, 리덕션은 고정 트리.
3. **`pow` 금지**(섬유 `|cos|⁶`, `OIL_*` 모두 곱셈). `Math.hypot` → `length(vec2)`. `exp`는 합성에서만(`1 − exp(−3·mass)`).
4. **`sin/cos` 금지** → `det_sin/det_cos`(§2.4). 종이 회전 `rotationRad`의 `cos/sin`은 `samplePaper`가 `Math.cos/sin`을 쓰므로 호스트가 계산해 uniform으로 넘기면 비트 일치한다(`paper_rotation`이 이미 Params에 있다).
5. **fma 계약**: WGSL 구현은 곱셈-덧셈을 fma로 합칠 수 있다. 문턱 비교가 있는 식(`max(s0,sN) > θc·cbar`, `ws > surfaceCap`)은 이웃 두 셀이 같은 식을 써서 판정이 대칭이 되도록 한다.
6. **f32 저장 지점**: CPU `fround`가 있는 곳(`rho1`, 유화 `mv`/`amount`/`dep`/`weight`, 합성 `alpha`)은 GPU에서도 같은 위치에서 f32가 되도록 변수를 f32로 둔다(f16로 내리지 않는다). f16 압축은 f32 패리티가 확보된 뒤 `f0..f8`에만 시도하고 `mass-conservation` 시험을 다시 통과해야 한다(설계 §5 폴백: 실패 시 `lbm`만 f32 승격).
7. **`cure`는 정수 카운터를 f32에 저장**한다(2²⁴까지 정확).

## 11. 미결정·위험

- **지속 레이어 전환**(§5.1)은 GPU `endStroke` 흐름과 `bake_wet`/`composite_all` 호출 순서, 영수증(`wet_live_count` readback) 규약에 영향이 크다. 가장 먼저 합의해야 한다.
- **스토리지 바인딩 8개 한도**(§2.6): group 3 신설 + 습식 전용 레이아웃이 전제다.
- **종이 `paper_wet` f32 버퍼**: 기존 8비트 `paperTex`로는 κ 필드 패리티가 불가능하다.
- **유화 창 스크래치 크기**(최대 64 MiB)와 dab 1개 = 디스패치 묶음의 비용. 큰 브러시에서 병목일 수 있다(`MAX_TILES_PER_DAB` 초과 dab는 CPU처럼 건너뜀).
- **브라우저 미검증**: 이 문서의 어떤 GPU 커널도 실제 WebGPU에서 실행해 보지 못했다. 허용오차 표는 제안값이며 첫 패리티 측정 후 조정이 필요할 수 있다(단, 설계 §4 지표 임계는 완화하지 않는다).
- `glue`(ext 11)는 현재 CPU가 읽지 않는 예약 채널이다. GPU가 쓰지 않아도 패리티에 영향이 없다.

## 12. GPU 구현 결과·편차 (2026-10-02, engine-gpu)

이 명세를 WebGPU compute로 구현했고(1·2차 분할 없이 한 번에) SwiftShader(소프트웨어 렌더러)에서 CPU 참조와 대조했다. 실 GPU(`softwareRenderer: false`)·성능은 검증하지 못했다. 측정 명령은 README `scripts/browser-probe.mjs` 예시(`--wet-scenes`·`--wet-preset-scenes`·`--stroke-state`·`--sequences`·`--synthetic`·`--limits-check`)다.

### 12.1 구현 위치

- WGSL(`engine/gpu/wgsl/`): `wet-common`(머리말·종이 파생·표시 합성)·`wet-water`(`wet_snapshot`·`wet_edge_delta`·`wet_step_water`·`wet_expand`·`wet_commit`·`wet_settle_check`)·`wet-oil`(`oil_*`)·`wet-composite`(`composite_*`·`bake_wet`·`flatten_oil`)·`bake-stroke`. 래스터는 `fine-raster`(§6 계약 3건 적용).
- 호스트: `layout.ts`(채널·바인딩·버퍼 크기 단일 원천)·`wet-kernel.ts`(§7.2 상수 호스트 계산)·`wet-bindings.ts`(가족별 레이아웃, group 3)·`pipeline-compute.ts`(프레임 인코딩·정착 루프·평탄화·`endStroke`).

### 12.2 명세 대비 구현 선택(편차)

1. `wet_retire`는 별도 커널이 아니다: `wet_step_water`가 유지 플래그를 `wet_live_next`에 쓰고, `wet_expand`가 경계 셀 물로 이웃을 활성화(CAS 슬롯 할당·슬롯 번호는 결과에 영향 없음), `wet_commit`이 live ← live_next 확정과 활성 목록 압축(단일 워크그룹 스캔)·간접 인자 기록을 한다.
2. 종이 파생 필드(h·absorb·capBase·κ)는 버퍼에 저장하지 않고 타일마다 공유 메모리 18×18 배열로 전역 셀 좌표에서 즉석 계산한다(`det_sin/det_cos`). 저장 버퍼는 f32 원본 `paper_wet`(256²×3)뿐이다.
3. 유화: dab 창(AABB ± passes) 스크래치 16 f32/셀 + 헤더 16 f32, 읽기·쓰기 두 벌(핑퐁), dab 레코드 256 B 동적 uniform 2개/dab(`MAX_OIL_DABS_PER_FRAME` 4096), 창 셀 상한 1,114,112(≈ 71 MB; 초과·dab 상한 초과는 `StrokeBudgetExceededError`).
4. 정착: 프레임 16개 청크(상한 수채 240·유화 48프레임), 프레임 끝 `wet_settle_check`, 청크마다 헤더 readback 1회. 평탄화(`flattenWet`)는 매체 종류가 바뀌는 `beginStroke`에서만 큐에 넣고 기다리지 않는다.
5. 요구 한도: `maxBindGroups ≥ 4`, `maxComputeWorkgroupStorageSize ≥ 16 KiB`(기본 한도). 확장 풀 23채널의 storage 바인딩 크기가 기본 128 MiB를 넘는 구성은 레인이 어댑터 한도 범위에서 `requiredLimits`로 요청하고(`requiredBufferLimits`), 예산은 장치가 실제로 받은 한도로 검증한다. 기본 습식 풀 용량은 512 → **2048타일**로 올렸다(512² 캔버스의 유화 한 획이 528타일을 써서 512로는 모자랐다).
6. `wasm-gpu-hybrid`는 `scan_add`가 `wet_live`·`wet_live_next`를 세워 같은 습식 파이프라인을 쓴다. `readbackLinear`는 `composite_linear`로 GPU 표시 합성을 그대로 적용한다.

### 12.3 실측(SwiftShader, CPU 참조 대비) — §9.1 허용오차 표와의 대조

| 항목 | 허용오차(제안) | 실측 |
| --- | --- | --- |
| 단일 서브스텝(장면 10종) | max\|Δ\| ≤ 1e-5 | ≤ 2.4e-7 |
| 20·60프레임 궤적 | max\|Δ\| ≤ 5e-4, 상대 L2 ≤ 1e-3 | max\|Δ\| ≤ 1.4e-6, 상대 L2 ≤ 2e-5 |
| 질량 장부(물·안료) | 상대 ≤ 1e-4 | ≤ 1.3e-6(장면), ≤ 4.4e-7(획 도중) |
| 활성 타일 집합 | — | 불일치 0 |
| 유화 한 dab(H·m·C) | ≤ 2e-6 | 6e-8(1 dab), 189 dab 뒤 2.2e-6 |
| 획 도중 상태(128² 나선) | — | 수채 건조 6.2e-7·구아슈 1.8e-5·수묵 9.6e-5(1셀)·수채 속도장 1셀 0.17(문턱 분기) |
| 8비트 합성 | \|Δ\| ≤ 1/255 p99, ≤ 3/255 최대 | 카탈로그 93건 최대 1/255(1024² 수묵 최대 3/255), ΔE p99 0 |
| 프리셋 픽셀 해시 | CPU와 ≤ 1/255(p99) | 93건 중 87건 동일, 나머지 1/255 이내 |
| 같은 장치 반복 | 비트 동일 | 93/93 해시 동일 |

§9.3 기준값: 합성 지그재그 256²(습식 5종)·512²(수채·유화) CPU 해시가 위 표와 일치했고(2026-10-02 프로브), GPU는 δ48 0%·ΔE p99 0이다.

### 12.4 측정이 드러낸 래스터 미러 어긋남 2건(수정함)

- **8비트 종이 텍스처**: 래스터·유화 그레인 `1 − grain·(1 − bump)`가 8비트 `paperTex`(요철 양자화 ≤ 1/510 + 하드웨어 쌍선형 가중치)를 읽어 단일 dab 유화 높이가 CPU와 8e-4 어긋났다. f32 `rgba32float` + `textureLoad` 4탭 직접 보간(`paper_sample_spec`)으로 바꿨다.
- **내장 `sin/cos` 정밀도**: WebGPU는 내장 `sin/cos`의 절대 오차 2^-11을 허용한다. dab 각도 회전(`normalized_distance`·팁 마스크 좌표)과 종이 회전이 이를 써서 SwiftShader에서 각도 0.3의 커버리지가 4.2e-4 어긋났고, 수묵·구아슈 획에서 문턱 분기를 뒤집어 상태가 셀당 최대 0.13까지 갈라졌다. `rot_cs`(`det_sin/det_cos`, 각도 0은 정확히 (1, 0))로 바꿔 단일 dab 24개 스윕이 전부 ≤ 9e-7이다.
- 효과: 카탈로그 93건 ΔE p99 최대 0.69 → 0, 유화 189 dab 상태 5.3e-3 → 2.2e-6.

### 12.5 남은 위험

- 실 GPU: `exp`·`pow`·`log2`의 구현별 정밀도(WebGPU 허용: 수 ULP)와 f32 합산 순서, 타이밍·`maxComputeWorkgroupStorageSize` 사용량(물 스텝 공유 메모리 ≈ 9 KB)은 SwiftShader에서만 확인했다.
- 문턱 분기(방향 선택·경화·핀닝·`wd > rhoMin`)는 f32/f64 차이로 드물게 뒤집힌다(수채 126 dab 획 꼬리 프레임의 속도장 1셀).
- 습식 풀 용량(기본 2048타일)을 넘는 대형 캔버스는 `LaneInit.wetCapacityTiles`로 올려야 하며, 그래도 장치 한도를 넘으면 init이 `StrokeBudgetExceededError`로 실패한다.
