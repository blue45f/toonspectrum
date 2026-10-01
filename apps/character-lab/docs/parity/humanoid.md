# character-lab 패리티 — humanoid 영역(절차 파라메트릭 휴머노이드·ParamPanel)

상태: **current** (2026-10-01, humanoid 작업자 작성). core가 `docs/shaper-parity-checklist.md`로 집계하기 전의 단일 소스이며 열 구조는 체크리스트와 같다.
모든 로직은 순수 TS(`src/domains/humanoid/**`)이고 `@babylonjs/*`·DOM·난수(`Math.random`)를 쓰지 않으므로 Node vitest로 검증했다.
이 컨테이너에는 GPU가 없어 실제 렌더에서의 모습(셰이딩·GPU 스키닝·morph 텍스처)은 '브라우저 검증' 열에 **미검증**으로 둔다.
형상 점검용으로 삼각형 래스터 스크래치(전면·측면·후면·입 단면 PNG)를 직접 만들어 눈으로 확인했고(저장하지 않음), 그 결과가 아래 §2 "입" 행과 §6의 수정 내역에 반영돼 있다.

- 소유 파일: `src/domains/humanoid/**`(소스 22 + 테스트 12 + fixture 1), `src/app/shell/panels/ParamPanel.tsx`(+`.test.tsx`),
  `src/app/humanoid-outfit.integration.test.ts`(humanoid × outfit × 플래너 × 물리 결합 검증), 이 문서.
- 열 의미: **구현 상태** 구현됨/부분/미구현 · **Node 검증** vitest 파일 · **브라우저 검증** 미검증 또는 `YYYY-MM-DD·기기·backend` · **비고** 베타·사유.

## 1. 조립·소비 규약(core·render·outfit가 알아야 할 것)

1. **파라미터 0 기준 + morph**. `buildHumanoidModel(recipe, { subdivisionLevels: 0|1|2, seed, outfit })`는 체형·얼굴 파라미터 값을 굽지 않는다.
   현재 값은 적용 플랜(`paramToMorphWeights`)이 morph 가중치(`param:<키>:+|-`, 표정은 `facs:*`)로 넣는다 → 슬라이더 드래그는 소스 재생성 없이 즉시 반영된다.
   결과는 `recipe.slots`의 **지오메트리 슬롯 7개**(`GEOMETRY_SLOT_KINDS`: eyes·irises·hair·top·bottom·shoes·accessory)와 세분 단계에만 의존한다.
2. **소스 재생성 키 `geometryKeyOf(recipe)`**. 위 7개 슬롯 id만 모은 문자열이다. core가 apply-loop의 절차 소스 키에 포함해 헤어·의상·눈 슬롯 변경 = 소스 재생성,
   그 밖의 슬롯·파라미터·색 = 플랜만 하도록 이미 반영했다(체크리스트 §12).
3. **partId = `PART_ROLES` 인덱스 + 1(역할 고정), materialId = 인덱스**. `state/apply-plan.ts`의 기본 레이아웃(`DEFAULT_PART_LAYOUT`)과 같은 규칙이다.
   슬롯이 비어 파츠가 없는 역할(예: 대머리 → hair 없음)이 있어도 나머지 partId가 밀리지 않는다. 그래서 `partIdPalette`는 **희소(sparse)** 할 수 있다
   (모든 역할이 있으면 `allocatePartIds(parts)`와 같다). 엔진은 플랜의 partId가 모델에 없으면 건너뛰고(`rig.partById.get`), 플래너는 슬롯이 null인 역할을 숨긴다
   (`app/humanoid-outfit.integration.test.ts`가 5개 레시피로 정렬을 검사). 파츠는 **역할당 최대 1개**이며 좌우 눈 파츠·헤어 캡/스트랜드·액세서리 조각은 한 파츠로 병합한다.
4. **outfit 포트 규약**(`docs/parity/outfit.md` §1)을 조립기가 적용한다: 두 번째 결과의 보조 본 인덱스(≥55)를 앞 결과의 본 수만큼 밀고, 보조 루트 본의 `restTranslation`을
   (추정 피벗 − 실제 rest 위치)로 보정하며, 헤어에는 머리 프레임 유사변환 morph(`param:height|legLength|headSize|neckLength:±`)를 붙인다. outfit이 준 `param:headSize:±`는
   정확한 프레임 델타로 대체한다. 도메인 교차 import 금지로 `combineOutfitResults`·`rebaseAuxiliaryRoots`를 같은 의미로 재구현했다(출처 주석).
5. **기준 형상 캐시**. 슬롯과 무관한 부분(몸·머리·스켈레톤·스킨 웨이트·체형 morph·두피/몸 표면)은 세분 단계별로 한 번만 만들고 호출마다 버퍼를 복제해 돌려준다
   (슬롯을 바꿔 소스를 다시 만들 때 수백 ms → 수십~150 ms). 캐시 유무와 무관하게 바이트가 같다(테스트). `clearHumanoidBaseCache()`로 비울 수 있다.
6. **관절 오프셋 채널(계약 밖 부가 필드)**. `ProceduralHumanoidModel.jointOffsets`: 체형 morph 이름(18개) → 본 → rest 평행이동 오프셋. 가중치 w인 morph는 본마다 w × 오프셋을 더해야
   morph된 팔·다리가 새 관절을 중심으로 회전한다(`skeletonWithJointOffsets` + `boneWorldMatrices`가 기준 구현이고, 테스트가 "새 팔꿈치 기준 회전 거리 보존 < 1 mm / 미반영 시 > 5 mm"를 확인).
   현재 render는 이 필드를 읽지 않는다 → §4 요청.
7. **입**. 머리 케이지에 입 구멍(쿼드 4개를 걷음) + 입 안 주머니(링 6 + 폴 캡)가 있다. 위 입술은 head, 아래 입술·턱·입 안 아래 벽은 jaw 본 가중치를 따른다
   (`jawMaskLocal` = FACS 턱 열림 필드와 같은 마스크). 치아·혀는 그 공동 안에 놓이고 jaw 본·FACS 턱 열림을 따른다. 모든 morph 극값에서 치아·혀가 피부 고체에 파묻히지 않음을 검사한다(§2).
8. **결정성**. 난수 없음(시드는 outfit 포트에만 전달). 같은 입력 → 같은 바이트(`humanoidModelDigest`, fnv1a64). 반환 모델의 버퍼를 바꿔도 다음 빌드가 오염되지 않는다.

## 2. 항목별 상태

| 항목(SHAPER 대응) | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
|---|---|---|---|---|
| 단면 스윕 쿼드 케이지: 몸통 20열·목·팔 14열(+어깨 구멍 브리지)·손(손바닥+손가락 4×4열+엄지)·다리 12열(Y 분기)·발. 닫힌 쿼드 다양체, 좌우 정확한 x 거울 | 구현됨 | `geometry/cage.test.ts`(모든 간선 2면·감김 일관·오일러 2·영역 태그·결정성·UV [0.5,1]), `geometry/sweep.test.ts` | 미검증 | 정점 1,078 · 쿼드 1,076. 스윕 로프트(Hyun 2005)·스피어-메시 프록시(Thiery 2013) 개념만 |
| 머리 케이지: 32×16 구면 그리드 + 귀 2 + 입 구멍·입 안 주머니(정점 595 · 쿼드 589). 눈 소켓·코·눈썹·볼·입술·턱 해석 함수 | 구현됨 | `geometry/head-cage.test.ts`, `geometry/mouth-pocket.test.ts`(구멍·주머니 위상, 오일러 6, 입 폭 = 입꼬리 랜드마크, 중립 입 틈 < 0.06, 세분 0·1·2 수밀) | 미검증 | 머리는 프레임 유사변환만으로 움직인다(눈·치아와 같은 변위) |
| **입(구멍·주머니·턱·치아·혀)** | 구현됨 | `geometry/mouth-pocket.test.ts`(치아·혀가 공동 안 = 레이캐스트 홀짝, 공동 가운데는 공기·옆은 고체), `humanoid-model.test.ts`(모든 morph 극값·대표 표정 3종에서 치아·혀가 피부에 파묻히지 않음, jaw 본 회전 vs jawOpen morph 아래 입술 하강 근사 일치 4 mm, 윗니·이마 정지), `skeleton/jaw-weights.test.ts` | 미검증(입 안 셰이딩·툰 외곽선) | **수정 내역**: 이전 상태는 입 구멍이 없고 head 웨이트 후보에 jaw가 없어 입이 열리지 않았다. 입 안은 머리와 같은 스킨 재질(역할 `head`)이라 입 안 색은 렌더가 정해야 한다(UV 섬 `MOUTH_TUBE_RECT`) |
| Catmull-Clark 세분(경계 규칙, 선형 스텐실 → morph 델타 정확 리프트, UV 섬 토폴로지 별도 세분, 영역 one-hot 리프트) 0/1/2회 + `predictVertexCount` | 구현됨 | `geometry/subdivision.test.ts`(큐브 1회 정점 26·면 24·간선 48, 2회 98/96, 모서리 5/9·면점·간선점 3/4 규칙 값, 선형성, 열린 패치 경계 규칙), 케이지·머리 테스트의 세분 후 수밀 | 미검증 | Catmull & Clark 1978 수식만 |
| UV 아틀라스(머리 u ≤ 0.5, 피부 u ≥ 0.5, 귀·폴 캡·손가락 띠·입 안 섬, 거터) | 구현됨 | `geometry/uv-layout.test.ts`(섬 겹침 없음·반쪽 규칙·손가락 띠·캡 셀·입 섬) | 미검증(텍스처 이음매) | 정점 UV는 전부 [0,1] |
| 눈 4파츠(안구·홍채·동공·하이라이트) × 좌우 × 눈 6 × 홍채 5 스타일, 눈썹·속눈썹(눈 스타일별), 치아(상·하 아치)·혀 | 구현됨 | `geometry/small-parts.test.ts`(수밀 구·유효 메시·홍채가 안구 앞·오른눈 = 왼눈 x 거울·치아·혀가 입 상자 안), `humanoid-model.test.ts`(눈 스타일은 눈 파츠만 바꿈) | 미검증(홍채·하이라이트 셰이딩) | 홍채 반경·동공 모양·하이라이트 배치는 `IRIS_STYLE_SPECS` |
| 체형 9 ± = 18 morph(케이지 ±1 재생성 → 스텐실 리프트, 머리 프레임 유사변환, 델타 법선 포함) | 구현됨 | `morph/morph.test.ts`(이름 일치·비영·좌우 대칭 ≤ 1e-4·± 정확히 반대·머리 크기 델타 = 프레임 유사변환), `humanoid-model.test.ts`(키 ±는 머리 높이 ±, 팔 길이 ±는 손끝 x 범위, 발은 지면에) | 미검증 | SMPL "형상 델타 후 관절 회귀" 개념만 |
| 관절 오프셋(체형 morph ±별 본 rest 이동) + CPU 기준 구현 `skeletonWithJointOffsets` | 구현됨(채널은 계약 밖 부가 필드) | `humanoid-model.test.ts`(새 팔꿈치 회전 거리 보존), `morph/morph.test.ts`(팔 길이 +→ 손목 바깥, 키 +→ 머리 위) | 미검증 | **render 미소비** → §4 |
| 얼굴 15 ± = 30 morph(필드 기반, 컴팩트 서포트 마스크) | 구현됨 | `morph/morph.test.ts`(30개 이름·비영·대칭·±), `humanoid-model.test.ts`(30개 모두 머리 파츠에 비영) | 미검증 | 파라미터마다 영향 영역이 자기 부위로 한정된다(눈 파라미터가 입·코를, 코 파라미터가 눈·윗니를 움직이지 않음을 랜드마크 13곳 표로 점검해 새는 필드를 좁혔다 — §6) |
| FACS 16 델타(눈썹·눈꺼풀·볼·코·턱·입꼬리·오므림·깔때기·누름·혀 내밀기, 치아·혀 전용 처리 포함) | 구현됨 | `morph/morph.test.ts`(16개 이름·비영·눈 감기 외 대칭·턱 열림은 아랫니·혀만·안구 무반응), `humanoid-model.test.ts` | 미검증 | 치아·혀는 입 안 벽과 같은 필드로 움직이고 턱 열림·오므림·혀 내밀기만 전용 처리 |
| VRM 1.0 55본 rest 스켈레톤(`HUMANOID_BONE_NAMES` 순서, 부모 = `HUMANOID_BONE_PARENTS`, 손가락 근위→원위, 좌우 x 거울) + 충돌 캡슐 14 | 구현됨 | `skeleton/skeleton.test.ts`, `humanoid-model.test.ts`(55본 이름·계층, 보조 본은 그 뒤 auxiliary) | 미검증 | rest 회전은 항등(VRM 정규화 리그 규약), T-포즈·손바닥 아래·+x = 왼쪽 |
| 자동 스킨 웨이트: 캡슐 거리 역수 상위 4 → 정규화 → 라플라시안 스무딩 2회 → 상위 4·정규화, 영역(BODY_REGIONS)별 후보 본 | 구현됨 | `skeleton/skeleton.test.ts`(합 1·≤4·범위·상완/허벅지 최대 본·스무딩 후 거칠기 감소·결정성·반대편 본 무영향), `humanoid-model.test.ts`(전 파츠) | 미검증(GPU 스키닝 일치) | 몸 정점 4,934 중 4,463(90%)이 4영향. 정점 17k 기준 약 0.25~0.3 s(TS, 연구 목표 20k·300 ms 근접) |
| 머리 파츠 jaw 본 웨이트(`blendJawWeights`: head 몫을 `jawMaskLocal`만큼 jaw로) | 구현됨 | `skeleton/jaw-weights.test.ts`(마스크 규칙·합 1·≤4·결정성·head 계열 아닌 정점 무변경·슬롯 가득 찬 정점·CPU 스키닝으로 아래 입술 하강 > 1.5 cm/윗입술·이마 정지, 수정 전에는 jaw가 머리를 못 움직임) | 미검증 | head·neck 후보만 있던 웨이트에 jaw를 더한 것(스펙 확장) |
| CPU 스키닝 참고 구현(`skinPositionsCpu`, `boneWorldMatrices`, identity에서 원형 복원, 보조 본 포함) | 구현됨 | `skeleton/skeleton.test.ts`, `humanoid-model.test.ts`(전 파츠 identity 오차 < 1e-4), 통합 테스트(헤어·스커트가 몸 따라 움직임) | 미검증(GPU 스키닝과 비교) | 엔진 GPU 스키닝 비교 기준 |
| 팔레트(피부 8·홍채 10·헤어 12, 소문자 #rrggbb, 기본 레시피 색 포함) | 구현됨 | `palette.test.ts`(불변식·OKLab 거리 ≥ 0.03·기본색 견본) | — | 자체 선정 색(상용 팔레트 복제 없음) |
| `buildHumanoidModel`(OutfitBuilderPort DI·병합·규약 적용·fail-visible) | 구현됨 | `humanoid-model.test.ts`(스텁 포트: DI 인자·인덱스 이동·피벗 보정·headSize 대체·병합·실패 코드), `app/humanoid-outfit.integration.test.ts`(**실제** outfit: 헤어 7·상의 5·하의 5·신발 4·액세서리 6 각각 + 최악 조합, 플래너 정렬, 물리 솔버 생성·settle 결정성) | 미검증 | 어휘 밖 프리셋 → `humanoid-unknown-style`, 파츠 위반 → `humanoid-part-invalid`, 체인·본 위반 코드 |
| 정점·삼각형 상한(스펙 ≤ 140k), 법선 단위, UV [0,1], 수밀, 결정성 해시 | 구현됨 | `humanoid-model.test.ts` | — | 수치는 §3 |
| ParamPanel: 체형 9·얼굴 15 슬라이더(양 끝 설명·`aria-valuetext`)·숫자 입력(초안 유지·클램프)·행/그룹/전체 리셋·피부·홍채·머리·눈썹 팔레트·신체 지표 요약·슬롯 능력 사유·패키지 소스 안내 | 구현됨 | `app/shell/panels/ParamPanel.test.tsx`(jsdom 15케이스: 실제 store에서 슬라이더 연속 변경·전체 초기화가 되돌리기 1단계) | 미검증(레이아웃·터치) | `param/set` + `coalesceKey`, 그룹 초기화는 같은 `reset:<group>` 키로 병합 |

## 3. 수치(이 컨테이너 실측)

| 항목 | 값 |
|---|---|
| 케이지 | 몸 정점 1,078·쿼드 1,076 / 머리 정점 595·쿼드 589(입 주머니 정점 61 포함) |
| 기본 레시피(헤어 soft-bob·티·청바지·스니커즈), 세분 0 | 정점 5,257 · 삼각형 7,910 · 파츠 14 · 본 223(보조 168) · 체인 24 |
| 〃 세분 1(앱 기본, `SUBDIVISION_LEVELS`) | 정점 12,987 · **삼각형 22,052** · morph 항목 319 |
| 〃 세분 2 | 정점 41,764 · 삼각형 77,042 |
| 파츠(세분 1, 최악 조합 15파츠) | skin 4,934v/8,608t · head 2,660v/4,712t · 안구 442v · 홍채·동공·하이라이트 각 146v · 눈썹 104v · 속눈썹 124v · 치아 154v · 혀 117v |
| morph 이름 | **64개** = 체형 18 + 얼굴 30 + FACS 16(`ALL_FACS_MORPH_NAMES`). 파츠별 항목: skin 16 · head 54 · 안구계 14 · 눈썹 41 · 속눈썹 39 · 치아 43 · 혀 36 · 헤어 8(머리 프레임 morph만) |
| 본 | 55(VRM 필수 15 + 선택) + outfit 보조 본(최악 조합 436 → 491) |
| 빌드 시간(기준 캐시 포함, 4코어 공유 컨테이너 실측) | 세분 1 첫 빌드 약 0.3~0.8 s, 이후 슬롯 변경 재생성 약 40~150 ms · 세분 2 첫 빌드 약 0.8~1.4 s |

연구 수치 목표(`research-character-lab.md` §4)와의 대조: 삼각형 ≤ 40k(LOD0)·헤어 포함 ≤ 60k → **세분 1은 충족(22k)**, 세분 2는 77k라 초과(스펙 상한 140k 안, 앱 기본은 세분 1).
본 55~120 → 몸 55는 충족이나 outfit 보조 본(헤어·스커트 체인)이 168~436개라 합계가 120을 넘는다(outfit 소관, 렌더는 본 텍스처로 처리해야 한다).
morph ≥ 100(52 표정 + 2×24) → 계약이 FACS 16 + 체형·얼굴 24×2 = 64로 동결돼 **미달**(§5).
슬라이더 체감 지연 ≤ 50 ms → 슬라이더는 플랜 morph 가중치만 바꾸므로 소스 재생성이 없다(실제 지연은 브라우저에서 측정 필요).

## 4. 다른 작업자·core에게 요청(계약 변경 포함)

1. **render**: `ProceduralHumanoidModel.jointOffsets`(체형 morph 이름 → 본 → rest 평행이동)를 `"jointOffsets" in model` 덕 타이핑으로 읽어, 플랜의 체형 morph 가중치 w마다
   본 rest 위치에 w × 오프셋을 더하고 **역바인드를 morph된 rest에서 다시 만든다**(공식과 기준 구현: `skeletonWithJointOffsets`·`boneWorldMatrices`, 테스트가 검증). 하지 않으면 팔 길이·키·어깨 너비 ≠ 0에서
   팔꿈치·무릎이 옛 위치를 중심으로 회전한다. 정식 채널은 core가 `HumanoidModelData`에 선택 필드(예: `jointOffsets?: Readonly<Record<string, Readonly<Partial<Record<HumanoidBoneName, Vec3>>>>>`)로 올리는 계약 변경이 필요하다
   (render는 domains를 import할 수 없으므로 합산 함수는 shared/contracts 또는 render가 재구현).
2. **render**: 머리 파츠 morph가 54개(안구계 14, 눈썹 41, 치아 43)라 Babylon `MorphTargetManager`는 텍스처 모드(타깃을 텍스처에 저장)를 쓰는 편이 안전하다(속성 방식은 메시당 동시 활성 타깃 수에 제한이 있다). morph 항목은 `deltaNormals`를 함께 준다.
3. **render/core**: 입 안 공동의 색·그림자. 입 안 벽은 역할 `head` 파츠(스킨 재질)라 입 안이 피부색으로 보인다. 입 안 UV 섬(`MOUTH_TUBE_RECT`·`MOUTH_CAP_RECT`)에 어두운 붉은 색을 칠하거나 툰 셰이더가 AO/그림자로 처리해야 한다.
4. **core(`contracts/mesh-data.ts`)**: `allocatePartIds`가 순서 기반 1..n이라 결손 역할이 있으면 `DEFAULT_PART_LAYOUT`과 어긋난다. humanoid는 역할 고정 partId(희소 팔레트)로 돌려주므로
   주석("파츠의 partId 필드는 이 함수의 결과와 같아야 한다")에 "역할 고정 레이아웃을 쓰는 소스는 예외"를 명시하거나 `allocatePartIds`에 역할 고정 변형을 추가하길 권한다. 이 문서 §1.3이 근거다.
5. **스타일(core CSS)**: ParamPanel이 쓰는 클래스(`cl-param-group/subtitle/row/pole(--negative/--positive)/number/reset/status/palette-row/palette-label/palette/swatch(--selected)/palette-name`)는
   core가 `character-lab.css`에 이미 반영했다. 색 견본은 인라인 `backgroundColor`(hex)와 최소 크기를 직접 지정한다.
6. 선택 확장(계약 동결 범위 밖): FACS 52 ARKit 확장·corrective shape(턱 열림 × 입꼬리 등)·MVC 케이지 변형·DQS는 미구현(§5).

## 5. 스펙 대비 미구현·축소와 이유

| 항목 | 상태 | 이유 |
|---|---|---|
| FACS 52(ARKit) 확장, corrective shape(jawOpen × mouthSmile 등) | 미구현 | 계약이 FACS 16으로 동결(`FACS_UNITS`). 이름 확장은 contracts 변경 + animation·state 연동이 필요(연구 보고서의 "확장 가능" 항목). 현재 16유닛 + 입 안 공동 정합은 구현 |
| 정점 곡률·AO 채널(COLOR_1 등)로 사전 적분 SSS | 미구현 | `MeshPartData`에 정점 색 채널이 없다(계약). 렌더 쪽 결정 |
| 열 확산·BBW 웨이트 베이크, DQS, MVC 케이지 변형 | 미구현 | 스펙은 "캡슐 거리 + 라플라시안 스무딩"이며 구현·검증함. 나머지는 연구상 beta/later 항목 |
| 세분 2의 삼각형 ≤ 60k | 해당 없음 | 세분 2(77k)는 선택 고품질. 앱 기본은 세분 1(22k) |
| 실제 GPU에서의 morph·스키닝·셰이딩 확인 | 미검증 | GPU 없음(브라우저 미검증 섹션) |

## 6. 이번 마감에서 고친 결함(디스크 상태 대비)

- `morph.test.ts` 실패 2건 → 원인은 필드 결함: `eyeSize`·`earSize`·`earAngle`이 정중선(x = 0) 정점을 한쪽으로 쏠리게 해 거울 대칭이 깨졌다(정중선에서 중심 x를 선형으로 줄이고 귀 마스크를 컴팩트 서포트로 교체). `headSize`는 몸 케이지를 움직이지 않으므로 테스트의 "몸 델타 비영" 가정을 "몸·머리 중 하나"로 바로잡았다.
- `nearMirrored`·`mirroredFeature`의 `max`(정중선에서 미분 불연속 → 입꼬리·눈 마스크가 가운데에 V자 꺾임)를 확률적 합집합 `1 − (1−a)(1−b)`로 교체.
- **입이 없던 문제**: 머리 케이지에 입 구멍·주머니, jaw 본 웨이트, 턱 마스크, 치아·혀 위치(공동 안)를 추가(§2 "입").
- **얼굴 필드 누출**: 눈 파라미터가 입·코를, 코 파라미터가 눈·윗니를, 턱 길이가 입·윗니를, 이마가 눈을 움직이던 것을 컴팩트 서포트 마스크로 좁혔다(랜드마크 13곳 × 15파라미터 표로 점검).
- **partId 정렬**: 조립기가 존재하는 파츠에만 1..n을 매겨 결손 역할이 있으면 플래너 가시성·색이 엉뚱한 파츠에 걸렸다 → 역할 고정 partId(§1.3).
- **관절 오프셋**과 jaw 웨이트를 CPU 기준 구현으로 검증.

## 7. 공개 API 요약

- `humanoid-model.ts`: `buildHumanoidModel(recipe, { subdivisionLevels, seed, outfit }): ProceduralHumanoidModel`(= `HumanoidModelData` + `jointOffsets`·`styles`·`stats`),
  `geometryKeyOf(recipe)`, `GEOMETRY_SLOT_KINDS`, `partIdOfRole(role)`, `resolveStyles`, `humanoidModelDigest(model)`, `clearHumanoidBaseCache()`, `TRIANGLE_BUDGET`(140,000),
  조립 보조: `buildScalpSurface`·`fitScalpSphere`·`assumedHeadPivot`·`assumedBodyPivots`·`buildBodySurface`·`offsetAuxiliaryJointIndices`·`rebaseAuxiliaryRoots`·`combineOutfitResults`·`collectMorphNames`.
- `geometry/`: `buildBodyCage(params)`·`buildHeadCage(params)`(`mouthRim`·`mouthVertexCount`)·`mouthWarp`, `catmullClark(mesh, levels)`·`buildSubdivisionPlan`·`liftAttribute`·`predictVertexCount`·`subdividedToTriMesh`,
  `sweepSection`·`ellipseProfile`·`framesAlongPath`, `QuadMeshBuilder`, `buildEyeball/Iris/Pupil/EyeHighlight`·`buildBrows/Lash`·`buildTeeth/Tongue`, `UV_ISLANDS`·`MOUTH_TUBE_RECT`·`MOUTH_CAP_RECT`.
- `morph/`: `buildBodyMorphs`·`headAttachedBodyDelta`, `buildFaceParamDeltas`·`buildFacsDeltas`·`evaluateFaceField`, `FACE_PARAM_FIELDS`·`FACS_FIELDS`·`jawMaskLocal`.
- `skeleton/`: `buildHumanoidSkeleton`·`boneWorldPositions`·`boneCapsules`, `computeSkinWeights`·`blendJawWeights`·`buildAdjacency`, `boneWorldMatrices`·`skinPositionsCpu`·`skeletonWithJointOffsets`·`collidersFromSkeleton`.
- `palette.ts`: `SKIN_TONES`·`IRIS_COLORS`·`HAIR_COLORS`·`PALETTES`·`findPaletteEntry`·`paletteInvariants`. `fixtures.ts`: `createStubOutfitBuilder`·`countRayCrossings`(테스트용).
- `app/shell/panels/ParamPanel.tsx`: `ParamPanel`, `PARAM_POLES_KO`, `formatParam`, `describeParamValue`.

## 8. 라이선스·출처

| 항목 | 라이선스 | 사용 방식 |
|---|---|---|
| Catmull-Clark(1978)·Hyun 2005 스윕 로프트·Thiery 2013 스피어-메시 프록시·Blanz-Vetter 1999·Lewis 2014 델타 블렌드셰이프·SMPL 구조(개념) | 논문 | 수식·개념만 재구현(SMPL 모델·코드·데이터 미사용) |
| Pinocchio(Baran-Popović 2007) 캡슐 초기값 + 확산 평활 | 논문(라이브러리는 GPL 계열 → 미열람) | 개념만 재구현 |
| three-vrm 정규화 리그·VRM 1.0 humanoid 본 어휘 | MIT / 사양(라이선스 미확인 → 본문 복제 없음) | 본 이름·계층만(`contracts/bones.ts`) |
| MakeHuman·MPFB2·MB-Lab(GPL/AGPL) | — | 코드 미열람, 에셋 미사용 |
| 팔레트 색 | 자체 선정 | 상용 팔레트 복제 없음 |

## 9. 남은 위험·브라우저 미검증

- GPU 스키닝·morph 텍스처 모드(타깃 54개)·실제 셰이딩에서의 형상은 미검증이다. CPU 참고 구현(`skinPositionsCpu`)과 엔진 결과의 비교 테스트는 render/브라우저 소관이다.
- 입 안 공동은 기하·웨이트·morph 정합까지 검증했고, 입 안 색·툰 외곽선·그림자는 미검증이다(§4.3).
- 헤어 카드·의상 셸의 모습은 outfit 소관이며 humanoid는 두피 표면·몸 표면·체형 morph를 정확한 위치로 넘기는 데까지 검증했다(의상이 몸을 관통하지 않음: 어깨 너비 + 상태에서도 < 2%).
- 모든 morph 극값 검사는 단일 morph ±1과 대표 표정 3종 조합이다. 임의의 다중 극값 조합에서의 치아·혀 정합까지 보증하지는 않는다.

## 10. 검증 기록(2026-10-01, humanoid 작업자 실측)

| 명령 | 결과 |
|---|---|
| `pnpm --filter @toonstudio/character-lab typecheck` | 오류 0 |
| `pnpm exec eslint --max-warnings=0 apps/character-lab/src/domains/humanoid apps/character-lab/src/app/shell/panels/ParamPanel.tsx apps/character-lab/src/app/shell/panels/ParamPanel.test.tsx apps/character-lab/src/app/humanoid-outfit.integration.test.ts` | 오류 0 · 경고 0 |
| `pnpm exec vitest run apps/character-lab/src/domains/humanoid apps/character-lab/src/app/shell/panels/ParamPanel.test.tsx apps/character-lab/src/app/humanoid-outfit.integration.test.ts` (루트 설정) | 14파일 / 152케이스 통과 |
| `pnpm --filter @toonstudio/character-lab exec vitest run src/domains/humanoid src/app/shell/panels/ParamPanel.test.tsx src/app/humanoid-outfit.integration.test.ts` (앱 설정) | 14파일 / 152케이스 통과 |
| `pnpm --filter @toonstudio/character-lab test` (앱 전체, 마감 직전 1회) | 160파일 / 1031케이스 통과 |

- 테스트 파일: humanoid 12(`humanoid-model`·`palette`·`geometry/{cage,head-cage,mouth-pocket,small-parts,subdivision,sweep,uv-layout}`·`morph/morph`·`skeleton/{skeleton,jaw-weights}`) + ParamPanel 1 + 통합 1.
- 실제 store 연결 테스트는 병합 윈도우(250 ms)가 머신 부하에 흔들리지 않도록 호출마다 1 ms씩 늘어나는 결정적 시계(`now`)를 주입한다.
