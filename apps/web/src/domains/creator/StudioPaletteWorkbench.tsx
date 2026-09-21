import type { ReactNode } from "react";
import { StudioColorEditor } from "./color/StudioColorEditor";
import { useStudioColorTargetKey, useStudioColorWorkspace } from "./color/StudioColorWorkspaceContext";
import { useStudioColorSession } from "./color/useStudioColorSession";

export interface StudioPaletteWorkbenchProps {
  readonly value: string;
  readonly recentColors: readonly string[];
  readonly onPreviewColor: (hex: string) => void;
  readonly onCommitColor: (hex: string) => void;
  readonly libraryContent: ReactNode;
}

/** Style dock shares the compact picker's editor and gesture transaction. */
export function StudioPaletteWorkbench({ value, recentColors, onPreviewColor, onCommitColor, libraryContent }: StudioPaletteWorkbenchProps) {
  const targetKey = useStudioColorTargetKey("brush-shape", undefined, "style-primary");
  const workspace = useStudioColorWorkspace();
  const { session, message, change, commit, cancel } = useStudioColorSession({
    targetKey, value,
    onCommit: (color) => { onPreviewColor(color); onCommitColor(color); },
  });
  return <section aria-label="색상 작업실" data-studio-palette-workbench="true" className="p-2">
    <StudioColorEditor session={session} onChange={change} onGestureCommit={() => { commit(); }}
      onApplyRequest={() => { commit(); }} onCancelRequest={cancel} recentColors={recentColors}
      documentColors={workspace?.documentColors} libraryContent={libraryContent} error={message} />
  </section>;
}
