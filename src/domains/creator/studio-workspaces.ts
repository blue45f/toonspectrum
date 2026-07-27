import {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  normalizeStudioDrawingPaletteLayout,
  type StudioDrawingPaletteLayout,
} from "./studio-drawing-palettes";
import {
  DEFAULT_STUDIO_INSPECTOR_LAYOUT,
  STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY,
  STUDIO_DOCUMENT_INSPECTOR_SECTIONS,
  STUDIO_IMAGE_INSPECTOR_SECTIONS,
  STUDIO_INSPECTOR_PRIMARY_SECTIONS,
  normalizeStudioInspectorLayout,
  type StudioInspectorLayout,
} from "./studio-inspector-layout";
import {
  DEFAULT_STUDIO_QUICK_ACTIONS,
  QUICK_ACTION_IDS,
  QUICK_ACTION_SLOTS,
  STUDIO_QUICK_ACTIONS_STORAGE_KEY,
  normalizeStudioQuickActionsPreferences,
  type StudioQuickActionId,
  type StudioQuickActionsPreferences,
} from "./studio-quick-actions";

export {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  STUDIO_DRAWING_PALETTE_MAX_PERCENT,
  STUDIO_DRAWING_PALETTE_MIN_PERCENT,
  moveStudioDrawingPalette,
  normalizeStudioDrawingPaletteLayout,
  resizeStudioDrawingPalettes,
  toggleStudioDrawingPalette,
} from "./studio-drawing-palettes";
export type {
  StudioCanonicalDrawingPaletteLayout,
  StudioDrawingPaletteId,
  StudioDrawingPaletteLayout,
  StudioDrawingPaletteLockKind,
  StudioDrawingPaletteLocks,
  StudioDrawingPaletteLockState,
  StudioDrawingPaletteMoveDirection,
} from "./studio-drawing-palettes";

/**
 * Studio workspace persistence intentionally contains UI layout only.
 *
 * Project content, asset payloads, AI requests, provider settings, and credentials do not belong in
 * this model. Normalization rebuilds a field allowlist, so unrelated keys from untrusted storage are
 * discarded before the value can be returned or saved again.
 */

export const STUDIO_WORKSPACE_STATE_VERSION = 3 as const;
export const STUDIO_WORKSPACE_PAYLOAD_VERSION = 3 as const;
export const STUDIO_WORKSPACE_MAX_CUSTOM = 24;
export const STUDIO_WORKSPACE_NAME_MAX_LENGTH = 48;
export const STUDIO_WORKSPACE_RAW_MAX_BYTES = 64 * 1024;
export const STUDIO_WORKSPACE_STORAGE_KEY = "toonspectrum:studio:workspaces";

export const STUDIO_WORKSPACE_LEFT_PANEL_WIDTH = Object.freeze({
  minimum: 128,
  default: 160,
  maximum: 360,
});
export const STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH = Object.freeze({
  minimum: 240,
  default: 280,
  maximum: 720,
});

export const STUDIO_LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY = "studio:leftW";
export const STUDIO_LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY = "studio:rightW";

/** The original six presets remain stable for existing shortcuts, help copy, and saved state. */
export const STUDIO_CLASSIC_WORKSPACE_IDS = [
  "storyboard",
  "lineart",
  "coloring",
  "lettering",
  "review",
  "publish",
] as const;

export const STUDIO_DEFAULT_WORKSPACE_IDS = [
  ...STUDIO_CLASSIC_WORKSPACE_IDS,
  "pro-comic",
] as const;

export const STUDIO_PRO_COMIC_PALETTE_PRIORITY = [
  "tool-properties",
  "layers",
  "pages",
  "materials-quick-access",
] as const;

export type StudioClassicWorkspaceId = (typeof STUDIO_CLASSIC_WORKSPACE_IDS)[number];
export const STUDIO_MOBILE_CONTROL_SIDES = ["left", "right"] as const;

export type StudioDefaultWorkspaceId = (typeof STUDIO_DEFAULT_WORKSPACE_IDS)[number];
export type StudioProComicPalettePriority =
  (typeof STUDIO_PRO_COMIC_PALETTE_PRIORITY)[number];
export type StudioMobileControlSide = (typeof STUDIO_MOBILE_CONTROL_SIDES)[number];
export type StudioWorkspaceId = StudioDefaultWorkspaceId | string;
export type StudioWorkspaceMoveDirection = "up" | "down";

export interface StudioWorkspaceDesktopLayout {
  readonly leftPanelOpen: boolean;
  readonly rightPanelOpen: boolean;
  readonly leftPanelWidth: number;
  readonly rightPanelWidth: number;
}

export interface StudioWorkspaceLayout {
  readonly inspector: StudioInspectorLayout;
  readonly desktop: StudioWorkspaceDesktopLayout;
  readonly drawingPalettes: StudioDrawingPaletteLayout;
  readonly quickActions: StudioQuickActionsPreferences;
}

export interface StudioDefaultWorkspace {
  readonly id: StudioDefaultWorkspaceId;
  readonly name: string;
  readonly description: string;
  readonly layout: StudioWorkspaceLayout;
}

export interface StudioCustomWorkspace {
  readonly id: string;
  readonly name: string;
  readonly layout: StudioWorkspaceLayout;
}

export interface StudioWorkspaceState {
  readonly version: typeof STUDIO_WORKSPACE_STATE_VERSION;
  readonly activeWorkspaceId: StudioWorkspaceId;
  readonly liveLayout: StudioWorkspaceLayout;
  readonly customWorkspaces: readonly StudioCustomWorkspace[];
  readonly mobileControlSide: StudioMobileControlSide;
  readonly applyQuickActionsOnSwitch: boolean;
}

export interface StudioWorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type StudioWorkspaceLoadStorage = Pick<StudioWorkspaceStorage, "getItem"> &
  Partial<Pick<StudioWorkspaceStorage, "setItem" | "removeItem">>;

export interface StudioWorkspaceMigrationInput {
  readonly inspector?: unknown;
  readonly quickActions?: unknown;
  readonly leftPanelOpen?: unknown;
  readonly rightPanelOpen?: unknown;
  readonly leftPanelWidth?: unknown;
  readonly rightPanelWidth?: unknown;
  readonly mobileControlSide?: unknown;
  readonly applyQuickActionsOnSwitch?: unknown;
}

export type StudioWorkspacePersistenceStatus = "persisted" | "session-only";
export type StudioWorkspacePersistenceFailure =
  | "storage-unavailable"
  | "read-failed"
  | "write-failed"
  | "verification-failed"
  | "owner-mismatch"
  | "invalid-payload"
  | "payload-too-large";

export interface StudioWorkspaceSaveResult {
  readonly state: StudioWorkspaceState;
  readonly ownerScope: string;
  readonly status: StudioWorkspacePersistenceStatus;
  readonly failure: StudioWorkspacePersistenceFailure | null;
}

export type StudioWorkspaceLoadSource =
  | "current"
  | "legacy-v1"
  | "legacy-v2"
  | "legacy-preferences"
  | "default";

export interface StudioWorkspaceLoadResult {
  readonly state: StudioWorkspaceState;
  readonly ownerScope: string;
  readonly source: StudioWorkspaceLoadSource;
  /** Whether an accepted value already resides under the stable owner key. */
  readonly status: StudioWorkspacePersistenceStatus;
  readonly failure: StudioWorkspacePersistenceFailure | null;
}

export interface StudioWorkspaceSaveOptions {
  /** Scope returned by loadStudioWorkspacePersistence; prevents auth-transition cross-writes. */
  readonly sourceOwnerScope?: string;
}

const LEGACY_V1_STORAGE_PREFIX = "toonspectrum-studio-workspaces:v1";
const WORKSPACE_ENVELOPE_KIND = "toonspectrum.studio-workspaces";
const STORAGE_KEY_MAX_LENGTH = 160;
const CUSTOM_ID_MAX_LENGTH = 80;
const CUSTOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u;

const DEFAULT_ID_SET = new Set<string>(STUDIO_DEFAULT_WORKSPACE_IDS);
const PRIMARY_SECTION_SET = new Set<string>(STUDIO_INSPECTOR_PRIMARY_SECTIONS);
const IMAGE_SECTION_SET = new Set<string>(STUDIO_IMAGE_INSPECTOR_SECTIONS);
const DOCUMENT_SECTION_SET = new Set<string>(STUDIO_DOCUMENT_INSPECTOR_SECTIONS);
const QUICK_ACTION_ID_SET = new Set<string>(QUICK_ACTION_IDS);
const MOBILE_CONTROL_SIDE_SET = new Set<string>(STUDIO_MOBILE_CONTROL_SIDES);
const STATE_OWNER_SCOPES = new WeakMap<object, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampPanelWidth(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeDesktopLayout(
  value: unknown,
  fallback: StudioWorkspaceDesktopLayout
): StudioWorkspaceDesktopLayout {
  if (!isRecord(value)) return Object.freeze({ ...fallback });
  return Object.freeze({
    leftPanelOpen:
      typeof value.leftPanelOpen === "boolean"
        ? value.leftPanelOpen
        : fallback.leftPanelOpen,
    rightPanelOpen:
      typeof value.rightPanelOpen === "boolean"
        ? value.rightPanelOpen
        : fallback.rightPanelOpen,
    leftPanelWidth: clampPanelWidth(
      value.leftPanelWidth,
      fallback.leftPanelWidth,
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum,
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.maximum
    ),
    rightPanelWidth: clampPanelWidth(
      value.rightPanelWidth,
      fallback.rightPanelWidth,
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum,
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum
    ),
  });
}

function freezeInspector(layout: StudioInspectorLayout): StudioInspectorLayout {
  return Object.freeze({ ...layout });
}

function freezeQuickActions(
  preferences: StudioQuickActionsPreferences
): StudioQuickActionsPreferences {
  return Object.freeze({
    version: 1,
    slots: Object.freeze({ ...preferences.slots }),
  });
}

function freezeLayout(layout: StudioWorkspaceLayout): StudioWorkspaceLayout {
  return Object.freeze({
    inspector: freezeInspector(layout.inspector),
    desktop: normalizeDesktopLayout(layout.desktop, {
      leftPanelOpen: true,
      rightPanelOpen: true,
      leftPanelWidth: STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default,
      rightPanelWidth: STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default,
    }),
    drawingPalettes: normalizeStudioDrawingPaletteLayout(
      layout.drawingPalettes,
    ),
    quickActions: freezeQuickActions(layout.quickActions),
  });
}

function createQuickActions(
  actions: readonly [
    StudioQuickActionId,
    StudioQuickActionId,
    StudioQuickActionId,
    StudioQuickActionId,
    StudioQuickActionId,
    StudioQuickActionId,
  ]
): StudioQuickActionsPreferences {
  return freezeQuickActions({
    version: 1,
    slots: {
      north: actions[0],
      northEast: actions[1],
      southEast: actions[2],
      south: actions[3],
      southWest: actions[4],
      northWest: actions[5],
    },
  });
}

function createBuiltinLayout(
  inspector: StudioInspectorLayout,
  desktop: Pick<StudioWorkspaceDesktopLayout, "leftPanelOpen" | "rightPanelOpen"> &
    Partial<
      Pick<
        StudioWorkspaceDesktopLayout,
        "leftPanelWidth" | "rightPanelWidth"
      >
    >,
  actions: Parameters<typeof createQuickActions>[0]
): StudioWorkspaceLayout {
  return freezeLayout({
    inspector,
    desktop: {
      ...desktop,
      leftPanelWidth:
        desktop.leftPanelWidth ?? STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default,
      rightPanelWidth:
        desktop.rightPanelWidth ?? STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default,
    },
    drawingPalettes: DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
    quickActions: createQuickActions(actions),
  });
}

/**
 * Immutable, task-oriented workspaces. The original six remain byte-for-byte equivalent; the
 * professional comic preset only composes fields already understood by StudioPage.
 */
export const STUDIO_DEFAULT_WORKSPACES: readonly StudioDefaultWorkspace[] = Object.freeze([
  Object.freeze({
    id: "storyboard",
    name: "스토리보드",
    description: "페이지와 컷 흐름을 보며 러프 콘티를 빠르게 구성합니다.",
    layout: createBuiltinLayout(
      { primary: "document", image: "quick", document: "navigator" },
      { leftPanelOpen: true, rightPanelOpen: true },
      ["undo", "redo", "select", "pen", "add-bubble", "fit-width"]
    ),
  }),
  Object.freeze({
    id: "lineart",
    name: "선화",
    description: "펜, 지우개와 참조 채우기에 집중한 선화 작업공간입니다.",
    layout: createBuiltinLayout(
      { primary: "properties", image: "fill", document: "canvas" },
      { leftPanelOpen: false, rightPanelOpen: true },
      ["undo", "redo", "pen", "eraser", "eyedropper", "advanced-fill"]
    ),
  }),
  Object.freeze({
    id: "coloring",
    name: "채색",
    description: "참조 채우기, 색 추출과 페이지 색보정을 가까이 둡니다.",
    layout: createBuiltinLayout(
      { primary: "properties", image: "fill", document: "grade" },
      { leftPanelOpen: false, rightPanelOpen: true },
      ["undo", "redo", "eyedropper", "advanced-fill", "select", "eraser"]
    ),
  }),
  Object.freeze({
    id: "lettering",
    name: "대사·레터링",
    description: "말풍선 추가, 선택, 복제와 정리를 위한 작업공간입니다.",
    layout: createBuiltinLayout(
      { primary: "properties", image: "quick", document: "canvas" },
      { leftPanelOpen: true, rightPanelOpen: true },
      ["undo", "redo", "add-bubble", "select", "duplicate", "delete"]
    ),
  }),
  Object.freeze({
    id: "review",
    name: "검수",
    description: "긴 페이지 탐색과 요소 속성 확인에 맞춘 검수 작업공간입니다.",
    layout: createBuiltinLayout(
      { primary: "document", image: "retouch", document: "navigator" },
      { leftPanelOpen: true, rightPanelOpen: true },
      ["undo", "redo", "select", "properties", "fit-width", "bring-front"]
    ),
  }),
  Object.freeze({
    id: "publish",
    name: "게시",
    description: "게시 정보와 최종 화면 맞춤 검사를 바로 엽니다.",
    layout: createBuiltinLayout(
      { primary: "publish", image: "quick", document: "canvas" },
      { leftPanelOpen: false, rightPanelOpen: true },
      ["fit-width", "properties", "select", "undo", "redo", "eyedropper"]
    ),
  }),
  Object.freeze({
    id: "pro-comic",
    name: "프로 만화",
    description:
      "도구 속성·레이어·페이지 동선을 유지하고 자주 쓰는 제작 명령을 가까이 둡니다.",
    layout: createBuiltinLayout(
      { primary: "properties", image: "fill", document: "navigator" },
      {
        leftPanelOpen: true,
        rightPanelOpen: true,
        leftPanelWidth: 216,
        rightPanelWidth: 344,
      },
      ["undo", "redo", "pen", "advanced-fill", "add-bubble", "fit-width"]
    ),
  }),
]);

function defaultWorkspace(id: StudioDefaultWorkspaceId): StudioDefaultWorkspace {
  const workspace = STUDIO_DEFAULT_WORKSPACES.find((candidate) => candidate.id === id);
  // The exhaustive immutable catalog above guarantees this branch cannot be reached.
  if (!workspace) throw new RangeError(`Unknown default workspace: ${id}`);
  return workspace;
}

function createDefaultState(ownerScope?: string): StudioWorkspaceState {
  return createState({
    version: STUDIO_WORKSPACE_STATE_VERSION,
    activeWorkspaceId: "storyboard",
    liveLayout: defaultWorkspace("storyboard").layout,
    customWorkspaces: [],
    mobileControlSide: "right",
    applyQuickActionsOnSwitch: true,
  }, ownerScope);
}

function createState(
  state: StudioWorkspaceState,
  ownerScope = STATE_OWNER_SCOPES.get(state)
): StudioWorkspaceState {
  const normalized = Object.freeze({
    version: STUDIO_WORKSPACE_STATE_VERSION,
    activeWorkspaceId: state.activeWorkspaceId,
    liveLayout: freezeLayout(state.liveLayout),
    customWorkspaces: Object.freeze(
      state.customWorkspaces.map((workspace) =>
        Object.freeze({
          id: workspace.id,
          name: workspace.name,
          layout: freezeLayout(workspace.layout),
        })
      )
    ),
    mobileControlSide: state.mobileControlSide,
    applyQuickActionsOnSwitch: state.applyQuickActionsOnSwitch,
  });
  if (ownerScope) STATE_OWNER_SCOPES.set(normalized, ownerScope);
  return normalized;
}

function createDerivedState(
  source: StudioWorkspaceState,
  state: StudioWorkspaceState
): StudioWorkspaceState {
  return createState(state, STATE_OWNER_SCOPES.get(source));
}

export const DEFAULT_STUDIO_WORKSPACE_STATE: StudioWorkspaceState = createDefaultState();

function rawUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > STUDIO_WORKSPACE_RAW_MAX_BYTES) return bytes;
  }
  return bytes;
}

function decodeBoundedRaw(raw: unknown): unknown {
  if (typeof raw === "string") {
    if (rawUtf8ByteLength(raw) > STUDIO_WORKSPACE_RAW_MAX_BYTES) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  try {
    const encoded = JSON.stringify(raw);
    if (
      typeof encoded !== "string" ||
      rawUtf8ByteLength(encoded) > STUDIO_WORKSPACE_RAW_MAX_BYTES
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return raw;
}

function isExactInspectorLayout(value: unknown): value is StudioInspectorLayout {
  if (!isRecord(value)) return false;
  return (
    typeof value.primary === "string" &&
    PRIMARY_SECTION_SET.has(value.primary) &&
    typeof value.image === "string" &&
    IMAGE_SECTION_SET.has(value.image) &&
    typeof value.document === "string" &&
    DOCUMENT_SECTION_SET.has(value.document)
  );
}

function isExactQuickActions(value: unknown): value is StudioQuickActionsPreferences {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.slots)) return false;
  const slots = value.slots;
  return QUICK_ACTION_SLOTS.every((slot) => {
    const action = slots[slot];
    return typeof action === "string" && QUICK_ACTION_ID_SET.has(action);
  });
}

function normalizeWorkspaceLayout(
  value: unknown,
  fallback: StudioWorkspaceLayout
): StudioWorkspaceLayout {
  if (!isRecord(value)) return freezeLayout(fallback);

  const inspector = isExactInspectorLayout(value.inspector)
    ? normalizeStudioInspectorLayout(value.inspector)
    : fallback.inspector;
  const desktop = normalizeDesktopLayout(value.desktop, fallback.desktop);
  const drawingPalettes = normalizeStudioDrawingPaletteLayout(
    value.drawingPalettes,
    fallback.drawingPalettes,
  );
  const quickActions = isExactQuickActions(value.quickActions)
    ? normalizeStudioQuickActionsPreferences(value.quickActions)
    : fallback.quickActions;

  return freezeLayout({ inspector, desktop, drawingPalettes, quickActions });
}

/** Creates a canonical immutable workspace layout from UI state. */
export function normalizeStudioWorkspaceLayout(
  value: unknown,
  fallback: StudioWorkspaceLayout = defaultWorkspace("storyboard").layout
): StudioWorkspaceLayout {
  return normalizeWorkspaceLayout(value, fallback);
}

function validCustomId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= CUSTOM_ID_MAX_LENGTH &&
    CUSTOM_ID_PATTERN.test(value) &&
    !DEFAULT_ID_SET.has(value)
  );
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (containsControlCharacter(value)) return null;
  const name = value.trim().replace(/\s+/gu, " ");
  if (
    !name ||
    Array.from(name).length > STUDIO_WORKSPACE_NAME_MAX_LENGTH
  ) {
    return null;
  }
  return name;
}

/** Validates and canonicalizes a user-facing name, throwing before state can be changed. */
export function normalizeStudioWorkspaceName(value: string): string {
  const name = normalizedName(value);
  if (!name) {
    throw new TypeError(
      `Workspace names must contain 1-${STUDIO_WORKSPACE_NAME_MAX_LENGTH} visible characters.`
    );
  }
  return name;
}

function normalizeCustomWorkspaces(
  value: unknown,
  layoutFallback: StudioWorkspaceLayout
): readonly StudioCustomWorkspace[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const workspaces: StudioCustomWorkspace[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate) || !validCustomId(candidate.id)) continue;
    const name = normalizedName(candidate.name);
    if (!name || ids.has(candidate.id) || !isRecord(candidate.layout)) continue;
    ids.add(candidate.id);
    workspaces.push(
      Object.freeze({
        id: candidate.id,
        name,
        layout: normalizeWorkspaceLayout(candidate.layout, layoutFallback),
      })
    );
    if (workspaces.length >= STUDIO_WORKSPACE_MAX_CUSTOM) break;
  }
  return Object.freeze(workspaces);
}

function normalizeDecodedStudioWorkspaceState(
  decoded: unknown,
  ownerScope?: string
): StudioWorkspaceState | null {
  if (
    !isRecord(decoded) ||
    (decoded.version !== 1 &&
      decoded.version !== 2 &&
      decoded.version !== STUDIO_WORKSPACE_STATE_VERSION)
  ) {
    return null;
  }

  const fallback = defaultWorkspace("storyboard").layout;
  const liveLayout = normalizeWorkspaceLayout(decoded.liveLayout, fallback);
  const customWorkspaces = normalizeCustomWorkspaces(decoded.customWorkspaces, fallback);
  const customIds = new Set(customWorkspaces.map((workspace) => workspace.id));
  const activeWorkspaceId =
    typeof decoded.activeWorkspaceId === "string" &&
    (DEFAULT_ID_SET.has(decoded.activeWorkspaceId) || customIds.has(decoded.activeWorkspaceId))
      ? decoded.activeWorkspaceId
      : "storyboard";
  const mobileControlSide =
    typeof decoded.mobileControlSide === "string" &&
    MOBILE_CONTROL_SIDE_SET.has(decoded.mobileControlSide)
      ? (decoded.mobileControlSide as StudioMobileControlSide)
      : "right";

  return createState({
    version: STUDIO_WORKSPACE_STATE_VERSION,
    activeWorkspaceId,
    liveLayout,
    customWorkspaces,
    mobileControlSide,
    applyQuickActionsOnSwitch:
      typeof decoded.applyQuickActionsOnSwitch === "boolean"
        ? decoded.applyQuickActionsOnSwitch
        : true,
  }, ownerScope);
}

/**
 * Strict state normalizer for untrusted storage and previous workspace payloads.
 *
 * Unknown versions, malformed roots, cyclic values, and values over 64 KiB reset to defaults.
 * Known v1/v2 fields recover independently, while every unrecognized field is deliberately
 * omitted from the returned allowlisted object. Missing palette state receives bounded v3 defaults.
 */
export function normalizeStudioWorkspaceState(raw: unknown): StudioWorkspaceState {
  const ownerScope = isRecord(raw) ? STATE_OWNER_SCOPES.get(raw) : undefined;
  const decoded = decodeBoundedRaw(raw);
  return normalizeDecodedStudioWorkspaceState(decoded, ownerScope) ?? createDefaultState(ownerScope);
}

function ownerHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

/** Opaque deterministic namespace used by both the stable key and payload envelope. */
export function studioWorkspaceOwnerScope(userId: string | null | undefined): string {
  const normalizedUserId = userId?.trim() ?? "";
  return normalizedUserId ? `owner-${ownerHash(normalizedUserId)}` : "guest";
}

/** Anonymous and authenticated owners receive stable, version-independent, opaque keys. */
export function studioWorkspaceStorageKey(userId: string | null | undefined): string {
  return `${STUDIO_WORKSPACE_STORAGE_KEY}:${studioWorkspaceOwnerScope(userId)}`.slice(
    0,
    STORAGE_KEY_MAX_LENGTH
  );
}

function legacyV1StorageKey(userId: string | null | undefined): string {
  const normalizedUserId = userId?.trim() ?? "";
  if (!normalizedUserId) return `${LEGACY_V1_STORAGE_PREFIX}:guest`;
  let preview = "invalid-unicode";
  try {
    preview = encodeURIComponent(normalizedUserId).slice(0, 72);
  } catch {
    // Preserve the exact v1 fallback used for invalid Unicode owner identifiers.
  }
  return `${LEGACY_V1_STORAGE_PREFIX}:user:${preview}-${ownerHash(normalizedUserId)}`.slice(
    0,
    STORAGE_KEY_MAX_LENGTH
  );
}

interface StudioWorkspaceEnvelope {
  readonly kind: typeof WORKSPACE_ENVELOPE_KIND;
  readonly payloadVersion: 1 | 2 | typeof STUDIO_WORKSPACE_PAYLOAD_VERSION;
  readonly ownerScope: string;
  readonly state: unknown;
}

interface DecodedWorkspaceEnvelope {
  readonly state: StudioWorkspaceState;
  readonly needsMigration: boolean;
  readonly migrationSource: Extract<
    StudioWorkspaceLoadSource,
    "legacy-v1" | "legacy-v2"
  > | null;
}

function decodeWorkspaceEnvelope(
  raw: string,
  expectedOwnerScope: string
): DecodedWorkspaceEnvelope | StudioWorkspacePersistenceFailure {
  const decoded = decodeBoundedRaw(raw);
  if (!isRecord(decoded)) return "invalid-payload";

  // Bare prior-version states are accepted only as migration sources. Current storage always
  // writes an owner-scoped envelope and verifies the exact serialized value.
  if (decoded.version === 1 || decoded.version === 2) {
    const state = normalizeDecodedStudioWorkspaceState(decoded, expectedOwnerScope);
    return state
      ? {
          state,
          needsMigration: true,
          migrationSource: decoded.version === 1 ? "legacy-v1" : "legacy-v2",
        }
      : "invalid-payload";
  }

  if (
    decoded.kind !== WORKSPACE_ENVELOPE_KIND ||
    (decoded.payloadVersion !== 1 &&
      decoded.payloadVersion !== 2 &&
      decoded.payloadVersion !== STUDIO_WORKSPACE_PAYLOAD_VERSION) ||
    typeof decoded.ownerScope !== "string"
  ) {
    return "invalid-payload";
  }
  if (decoded.ownerScope !== expectedOwnerScope) return "owner-mismatch";

  const state = normalizeDecodedStudioWorkspaceState(decoded.state, expectedOwnerScope);
  if (!state) return "invalid-payload";
  const stateVersion = isRecord(decoded.state) ? decoded.state.version : null;
  const needsMigration =
    decoded.payloadVersion !== STUDIO_WORKSPACE_PAYLOAD_VERSION ||
    stateVersion !== STUDIO_WORKSPACE_STATE_VERSION;
  return {
    state,
    needsMigration,
    migrationSource: needsMigration
      ? decoded.payloadVersion === 2 || stateVersion === 2
        ? "legacy-v2"
        : "legacy-v1"
      : null,
  };
}

function persistenceResult(
  state: StudioWorkspaceState,
  ownerScope: string,
  status: StudioWorkspacePersistenceStatus,
  failure: StudioWorkspacePersistenceFailure | null
): StudioWorkspaceSaveResult {
  return Object.freeze({ state, ownerScope, status, failure });
}

function loadResult(
  state: StudioWorkspaceState,
  ownerScope: string,
  source: StudioWorkspaceLoadSource,
  status: StudioWorkspacePersistenceStatus,
  failure: StudioWorkspacePersistenceFailure | null
): StudioWorkspaceLoadResult {
  return Object.freeze({ state, ownerScope, source, status, failure });
}

function scopedState(state: StudioWorkspaceState, ownerScope: string): StudioWorkspaceState {
  STATE_OWNER_SCOPES.set(state, ownerScope);
  return state;
}

function serializeWorkspaceEnvelope(
  state: StudioWorkspaceState,
  ownerScope: string
): string | null {
  try {
    const envelope: StudioWorkspaceEnvelope = {
      kind: WORKSPACE_ENVELOPE_KIND,
      payloadVersion: STUDIO_WORKSPACE_PAYLOAD_VERSION,
      ownerScope,
      state,
    };
    const serialized = JSON.stringify(envelope);
    return rawUtf8ByteLength(serialized) <= STUDIO_WORKSPACE_RAW_MAX_BYTES
      ? serialized
      : null;
  } catch {
    return null;
  }
}

/**
 * Saves the normalized UI allowlist and verifies the exact write before reporting persistence.
 * Editing remains available when storage is blocked; callers receive a truthful session-only result.
 */
export function saveStudioWorkspaceState(
  storage: StudioWorkspaceStorage | null | undefined,
  userId: string | null | undefined,
  state: unknown,
  options: StudioWorkspaceSaveOptions = {}
): StudioWorkspaceSaveResult {
  const targetOwnerScope = studioWorkspaceOwnerScope(userId);
  const stateOwnerScope = isRecord(state) ? STATE_OWNER_SCOPES.get(state) : undefined;
  const sourceOwnerScopes = [stateOwnerScope, options.sourceOwnerScope].filter(
    (scope): scope is string => typeof scope === "string"
  );
  const normalized = normalizeStudioWorkspaceState(state);
  if (sourceOwnerScopes.some((scope) => scope !== targetOwnerScope)) {
    return persistenceResult(
      normalized,
      targetOwnerScope,
      "session-only",
      "owner-mismatch"
    );
  }
  scopedState(normalized, targetOwnerScope);
  if (!storage) {
    return persistenceResult(
      normalized,
      targetOwnerScope,
      "session-only",
      "storage-unavailable"
    );
  }

  const serialized = serializeWorkspaceEnvelope(normalized, targetOwnerScope);
  if (!serialized) {
    return persistenceResult(
      normalized,
      targetOwnerScope,
      "session-only",
      "payload-too-large"
    );
  }

  const key = studioWorkspaceStorageKey(userId);
  try {
    storage.setItem(key, serialized);
  } catch {
    return persistenceResult(normalized, targetOwnerScope, "session-only", "write-failed");
  }

  try {
    if (storage.getItem(key) !== serialized) {
      return persistenceResult(
        normalized,
        targetOwnerScope,
        "session-only",
        "verification-failed"
      );
    }
  } catch {
    return persistenceResult(
      normalized,
      targetOwnerScope,
      "session-only",
      "verification-failed"
    );
  }
  return persistenceResult(normalized, targetOwnerScope, "persisted", null);
}

function removeLegacyKeysAfterVerifiedWrite(
  storage: StudioWorkspaceLoadStorage,
  keys: readonly string[],
  write: StudioWorkspaceSaveResult
): void {
  if (write.status !== "persisted" || !storage.removeItem) return;
  for (const key of new Set(keys)) {
    try {
      storage.removeItem(key);
    } catch {
      // Cleanup failure does not invalidate the verified current payload.
    }
  }
}

function loadLegacyPreferences(
  storage: StudioWorkspaceLoadStorage
): { state: StudioWorkspaceState; keys: readonly string[] } | null | "read-failed" {
  const keys = [
    STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY,
    STUDIO_QUICK_ACTIONS_STORAGE_KEY,
    STUDIO_LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY,
    STUDIO_LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY,
  ] as const;
  const values = new Map<string, string>();
  try {
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value !== null) values.set(key, value);
    }
  } catch {
    return "read-failed";
  }
  if (values.size === 0) return null;

  const numericWidth = (key: string): number | undefined => {
    const raw = values.get(key);
    if (raw === undefined || !raw.trim()) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    state: migrateLegacyStudioWorkspaceState({
      inspector: values.get(STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY),
      quickActions: values.get(STUDIO_QUICK_ACTIONS_STORAGE_KEY),
      leftPanelWidth: numericWidth(STUDIO_LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY),
      rightPanelWidth: numericWidth(STUDIO_LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY),
    }),
    keys: [...values.keys()],
  };
}

function persistMigratedWorkspace(
  storage: StudioWorkspaceLoadStorage,
  userId: string | null | undefined,
  state: StudioWorkspaceState,
  ownerScope: string
): StudioWorkspaceSaveResult {
  if (!storage.setItem) {
    return persistenceResult(state, ownerScope, "session-only", "storage-unavailable");
  }
  return saveStudioWorkspaceState(
    {
      getItem: storage.getItem.bind(storage),
      setItem: storage.setItem.bind(storage),
      ...(storage.removeItem ? { removeItem: storage.removeItem.bind(storage) } : {}),
    },
    userId,
    state,
    { sourceOwnerScope: ownerScope }
  );
}

/** Loads, owner-validates, and opportunistically migrates stable/prior/legacy preference payloads. */
export function loadStudioWorkspacePersistence(
  storage: StudioWorkspaceLoadStorage | null | undefined,
  userId: string | null | undefined
): StudioWorkspaceLoadResult {
  const ownerScope = studioWorkspaceOwnerScope(userId);
  const fallback = createDefaultState(ownerScope);
  if (!storage) {
    return loadResult(
      fallback,
      ownerScope,
      "default",
      "session-only",
      "storage-unavailable"
    );
  }

  const currentKey = studioWorkspaceStorageKey(userId);
  let invalidPayloadFound = false;
  let currentRaw: string | null;
  try {
    currentRaw = storage.getItem(currentKey);
  } catch {
    return loadResult(fallback, ownerScope, "default", "session-only", "read-failed");
  }
  if (currentRaw !== null) {
    const decoded = decodeWorkspaceEnvelope(currentRaw, ownerScope);
    if (typeof decoded === "string") {
      if (decoded === "owner-mismatch") {
        return loadResult(fallback, ownerScope, "default", "session-only", decoded);
      }
      invalidPayloadFound = true;
    } else {
      if (!decoded.needsMigration) {
        return loadResult(decoded.state, ownerScope, "current", "persisted", null);
      }
      const write = persistMigratedWorkspace(storage, userId, decoded.state, ownerScope);
      return loadResult(
        write.state,
        ownerScope,
        decoded.migrationSource ?? "legacy-v1",
        write.status,
        write.failure
      );
    }
  }

  const legacyKey = legacyV1StorageKey(userId);
  let legacyRaw: string | null;
  try {
    legacyRaw = storage.getItem(legacyKey);
  } catch {
    return loadResult(fallback, ownerScope, "default", "session-only", "read-failed");
  }
  if (legacyRaw !== null) {
    const decodedLegacy = decodeBoundedRaw(legacyRaw);
    const legacyState =
      isRecord(decodedLegacy) && decodedLegacy.version === 1
        ? normalizeDecodedStudioWorkspaceState(decodedLegacy, ownerScope)
        : null;
    if (legacyState) {
      const write = persistMigratedWorkspace(storage, userId, legacyState, ownerScope);
      removeLegacyKeysAfterVerifiedWrite(storage, [legacyKey], write);
      return loadResult(
        write.state,
        ownerScope,
        "legacy-v1",
        write.status,
        write.failure
      );
    }
    invalidPayloadFound = true;
  }

  // Pre-workspace inspector/quick-action/resize keys were global, so only the guest scope may
  // claim them. Authenticated owners start clean instead of inheriting another session's layout.
  if (ownerScope === "guest") {
    const legacyPreferences = loadLegacyPreferences(storage);
    if (legacyPreferences === "read-failed") {
      return loadResult(fallback, ownerScope, "default", "session-only", "read-failed");
    }
    if (legacyPreferences) {
      scopedState(legacyPreferences.state, ownerScope);
      const write = persistMigratedWorkspace(
        storage,
        userId,
        legacyPreferences.state,
        ownerScope
      );
      removeLegacyKeysAfterVerifiedWrite(storage, legacyPreferences.keys, write);
      return loadResult(
        write.state,
        ownerScope,
        "legacy-preferences",
        write.status,
        write.failure
      );
    }
  }

  return loadResult(
    fallback,
    ownerScope,
    "default",
    "session-only",
    invalidPayloadFound ? "invalid-payload" : null
  );
}

/** Backwards-compatible state-only loader. Use loadStudioWorkspacePersistence for status/source. */
export function loadStudioWorkspaceState(
  storage: StudioWorkspaceLoadStorage | null | undefined,
  userId: string | null | undefined
): StudioWorkspaceState {
  return loadStudioWorkspacePersistence(storage, userId).state;
}

export function resolveStudioWorkspace(
  state: StudioWorkspaceState,
  id: StudioWorkspaceId
): StudioDefaultWorkspace | StudioCustomWorkspace | null {
  if (DEFAULT_ID_SET.has(id)) {
    return STUDIO_DEFAULT_WORKSPACES.find((workspace) => workspace.id === id) ?? null;
  }
  return state.customWorkspaces.find((workspace) => workspace.id === id) ?? null;
}

export function listStudioWorkspaces(
  state: StudioWorkspaceState
): readonly (StudioDefaultWorkspace | StudioCustomWorkspace)[] {
  const normalized = normalizeStudioWorkspaceState(state);
  return Object.freeze([...STUDIO_DEFAULT_WORKSPACES, ...normalized.customWorkspaces]);
}

function nextCustomId(workspaces: readonly StudioCustomWorkspace[]): string {
  const ids = new Set(workspaces.map((workspace) => workspace.id));
  let sequence = 1;
  while (ids.has(`custom-${sequence}`)) sequence += 1;
  return `custom-${sequence}`;
}

const DUPLICATE_NAME_SUFFIX_PATTERN = / 복사본(?: [1-9][0-9]*)?$/u;

function workspaceNameCollisionKey(name: string): string {
  return name.normalize("NFKC").toLowerCase();
}

/**
 * Truncates by the model's code-point limit without cutting a user-perceived grapheme in half.
 * The code-point fallback still preserves surrogate pairs in engines without Intl.Segmenter.
 */
function truncateWorkspaceNameBase(name: string, maximumCodePoints: number): string {
  if (maximumCodePoints <= 0) return "";
  if (typeof Intl.Segmenter !== "function") {
    return Array.from(name).slice(0, maximumCodePoints).join("");
  }

  let result = "";
  let codePointCount = 0;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(name)) {
    const segmentCodePoints = Array.from(segment).length;
    if (codePointCount + segmentCodePoints > maximumCodePoints) break;
    result += segment;
    codePointCount += segmentCodePoints;
  }
  return result;
}

function duplicateWorkspaceName(
  sourceName: string,
  customWorkspaces: readonly StudioCustomWorkspace[]
): string {
  const occupiedNames = new Set(
    [...STUDIO_DEFAULT_WORKSPACES, ...customWorkspaces].map((workspace) =>
      workspaceNameCollisionKey(workspace.name)
    )
  );
  const strippedBase = sourceName.replace(DUPLICATE_NAME_SUFFIX_PATTERN, "").trim();
  const base = strippedBase || sourceName;

  // There are at most 30 occupied built-in/custom names. Since every suffix is distinct,
  // one more candidate than the occupied-key count guarantees a collision-free result.
  for (let sequence = 1; sequence <= occupiedNames.size + 1; sequence += 1) {
    const suffix = sequence === 1 ? " 복사본" : ` 복사본 ${sequence}`;
    const availableBaseLength =
      STUDIO_WORKSPACE_NAME_MAX_LENGTH - Array.from(suffix).length;
    const candidate = normalizeStudioWorkspaceName(
      `${truncateWorkspaceNameBase(base, availableBaseLength)}${suffix}`
    );
    if (!occupiedNames.has(workspaceNameCollisionKey(candidate))) return candidate;
  }

  // The finite catalog bound makes this unreachable, but fail closed if that invariant changes.
  throw new RangeError("Unable to create a unique Studio workspace name.");
}

/** Captures the current live layout as a new custom workspace and activates it. */
export function saveStudioWorkspace(
  state: StudioWorkspaceState,
  name: string,
  layout: StudioWorkspaceLayout = state.liveLayout
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  if (normalized.customWorkspaces.length >= STUDIO_WORKSPACE_MAX_CUSTOM) {
    throw new RangeError(`Studio supports at most ${STUDIO_WORKSPACE_MAX_CUSTOM} custom workspaces.`);
  }
  const workspace: StudioCustomWorkspace = Object.freeze({
    id: nextCustomId(normalized.customWorkspaces),
    name: normalizeStudioWorkspaceName(name),
    layout: normalizeWorkspaceLayout(layout, normalized.liveLayout),
  });
  return createDerivedState(normalized, {
    ...normalized,
    activeWorkspaceId: workspace.id,
    liveLayout: workspace.layout,
    customWorkspaces: [...normalized.customWorkspaces, workspace],
  });
}

function requireCustomWorkspaceIndex(state: StudioWorkspaceState, id: string): number {
  if (DEFAULT_ID_SET.has(id)) throw new TypeError("Built-in workspaces are immutable.");
  const index = state.customWorkspaces.findIndex((workspace) => workspace.id === id);
  if (index < 0) throw new RangeError(`Unknown custom workspace: ${id}`);
  return index;
}

/**
 * Duplicates a custom workspace's saved snapshot directly beside its source.
 * Catalog duplication is intentionally non-destructive: the active id and current live (including
 * dirty) layout are preserved. Use switchStudioWorkspace explicitly to activate the new copy.
 */
export function duplicateStudioWorkspace(
  state: StudioWorkspaceState,
  id: string
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const sourceIndex = requireCustomWorkspaceIndex(normalized, id);
  if (normalized.customWorkspaces.length >= STUDIO_WORKSPACE_MAX_CUSTOM) {
    throw new RangeError(`Studio supports at most ${STUDIO_WORKSPACE_MAX_CUSTOM} custom workspaces.`);
  }

  const source = normalized.customWorkspaces[sourceIndex]!;
  const duplicate: StudioCustomWorkspace = Object.freeze({
    id: nextCustomId(normalized.customWorkspaces),
    name: duplicateWorkspaceName(source.name, normalized.customWorkspaces),
    layout: freezeLayout(source.layout),
  });
  const customWorkspaces = [...normalized.customWorkspaces];
  customWorkspaces.splice(sourceIndex + 1, 0, duplicate);
  return createDerivedState(normalized, { ...normalized, customWorkspaces });
}

/**
 * Moves a custom workspace to an exact final index in the custom-only catalog.
 * Built-ins remain immutable and outside this index space. Active/live state is never changed.
 */
export function reorderStudioWorkspace(
  state: StudioWorkspaceState,
  id: string,
  targetIndex: number
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const sourceIndex = requireCustomWorkspaceIndex(normalized, id);
  if (!Number.isInteger(targetIndex)) {
    throw new TypeError("Studio workspace target index must be an integer.");
  }
  if (targetIndex < 0 || targetIndex >= normalized.customWorkspaces.length) {
    throw new RangeError(`Studio workspace target index is out of range: ${targetIndex}`);
  }
  if (targetIndex === sourceIndex) return normalized;

  const customWorkspaces = [...normalized.customWorkspaces];
  const workspace = customWorkspaces[sourceIndex]!;
  customWorkspaces.splice(sourceIndex, 1);
  customWorkspaces.splice(targetIndex, 0, workspace);
  return createDerivedState(normalized, { ...normalized, customWorkspaces });
}

/** Moves a custom workspace by one position; first-up and last-down are canonical no-ops. */
export function moveStudioWorkspace(
  state: StudioWorkspaceState,
  id: string,
  direction: StudioWorkspaceMoveDirection
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const sourceIndex = requireCustomWorkspaceIndex(normalized, id);
  if (direction !== "up" && direction !== "down") {
    throw new TypeError(`Unknown Studio workspace move direction: ${String(direction)}`);
  }
  const targetIndex = sourceIndex + (direction === "up" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= normalized.customWorkspaces.length) {
    return normalized;
  }
  return reorderStudioWorkspace(normalized, id, targetIndex);
}

/** Replaces a custom workspace snapshot with the current live layout. */
export function overwriteStudioWorkspace(
  state: StudioWorkspaceState,
  id: string,
  layout: StudioWorkspaceLayout = state.liveLayout
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const index = requireCustomWorkspaceIndex(normalized, id);
  const existing = normalized.customWorkspaces[index];
  const nextLayout = normalizeWorkspaceLayout(layout, normalized.liveLayout);
  const customWorkspaces = normalized.customWorkspaces.map((workspace, candidateIndex) =>
    candidateIndex === index
      ? Object.freeze({ ...existing, layout: nextLayout })
      : workspace
  );
  return createDerivedState(normalized, {
    ...normalized,
    activeWorkspaceId: id,
    liveLayout: nextLayout,
    customWorkspaces,
  });
}

export function renameStudioWorkspace(
  state: StudioWorkspaceState,
  id: string,
  name: string
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const index = requireCustomWorkspaceIndex(normalized, id);
  const normalizedName = normalizeStudioWorkspaceName(name);
  return createDerivedState(normalized, {
    ...normalized,
    customWorkspaces: normalized.customWorkspaces.map((workspace, candidateIndex) =>
      candidateIndex === index
        ? Object.freeze({ ...workspace, name: normalizedName })
        : workspace
    ),
  });
}

function applyWorkspaceLayout(
  liveLayout: StudioWorkspaceLayout,
  workspaceLayout: StudioWorkspaceLayout,
  applyQuickActions: boolean
): StudioWorkspaceLayout {
  return freezeLayout({
    inspector: workspaceLayout.inspector,
    desktop: workspaceLayout.desktop,
    drawingPalettes: workspaceLayout.drawingPalettes,
    quickActions: applyQuickActions
      ? workspaceLayout.quickActions
      : liveLayout.quickActions,
  });
}

/** Switches the active workspace, optionally preserving the user's live radial quick actions. */
export function switchStudioWorkspace(
  state: StudioWorkspaceState,
  id: StudioWorkspaceId
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const workspace = resolveStudioWorkspace(normalized, id);
  if (!workspace) throw new RangeError(`Unknown workspace: ${id}`);
  // Re-selecting the current workspace is non-destructive. Reload is the explicit discard action.
  if (workspace.id === normalized.activeWorkspaceId) return normalized;
  return createDerivedState(normalized, {
    ...normalized,
    activeWorkspaceId: workspace.id,
    liveLayout: applyWorkspaceLayout(
      normalized.liveLayout,
      workspace.layout,
      normalized.applyQuickActionsOnSwitch
    ),
  });
}

/** Reloads the saved snapshot of the active workspace and discards unsaved layout changes. */
export function reloadStudioWorkspace(state: StudioWorkspaceState): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const workspace = resolveStudioWorkspace(normalized, normalized.activeWorkspaceId);
  if (!workspace) return normalized;
  return createDerivedState(normalized, {
    ...normalized,
    liveLayout: applyWorkspaceLayout(
      normalized.liveLayout,
      workspace.layout,
      normalized.applyQuickActionsOnSwitch
    ),
  });
}

export function deleteStudioWorkspace(
  state: StudioWorkspaceState,
  id: string
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  const index = requireCustomWorkspaceIndex(normalized, id);
  const customWorkspaces = normalized.customWorkspaces.filter(
    (_, candidateIndex) => candidateIndex !== index
  );
  if (normalized.activeWorkspaceId !== id) {
    return createDerivedState(normalized, { ...normalized, customWorkspaces });
  }

  const fallback = defaultWorkspace("storyboard");
  return createDerivedState(normalized, {
    ...normalized,
    activeWorkspaceId: fallback.id,
    liveLayout: applyWorkspaceLayout(
      normalized.liveLayout,
      fallback.layout,
      normalized.applyQuickActionsOnSwitch
    ),
    customWorkspaces,
  });
}

export function updateStudioWorkspaceLiveLayout(
  state: StudioWorkspaceState,
  liveLayout: StudioWorkspaceLayout
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  return createDerivedState(normalized, {
    ...normalized,
    liveLayout: normalizeWorkspaceLayout(liveLayout, normalized.liveLayout),
  });
}

export function updateStudioWorkspacePreferences(
  state: StudioWorkspaceState,
  preferences: {
    readonly mobileControlSide?: StudioMobileControlSide;
    readonly applyQuickActionsOnSwitch?: boolean;
  }
): StudioWorkspaceState {
  const normalized = normalizeStudioWorkspaceState(state);
  return createDerivedState(normalized, {
    ...normalized,
    mobileControlSide: MOBILE_CONTROL_SIDE_SET.has(preferences.mobileControlSide ?? "")
      ? (preferences.mobileControlSide as StudioMobileControlSide)
      : normalized.mobileControlSide,
    applyQuickActionsOnSwitch:
      typeof preferences.applyQuickActionsOnSwitch === "boolean"
        ? preferences.applyQuickActionsOnSwitch
        : normalized.applyQuickActionsOnSwitch,
  });
}

export function areStudioWorkspaceLayoutsEqual(
  first: StudioWorkspaceLayout,
  second: StudioWorkspaceLayout,
  includeQuickActions = true
): boolean {
  const left = normalizeWorkspaceLayout(first, defaultWorkspace("storyboard").layout);
  const right = normalizeWorkspaceLayout(second, defaultWorkspace("storyboard").layout);
  if (
    left.inspector.primary !== right.inspector.primary ||
    left.inspector.image !== right.inspector.image ||
    left.inspector.document !== right.inspector.document ||
    left.desktop.leftPanelOpen !== right.desktop.leftPanelOpen ||
    left.desktop.rightPanelOpen !== right.desktop.rightPanelOpen ||
    left.desktop.leftPanelWidth !== right.desktop.leftPanelWidth ||
    left.desktop.rightPanelWidth !== right.desktop.rightPanelWidth ||
    left.drawingPalettes.order.some(
      (id, index) => right.drawingPalettes.order[index] !== id
    ) ||
    left.drawingPalettes.collapsed["sub-tools"] !==
      right.drawingPalettes.collapsed["sub-tools"] ||
    left.drawingPalettes.collapsed["tool-properties"] !==
      right.drawingPalettes.collapsed["tool-properties"] ||
    left.drawingPalettes.sizes["sub-tools"] !==
      right.drawingPalettes.sizes["sub-tools"] ||
    left.drawingPalettes.sizes["tool-properties"] !==
      right.drawingPalettes.sizes["tool-properties"] ||
    left.drawingPalettes.locks?.["sub-tools"].position !==
      right.drawingPalettes.locks?.["sub-tools"].position ||
    left.drawingPalettes.locks?.["sub-tools"].height !==
      right.drawingPalettes.locks?.["sub-tools"].height ||
    left.drawingPalettes.locks?.["tool-properties"].position !==
      right.drawingPalettes.locks?.["tool-properties"].position ||
    left.drawingPalettes.locks?.["tool-properties"].height !==
      right.drawingPalettes.locks?.["tool-properties"].height
  ) {
    return false;
  }
  if (!includeQuickActions) return true;
  return QUICK_ACTION_SLOTS.every(
    (slot) => left.quickActions.slots[slot] === right.quickActions.slots[slot]
  );
}

export function isStudioWorkspaceDirty(state: StudioWorkspaceState): boolean {
  const normalized = normalizeStudioWorkspaceState(state);
  const active = resolveStudioWorkspace(normalized, normalized.activeWorkspaceId);
  if (!active) return true;
  return !areStudioWorkspaceLayoutsEqual(
    normalized.liveLayout,
    active.layout,
    normalized.applyQuickActionsOnSwitch
  );
}

/**
 * One-time bridge from the pre-workspace inspector and quick-action storage values.
 * The legacy values become live layout only; no document or provider data is accepted.
 */
export function migrateLegacyStudioWorkspaceState(
  input: StudioWorkspaceMigrationInput
): StudioWorkspaceState {
  const decodedInspector = decodeBoundedRaw(
    input.inspector ?? DEFAULT_STUDIO_INSPECTOR_LAYOUT
  );
  const decodedQuickActions = decodeBoundedRaw(
    input.quickActions ?? DEFAULT_STUDIO_QUICK_ACTIONS
  );
  const inspector = normalizeStudioInspectorLayout(
    decodedInspector ?? DEFAULT_STUDIO_INSPECTOR_LAYOUT
  );
  const quickActions = normalizeStudioQuickActionsPreferences(
    decodedQuickActions ?? DEFAULT_STUDIO_QUICK_ACTIONS
  );
  const lineart = defaultWorkspace("lineart");

  return createState({
    version: STUDIO_WORKSPACE_STATE_VERSION,
    activeWorkspaceId: lineart.id,
    liveLayout: freezeLayout({
      inspector,
      desktop: {
        leftPanelOpen:
          typeof input.leftPanelOpen === "boolean" ? input.leftPanelOpen : true,
        rightPanelOpen:
          typeof input.rightPanelOpen === "boolean" ? input.rightPanelOpen : true,
        leftPanelWidth: clampPanelWidth(
          input.leftPanelWidth,
          STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default,
          STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum,
          STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.maximum
        ),
        rightPanelWidth: clampPanelWidth(
          input.rightPanelWidth,
          STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default,
          STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum,
          STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum
        ),
      },
      drawingPalettes: DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
      quickActions,
    }),
    customWorkspaces: [],
    mobileControlSide:
      typeof input.mobileControlSide === "string" &&
      MOBILE_CONTROL_SIDE_SET.has(input.mobileControlSide)
        ? (input.mobileControlSide as StudioMobileControlSide)
        : "right",
    applyQuickActionsOnSwitch:
      typeof input.applyQuickActionsOnSwitch === "boolean"
        ? input.applyQuickActionsOnSwitch
        : true,
  });
}
