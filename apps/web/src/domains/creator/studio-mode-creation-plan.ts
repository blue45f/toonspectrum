import { studioCreationPreset } from "./studio-creation-presets";
import { studioModeProfile, type StudioModeProfile } from "./studio-mode-profile";
import type {
  StudioDocumentKind,
  StudioDocumentWorkspace,
} from "./studio-project-document-store";
import type { StudioProjectCreationResult } from "./studio-project-creation";
import type { StudioProjectKind } from "./studio-project-library-store";

export interface StudioModeCreationPlan {
  readonly mode: StudioProjectKind;
  readonly profile: StudioModeProfile;
  readonly document: {
    readonly kind: StudioDocumentKind;
    readonly workspace: StudioDocumentWorkspace;
    readonly width: number;
    readonly height: number;
    readonly pageCount: number;
  };
  readonly launch: {
    readonly uiMode: "focus" | "basic" | "full";
    readonly startTool: "draw" | "select";
  };
}

function legacyDensity(profile: StudioModeProfile): StudioModeCreationPlan["launch"]["uiMode"] {
  if (profile.launch.density === "focus") return "focus";
  if (profile.launch.density === "full") return "full";
  return "basic";
}

export function resolveStudioModeCreationPlan(
  kind: StudioProjectKind,
  templateId?: string | null,
): StudioModeCreationPlan {
  const profile = studioModeProfile(kind);
  const preset = studioCreationPreset(kind, templateId);
  const quickSketch = kind === "illustration" && preset.id === "quick-sketch";
  return Object.freeze({
    mode: kind,
    profile,
    document: Object.freeze({
      kind: profile.document.kind,
      workspace: profile.document.workspace,
      width: preset.width,
      height: preset.height,
      pageCount: 1,
    }),
    launch: Object.freeze({
      uiMode: quickSketch ? "focus" : legacyDensity(profile),
      startTool: profile.launch.primaryTool,
    }),
  });
}

export function buildStudioModeLaunchHref(
  result: Pick<StudioProjectCreationResult, "href">,
  plan: StudioModeCreationPlan,
): string {
  const [pathname = result.href, rawSearch = ""] = result.href.split("?", 2);
  const search = new URLSearchParams(rawSearch);
  search.set("workspace", plan.document.workspace);
  search.set("uiMode", plan.launch.uiMode);
  search.set("startTool", plan.launch.startTool);
  const serialized = search.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}
