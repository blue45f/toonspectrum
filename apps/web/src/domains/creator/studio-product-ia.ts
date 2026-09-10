/**
 * ToonStudio final product IA contract.
 *
 * Feature breadth may grow, but the user-facing concepts below are intentionally bounded:
 * - four global destinations
 * - six project destinations
 * - nine default direct-manipulation tools
 * - four user-facing work states
 * - exactly one primary surface for every capability
 *
 * New features must project into one of these owners instead of creating another top-level hub,
 * library, lab or status vocabulary.
 */

export const STUDIO_GLOBAL_NAVIGATION = [
  { id: "work", label: "내 작업", href: "/studio" },
  { id: "create", label: "새로 만들기", href: "/studio/new" },
  { id: "assets", label: "에셋", href: "/studio/assets" },
  { id: "learn", label: "배우기", href: "/learn" },
] as const;

export const STUDIO_PROJECT_NAVIGATION = [
  { id: "overview", label: "개요" },
  { id: "story", label: "스토리" },
  { id: "production", label: "제작" },
  { id: "assets", label: "에셋" },
  { id: "review", label: "검토" },
  { id: "export", label: "내보내기" },
] as const;

export const STUDIO_DEFAULT_TOOL_GROUPS = [
  { id: "select", label: "선택", members: ["select"] },
  { id: "brush", label: "브러시", members: ["pen", "pixel-pencil"] },
  { id: "eraser", label: "지우개", members: ["eraser"] },
  { id: "fill", label: "채우기", members: ["fill", "lasso-fill"] },
  { id: "selection", label: "영역 선택", members: ["marquee-rect", "marquee-circle", "lasso"] },
  { id: "transform", label: "변형", members: ["transform", "crop"] },
  { id: "shape", label: "컷·도형", members: ["smart-shape", "shape-rect", "shape-ellipse"] },
  { id: "lettering", label: "글자·말풍선", members: ["text", "bubble"] },
  { id: "color", label: "색상", members: ["eyedropper"] },
] as const;

export const STUDIO_USER_WORK_STATES = [
  { id: "safe", label: "저장됨" },
  { id: "processing", label: "저장 중" },
  { id: "offline-safe", label: "오프라인에서도 안전" },
  { id: "attention", label: "확인할 내용이 있어요" },
] as const;

export const STUDIO_FORBIDDEN_DEFAULT_UI_TERMS = [
  "revision",
  "리비전",
  "lease",
  "crdt",
  "opfs",
  "sqlite",
  "provider",
  "leader tab",
  "follower tab",
  "writer tab",
  "server lock",
  "서버 잠금",
] as const;

export type StudioCapabilityMaturity = "stable" | "beta" | "labs";
export type StudioSurfaceRole = "primary" | "projection" | "diagnostic" | "legacy";

export interface StudioCapabilitySurface {
  readonly id: string;
  readonly role: StudioSurfaceRole;
}

export interface StudioCapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly owner: string;
  readonly primaryRoute: string;
  readonly maturity: StudioCapabilityMaturity;
  readonly surfaces: readonly StudioCapabilitySurface[];
  readonly aliases?: readonly string[];
}

export const STUDIO_CAPABILITY_REGISTRY: readonly StudioCapabilityDefinition[] = [
  {
    id: "project.home",
    label: "내 작업",
    owner: "project",
    primaryRoute: "/studio",
    maturity: "stable",
    surfaces: [
      { id: "studio-home", role: "primary" },
      { id: "header-work-link", role: "projection" },
      { id: "mobile-work-tab", role: "projection" },
    ],
    aliases: ["프로젝트 센터", "creator hub"],
  },
  {
    id: "project.create",
    label: "새로 만들기",
    owner: "project",
    primaryRoute: "/studio/new",
    maturity: "stable",
    surfaces: [
      { id: "studio-new", role: "primary" },
      { id: "header-create-action", role: "projection" },
      { id: "mobile-create-tab", role: "projection" },
    ],
    aliases: ["make", "quick start"],
  },
  {
    id: "story.workspace",
    label: "스토리",
    owner: "story",
    primaryRoute: "/studio/p/:projectId/story",
    maturity: "beta",
    surfaces: [
      { id: "project-story", role: "primary" },
      { id: "comic-story-command", role: "projection" },
      { id: "assistant-story-context", role: "projection" },
      { id: "story-lab-route", role: "legacy" },
      { id: "storyworld-route", role: "legacy" },
    ],
    aliases: ["스토리 연구실", "storyworld", "writer room", "리서치"],
  },
  {
    id: "asset.library",
    label: "에셋",
    owner: "assets",
    primaryRoute: "/studio/assets",
    maturity: "beta",
    surfaces: [
      { id: "studio-assets", role: "primary" },
      { id: "project-assets", role: "projection" },
      { id: "insert-assets", role: "projection" },
      { id: "asset-market", role: "projection" },
      { id: "studio-assets-placeholder", role: "legacy" },
    ],
    aliases: ["내 에셋", "에셋 마켓", "소재", "library"],
  },
  {
    id: "brush.library",
    label: "브러시 선택",
    owner: "brush",
    primaryRoute: "/studio/assets/brushes",
    maturity: "stable",
    surfaces: [
      { id: "brush-hub", role: "primary" },
      { id: "brush-quick-strip", role: "projection" },
      { id: "brush-professional-panel", role: "projection" },
      { id: "brush-mobile-sheet", role: "projection" },
      { id: "brush-command-search", role: "projection" },
      { id: "brush-library-sheet", role: "legacy" },
      { id: "saved-brush-panel", role: "legacy" },
    ],
    aliases: ["빠른 브러시", "서브 도구", "전체 라이브러리", "내 브러시"],
  },
  {
    id: "brush.editor",
    label: "브러시 설정",
    owner: "brush",
    primaryRoute: "/studio/assets/brushes/:brushId/edit",
    maturity: "beta",
    surfaces: [
      { id: "brush-editor", role: "primary" },
      { id: "brush-current-settings", role: "projection" },
      { id: "brush-studio", role: "legacy" },
      { id: "brush-lab-v6", role: "legacy" },
      { id: "brush-v5-diagnostic", role: "diagnostic" },
    ],
    aliases: ["브러시 스튜디오", "브러시 연구실", "brush lab", "V6 작업대"],
  },
  {
    id: "review.workspace",
    label: "검토",
    owner: "review",
    primaryRoute: "/studio/p/:projectId/review",
    maturity: "beta",
    surfaces: [
      { id: "project-review", role: "primary" },
      { id: "editor-comments", role: "projection" },
      { id: "share-action", role: "projection" },
      { id: "review-route", role: "legacy" },
      { id: "versions-route", role: "legacy" },
    ],
    aliases: ["리뷰", "공유", "버전", "승인"],
  },
  {
    id: "export.workspace",
    label: "내보내기",
    owner: "export",
    primaryRoute: "/studio/p/:projectId/export",
    maturity: "beta",
    surfaces: [
      { id: "project-export", role: "primary" },
      { id: "editor-export-action", role: "projection" },
      { id: "publish-route", role: "legacy" },
      { id: "publishing-page", role: "legacy" },
    ],
    aliases: ["게시", "출판", "퍼블리싱", "publish package"],
  },
  {
    id: "assistant.contextual",
    label: "도우미",
    owner: "assistant",
    primaryRoute: "/studio/p/:projectId/d/:documentId",
    maturity: "beta",
    surfaces: [
      { id: "assistant-panel", role: "primary" },
      { id: "contextual-ai-actions", role: "projection" },
      { id: "command-palette-ai", role: "projection" },
      { id: "legacy-ai-menu", role: "legacy" },
    ],
    aliases: ["AI", "AI 어시스트", "Copilot"],
  },
  {
    id: "three-d.workspace",
    label: "3D",
    owner: "3d",
    primaryRoute: "/studio/p/:projectId/d/:documentId?workspace=3d",
    maturity: "beta",
    surfaces: [
      { id: "document-3d-workspace", role: "primary" },
      { id: "insert-3d", role: "projection" },
      { id: "image-to-3d-action", role: "projection" },
      { id: "bg3d-route", role: "legacy" },
      { id: "poser-route", role: "legacy" },
      { id: "hybrid-dcc", role: "diagnostic" },
    ],
    aliases: ["배경 3D", "포저", "캐릭터 셰이퍼", "Lift 3D"],
  },
] as const;

export const STUDIO_LEGACY_ROUTE_ALIASES = [
  { from: "/make", to: "/studio/new" },
  { from: "/creator-hub", to: "/studio" },
  { from: "/brush-lab", to: "/studio/assets/brushes/new" },
  { from: "/shaper", to: "/studio/assets/characters/new" },
  { from: "/music", to: "/studio/assets/audio" },
  { from: "/publishing", to: "/studio/publish" },
  { from: "/create", to: "/showcase" },
] as const;

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function containsForbiddenTerm(value: string): string | null {
  const normalized = value.toLocaleLowerCase();
  return STUDIO_FORBIDDEN_DEFAULT_UI_TERMS.find((term) =>
    normalized.includes(term.toLocaleLowerCase())
  ) ?? null;
}

export function studioCapabilityById(id: string): StudioCapabilityDefinition | null {
  return STUDIO_CAPABILITY_REGISTRY.find((capability) => capability.id === id) ?? null;
}

export function validateStudioProductIa(): readonly string[] {
  const issues: string[] = [];

  if (STUDIO_GLOBAL_NAVIGATION.length !== 4) {
    issues.push(`global navigation must contain 4 items, found ${STUDIO_GLOBAL_NAVIGATION.length}`);
  }
  if (STUDIO_PROJECT_NAVIGATION.length !== 6) {
    issues.push(`project navigation must contain 6 items, found ${STUDIO_PROJECT_NAVIGATION.length}`);
  }
  if (STUDIO_DEFAULT_TOOL_GROUPS.length !== 9) {
    issues.push(`default tool rail must contain 9 groups, found ${STUDIO_DEFAULT_TOOL_GROUPS.length}`);
  }
  if (STUDIO_USER_WORK_STATES.length !== 4) {
    issues.push(`user work states must contain 4 states, found ${STUDIO_USER_WORK_STATES.length}`);
  }

  for (const duplicate of duplicateValues(STUDIO_GLOBAL_NAVIGATION.map((item) => item.id))) {
    issues.push(`duplicate global navigation id: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(STUDIO_PROJECT_NAVIGATION.map((item) => item.id))) {
    issues.push(`duplicate project navigation id: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(STUDIO_DEFAULT_TOOL_GROUPS.map((item) => item.id))) {
    issues.push(`duplicate default tool id: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(STUDIO_CAPABILITY_REGISTRY.map((item) => item.id))) {
    issues.push(`duplicate capability id: ${duplicate}`);
  }
  for (const duplicate of duplicateValues(STUDIO_LEGACY_ROUTE_ALIASES.map((item) => item.from))) {
    issues.push(`duplicate legacy route alias: ${duplicate}`);
  }

  for (const capability of STUDIO_CAPABILITY_REGISTRY) {
    const primary = capability.surfaces.filter((surface) => surface.role === "primary");
    if (primary.length !== 1) {
      issues.push(`${capability.id} must own exactly one primary surface, found ${primary.length}`);
    }
    for (const duplicate of duplicateValues(capability.surfaces.map((surface) => surface.id))) {
      issues.push(`${capability.id} has duplicate surface: ${duplicate}`);
    }
  }

  const visibleLabels = [
    ...STUDIO_GLOBAL_NAVIGATION.map((item) => item.label),
    ...STUDIO_PROJECT_NAVIGATION.map((item) => item.label),
    ...STUDIO_DEFAULT_TOOL_GROUPS.map((item) => item.label),
    ...STUDIO_USER_WORK_STATES.map((item) => item.label),
    ...STUDIO_CAPABILITY_REGISTRY.map((item) => item.label),
  ];
  for (const label of visibleLabels) {
    const term = containsForbiddenTerm(label);
    if (term) issues.push(`default UI label "${label}" contains internal term "${term}"`);
  }

  return Object.freeze(issues);
}
