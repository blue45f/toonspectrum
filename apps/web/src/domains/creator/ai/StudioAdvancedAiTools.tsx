import { useMemo, useRef, useState } from "react";

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
  const [showByok, setShowByok] = useState(false);
  const [providerKey, setProviderKey] = useState("");
  const providerKeyRef = useRef("");
  providerKeyRef.current = providerKey;
  const client = useMemo(
    () =>
      userId
        ? new Studio3dGenerationHttpClient({
            userId,
            providerApiKey: () => providerKeyRef.current || undefined,
          })
        : null,
    [userId],
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
              <button
                type="button"
                aria-expanded={showByok}
                onClick={() => setShowByok((value) => !value)}
                className="min-h-11 rounded-lg border border-line px-3 text-left text-xs font-bold"
              >
                세션 한정 BYOK {showByok ? "접기" : "설정"}
              </button>
              {showByok ? (
                <label className="grid gap-1 rounded-lg border border-line bg-card p-2 text-xs font-semibold">
                  Hyper3D API 키
                  <input
                    type="password"
                    autoComplete="off"
                    value={providerKey}
                    onChange={(event) => setProviderKey(event.currentTarget.value.slice(0, 512))}
                    placeholder="브라우저 메모리에만 보관"
                    className="min-h-11 rounded-lg border border-line bg-panel px-2 font-normal"
                  />
                  <span className="text-[0.58rem] font-normal leading-relaxed text-fg-3">
                    키는 이 컴포넌트의 메모리에만 존재하며 작업 기록·localStorage·서버 DB에 저장하지 않습니다.
                  </span>
                </label>
              ) : null}
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
              로그인한 Studio 작업에서 AI 3D 생성 작업 내역과 비용 원장을 사용할 수 있습니다.
            </p>
          )
        ) : null}
      </div>
    </details>
  );
}
