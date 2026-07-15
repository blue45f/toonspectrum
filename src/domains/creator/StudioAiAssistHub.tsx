/**
 * StudioAiAssistHub — tabbed AI assist shell (PicsArt/Canva-class).
 * Connection status · tool tabs · prompt presets · recent chips · tool slot.
 */
import {
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  ImageIcon,
  MessageCircle,
  Palette,
  Settings2,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";


import {
  presetsForAssistTool,
  recentPromptsForTool,
  STUDIO_AI_ASSIST_TOOLS,
  type StudioAiAssistToolId,
  type StudioAiRecentPromptsState,
} from "./studio-ai-assist-ux";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";

import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<StudioAiAssistToolId, LucideIcon> = {
  background: ImageIcon,
  character: UserRound,
  composition: Clapperboard,
  dialogue: MessageCircle,
  palette: Palette,
};

export interface StudioAiAssistHubProps {
  activeTool: StudioAiAssistToolId;
  onToolChange: (tool: StudioAiAssistToolId) => void;
  /** Image BYOK ready */
  imageConfigured: boolean;
  /** Text AI ready (server or BYOK) */
  textConfigured: boolean;
  connectionLabel: string;
  connectionOk: boolean;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
  /** Optional provider selector (server AI) */
  providerSlot?: ReactNode;
  recentState: StudioAiRecentPromptsState;
  onApplyPresetPrompt: (tool: StudioAiAssistToolId, prompt: string) => void;
  toolPanel: ReactNode;
  className?: string;
}

export function StudioAiAssistHub({
  activeTool,
  onToolChange,
  imageConfigured,
  textConfigured,
  connectionLabel,
  connectionOk,
  onOpenSettings,
  onPreloadSettings,
  providerSlot,
  recentState,
  onApplyPresetPrompt,
  toolPanel,
  className,
}: StudioAiAssistHubProps): ReactElement {
  const toolMeta = STUDIO_AI_ASSIST_TOOLS.find((t) => t.id === activeTool) ?? STUDIO_AI_ASSIST_TOOLS[0]!;
  const presets = presetsForAssistTool(activeTool);
  const recents = recentPromptsForTool(recentState, activeTool, 4);
  const toolReady = toolMeta.needsImageApi
    ? imageConfigured
    : toolMeta.needsTextApi
      ? textConfigured
      : true;

  return (
    <div
      className={cn("flex max-h-[calc(100dvh-13rem)] flex-col gap-2", className)}
      data-studio-ai-assist-hub="true"
    >
      {/* Connection strip */}
      <button
        type="button"
        onClick={onOpenSettings}
        onMouseEnter={onPreloadSettings}
        onFocus={onPreloadSettings}
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          connectionOk
            ? "border-good/35 bg-good/10 hover:bg-good/15"
            : "border-line bg-panel/50 hover:bg-raised"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-fg">
          <Settings2 size={14} className="shrink-0 text-accent" aria-hidden />
          AI 어시스트 설정
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[0.65rem] font-medium",
            connectionOk ? "text-good" : "text-fg-3"
          )}
        >
          {connectionOk ? <CheckCircle2 size={12} aria-hidden /> : null}
          <span className="max-w-[9rem] truncate">{connectionLabel}</span>
          <ChevronRight size={12} aria-hidden />
        </span>
      </button>

      {providerSlot}

      {/* Friendly intro */}
      <div className="flex items-start gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={15} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold text-fg">무엇을 도와드릴까요?</p>
          <p className="text-[0.6rem] leading-snug text-fg-3">
            도구를 고른 뒤 예시 칩을 누르거나 직접 적어 주세요. ⌘/Ctrl+Enter로 실행할 수 있어요.
          </p>
        </div>
      </div>

      {/* Tool tabs */}
      <div
        className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="AI 어시스트 도구"
      >
        {STUDIO_AI_ASSIST_TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.id];
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={tool.title}
              onClick={() => onToolChange(tool.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[0.64rem] font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent bg-accent text-on-accent shadow-sm"
                  : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
              )}
            >
              <Icon size={12} aria-hidden />
              {tool.shortLabel}
            </button>
          );
        })}
      </div>

      <p className="text-[0.6rem] leading-snug text-fg-3">{toolMeta.title}</p>

      {!toolReady ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas/30 px-3 py-2 text-[0.62rem] leading-snug text-fg-3">
          {toolMeta.needsImageApi
            ? "이미지 생성은 내 API 키(BYOK)가 필요해요. 위 설정에서 키를 등록해 주세요."
            : "텍스트 AI가 아직 연결되지 않았어요. 로그인(서버 AI) 또는 API 키를 등록해 주세요."}
        </div>
      ) : null}

      {/* Presets */}
      {presets.length > 0 ? (
        <div>
          <p className="mb-1 text-[0.62rem] font-semibold text-fg-2">빠른 예시</p>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.prompt}
                onClick={() => onApplyPresetPrompt(activeTool, preset.prompt)}
                className={cn(
                  "rounded-full border border-line bg-card px-2.5 py-1 text-[0.62rem] font-semibold text-fg-2",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  "hover:border-accent/45 hover:bg-raised hover:text-fg"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent */}
      {recents.length > 0 ? (
        <div>
          <p className="mb-1 text-[0.62rem] font-semibold text-fg-2">최근 프롬프트</p>
          <div className="flex flex-col gap-0.5">
            {recents.map((prompt) => (
              <button
                key={prompt}
                type="button"
                title={prompt}
                onClick={() => onApplyPresetPrompt(activeTool, prompt)}
                className={cn(
                  "truncate rounded-lg border border-line/70 bg-canvas/40 px-2 py-1.5 text-left text-[0.6rem] text-fg-3",
                  STUDIO_FOCUS_RING,
                  "hover:border-accent/40 hover:bg-raised hover:text-fg-2"
                )}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Active tool panel */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">{toolPanel}</div>
    </div>
  );
}
