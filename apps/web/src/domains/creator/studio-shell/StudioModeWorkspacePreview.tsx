import {
  Box,
  Clapperboard,
  Image as ImageIcon,
  Layers3,
  MonitorPlay,
  PanelsTopLeft,
  PenTool,
  Presentation,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { studioModeLabel, type StudioModeProfile, type StudioModeShell } from "../studio-mode-profile";

const SHELL_ICON: Readonly<Record<StudioModeShell, LucideIcon>> = {
  comic: PanelsTopLeft,
  drawing: PenTool,
  image: ImageIcon,
  layout: Layers3,
  slides: Presentation,
  storyboard: Clapperboard,
  spatial: Box,
  timeline: MonitorPlay,
};

const SHELL_GRID: Readonly<Record<StudioModeShell, string>> = {
  comic: "grid-cols-[4.5rem_minmax(0,1fr)_5.5rem]",
  drawing: "grid-cols-[4.5rem_minmax(0,1fr)_5.5rem]",
  image: "grid-cols-[4.5rem_minmax(0,1fr)_5.5rem]",
  layout: "grid-cols-[5rem_minmax(0,1fr)_5.5rem]",
  slides: "grid-cols-[5rem_minmax(0,1fr)_5.5rem]",
  storyboard: "grid-cols-[5rem_minmax(0,1fr)_5.5rem]",
  spatial: "grid-cols-[5rem_minmax(0,1fr)_5.5rem]",
  timeline: "grid-cols-[5rem_minmax(0,1fr)_5.5rem]",
};

const PANEL_LABELS: Readonly<Record<StudioModeShell, readonly [string, string, string]>> = {
  comic: ["EP / CUT", "VERTICAL CANVAS", "LAYER / BUBBLE"],
  drawing: ["REFERENCE", "CANVAS", "BRUSH / LAYER"],
  image: ["HISTORY", "IMAGE", "MASK / GRADE"],
  layout: ["TEMPLATE", "ARTBOARD", "TYPE / LAYOUT"],
  slides: ["SLIDES", "SLIDE", "LAYOUT / THEME"],
  storyboard: ["SCENE / SHOT", "SHOT BOARD", "CAMERA / NOTE"],
  spatial: ["OUTLINER", "3D VIEWPORT", "CAMERA / POSE"],
  timeline: ["SCENE / ASSET", "PREVIEW", "MOTION / FX"],
};

export function StudioModeWorkspacePreview({
  profile,
  locale,
  compact = false,
}: {
  readonly profile: StudioModeProfile;
  readonly locale: "ko" | "en";
  readonly compact?: boolean;
}) {
  const Icon = SHELL_ICON[profile.shell];
  const panelLabels = PANEL_LABELS[profile.shell];
  const hasBottom = profile.panels.bottom.length > 0;

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm",
        compact ? "p-3" : "p-4 sm:p-5",
      )}
      data-studio-mode-preview={profile.id}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.16em] text-accent">
            <Icon size={13} aria-hidden="true" />
            {studioModeLabel(profile, locale)} workspace
          </p>
          <p className="mt-1 text-sm font-black text-fg">{profile.headline[locale]}</p>
          {!compact ? <p className="mt-1 text-xs leading-5 text-fg-3">{profile.description[locale]}</p> : null}
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Sparkles size={14} aria-hidden="true" />
        </span>
      </div>

      <div className={cn("mt-3 grid min-h-28 overflow-hidden rounded-xl border border-line bg-bg", SHELL_GRID[profile.shell])}>
        <div className="border-r border-line bg-card/80 p-2">
          <span className="text-[0.5rem] font-black tracking-wide text-fg-3">{panelLabels[0]}</span>
          <div className="mt-2 space-y-1.5">
            {profile.panels.left.slice(0, 4).map((panel) => (
              <span key={panel} className="block h-2.5 rounded bg-raised" title={panel} />
            ))}
          </div>
        </div>
        <div className="relative grid min-w-0 place-items-center bg-canvas/70 p-2">
          <span className="rounded-lg border border-line bg-card/80 px-3 py-2 text-center text-[0.55rem] font-black text-fg-2 shadow-sm">
            {panelLabels[1]}
          </span>
          {profile.shell === "comic" ? (
            <div className="absolute inset-x-[28%] bottom-2 top-2 flex flex-col gap-1 opacity-60">
              <span className="h-5 rounded border border-line bg-card" />
              <span className="h-8 rounded border border-line bg-card" />
              <span className="h-4 rounded border border-line bg-card" />
            </div>
          ) : null}
          {profile.shell === "storyboard" ? (
            <div className="absolute inset-2 grid grid-cols-2 gap-1 opacity-50">
              {Array.from({ length: 4 }).map((_, index) => <span key={index} className="rounded border border-line bg-card" />)}
            </div>
          ) : null}
        </div>
        <div className="border-l border-line bg-card/80 p-2">
          <span className="text-[0.5rem] font-black tracking-wide text-fg-3">{panelLabels[2]}</span>
          <div className="mt-2 space-y-1.5">
            {profile.panels.right.slice(0, 4).map((panel) => (
              <span key={panel} className="block h-2.5 rounded bg-raised" title={panel} />
            ))}
          </div>
        </div>
        {hasBottom ? (
          <div className="col-span-3 border-t border-line bg-card/80 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[0.5rem] font-black tracking-wide text-fg-3">
                {profile.panels.bottom.join(" / ").toUpperCase()}
              </span>
              <span className="h-2 flex-1 rounded bg-raised" />
              <span className="h-2 w-8 rounded bg-raised" />
            </div>
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-[0.6rem] font-black uppercase tracking-wide text-fg-3">{locale === "ko" ? "제작 흐름" : "Workflow"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {profile.workflow.map((item, index) => (
                <span key={item.id} className="rounded-full border border-line bg-card px-2 py-1 text-[0.65rem] font-semibold text-fg-2">
                  {index + 1}. {item.label[locale]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[0.6rem] font-black uppercase tracking-wide text-fg-3">{locale === "ko" ? "주요 도구" : "Key tools"}</p>
            <p className="mt-1.5 text-xs leading-5 text-fg-2">{profile.keyTools.map((tool) => tool[locale]).join(" · ")}</p>
          </div>
          <div>
            <p className="text-[0.6rem] font-black uppercase tracking-wide text-fg-3">AI</p>
            <p className="mt-1.5 text-xs leading-5 text-fg-2">
              {profile.aiActions.slice(0, 4).map((action) => action.replaceAll("-", " ")).join(" · ")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
