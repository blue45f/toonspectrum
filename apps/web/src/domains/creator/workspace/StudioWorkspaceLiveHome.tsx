import type { ReactNode } from "react";
import { StudioVirtualSpacePage } from "../virtual-space/StudioVirtualSpacePage";

/** Personal space is local-only. It never creates a server work, membership or media session. */
export const PERSONAL_STUDIO_HOME_ID = "virtual-demo:personal-home";

export function StudioWorkspaceLiveHome({ projectId, header }: {
  readonly projectId: string | null;
  readonly header: ReactNode;
}) {
  return <StudioVirtualSpacePage projectIdOverride={projectId ?? PERSONAL_STUDIO_HOME_ID}
    personal={projectId === null} homeHeader={header} />;
}
