import { studioCreationPreset } from "./studio-creation-presets";
import { studioModeProfile } from "./studio-mode-profiles";
import type { StudioModeProfile } from "./studio-mode-profile";
import type { StudioProjectKind } from "./studio-project-library-store";

export interface StudioCreationPlan {
  readonly kind: StudioProjectKind;
  readonly profile: StudioModeProfile;
  readonly document: {
    readonly kind: StudioModeProfile["document"]["kind"];
    readonly workspace: StudioModeProfile["document"]["workspace"];
    readonly width: number;
    readonly height: number;
    readonly pageCount: number;
  };
  readonly launch: StudioModeProfile["launch"];
}

export function resolveStudioCreationPlan(
  kind: StudioProjectKind,
  templateId?: string | null,
): StudioCreationPlan {
  const profile = studioModeProfile(kind);
  const preset = studioCreationPreset(kind, templateId);
  return Object.freeze({
    kind,
    profile,
    document: Object.freeze({      kind: profile.document.kind,
      workspace: profile.document.workspace,
      width: preset.width,
      height: preset.height,
      pageCount: 1,
    }),
    launch: profile.launch,
  });
}

const densityQueryValue = (density: StudioModeProfile["launch"]["density"]): string => {
  if (density === "simple") return "basic";
  return density;
};

export function buildStudioModeLaunchHref(
  href: string,
  plan: StudioCreationPlan,
): string {
  const url = new URL(href, "https://toonstudio.local");
  url.searchParams.set("workspace", plan.document.workspace);
  url.searchParams.set("uiMode", densityQueryValue(plan.launch.density));
  url.searchParams.set("startTool", plan.launch.primaryTool);
  const search = url.searchParams.toString();
  return search ? `${url.pathname}?${search}` : url.pathname;
}

export function studioModeInitialDocumentTitle(
  kind: StudioProjectKind,
  projectTitle: string,
): string {
  if (kind === "webtoon") return "EP01 원고";
  if (kind === "slides") return "발표 자료";
  return `${projectTitle.trim()} 작업 문서`;
}
