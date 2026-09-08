/**
 * Legacy public seam for the Studio scenario surface.
 *
 * The implementation now lives in the focused AI comic director domain while the existing lazy
 * registry and parent-owned scenario orchestration keep the same component and prop contract.
 */
import { StudioAiComicDirectorPanel } from "./ai/StudioAiComicDirectorPanel";
import { loadStudioAiSessionSettings } from "./ai/studio-ai-client";

import type { StudioAiComicDirectorPanelProps } from "./ai/StudioAiComicDirectorPanel";
import type { ReactElement } from "react";

export type StudioScenarioAutoLayoutPanelProps = StudioAiComicDirectorPanelProps;

export function StudioScenarioAutoLayoutPanel(
  props: StudioScenarioAutoLayoutPanelProps,
): ReactElement | null {
  const configuredSettings = props.aiSettings
    ?? (typeof window === "undefined"
      ? undefined
      : loadStudioAiSessionSettings(
          globalThis.sessionStorage,
          globalThis.localStorage,
        ));
  return (
    <StudioAiComicDirectorPanel
      {...props}
      aiSettings={configuredSettings}
    />
  );
}
