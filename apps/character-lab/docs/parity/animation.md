# character-lab 패리티 — animation 영역(IK·관절·표정·포즈·프리셋·패널)

상태: **current** (2026-10-01, animation 작업자 작성). core가 `docs/shaper-parity-checklist.md`로 집계하기 전의 단일 소스이며,
열 구조는 체크리스트와 같다. 모든 로직은 순수 TS(`src/animation/**`)이고 `@babylonjs/*`·DOM을 쓰지 않으므로
Node vitest로 검증했다. 이 컨테이너에는 GPU가 없어 뷰포트 안에서의 동작은 '브라우저 검증' 열에 **미검증**으로 둔다.

## 좌표·리그 규약

- 우수 좌표계, Y-up, 캐릭터 정면 +Z, 캐릭터 왼쪽 +X(`presets/rotation-dsl.ts` `LEFT_X_SIGN`), rest = T-pose(손바닥 아래, 엄지 앞).
- `Pose`는 rest 기준 본 로컬 쿼터니언(`local = rest ∘ pose`, glTF 노드 규약). 없는 본 = rest.
- 참조 스켈레톤(`reference-skeleton.ts`, 55본·신장 약 1.65 m)은 소스(절차/제작)에 독립적인 검증·패널 IK 환산용이다.
  실제 스켈레톤은 humanoid/authored가 `SkeletonData`로 제공하며 같은 함수에 그대로 넣을 수 있다.

## 구현 상태 표

| 항목(SHAPER 대응) | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고(베타·사유) |
| --- | --- | --- | --- | --- |
| 해석적 two-bone IK(팔꿈치·무릎, 폴 벡터, 중간 관절 각 제한, 도달 불가 시 최대 신장 + 사유) | 구현됨 | `src/animation/two-bone-ik.test.ts` (도달 오차 ≤1e-4, pole 평면·방향, max-reach/min-fold/limited/degenerate, 무작위 100개 결정성) | 미검증 | 코사인 법칙 해석해(Aristidou & Lasenby survey 분류). 결과는 월드 델타 회전 2개 |
| IK 목표(손·발 4체인) → Pose 환산(FK → solve → 로컬 회전 → swing-twist 클램프 → 재FK 오차) | 구현됨 | `src/animation/ik-apply.test.ts` (4체인 도달, pole, 도달 불가 사유, 제한 클램프 보고, 체인 본 누락 throw, 결정성) | 미검증 | 클램프로 못 미치면 `status: "clamped"` + 실제 오차(무음 없음) |
| FABRIK 보조 체인(척추 5본·손가락 3본, 원뿔·힌지 제약, ≤10회·오차 ≤1 mm) | 구현됨 | `src/animation/fabrik.test.ts` (수렴·길이 보존·max-reach·원뿔·힌지·무작위 100개 ≤10회, 척추 머리 목표, 손끝 목표, 제한 클램프 보고, 체인 검증 throw) | 미검증 | 연구 종합 채택 기법(사지=two-bone, 척추·손가락=FABRIK). 루트 세그먼트 원뿔은 부모 본 축 기준 |
| 관절 제한(JOINT_LIMITS_DEG swing/twist 분해·클램프·위반 목록) | 구현됨 | `src/animation/joint-limits.test.ts` (분해 각, 통과·클램프, twist 0, 단조·포화, 본별 제한, 포즈 전체 클램프) | 미검증 | 본 축은 자식 rest 오프셋 평균(`boneAxisLocal`) |
| 관절 드래그(화면 평면 회전 → 로컬 포즈 → 클램프) | 구현됨(함수) | `src/animation/joint-drag.test.ts` (방향·깊이 보존, 원근/직교 카메라, 다른 본 보존, 단조 클램프, twist 제한, throw) | 미검증 | 뷰포트 핸들 SVG·포인터 처리는 render `ViewportPane`이 `dragJoint`로 연결해 `pose/set` 기록(통합 후 브라우저 검증 필요) |
| 표정 합성(프리셋 + FACS 16 슬라이더 우선, [0,1] 클램프, 프리셋 가중합, 길항 완화, 보간, morph 이름 변환) | 구현됨 | `src/animation/expression-blend.test.ts` | 미검증 | three-vrm override 규칙을 길항 쌍 9개에 적용. 보정(corrective) 셰이프는 humanoid 영역 |
| 포즈 스코프 병합·정규화·해시·보간·키 정제 | 구현됨 | `src/animation/pose-blend.test.ts` (스코프별 보존, replaceScope, 정규화, 해시 결정성, slerp) | 미검증 | reducer `mergePoseScoped`와 `mergePose(replaceScope: true)`는 같은 의미 |
| 표정 프리셋 12(어휘 1:1, [0,1], 서로 상이) | 구현됨 | `src/animation/presets/expression-presets.test.ts` | 미검증 | FACS AU 조합을 16 유닛으로 옮긴 자체 데이터 |
| 포즈 프리셋 10(55본 어휘, 손가락 제외, 단위 쿼터니언, 관절 제한 안, FK로 자연스러움 검사, 해시 상이) | 구현됨 | `src/animation/presets/pose-presets.test.ts` | 미검증 | 해부학 DSL(`rotation-dsl.ts`)로 저작. 대칭 포즈는 좌우 X 대칭 |
| 손 포즈 프리셋 8(손가락 30본만, 좌우 거울 대칭, 제한 안, 서로 상이) | 구현됨 | `src/animation/presets/hand-pose-presets.test.ts` | 미검증 | MCP ≤90°·PIP ≤100°·DIP ≤70° 범위 |
| `PERFORMANCE_PRESETS` 30개 카탈로그 항목(requires `morph:facs:*`/`bone:*`, 프레이밍, catalogInvariants 통과) | 구현됨 | `src/animation/presets/index.test.ts` | 미검증 | core `catalog-registry`가 외형 64개와 병합 |
| 참조 스켈레톤·순수 FK(월드 변환, 순환 검출, 본 축) | 구현됨 | `src/animation/reference-skeleton.test.ts`, `src/animation/skeleton-fk.test.ts` | 미검증 | glTF T·R 누적 규약, rest 회전 비항등 본 지원 |
| PosePanel(포즈 10·손 포즈 8 카드, 적용 범위 4종, IK 목표 손·발 4 + 머리 척추 체인, 폴 벡터, 현재 위치 읽기, 초기화, 제한 클램프) | 구현됨 | `src/app/shell/panels/PosePanel.test.tsx` (jsdom: 카드 1회 dispatch, 스코프 pose/set, 손 side 분기, IK 도달·폴·비수치·불가·머리, `data-status` reached/unreachable, 현재 위치, 클램프·초기화, 미지원 disabled) | 미검증 | 전신 = `slot/apply`, 그 외 범위 = `pose/set`(범위 안 교체·밖 보존). IK 결과는 전신 `pose/set`. IK 상태 문구는 `data-status`(reached/clamped/unreachable)로 core CSS `.cl-pose-ik-status[data-status]` 색상과 연결 |
| ExpressionPanel(프리셋 12 카드, 프리셋 세기, FACS 16 슬라이더, 초기화, 모순 유닛 완화, 활성 유닛·morph 수) | 구현됨 | `src/app/shell/panels/ExpressionPanel.test.tsx` (jsdom: 카드 1회 dispatch, 슬라이더 merge+`coalesceKey: unit`, 세기·슬라이더 우선(세기는 coalesce 없음), 초기화·완화, 미지원 disabled) | 미검증 | 슬라이더 드래그는 `expression/set`에 `coalesceKey: unit`을 실어 같은 유닛 연속 변경을 history 1단계로 병합(2026-10-01 계약 반영, state/lab-store가 `param/set`과 같이 처리·`src/state/lab-store.test.ts`에 병합 테스트). 프리셋 카드·세기·초기화·완화는 각각 1단계 |
| 사진 포즈 인식 결과 적용(33 랜드마크 → Pose) | 다른 영역(vision) | — | — | vision이 `IkGoal`·`applyIkGoal`·`mergePose`를 재사용 |

## 공개 API(요약, `src/animation/index.ts` 배럴)

- `solveTwoBoneIk(input)`, `rotationBetweenFrames`, `IK_REACH_TOLERANCE`
- `applyIkGoal(pose, skeleton, goal)`, `solveIkGoal(...)` (`IkApplyResult`: reached·error·status·reasonKo·chain)
- `solveFabrik(input)`, `constrainDirection`, `solveChainIk(pose, skeleton, chain, target, options)`, `applyChainIk`, `SPINE_IK_CHAIN`, `fingerIkChain`, `fingerTipLocal`
- `dragJoint(pose, skeleton, bone, fromWorld, toWorld, camera)`, `dragJointDetailed`, `screenPlaneAngle`
- `clampToJointLimit`, `clampBoneRotation`, `clampPoseToLimits`, `poseLimitViolations`, `isWithinJointLimit`, `swingTwistAnglesDeg`, `canonicalQuat`
- `blendExpression`, `blendExpressionPresets`, `relaxAntagonists`, `lerpExpression`, `expressionToMorphWeights`, `EXPRESSION_ANTAGONISTS`
- `mergePose`, `normalizePose`, `posesEqual`, `poseHash`, `lerpPose`, `sanitizePoseKeys`
- `EXPRESSION_PRESETS`(12)·`POSE_PRESETS`(10)·`HAND_POSE_PRESETS`(8)·`PERFORMANCE_PRESETS`(30)·`find*Preset`
- `createReferenceSkeleton`, `computeWorldTransforms`, `boneAxisLocal`, `poseRotationFromWorld`, 회전 DSL(`armAim`·`elbowFlex`·`fingerCurl`…)

## 연구 수치 목표 대비(Node 측정, 2026-10-01)

연구 종합(`design/research-character-lab.md` numericTargets)의 IK 목표는 "two-bone 해석적 1 µs/체인, FABRIK ≤10회 반복·오차 <1 mm"다.
이 컨테이너(Node 22, 4코어)에서 임시 벤치 스크립트(저장소에 남기지 않음)로 측정한 값:

| 항목 | 측정값 | 목표 | 판정 |
| --- | --- | --- | --- |
| `solveTwoBoneIk` | 4.77 µs/solve (N=20,000) | 1 µs/체인 | 미달(불변 튜플 할당 비용). 초당 약 20만 회로 상호작용(체인 4개·60 fps = 240 회/s)에는 충분하며, 할당 없는 Float32Array 경로는 후속 과제 |
| `solveFabrik`(4 세그먼트, 무작위 도달 가능 목표 5,000개) | 25.18 µs/solve, 평균 1.67회·최대 4회, 도달 5,000/5,000(오차 ≤1 mm) | ≤10회·<1 mm | 충족 |
| `applyIkGoal`(leftArm, 55본 FK 2회 포함, 무작위 목표 2,000개) | 88.2 µs/goal, 도달 1,931/2,000 | — | 미도달 69건은 관절 제한 클램프·도달 범위 밖 목표로 모두 `status`·사유가 보고됨(무음 없음) |
| `solveChainIk`(척추 5본, 무작위 목표 2,000개) | 162.6 µs/goal, 도달 1,938/2,000 | — | 미도달은 척추 제한(35/25/20/40°) 클램프 보고 |

프리셋 수치(참조 스켈레톤 FK): 모든 포즈·손 포즈 프리셋이 `poseLimitViolations` 0건, 대칭 프리셋은 좌우 X 대칭(허용 오차 1e-9),
손 흔들기 오른손 y=1.664 > 머리 y=1.490, 가리키기 오른손 z=0.494, 앉기 무릎 z=0.417·y=0.885, 팔짱 양손이 중심선을 넘음(`pose-presets.test.ts`가 고정).

## 브라우저 검증 절차(GPU 환경, 통합 후)

1. `pnpm dev:character-lab` → WebGPU 선택 → 포즈 탭에서 '손 흔들기' 카드 클릭 → 뷰포트 오른팔이 머리 위로 올라가는지, 되돌리기 1단계인지.
2. 범위 '상체'로 '앉기' 적용 → 다리는 그대로이고 팔·몸통만 바뀌는지.
3. IK 목표 '왼손' (0.35, 1.10, 0.30) 적용 → status '도달', 손이 몸 앞으로 오는지; (2, 2, 2) → '최대 신장' 사유.
4. 표정 탭 '웃음' 카드 → 입·턱 morph 반영, '턱 열기' 슬라이더 → 즉시 반영, '프리셋 세기' 50% → 절반 강도.
5. 뷰포트 관절 핸들을 끌어 팔을 등 뒤로 넘기려 할 때 160° 근처에서 멈추는지(관절 제한).
결과는 `docs/shaper-parity-checklist.md` '브라우저 검증' 열에 날짜·기기·backend와 함께 기록한다.
