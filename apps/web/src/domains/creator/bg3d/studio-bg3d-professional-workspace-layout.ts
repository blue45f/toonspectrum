export const STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LEGACY_STORAGE_KEY =
  "toonspectrum.studio.bg3d.workspace-layout.v1";
export const STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY =
  "toonspectrum.studio.bg3d.workspace-layout.v2";

export const STUDIO_BG3D_OUTLINER_WIDTH_MIN = 240;
export const STUDIO_BG3D_OUTLINER_WIDTH_MAX = 420;
export const STUDIO_BG3D_INSPECTOR_WIDTH_MIN = 320;
export const STUDIO_BG3D_INSPECTOR_WIDTH_MAX = 520;

export type StudioBg3dWorkspacePresetId =
  | "scene"
  | "character"
  | "output"
  | "focus"
  | "custom";
export type StudioBg3dWorkspaceDockOrder =
  | "outliner-viewport-inspector"
  | "inspector-viewport-outliner";
export type StudioBg3dWorkspacePanel = "outliner" | "inspector";

export interface StudioBg3dProfessionalWorkspaceLayout {
  readonly version: 2;
  readonly outlinerWidth: number;
  readonly inspectorWidth: number;
  readonly outlinerVisible: boolean;
  readonly inspectorVisible: boolean;
  readonly dockOrder: StudioBg3dWorkspaceDockOrder;
  readonly preset: StudioBg3dWorkspacePresetId;
}

function freezeLayout(
  value: Omit<StudioBg3dProfessionalWorkspaceLayout, "version">,
): StudioBg3dProfessionalWorkspaceLayout {
  return Object.freeze({ version: 2, ...value });
}

export const STUDIO_BG3D_PROFESSIONAL_WORKSPACE_PRESETS: Readonly<
  Record<Exclude<StudioBg3dWorkspacePresetId, "custom">, StudioBg3dProfessionalWorkspaceLayout>
> = Object.freeze({
  scene: freezeLayout({
    outlinerWidth: 280,
    inspectorWidth: 360,
    outlinerVisible: true,
    inspectorVisible: true,
    dockOrder: "outliner-viewport-inspector",
    preset: "scene",
  }),
  character: freezeLayout({
    outlinerWidth: 260,
    inspectorWidth: 440,
    outlinerVisible: true,
    inspectorVisible: true,
    dockOrder: "outliner-viewport-inspector",
    preset: "character",
  }),
  output: freezeLayout({
    outlinerWidth: 260,
    inspectorWidth: 480,
    outlinerVisible: false,
    inspectorVisible: true,
    dockOrder: "outliner-viewport-inspector",
    preset: "output",
  }),
  focus: freezeLayout({
    outlinerWidth: 280,
    inspectorWidth: 360,
    outlinerVisible: false,
    inspectorVisible: false,
    dockOrder: "outliner-viewport-inspector",
    preset: "focus",
  }),
});

export const DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT =
  STUDIO_BG3D_PROFESSIONAL_WORKSPACE_PRESETS.scene;

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isDockOrder(value: unknown): value is StudioBg3dWorkspaceDockOrder {
  return value === "outliner-viewport-inspector" || value === "inspector-viewport-outliner";
}

function isPreset(value: unknown): value is StudioBg3dWorkspacePresetId {
  return value === "scene" || value === "character" || value === "output"
    || value === "focus" || value === "custom";
}

export function normalizeStudioBg3dProfessionalWorkspaceLayout(
  value: unknown,
): StudioBg3dProfessionalWorkspaceLayout {
  if (!value || typeof value !== "object") {
    return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
  }
  const candidate = value as Partial<StudioBg3dProfessionalWorkspaceLayout> & { readonly version?: number };
  return freezeLayout({
    outlinerWidth: clampInteger(
      candidate.outlinerWidth,
      STUDIO_BG3D_OUTLINER_WIDTH_MIN,
      STUDIO_BG3D_OUTLINER_WIDTH_MAX,
      DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT.outlinerWidth,
    ),
    inspectorWidth: clampInteger(
      candidate.inspectorWidth,
      STUDIO_BG3D_INSPECTOR_WIDTH_MIN,
      STUDIO_BG3D_INSPECTOR_WIDTH_MAX,
      DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT.inspectorWidth,
    ),
    outlinerVisible: typeof candidate.outlinerVisible === "boolean"
      ? candidate.outlinerVisible
      : true,
    inspectorVisible: typeof candidate.inspectorVisible === "boolean"
      ? candidate.inspectorVisible
      : true,
    dockOrder: isDockOrder(candidate.dockOrder)
      ? candidate.dockOrder
      : "outliner-viewport-inspector",
    preset: candidate.version === 2 && isPreset(candidate.preset)
      ? candidate.preset
      : "custom",
  });
}

function scopeHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function studioBg3dProfessionalWorkspaceStorageKey(scopeKey?: string | null): string {
  const canonical = scopeKey?.trim();
  return canonical
    ? `${STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY}:${scopeHash(canonical)}`
    : STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY;
}

export function applyStudioBg3dWorkspacePreset(
  preset: Exclude<StudioBg3dWorkspacePresetId, "custom">,
): StudioBg3dProfessionalWorkspaceLayout {
  return STUDIO_BG3D_PROFESSIONAL_WORKSPACE_PRESETS[preset];
}

export function setStudioBg3dWorkspacePanelWidth(
  layout: StudioBg3dProfessionalWorkspaceLayout,
  panel: StudioBg3dWorkspacePanel,
  width: number,
): StudioBg3dProfessionalWorkspaceLayout {
  return normalizeStudioBg3dProfessionalWorkspaceLayout({
    ...layout,
    version: 2,
    preset: "custom",
    [panel === "outliner" ? "outlinerWidth" : "inspectorWidth"]: width,
  });
}

export function setStudioBg3dWorkspacePanelVisible(
  layout: StudioBg3dProfessionalWorkspaceLayout,
  panel: StudioBg3dWorkspacePanel,
  visible: boolean,
): StudioBg3dProfessionalWorkspaceLayout {
  return normalizeStudioBg3dProfessionalWorkspaceLayout({
    ...layout,
    version: 2,
    preset: "custom",
    [panel === "outliner" ? "outlinerVisible" : "inspectorVisible"]: visible,
  });
}

export function swapStudioBg3dWorkspaceDockOrder(
  layout: StudioBg3dProfessionalWorkspaceLayout,
): StudioBg3dProfessionalWorkspaceLayout {
  return normalizeStudioBg3dProfessionalWorkspaceLayout({
    ...layout,
    version: 2,
    preset: "custom",
    dockOrder: layout.dockOrder === "outliner-viewport-inspector"
      ? "inspector-viewport-outliner"
      : "outliner-viewport-inspector",
  });
}

export function readStudioBg3dProfessionalWorkspaceLayout(
  storage: Pick<Storage, "getItem"> | null,
  scopeKey?: string | null,
): StudioBg3dProfessionalWorkspaceLayout {
  if (!storage) return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
  try {
    const scoped = storage.getItem(studioBg3dProfessionalWorkspaceStorageKey(scopeKey));
    if (scoped) return normalizeStudioBg3dProfessionalWorkspaceLayout(JSON.parse(scoped));
    const globalV2 = scopeKey
      ? storage.getItem(STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY)
      : null;
    if (globalV2) return normalizeStudioBg3dProfessionalWorkspaceLayout(JSON.parse(globalV2));
    const legacy = storage.getItem(STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LEGACY_STORAGE_KEY);
    if (legacy) return normalizeStudioBg3dProfessionalWorkspaceLayout(JSON.parse(legacy));
  } catch {
    return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
  }
  return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
}

export function writeStudioBg3dProfessionalWorkspaceLayout(
  storage: Pick<Storage, "setItem"> | null,
  layout: StudioBg3dProfessionalWorkspaceLayout,
  scopeKey?: string | null,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      studioBg3dProfessionalWorkspaceStorageKey(scopeKey),
      JSON.stringify(normalizeStudioBg3dProfessionalWorkspaceLayout(layout)),
    );
    return true;
  } catch {
    return false;
  }
}
