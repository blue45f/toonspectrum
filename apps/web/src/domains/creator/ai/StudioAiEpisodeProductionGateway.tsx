import { Suspense, useEffect, useState } from "react";

import { subscribeStudioAiEpisodeProductionOpenRequest } from "./studio-ai-episode-production-intent";
import { studioAiEpisodeProductionModalLoader } from "./studio-ai-episode-production-loader";

import type { StudioAiEpisodeProductionPlan } from "./studio-ai-episode-production-director";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const StudioAiEpisodeProductionModal = lazyRetry(
  studioAiEpisodeProductionModalLoader.load,
  "StudioAiEpisodeProductionModal",
);

export interface StudioAiEpisodeProductionGatewayProps {
  readonly onApplyPlan?: (plan: StudioAiEpisodeProductionPlan) => void;
  readonly onApplyPrompt?: (prompt: string) => void;
}

/** Own only the optional dialog lifetime, never the host's menu or image-tool state. */
export function StudioAiEpisodeProductionGateway({
  onApplyPlan,
  onApplyPrompt,
}: StudioAiEpisodeProductionGatewayProps) {
  const [open, setOpen] = useState(false);
  // Subscribe also consumes pre-mount requests, and stays intact through StrictMode's replay.
  useEffect(() => subscribeStudioAiEpisodeProductionOpenRequest(() => setOpen(true)), []);
  const applyPlan = (plan: StudioAiEpisodeProductionPlan) => {
    onApplyPlan?.(plan);
    setOpen(false);
  };
  const applyPrompt = (prompt: string) => {
    onApplyPrompt?.(prompt);
    setOpen(false);
  };
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <StudioAiEpisodeProductionModal
        open
        onClose={() => setOpen(false)}
        {...(onApplyPlan ? { onApplyPlan: applyPlan } : { onApplyPrompt: applyPrompt })}
      />
    </Suspense>
  );
}
