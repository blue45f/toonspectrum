import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useUserAi } from "@/shared/ai/user-ai-store";

import { Studio3dGenerationHttpClient } from "./studio-3d-generation-client";
import { StudioAi3dGenerationPanel } from "./StudioAi3dGenerationPanel";
import { StudioConnectedStrokeProposalPanel } from "./StudioConnectedStrokeProposalPanel";

export interface StudioAdvancedAiToolsProps {
  readonly userId?: string;
  readonly onInsertGenerated3d?: (blob: Blob, revisionId: string) => Promise<void> | void;
  readonly onSaveGenerated3d?: (blob: Blob, revisionId: string) => Promise<void> | void;
  readonly onEditGenerated3dTexture?: (blob: Blob, revisionId: string) => Promise<void> | void;
}

export function StudioAdvancedAiTools({
  userId,
  onInsertGenerated3d,
  onSaveGenerated3d,
  onEditGenerated3dTexture,
}: StudioAdvancedAiToolsProps) {
  const [active, setActive] = useState<"stroke" | "three-d">("stroke");
  const userAi = useUserAi();
  const connectionId = userAi.configuration.assignments["three-d"];
  const connection = userAi.configuration.connections.find((item) => item.id === connectionId) ?? null;
  const client = useMemo(
    () => userId && connection?.apiKey
      ? new Studio3dGenerationHttpClient({
          userId,
          providerApiKey: () => connection.apiKey,
        })
      : null,
    [connection, userId],
  );

  return (
    <details
      className="shrink-0 rounded-xl border border-line bg-panel/40"
      data-studio-advanced-ai-tools="true"
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-xs font-bold text-fg">
        <span>고급 공동 창작·3D</span>
        <span className="text-[0.58rem] font-medium text-fg-3">획 제안 · Rodin 3D</span>
      </summary>
      <div className="grid gap-3 border-t border-line p-3">
        <div className="flex gap-1" role="tablist" aria-label="고급 AI 제작 도구">
          <button
            type="button"
            role="tab"
            aria-selected={active === "stroke"}
            onClick={() => setActive("stroke")}
            className="min-h-11 flex-1 rounded-lg border border-line text-xs font-bold aria-selected:border-accent aria-selected:bg-accent/10"
          >
            획 제안
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={active === "three-d"}
            onClick={() => setActive("three-d")}
            className="min-h-11 flex-1 rounded-lg border border-line text-xs font-bold aria-selected:border-accent aria-selected:bg-accent/10"
          >
            AI 3D
          </button>
        </div>

        {active === "stroke" ? <StudioConnectedStrokeProposalPanel /> : null}

        {active === "three-d" ? (
          client ? (
            <div className="grid gap-2">
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 text-xs text-fg-2">
                <span>통합 AI 설정 · {connection?.label}</span>
                <Link to="/settings/ai" className="font-bold text-accent">연결 관리</Link>
              </div>
              <StudioAi3dGenerationPanel
                client={client}
                onInsertArtifact={
                  onInsertGenerated3d
                    ? (job, blob) => onInsertGenerated3d(blob, job.artifactRevision!.id)
                    : undefined
                }
                onSaveArtifact={
                  onSaveGenerated3d
                    ? (job, blob) => onSaveGenerated3d(blob, job.artifactRevision!.id)
                    : undefined
                }
                onOpenTextureEditor={
                  onEditGenerated3dTexture
                    ? (job, blob) => onEditGenerated3dTexture(blob, job.artifactRevision!.id)
                    : undefined
                }
              />
            </div>
          ) : (
            <p role="status" className="rounded-lg border border-warn/35 bg-warn/10 p-3 text-xs text-fg-2">
              로그인한 Studio 작업에서 통합 AI 설정의 Hyper3D/Rodin 사용자 키를 연결하면 사용할 수 있습니다.
            </p>
          )
        ) : null}
      </div>
    </details>
  );
}
