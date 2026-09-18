import { Box, ChevronDown, PenTool, ShieldCheck, Sparkles } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  getUnifiedAiAuxSettings,
  useUnifiedAiAuxSettings,
} from "@/shared/ai/unified-ai-settings";
import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { cn } from "@/shared/lib/utils";

import { Studio3dGenerationHttpClient } from "./studio-3d-generation-client";
import { StudioAi3dGenerationPanel } from "./StudioAi3dGenerationPanel";
import { StudioConnectedStrokeProposalPanel } from "./StudioConnectedStrokeProposalPanel";

export interface StudioAdvancedAiToolsProps {
  readonly userId?: string;
  readonly onInsertGenerated3d?: (blob: Blob, revisionId: string) => Promise<void> | void;
  readonly onSaveGenerated3d?: (blob: Blob, revisionId: string) => Promise<void> | void;
  readonly onEditGenerated3dTexture?: (blob: Blob, revisionId: string) => Promise<void> | void;
}

const TAB_CLASS =
  "flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioAdvancedAiTools({
  userId,
  onInsertGenerated3d,
  onSaveGenerated3d,
  onEditGenerated3dTexture,
}: StudioAdvancedAiToolsProps) {
  const [active, setActive] = useState<"stroke" | "three-d">("stroke");
  const [expanded, setExpanded] = useState(false);
  const rawId = useId().replace(/:/gu, "");
  const tabId = (tab: "stroke" | "three-d") => `studio-advanced-ai-${rawId}-tab-${tab}`;
  const panelId = (tab: "stroke" | "three-d") => `studio-advanced-ai-${rawId}-panel-${tab}`;
  const aux = useUnifiedAiAuxSettings();
  const hasProviderKey = Boolean(aux.settings.hyper3dApiKey);
  const client = useMemo(
    () => userId && hasProviderKey
      ? new Studio3dGenerationHttpClient({
          userId,
          providerApiKey: () => getUnifiedAiAuxSettings().hyper3dApiKey || undefined,
        })
      : null,
    [hasProviderKey, userId],
  );

  const moveTab = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    current: "stroke" | "three-d",
  ) => {
    const next = event.key === "Home"
      ? "stroke"
      : event.key === "End"
        ? "three-d"
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? current === "stroke" ? "three-d" : "stroke"
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? current === "three-d" ? "stroke" : "three-d"
            : null;
    if (!next) return;
    event.preventDefault();
    if (next === current) return;
    setActive(next);
    globalThis.requestAnimationFrame(() => document.getElementById(tabId(next))?.focus());
  };

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="group shrink-0 overflow-hidden rounded-2xl border border-line-strong bg-panel/55"
      data-studio-advanced-ai-tools="true"
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <Sparkles size={17} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <strong className="block text-xs font-black text-fg">고급 공동 창작·3D</strong>
          <span className="mt-0.5 block text-[0.61rem] leading-relaxed text-fg-3">
            검토형 획 제안과 개인 키 기반 3D 생성
          </span>
        </span>
        <span className="hidden items-center gap-1 rounded-full border border-good/30 bg-good/10 px-2 py-1 text-[0.56rem] font-bold text-good sm:inline-flex">
          <ShieldCheck size={11} aria-hidden /> 원본 보존
        </span>
        <ChevronDown size={15} className="text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      {expanded ? (
      <div className="grid gap-3 border-t border-line p-3">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="고급 AI 제작 도구">
          <button
            type="button"
            role="tab"
            id={tabId("stroke")}
            aria-controls={panelId("stroke")}
            aria-selected={active === "stroke"}
            tabIndex={active === "stroke" ? 0 : -1}
            onClick={() => setActive("stroke")}
            onKeyDown={(event) => moveTab(event, "stroke")}
            className={cn(
              TAB_CLASS,
              active === "stroke"
                ? "border-accent bg-accent/10 text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            <PenTool size={14} aria-hidden />
            획 제안
            <span className="rounded-full bg-good/10 px-1.5 py-0.5 text-[0.52rem] text-good">로컬</span>
          </button>
          <button
            type="button"
            role="tab"
            id={tabId("three-d")}
            aria-controls={panelId("three-d")}
            aria-selected={active === "three-d"}
            tabIndex={active === "three-d" ? 0 : -1}
            onClick={() => setActive("three-d")}
            onKeyDown={(event) => moveTab(event, "three-d")}
            className={cn(
              TAB_CLASS,
              active === "three-d"
                ? "border-accent bg-accent/10 text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            <Box size={14} aria-hidden />
            AI 3D
            <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[0.52rem] text-warn">개인 키</span>
          </button>
        </div>

        {active === "stroke" ? (
          <div
            id={panelId("stroke")}
            role="tabpanel"
            aria-labelledby={tabId("stroke")}
            className="grid gap-2"
          >
            <p className="rounded-xl border border-line bg-card/60 px-3 py-2 text-[0.62rem] leading-relaxed text-fg-3">
              최근 확정한 획을 읽어 후보를 제안하고, 선택한 획만 한 번의 Undo 단위로 추가합니다.
              원본 획은 자동으로 수정하지 않아요.
            </p>
            <StudioConnectedStrokeProposalPanel />
          </div>
        ) : null}
        {active === "three-d" ? (
          <div
            id={panelId("three-d")}
            role="tabpanel"
            aria-labelledby={tabId("three-d")}
            className="grid gap-2"
          >
            <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[0.62rem] leading-relaxed text-fg-2">
              외부 Hyper3D/Rodin으로 전송되는 개인 키 기능입니다. 공급자 크레딧이 사용될 수 있으며,
              무료 텍스트 풀이나 다른 유료 모델로 자동 전환하지 않습니다.
            </p>
            {client ? (
              <StudioAi3dGenerationPanel
                client={client}
                onInsertArtifact={onInsertGenerated3d ? (job, blob) => onInsertGenerated3d(blob, job.artifactRevision!.id) : undefined}
                onSaveArtifact={onSaveGenerated3d ? (job, blob) => onSaveGenerated3d(blob, job.artifactRevision!.id) : undefined}
                onOpenTextureEditor={onEditGenerated3dTexture ? (job, blob) => onEditGenerated3dTexture(blob, job.artifactRevision!.id) : undefined}
              />
            ) : (
              <AiRecoveryNotice
                code={userId ? "not_configured" : "login_required"}
                message={
                  userId
                    ? "통합 AI 설정에서 Hyper3D/Rodin 개인 키를 연결하면 텍스트·이미지·멀티뷰 기반 3D 생성과 재질 생성을 사용할 수 있어요."
                    : "3D 생성 작업 기록과 결과 자산을 안전하게 보관하려면 먼저 로그인한 뒤 개인 키를 연결하세요."
                }
              />
            )}
          </div>
        ) : null}
      </div>
      ) : null}
    </details>
  );
}
