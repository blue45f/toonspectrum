/**
 * Inspector information density — the default/advanced split, as data.
 *
 * `docs/rewrite/ux-audit-v5.md` §2.5 measured 33 controls in the inspector's
 * properties tab and 13 groups / 35 leaves in the tool-properties palette,
 * against a V5 §15 budget of **5~9 default controls, everything else behind an
 * Advanced section**. The audit also pointed at
 * `StudioImageAdjustmentsPanel.tsx:575-621` (`AdjustmentSection`) as the
 * pattern already correct in this repo; `StudioInspectorAside.tsx` renders the
 * split declared here with a port of it (`InspectorSection`).
 *
 * ## Why this is data and not just JSX
 *
 * Two contracts need to be machine-checkable without mounting a 4000-line
 * component: the default budget (5~9), and "nothing was removed — every
 * control is still reachable from Advanced". Both are asserted against this
 * table in `studio-inspector-density.test.ts`.
 *
 * ## On what evidence controls were assigned to the default tier
 *
 * **There is no usage telemetry in this repo.** No module records which
 * inspector control gets touched, so a frequency ranking measured on our own
 * users does not exist and this file does not pretend otherwise. The
 * assignment below uses four stated proxies, in priority order, and every
 * default-tier row records which one it leans on in `rationale`:
 *
 * 1. **Unconditional render.** A control the current inspector shows for
 *    *every* selection type was already judged universal by the code that
 *    exists (클리핑 `:2417`, 그룹 `:2427` are the only two).
 * 2. **Earned a chord or a menu row.** A control that also appears in
 *    `studio-command-catalog.ts` with a shortcut has demonstrated traffic —
 *    nobody spends a chord on a rarely used control (복제 ⌘J, 삭제 Delete,
 *    브러시 크기 `[`·`]`).
 * 3. **Competitor default surface.** What CSP's layer palette, Photoshop's
 *    Layers panel / options bar and Procreate's always-visible rail keep on
 *    screen with no disclosure: blend mode, opacity, clipping, size, flow,
 *    hardness.
 * 4. **Direct manipulation exists.** A control with an on-canvas equivalent
 *    (numeric X/Y/W/H/rotation vs. transform handles) is demoted, because the
 *    panel is the secondary path for it.
 *
 * Section boundaries follow the component's existing contiguous JSX spans, so
 * the split is a wrap rather than a re-order. When a better frequency signal
 * exists this table is the single place to revise.
 */

/* ------------------------------------------------------------------ types */

export type StudioInspectorPanelId = "element-properties" | "tool-properties";

export type StudioInspectorTier = "default" | "advanced";

/**
 * Canonical property key. Two groups in different panels that mean the same
 * thing must share this key **and** the label attached to it — that is the
 * "모드가 달라도 동일 명칭" requirement, enforced by contract test.
 */
export type StudioInspectorCanonicalKey =
  | "color"
  | "opacity"
  | "blend-mode"
  | "clipping"
  | "group"
  | "pixel-tools"
  | "edit-text"
  | "duplicate"
  | "delete"
  | "size"
  | "stamp-tuning"
  | "quick-shape"
  | "shape-style"
  | "text-fill"
  | "bubble"
  | "typography"
  | "text-align"
  | "constraints"
  | "blend-extended"
  | "layout"
  | "effect-lines"
  | "order-align"
  | "line-correction"
  | "brush-studio"
  | "brush-engines"
  | "symmetry"
  | "rulers";

export interface StudioInspectorControlGroup {
  id: string;
  canonical: StudioInspectorCanonicalKey;
  /** Header text. Must equal `STUDIO_INSPECTOR_CANONICAL_LABELS[canonical]`. */
  label: string;
  tier: StudioInspectorTier;
  /** Individual controls this group renders — the audit counts leaves. */
  leaves: number;
  /** Source-of-truth line span in `StudioInspectorAside.tsx`, measured. */
  source: string;
  /** Which proxy above justifies the tier. */
  rationale: string;
  /** Search corpus id that keeps this group reachable once it is collapsed. */
  searchEntryId?: string;
}

export interface StudioInspectorPanelDensity {
  id: StudioInspectorPanelId;
  label: string;
  groups: readonly StudioInspectorControlGroup[];
}

/**
 * One name per concept, across every panel and every tool mode.
 *
 * The measured violation this fixes: the element inspector called it
 * **불투명도** (`StudioInspectorAside.tsx:2388`) while the tool-properties
 * palette called the same 0–100% control **투명도** (`:3517`).
 */
export const STUDIO_INSPECTOR_CANONICAL_LABELS: Readonly<
  Record<StudioInspectorCanonicalKey, string>
> = Object.freeze({
  color: "색상",
  opacity: "불투명도",
  "blend-mode": "혼합 모드",
  clipping: "아래 레이어에 클리핑",
  group: "그룹",
  "pixel-tools": "픽셀 도구",
  "edit-text": "글자 편집",
  duplicate: "복제",
  delete: "삭제",
  size: "크기",
  "stamp-tuning": "흐름·경도",
  "quick-shape": "퀵 셰이프",
  "shape-style": "도형 스타일",
  "text-fill": "글자 채우기 스타일",
  bubble: "말풍선",
  typography: "타이포그래피",
  "text-align": "글자 정렬",
  constraints: "배치 제약",
  "blend-extended": "확장 블렌드",
  layout: "배치",
  "effect-lines": "집중선·속도선",
  "order-align": "정렬·순서",
  "line-correction": "선 보정",
  "brush-studio": "브러시 스튜디오",
  "brush-engines": "브러시 엔진",
  symmetry: "대칭 자",
  rulers: "자·가이드",
});

/** V5 §15 budget for the default tier, counted in leaves. */
export const STUDIO_INSPECTOR_DEFAULT_BUDGET = Object.freeze({
  min: 5,
  max: 9,
});

/* ----------------------------------------------------------------- tables */

const label = (canonical: StudioInspectorCanonicalKey): string =>
  STUDIO_INSPECTOR_CANONICAL_LABELS[canonical];

const ELEMENT_PROPERTIES: readonly StudioInspectorControlGroup[] = [
  /* -------------------------------------------------------------- default */
  {
    id: "element.color",
    canonical: "color",
    label: label("color"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:1848-1858",
    rationale:
      "프록시 3 — 색상 스와치는 CSP 컬러 서클·PS 전경색·Procreate 상단 원 모두 상시 노출한다.",
  },
  {
    id: "element.opacity",
    canonical: "opacity",
    label: label("opacity"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:2388-2403",
    rationale:
      "프록시 3 — CSP 레이어 팔레트·PS 레이어 패널의 기본 행에 항상 있다.",
    searchEntryId: "property.opacity",
  },
  {
    id: "element.clipping",
    canonical: "clipping",
    label: label("clipping"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:2417-2425",
    rationale:
      "프록시 1 — 선택 타입과 무관하게 무조건 렌더되는 두 컨트롤 중 하나다.",
    searchEntryId: "property.clipping",
  },
  {
    id: "element.group",
    canonical: "group",
    label: label("group"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:2427-2444",
    rationale: "프록시 1 — 무조건 렌더되는 나머지 하나다.",
  },
  {
    id: "element.blend-mode",
    canonical: "blend-mode",
    label: label("blend-mode"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:2446-2472",
    rationale:
      "프록시 3 — 위와 같은 근거. 16개 옵션은 select 안에 이미 접혀 있다.",
    searchEntryId: "property.blend-mode",
  },
  {
    id: "element.pixel-tools",
    canonical: "pixel-tools",
    label: label("pixel-tools"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:2598-3189",
    rationale:
      "프록시 1 — 5개 탭 스트립 자체는 컨트롤 1개다. 탭 내부는 이미 점진적 노출이라 예산에 1로 든다.",
  },
  {
    id: "element.edit-text",
    canonical: "edit-text",
    label: label("edit-text"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:3192-3196",
    rationale:
      "프록시 3 — 텍스트/말풍선 선택의 1차 동작이며 텍스트가 아닌 선택에서는 렌더되지 않는다.",
  },
  {
    id: "element.duplicate",
    canonical: "duplicate",
    label: label("duplicate"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:3273-3275",
    rationale: "프록시 2 — ⌘J 코드를 가진 명령(`edit.duplicate`)이다.",
  },
  {
    id: "element.delete",
    canonical: "delete",
    label: label("delete"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:3276-3278",
    rationale:
      "프록시 2 — Delete 코드를 가진 명령(`edit.delete-selection`)이다.",
  },

  /* ------------------------------------------------------------- advanced */
  {
    id: "element.shape-style",
    canonical: "shape-style",
    label: label("shape-style"),
    tier: "advanced",
    leaves: 4,
    source: "StudioInspectorAside.tsx:1755-1846",
    rationale: "그라데이션·패턴·선 스타일·도형 종류. 도형 선택에서만 의미가 있다.",
  },
  {
    id: "element.text-fill",
    canonical: "text-fill",
    label: label("text-fill"),
    tier: "advanced",
    leaves: 2,
    source: "StudioInspectorAside.tsx:1860-1897",
    rationale: "텍스트 그라데이션 채우기.",
  },
  {
    id: "element.bubble",
    canonical: "bubble",
    label: label("bubble"),
    tier: "advanced",
    leaves: 4,
    source: "StudioInspectorAside.tsx:1898-1970",
    rationale: "말풍선 외형·모양·앵커·꼬리.",
  },
  {
    id: "element.typography",
    canonical: "typography",
    label: label("typography"),
    tier: "advanced",
    leaves: 15,
    source: "StudioInspectorAside.tsx:1971-2318",
    rationale:
      "글꼴·크기·굵기·기울임 + 효과·곡선 텍스트·외곽선·자간/행간·그림자. 파일에서 연속된 한 덩어리라 한 섹션으로 접는다.",
  },
  {
    id: "element.constraints",
    canonical: "constraints",
    label: label("constraints"),
    tier: "advanced",
    leaves: 3,
    source: "StudioInspectorAside.tsx:2319-2339 + 2405-2415",
    rationale:
      "패널 안에 가두기·꽉 채우기·비율 잠금. 비율 잠금이 같은 개념이라 한 섹션으로 모았다.",
  },
  {
    id: "element.text-align",
    canonical: "text-align",
    label: label("text-align"),
    tier: "advanced",
    leaves: 3,
    source: "StudioInspectorAside.tsx:2340-2387",
    rationale: "정렬·세로 쓰기·높이를 텍스트에 맞춤.",
  },
  {
    id: "element.blend-extended",
    canonical: "blend-extended",
    label: label("blend-extended"),
    tier: "advanced",
    leaves: 3,
    source: "StudioInspectorAside.tsx:2474-2489",
    rationale: "이미지 선택 전용 확장 블렌드.",
  },
  {
    id: "element.layout",
    canonical: "layout",
    label: label("layout"),
    tier: "advanced",
    leaves: 7,
    source: "StudioInspectorAside.tsx:2491-2569",
    rationale:
      "프록시 4 — X·Y·너비·높이·회전·기울이기는 캔버스 핸들로 직접 조작 가능하다. 숫자 입력은 보조 경로다.",
    searchEntryId: "property.transform-numeric",
  },
  {
    id: "element.effect-lines",
    canonical: "effect-lines",
    label: label("effect-lines"),
    tier: "advanced",
    leaves: 2,
    source: "StudioInspectorAside.tsx:2571-2596",
    rationale: "집중선·속도선·프레임 전용 컨트롤.",
  },
  {
    id: "element.order-align",
    canonical: "order-align",
    label: label("order-align"),
    tier: "advanced",
    leaves: 12,
    source: "StudioInspectorAside.tsx:3197-3272",
    rationale:
      "3D·배경 재편집 2 + 좌우/상하 반전 2 + 순서 2 + 정렬 6. 액션바 15개 중 12개가 여기로 접힌다.",
  },
];

const TOOL_PROPERTIES: readonly StudioInspectorControlGroup[] = [
  /* -------------------------------------------------------------- default */
  {
    id: "tool.color",
    canonical: "color",
    label: label("color"),
    tier: "default",
    leaves: 2,
    source: "StudioInspectorAside.tsx:3484-3495",
    rationale:
      "프록시 3 — 색상과 스포이드는 Procreate 상시 레일과 CSP 도구 속성 최상단에 있다.",
  },
  {
    id: "tool.size",
    canonical: "size",
    label: label("size"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:3499-3514",
    rationale:
      "프록시 2+3 — `[`·`]` 코드(`brush.size-decrease/increase`)를 가졌고 모든 경쟁 제품이 상시 노출한다.",
  },
  {
    id: "tool.opacity",
    canonical: "opacity",
    label: label("opacity"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:3517-3531",
    rationale:
      "프록시 2+3 — `brush.opacity-step` 코드가 있다. 명칭을 요소 인스펙터와 '불투명도'로 통일했다(기존 '투명도').",
  },
  {
    id: "tool.stamp-tuning",
    canonical: "stamp-tuning",
    label: label("stamp-tuning"),
    tier: "default",
    leaves: 3,
    source: "StudioInspectorAside.tsx:3533-3567",
    rationale:
      "프록시 3 — Flow·Hardness 는 Photoshop 옵션 막대의 기본 노출 항목이다. 최소 굵기가 같은 map 에 묶여 있다.",
  },
  {
    id: "tool.quick-shape",
    canonical: "quick-shape",
    label: label("quick-shape"),
    tier: "default",
    leaves: 1,
    source: "StudioInspectorAside.tsx:3582-3607",
    rationale:
      "프록시 3 — Procreate QuickShape 대응 기능이고 펜 모드에서만 렌더된다.",
  },

  /* ------------------------------------------------------------- advanced */
  {
    id: "tool.line-correction",
    canonical: "line-correction",
    label: label("line-correction"),
    tier: "advanced",
    leaves: 5,
    source: "StudioInspectorAside.tsx:3569-3580",
    rationale:
      "입력 보정·보정 방식·즉시 반응·그린 후 보정·모서리 유지. 자체 헤더를 가진 5개짜리 묶음이다.",
  },
  {
    id: "tool.brush-studio",
    canonical: "brush-studio",
    label: label("brush-studio"),
    tier: "advanced",
    leaves: 27,
    source: "StudioInspectorAside.tsx:3609-3642",
    rationale:
      "감사 실측 21 Range + 6 Toggle. 모달+탭이라 그 안에서는 이미 기준 충족이었다.",
    searchEntryId: "panel.brush-studio",
  },
  {
    id: "tool.brush-engines",
    canonical: "brush-engines",
    label: label("brush-engines"),
    tier: "advanced",
    leaves: 2,
    source: "StudioInspectorAside.tsx:3643-3660",
    rationale: "호쿠사이 내추럴 미디어 + 절차적 아티스틱 브러시. 둘 다 자체 헤더를 가진 엔진 마운트다.",
  },
  {
    id: "tool.symmetry",
    canonical: "symmetry",
    label: label("symmetry"),
    tier: "advanced",
    leaves: 5,
    source: "StudioInspectorAside.tsx:3661-3743",
    rationale: "대칭 유형·갈래 수·중앙 X/Y·중앙 정렬.",
  },
  {
    id: "tool.rulers",
    canonical: "rulers",
    label: label("rulers"),
    tier: "advanced",
    leaves: 3,
    source: "StudioInspectorAside.tsx:3744-3803",
    rationale: "원근 자·아이소메트릭 그리드·고급 자. 세 패널 모두 자체 헤더를 갖는다.",
  },
];

export const STUDIO_INSPECTOR_DENSITY: Readonly<
  Record<StudioInspectorPanelId, StudioInspectorPanelDensity>
> = Object.freeze({
  "element-properties": {
    id: "element-properties",
    label: "선택 요소 속성",
    groups: Object.freeze(ELEMENT_PROPERTIES),
  },
  "tool-properties": {
    id: "tool-properties",
    label: "도구 속성",
    groups: Object.freeze(TOOL_PROPERTIES),
  },
});

/* ---------------------------------------------------------------- lookups */

export function inspectorGroups(
  panel: StudioInspectorPanelId,
): readonly StudioInspectorControlGroup[] {
  return STUDIO_INSPECTOR_DENSITY[panel].groups;
}

export function inspectorGroupsByTier(
  panel: StudioInspectorPanelId,
  tier: StudioInspectorTier,
): readonly StudioInspectorControlGroup[] {
  return inspectorGroups(panel).filter((group) => group.tier === tier);
}

/** Controls visible with no disclosure — the number V5 §15 caps at 5~9. */
export function inspectorDefaultLeafCount(
  panel: StudioInspectorPanelId,
): number {
  return inspectorGroupsByTier(panel, "default").reduce(
    (total, group) => total + group.leaves,
    0,
  );
}

/** Controls reachable at all. Must not shrink — Wave D collapses, never cuts. */
export function inspectorTotalLeafCount(panel: StudioInspectorPanelId): number {
  return inspectorGroups(panel).reduce(
    (total, group) => total + group.leaves,
    0,
  );
}

/** Advanced section ids, in render order. */
export function inspectorAdvancedSectionIds(
  panel: StudioInspectorPanelId,
): string[] {
  return inspectorGroupsByTier(panel, "advanced").map((group) => group.id);
}

/** Header text for an advanced section id, or `null` when it is not declared. */
export function inspectorSectionLabel(id: string): string | null {
  for (const panel of Object.values(STUDIO_INSPECTOR_DENSITY)) {
    const group = panel.groups.find((candidate) => candidate.id === id);
    if (group) return group.label;
  }
  return null;
}
