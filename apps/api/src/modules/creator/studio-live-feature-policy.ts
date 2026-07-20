import type { Provider } from "@nestjs/common";

export interface StudioLiveFeaturePolicy {
  /**
   * Legacy mesh voice is deliberately opt-in because TURN traffic and cluster discovery have a
   * recurring server cost. Screen sharing, chat, presence and CRDT collaboration remain enabled.
   */
  readonly voiceEnabled: boolean;
}

export const STUDIO_LIVE_FEATURE_POLICY = Symbol("STUDIO_LIVE_FEATURE_POLICY");

export function resolveStudioLiveFeaturePolicy(
  source: NodeJS.ProcessEnv = process.env
): StudioLiveFeaturePolicy {
  return Object.freeze({
    voiceEnabled: source.STUDIO_LIVE_VOICE_ENABLED === "true",
  });
}

export const studioLiveFeaturePolicyProvider: Provider = {
  provide: STUDIO_LIVE_FEATURE_POLICY,
  useFactory: () => resolveStudioLiveFeaturePolicy(process.env),
};
