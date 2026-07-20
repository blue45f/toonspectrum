import { describe, expect, it } from "vitest";

import { resolveStudioLiveFeaturePolicy } from "./studio-live-feature-policy";

describe("Studio live feature policy", () => {
  it("keeps recurring-cost voice infrastructure disabled by default", () => {
    expect(resolveStudioLiveFeaturePolicy({})).toEqual({ voiceEnabled: false });
    expect(resolveStudioLiveFeaturePolicy({ STUDIO_LIVE_VOICE_ENABLED: "false" }))
      .toEqual({ voiceEnabled: false });
  });

  it("requires an explicit exact opt-in before enabling legacy mesh voice", () => {
    expect(resolveStudioLiveFeaturePolicy({ STUDIO_LIVE_VOICE_ENABLED: "true" }))
      .toEqual({ voiceEnabled: true });
    expect(resolveStudioLiveFeaturePolicy({ STUDIO_LIVE_VOICE_ENABLED: "TRUE" }))
      .toEqual({ voiceEnabled: false });
  });
});
