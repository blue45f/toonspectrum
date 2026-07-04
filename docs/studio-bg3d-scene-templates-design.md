# 3D 배경 — 씬 템플릿 카탈로그 설계 문서

> 이 문서는 **설계 전용**이다. StudioPage.tsx / StudioBackground3D.tsx는 이 세션에서 직접 수정하지
> 않았다("새 파일만 생성" 원칙 — AGENTS.md·이 세션 지침). 아래 §2가 후속 통합 패스가 그대로 따라
> 적용할 수 있을 만큼 정확한 삽입 지점을 지정한다.

## §0. 배경 — 왜 필요한가

사용자 피드백: **"3d 배경 최대한 고도화 시켜줘 사실 3d 배경이라곤 하지만 실제로는 주변 오브젝트만
추가하는것 같아..."**

현재 `studio-background-3d-composites.ts`(`COMPOSITE_PRESETS`, `instantiateCompositePreset`)는 건물
한 채·나무 한 그루·차량 한 대처럼 **물체 하나**를 배치하는 도구다. "배경"을 만들려면 사용자가 이
버튼을 수십 번 눌러 건물·가로수·가로등을 일일이 흩뿌려야 했다 — 이게 "배경"이 아니라 "블록아웃
소품 놓기"로 느껴진 이유다.

이번 기능은 그 위에 한 겹을 더 얹는다: **"씬 템플릿"** — 기존 프리미티브/복합 프리셋 여러 개를
미리 정해둔 좌표(격자·열·링 배치)로 한 번에 전개해 "교실", "거리", "카페"처럼 **이미 완성된 공간**을
클릭 한 번으로 만든다. 새 지오메트리·새 복합 프리셋·새 npm 의존성은 전혀 추가하지 않았다 — 오직
기존 13종 `PRIMITIVE_DEFS`와 기존 12종 `COMPOSITE_PRESETS`를 좌표만 다르게 재사용한다.

## §0.1 만든 파일 (이 세션에서 신규 생성, 기존 파일 수정 없음)

| 파일 | 역할 |
|---|---|
| `src/domains/creator/studio-background-3d-scene-templates.ts` | 순수 로직 — 템플릿 카탈로그(`BG_SCENE_TEMPLATES`, 6개) + 전개 함수(`instantiateSceneTemplate`). Konva/DOM/React 의존 없음, 결정적. |
| `src/domains/creator/StudioBg3dSceneTemplatePanel.tsx` | 프레젠테이션, 무상태. 카테고리 칩 + 템플릿 카드 그리드(UI는 `StudioBackground3D.tsx`의 기존 복합 오브젝트 프리셋 그리드와 동형). |
| `src/domains/creator/studio-background-3d-scene-templates.test.ts` | vitest — 16개 케이스(유효성·순수성·yaw 회전 정확성 등 원본 11개 + 검증 패스에서 추가한 실측 기하 회귀 테스트 5개, §6 참고). 이미 실행해 전부 통과 확인함. |

`npx tsc -p tsconfig.json --noEmit`과 `npx eslint`로 이 3개 파일 모두 오류 0건 확인 완료.

## §0.2 데이터 모델 요약

```ts
type BgSceneTemplateCategory = "interior" | "urban" | "nature"; // 교실/카페=interior, 거리/골목길=urban, 공원/정원=nature
// 주의: 기존 BgCompositeCategory("building"|"nature"|"vehicle"|"prop")와는 이름만 "nature"가 겹치는
// 별개의 타입이다 — 하나는 "물체 종류", 하나는 "공간 종류"라는 다른 축이라 의도적으로 재사용하지
// 않았다. 통합 시 import 시 두 "nature"를 헷갈리지 않도록 주의.

interface BgSceneTemplate {
  id: string;
  category: BgSceneTemplateCategory;
  label: string;         // "교실" 등
  description: string;   // 카드 설명
  footprint: { width: number; depth: number }; // 대략적 바닥 X·Z 크기(m) — 반복 추가 시 겹침 방지 계산에만 사용
  placements: ScenePlacement[]; // "primitive"(낱개 도형, 절대좌표) | "composite"(기존 프리셋 참조 + 앵커 + 선택적 yaw)
}

function instantiateSceneTemplate(template: BgSceneTemplate, existingCount: number): BgPrimitive[]
```

`instantiateSceneTemplate`은 `instantiateCompositePreset(preset, existingCount)`와 정확히 같은
호출 계약(existingCount = 호출 시점의 `primitives.length`)을 따른다 — 다만 반복 추가 시 X축 이동폭
계수를 `footprint.width / 6`로 스케일해, 씬 템플릿(수 미터~14m)이 개별 복합 프리셋(0.3~2.4m)보다
훨씬 크다는 점을 반영했다. `existingCount`가 매 추가마다 방금 넣은 템플릿의 파츠 수만큼 커지므로,
반복 클릭해도 새 템플릿이 이전 템플릿 폭보다 항상 크게 밀려나 실질적으로 겹치지 않는다(정확한
빈패킹은 아니고, 기존 `createPrimitive`/`instantiateCompositePreset`과 같은 "찾기 쉬운 자리에
결정적으로 흩뿌리기" 철학의 연장 — 정밀한 배치는 사용자가 TransformControls로 직접 잡는다).

`composite` 배치의 `yaw`(world Y축 추가 회전, 라디안)는 **단순히 `rotation[1]`에 더하지 않는다.**
`THREE.Quaternion`으로 "프리셋 원본 로컬 회전을 적용한 뒤 world yaw를 적용"하는 순서로 합성한다
(`q.premultiply(qYaw)`). 이유: `building_house`의 지붕 파츠(`rotation=[-π/2, 0, π/2]`)를
node+three.js로 직접 검증한 결과, yaw=π를 `rotation[1]`에 그냥 더하면 틀린 결과(`ry`가 π가 됨)가
나오지만, 실제 쿼터니언 합성 결과는 `ry=0`이고 `rz`만 부호가 뒤집힌다 — 이미 X/Z축까지 튼 파츠에
"단순 덧셈"이 통하지 않는다는 걸 이 리포의 기존 리뷰 관례(§building_house 지붕 회전 버그 주석,
§vehicle_bus 바퀴 y 버그 주석)와 동일한 방식으로 직접 확인하고 반영했다. `three`는 이미
`studio-background-3d-primitives.ts`가 지오메트리 생성에 쓰는 기존 의존성이라 새 패키지 추가는
없다.

이번 배치(6개 템플릿)에서 실제로 쓴 yaw 값은 `0`(기본 정면 유지) / `Math.PI`(180°, 반대쪽 열이
서로 마주보게) / `Math.PI/2`(90°, 거리 템플릿의 평행주차 차량 1건)뿐이다. 함수 자체는 임의의
각도에 대해 수학적으로 정확하지만(Rodrigues 공식·쿼터니언 합성 그대로), 손으로 설계한 배치 좌표의
비겹침 계산을 검증 가능한 범위로 유지하기 위해 이 세 값만 썼다 — §5에서 스코프 축소로 다시 언급.

## §1. 템플릿 카탈로그 (6개, 최소 요구 4~6개 충족)

| id | 카테고리 | label | 구성 | footprint |
|---|---|---|---|---|
| `classroom` | interior | 교실 | 칠판 앞벽·측면 창문 2벽·교탁 + 책상 3×3(상판+몸통+의자, 열 간격 1.8m·행 간격 1.4m) | 8×7 |
| `cafe` | interior | 카페 | 뒷벽+카운터, 옆벽+통유리창, 원형 테이블 3개(의자 2개씩), 구석 화분(`bush_round`) | 6×5 |
| `street_avenue` | urban | 거리 | 왕복도로+중앙선, 도로 양옆 건물 4채(북쪽 열은 yaw=π로 도로 향해 반대로 서게), 보도 위 가로등×3·가로수×2·벤치×1, 평행주차 세단(yaw=π/2) | 14×13 |
| `residential_alley` | urban | 골목길 | 좁은 보행로(2.4m) 양옆 주택형 건물 4채, 화단(bush_round)×4·가로등×2·쓰레기통×2 | 11×10 |
| `park_plaza` | nature | 공원 | 포장 광장(6×6) 둘레에 나무 6그루(사각 링 배치), 남북 벤치 2개(서로 마주보게), 화단×4, 광장 모서리 가로등×4 | 14×14 |
| `backyard_garden` | nature | 정원 | 잔디 마당, 뒤쪽·오른쪽 L자 화단 경계(bush_round×6), 나무 1그루, 벤치+가로등 | 7×6.5 |

각 템플릿의 정확한 좌표·비겹침 근거(예: "책상 열 간격 1.8m에서 책상 반폭 0.31m → 간격 1.18m
확보", "블랙보드가 벽면에 0.02m만 파묻히고 0.03m 튀어나오는 건 `building_low_shop`의 창문
임베딩(offset z=1.11, 벽 두께 절반 1.1)과 같은 기존 관례"라)는 `studio-background-3d-scene-
templates.ts`의 각 항목 주석과 `studio-background-3d-scene-templates.test.ts`의 좌표 관련 테스트에
남겨뒀다 — 후속 패스가 좌표를 조정할 일이 있으면 그 근거부터 다시 계산해야 한다.

## §2. StudioPage.tsx / StudioBackground3D.tsx 통합 지점 (실제 통합은 후속 패스)

**중요한 선행 사실**: `StudioPage.tsx`는 이 기능과 관련해 **전혀 수정할 필요가 없다.** 3D 배경
도구는 이미 `StudioPage.tsx`가 `bg3dOpen` 상태로 열고 닫는 별도의 전체화면 모달
컴포넌트(`StudioBackground3D.tsx`, `lazyRetry`로 지연 로드, `StudioPage.tsx` 590~592번째 줄)이고,
씬 템플릿은 이 모달이 이미 갖고 있는 `primitives` 배열에 항목을 여러 개 한꺼번에 append하는
것뿐이다 — `addPrimitive`/`addComposite`와 완전히 같은 성격의 조작이라 실제 통합 작업은
**`StudioBackground3D.tsx` 한 파일 안에서만** 일어난다. `StudioPage.tsx`의 `bg3dOpen`/
`bg3dInitialDataUrl`/`onInsert` 배선(3243~3245, 8466~8467, 14776~14796번째 줄)은 그대로 재사용된다.

### 2.1 disarmAllPixelTools() — 변경 불필요(근거 명시)

AGENTS.md 지침상 캔버스 제스처를 가로채는 armed 도구는 `disarmAllPixelTools()`에 등록해야 한다.
**이 기능은 해당하지 않는다.** `StudioBackground3D`는 메인 Konva 캔버스 위에 얹히는 armed 상태가
아니라, 이미 열려 있는 별도 React-Three-Fiber 모달 내부에서 자신의 로컬 `primitives` state를
갱신할 뿐이다 — 기존 `addPrimitive`/`addComposite`도 동일한 이유로 `disarmAllPixelTools()`와
무관하며(그 두 함수가 `disarmAllPixelTools()`를 호출하거나 그 목록에 등록된 흔적이 없음을 확인),
씬 템플릿의 `addSceneTemplate`도 같은 성격이므로 `disarmAllPixelTools()`에 새 항목을 추가하지
않는다.

### 2.2 import 추가 (`StudioBackground3D.tsx` 상단, 기존 import 블록 37~56번째 줄 근처)

```ts
import { StudioBg3dSceneTemplatePanel } from "./StudioBg3dSceneTemplatePanel";
import {
  instantiateSceneTemplate,
  BG_SCENE_TEMPLATES,
  type BgSceneTemplateCategory,
} from "./studio-background-3d-scene-templates";
```

(`COMPOSITE_PRESETS` import는 이미 37~43번째 줄에 있으므로 추가 불필요 — `instantiateSceneTemplate`
내부에서 이미 그 배열을 참조한다.)

### 2.3 탭 타입·탭 목록 확장 (66번째 줄, 80~84번째 줄)

```ts
// 66번째 줄
type BgPanelTab = "shapes" | "templates" | "layers" | "view";
```

```ts
// 80~84번째 줄 — "도형" 다음, "레이어" 앞에 새 탭 삽입(발견 순서상 "낱개 도형 추가" 다음
// "완성된 공간 통째로 추가"가 자연스러운 위계).
import { LayoutTemplate } from "lucide-react"; // 기존 33번째 줄 lucide-react import 블록에 합류

const BG_PANEL_TABS: Array<{ id: BgPanelTab; label: string; icon: typeof Boxes; hint: string }> = [
  { id: "shapes", label: "도형", icon: Boxes, hint: "추가 · 선택한 도형 수치 편집" },
  { id: "templates", label: "템플릿", icon: LayoutTemplate, hint: "교실·거리·카페처럼 완성된 공간을 한 번에 추가" },
  { id: "layers", label: "레이어", icon: Layers, hint: "목록 · 선택 · 복제 · 삭제" },
  { id: "view", label: "보기", icon: Camera, hint: "카메라 프리셋 · 선화 미리보기" },
];
```

탭이 3개→4개가 되므로 탭 바 그리드도 함께 고쳐야 한다 — **742번째 줄**:

```diff
- <div role="tablist" aria-label="컨트롤 카테고리" className="grid shrink-0 grid-cols-3 gap-1 border-b ...">
+ <div role="tablist" aria-label="컨트롤 카테고리" className="grid shrink-0 grid-cols-4 gap-1 border-b ...">
```

키보드 좌우/Home/End 탐색(756~768번째 줄)은 `BG_PANEL_TABS.length`를 참조하므로 배열 길이만
바뀌면 자동으로 4개 탭을 순회한다 — 추가 수정 불필요.

### 2.4 상태 추가 (327~339번째 줄, `compositeCategory` 바로 아래)

```ts
// 씬 템플릿 그리드 카테고리 필터. null=전체. compositeCategory와 동형이지만 별개 상태 —
// BgSceneTemplateCategory와 BgCompositeCategory는 서로 다른 타입이라 공유할 수 없다(§0.2 참고).
const [sceneTemplateCategory, setSceneTemplateCategory] = useState<BgSceneTemplateCategory | null>(null);
```

별도의 "몇 번째로 추가했는지" 카운터 상태는 **불필요**하다 — `addComposite`와 마찬가지로
`instantiateSceneTemplate(template, primitives.length)`처럼 현재 `primitives.length`를 그대로
넘기면 된다(§0.2의 existingCount 계약).

### 2.5 핸들러 추가 (404~412번째 줄 `addComposite` 바로 아래에 나란히)

```ts
// 씬 템플릿 추가 — addComposite와 동일한 "추가 = 선택" UX. instantiateSceneTemplate이 이미
// 여러 프리셋/도형을 조합한 BgPrimitive[]를 통째로 돌려주므로, 그대로 append하고 첫 항목을 선택한다.
const addSceneTemplate = (templateId: string) => {
  const template = BG_SCENE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return;
  const parts = instantiateSceneTemplate(template, primitives.length);
  if (parts.length === 0) return;
  setPrimitives((prev) => [...prev, ...parts]);
  setSelectedId(parts[0].id);
};
```

undo/redo 히스토리는 이미 있는 디바운스 스냅샷 effect(360~379번째 줄, `primitives` 변화를
감시)가 그대로 처리한다 — 템플릿 하나를 통째로 추가해도 "한 번의 setPrimitives 호출 → 400ms
후 스냅샷 1개"이므로 Ctrl+Z 한 번에 템플릿 전체가 통째로 사라진다(개별 파츠 단위가 아님). 이는
기존 `addComposite`(여러 파츠짜리 복합 프리셋)도 이미 갖고 있는 동작이라 새 특수 처리가 필요 없다.

### 2.6 패널 렌더링 (새 `<section>`, "도형" 섹션(785~942번째 줄) 뒤·"레이어" 섹션(944번째 줄) 앞에 삽입)

```tsx
<section hidden={hideOnTab("templates")}>
  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
    <LayoutTemplate size={15} className="text-accent" aria-hidden />
    씬 템플릿
  </h3>
  <StudioBg3dSceneTemplatePanel
    activeCategory={sceneTemplateCategory}
    onCategoryChange={setSceneTemplateCategory}
    onAddTemplate={addSceneTemplate}
  />
</section>
```

이게 전부다 — 렌더 루프(`makeGeometry(kind)` 기반 지오메트리 생성), 선택/복제/삭제, TransformControls,
undo/redo, 선화 미리보기, PNG 내보내기(`encodeBg3dSceneHash`) 전부 `primitives` 배열을 제네릭하게
다루므로 **어느 것도 건드릴 필요가 없다.** 씬 템플릿은 순수하게 "`primitives` 배열에 미리 조합된
항목 뭉치를 한 번에 밀어 넣는" 추가 진입점일 뿐이다.

## §3. 접근성/UX 메모

- `StudioBg3dSceneTemplatePanel`의 카테고리 칩은 기존 복합 오브젝트 그리드의 칩과 동일한 시각
  언어(선택 시 `border-accent/60 bg-accent-soft text-accent`)를 그대로 재사용해 두 그리드가
  "같은 기능의 확장"처럼 느껴지게 했다.
- 카드에 "오브젝트 N개" 배지를 붙여, 클릭하면 primitives가 몇 개나 한꺼번에 늘어나는지 미리
  가늠하게 했다(교실 39개, 공원 58개 등 — 큰 씬일수록 캔버스가 복잡해진다는 기대치 설정).
- 새 탭은 role="tab"/aria-selected 등 기존 탭 접근성 패턴(747~780번째 줄)을 그대로 물려받는다
  (배열 길이만 늘렸으므로 별도 ARIA 배선 불필요).

## §4. 테스트

`src/domains/creator/studio-background-3d-scene-templates.test.ts` — 16개 케이스, 전부 통과 확인.
원본 11개:
- 템플릿 개수(≥4), footprint 양수, placements 비어있지 않음
- 모든 `primitive` 배치가 유효한 `BgPrimitiveKind` + 유한한 좌표
- 모든 `composite` 배치가 실존하는 `COMPOSITE_PRESETS` id를 참조
- 카테고리 3종 각각 템플릿 1개 이상, 레이블이 카테고리 유니온을 정확히 커버
- `instantiateSceneTemplate`이 파츠 수만큼 정확히 BgPrimitive를 생성, id 고유성, 유한한 값
- 같은 템플릿 내 두 프리미티브가 반올림된 좌표를 정확히 공유하지 않음(대략적 중복/겹침 가드)
- `existingCount=0`이면 원점 그대로, `existingCount` 증가에 비례해 anchorX가 `footprint.width/6`만큼
  선형 증가
- **yaw=π 회전 정확성**: 실제 사용 중인 yaw=π 배치 하나를 골라, 그 결과의 오프셋이 프리셋 원본
  offset의 (x,z) 부호만 뒤집히고 y(높이)는 불변인지 검증 — `rotateEulerYaw`가 임의로 값을 왜곡하지
  않는다는 회귀 가드
- 순수성(참조 비공유)

검증 패스에서 추가한 5개(§6 — 실측 기하 기반, three.js `Box3`/`Matrix4`로 실제 렌더 지오메트리를
계산한다):
- 미지 `presetId`는 예외 없이 조용히 건너뜀(코드 주석이 주장하는 방어 동작의 직접 테스트)
- yaw 처리가 `COMPOSITE_PRESETS`의 모든 파츠 × 8개 각도에서 독립적으로 다시 구성한 강체 Matrix4
  분해와 1e-6 이내로 일치(기존 yaw=π 단일 케이스보다 훨씬 넓은 커버리지)
- 카페 테이블 상판 반지름이 의자 반폭보다 크고 의도한 0.5m에 근접(§0.2/§6 버그의 회귀 가드)
- 어떤 템플릿에서도 서로 다른 두 배치가 (작은 쪽 부피 기준) 80%를 넘게 겹치지 않음(진짜 중복 배치
  버그를 잡되, 기존 최대 58.3%인 창문-벽 임베딩 같은 의도된 겹침은 통과)
- 바닥/도로 평면을 제외하면, 수평으로 겹치는 두 배치 사이에 뜻밖의 뜬 틈(0.005m 초과)이 없음
  (교실 책상 버그의 회귀 가드)

`pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm exec eslint <세 파일>` 모두 오류 0건.

## §5. 스케치 대비 편차 (스코프 축소 — 이 세션의 확립된 관례)

1. **템플릿 6개** — 요구 범위(최소 4~6개)의 상한. 더 늘리는 건(예: "사무실", "학교 운동장", "포장
   마차 거리") 같은 패턴을 반복하기만 하면 되므로 후속 배치로 미룸.
2. **yaw는 0/π/π/2만 사용** — `rotateOffsetYaw`/`rotateEulerYaw` 자체는 임의의 각도에 대해
   수학적으로 정확하다(Rodrigues 회전 공식·쿼터니언 합성, node+three.js로 직접 검증 완료 — §0.2).
   다만 6개 템플릿을 손으로 설계하면서 비겹침 계산을 검증 가능하게 유지하려고 "정면 유지/180°
   반대/90° 직각"의 세 값만 썼다. 연속적인 임의 각도(예: 광장에 나무를 육각형으로 놓고 안쪽을
   바라보게)는 코드상 이미 가능하지만 이번 6개 템플릿에는 쓰지 않았다.
3. **반복 추가 시 비겹침은 정밀 빈패킹이 아니라 근사치** — `existingCount * footprint.width/6`
   선형 이동은 "보통은 안 겹친다"는 수준의 휴리스틱이다(기존 `instantiateCompositePreset`의
   `existingCount % 5` 방식도 5번째 이후엔 겹치는 것과 같은 성격의 스코프). 사용자가 첫 템플릿의
   일부를 삭제/이동한 뒤 두 번째를 추가하면 오프셋이 "낮은 확률로" 예상과 다를 수 있음.
4. **책상-의자/테이블-의자의 수 cm 겹침은 의도적** — "앉아 있는 것처럼" 붙여두는 연출이며,
   `building_low_shop` 창문이 벽에 살짝 파묻히는 기존 관례와 동일한 종류의 근사다(버그 아님).
5. **새 프리미티브 종류·새 복합 프리셋 추가 없음** — 기존 13종/12종만 좌표 재조합. `prop_sign`
   (간판/표지판)은 이번 6개 템플릿 어디에도 안 썼다 — 후속 템플릿(예: "학교 정문", "상점가 골목")을
   위해 남겨둔 것이지 누락이 아니다.
6. **카메라 프레이밍 미조정** — `park_plaza`(14×14)·`street_avenue`(14×13)처럼 큰 템플릿은
   기존 `CAMERA_PRESETS`의 기본 시야보다 넓다. 이미 여러 복합 오브젝트를 수동으로 늘어놓아도
   벌어지는 상황과 동일하게, 사용자가 기존 확대/축소(`VIEWPORT_BTN` zoom) 컨트롤로 대응하는 걸
   전제한다 — 카메라 프리셋 자체를 새로 추가하거나 자동 프레이밍(bounding-box fit) 로직을 넣는
   건 이번 스코프 밖.
7. **완전 일반적인 3D 겹침(OBB-vs-OBB) 자동 검증은 없음** — 테스트는 "반올림된 좌표가 정확히
   같은 두 프리미티브가 없다"는 대략적 가드만 자동화했다. 실제 비겹침 근거는 이 문서 §1과 코드
   주석에 사람이 직접 계산한 수치로 남겼다(도형 크기가 종류마다 달라 일반적인 OBB 충돌 판정기를
   새로 만드는 건 블록아웃 도구 스코프 대비 과한 투자로 판단).
8. **uid() 중복 정의 부채 승계** — `studio-background-3d-composites.ts`가 이미 안고 있는
   "`uid()`가 `studio-background-3d-primitives.ts`에 export 안 돼 있어 로컬 복제"라는 부채를
   이 파일도 그대로 승계했다(같은 "새 파일만 생성" 제약 때문). 후속 배선 패스에서 원본 `uid()`에
   `export` 한 줄을 추가하고 두 로컬 복제본(`studio-background-3d-composites.ts`, 이 파일)을 모두
   지운 뒤 그 export를 import하도록 교체할 것 — composites.ts 8~12번째 줄 주석과 동일한 후속 작업.

## §6. 검증 패스에서 발견되어 수정된 사항

구현 직후 별도 검증 패스(node+three.js `Box3`로 실제 지오메트리를 렌더링해 world-space 바운딩
박스를 계산 — 사람이 손으로 짚은 게 아니라 실측)에서 아래 2개의 실제 버그와 1개의 이름 충돌
위험을 발견해 세 파일 모두 수정했다. 이 문서의 §0.2·§1·§4·§5의 서술 중 아래와 배치되는 부분은
이 §6이 최신이다.

1. **카페 테이블 상판 반지름 버그(실측으로 확인)** — `cafeTable()`의 상판 `scale`이 `[0.5, 0.05,
   0.5]`였는데, `makeGeometry("cylinder")`의 기본 반지름이 이미 0.3이라 실제 렌더링 반지름은
   `0.3 × 0.5 = 0.15m`(지름 30cm)였다 — 의자 반폭(0.2m)보다도 작은 "장난감 크기" 테이블이 되고,
   `chairOffset = 0.65`가 가정한 반지름(0.5)과 실제 렌더 반지름(0.15) 차이만큼(0.35m) 의자가
   테이블에서 붕 뜬 것처럼 보였다. `tableTopScale = tableRadius / 0.3`으로 역보정해 실제 반지름이
   의도한 0.5m가 되도록 수정(`studio-background-3d-scene-templates.ts` `cafeTable()`).
2. **교실 책상 상판-몸통 사이 4cm 뜬 틈(실측으로 확인)** — `classroomDesk()`의 몸통(body) 높이가
   0.46(중심 y=0.23)이라 [0, 0.46]까지만 채웠는데, 상판은 y=0.53 중심·두께 0.06이라 밑면이
   y=0.50이었다 — 몸통 윗면(0.46)과 상판 밑면(0.50) 사이에 0.04m 틈이 남아 상판이 허공에 떠
   보였다(9개 책상 전부, `classroomDesk` 헬퍼 하나에서 나오므로 반복 발생). 몸통 높이를 0.52(중심
   y=0.26)로 늘려 바닥에 닿으면서 상판 밑면에 2cm 파묻히도록(이 파일의 다른 파츠들과 같은 크기의
   임베딩) 수정.
3. **`SCENE_TEMPLATES`/`SCENE_TEMPLATE_CATEGORIES` 이름 충돌 위험** — 이 저장소에는 이미
   `studio-scene-templates.ts`(2D 패널-구성 기능, `StudioPage.tsx`/`studio-comipo-*`가 사용 중)가
   정확히 같은 이름으로 export하고 있었다. 지금 당장 컴파일이 깨지진 않지만(어느 파일도 둘 다
   import하지 않음), §2.2가 계획한 `StudioBackground3D.tsx` 통합이 실행되는 순간 이름이 겹칠
   잠재적 지뢰였다 — `BG_SCENE_TEMPLATES`/`BG_SCENE_TEMPLATE_CATEGORIES`/
   `BG_SCENE_TEMPLATE_CATEGORY_LABELS`로 개명해 제거했다(3개 파일 전부 반영, 위 §0.2/§2.2/§2.5
   코드 스니펫도 갱신됨). `BgSceneTemplate`/`BgSceneTemplateCategory` 타입명은 애초에 `Bg` 접두가
   있어 충돌이 없었으므로 그대로 둔다.

세 항목 모두 `studio-background-3d-scene-templates.test.ts`에 실측 기반 회귀 테스트로
추가되었다(카페 테이블 반지름 sanity, 스택 파츠 뜬 틈 없음 실측 스윕, 미지 presetId 방어 동작).
