export const STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY =
  "toonspectrum.studio.bg3d.workspace-layout.v1";

export const STUDIO_BG3D_OUTLINER_WIDTH_MIN = 240;
export const STUDIO_BG3D_OUTLINER_WIDTH_MAX = 420;
export const STUDIO_BG3D_INSPECTOR_WIDTH_MIN = 320;
export const STUDIO_BG3D_INSPECTOR_WIDTH_MAX = 520;

export interface StudioBg3dProfessionalWorkspaceLayout {
  readonly version: 1;
  readonly outlinerWidth: number;
  readonly inspectorWidth: number;
}

export const DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT:
  StudioBg3dProfessionalWorkspaceLayout = Object.freeze({
    version: 1,
    outlinerWidth: 280,
    inspectorWidth: 360,
  });

export type StudioBg3dWorkspacePanel = "outliner" | "inspector";

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
export function normalizeStudioBg3dProfessionalWorkspaceLayout(
  value: unknown,
): StudioBg3dProfessionalWorkspaceLayout {
  if (!value || typeof value !== "object") {
    return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
  }
  const candidate = value as Partial<StudioBg3dProfessionalWorkspaceLayout>;
  return Object.freeze({
    version: 1,
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
  });
}

export function setStudioBg3dWorkspacePanelWidth(
  layout: StudioBg3dProfessionalWorkspaceLayout,
  panel: StudioBg3dWorkspacePanel,
  width: number,
): StudioBg3dProfessionalWorkspaceLayout {
  return normalizeStudioBg3dProfessionalWorkspaceLayout({
    ...layout,
    [panel === "outliner" ? "outlinerWidth" : "inspectorWidth"]: width,
  });
}

export function readStudioBg3dProfessionalWorkspaceLayout(
  storage: Pick<Storage, "getItem"> | null,
): StudioBg3dProfessionalWorkspaceLayout {
  if (!storage) return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
  try {
    const serialized = storage.getItem(STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY);
    if (!serialized) return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
    return normalizeStudioBg3dProfessionalWorkspaceLayout(JSON.parse(serialized));
  } catch {
    return DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT;
  }
}

export function writeStudioBg3dProfessionalWorkspaceLayout(
  storage: Pick<Storage, "setItem"> | null,
  layout: StudioBg3dProfessionalWorkspaceLayout,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY,
      JSON.stringify(normalizeStudioBg3dProfessionalWorkspaceLayout(layout)),
    );
    return true;
  } catch {
    return false;
  }
}
