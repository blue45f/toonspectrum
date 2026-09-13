import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("studio collaboration cost boundary", () => {
  it("keeps legacy TURN-capable voice out of the collaboration shell", () => {
    const reachableSource = [
      "./live/StudioLiveCollaborationProvider.tsx",
      "./live/studio-live-collaboration-context.ts",
      "./live/StudioLiveCollaborationPanel.tsx",
      "./live/StudioLiveCanvasOverlay.tsx",
    ].map(source).join("\n");

    expect(reachableSource).not.toMatch(/StudioVoiceCall|studio-voice-call|getUserMedia/u);
    expect(reachableSource).not.toContain("음성 작업실");
  });

  it("keeps the new huddle RTC-only without credential endpoints or recording", () => {
    const huddle = source("./live/huddle/studio-p2p-huddle-controller.ts");
    const policy = source("./live/huddle/studio-p2p-huddle-protocol.ts");
    expect(huddle).not.toMatch(/MediaRecorder|localStorage|indexedDB|acquireStudioVoiceIcePolicy|screen-share\/ice|voice\/ice/u);
    expect(policy).toContain("stun:stun.l.google.com:19302");
    expect(policy).not.toMatch(/turn:|turns:/u);
  });

  it("exposes only the screen-share ICE credential route", () => {
    const controllerSource = source(
      "../../../../../apps/api/src/modules/creator/studio-voice-ice-policy.controller.ts"
    );

    expect(controllerSource).toContain("/creator/works/:id/screen-share/ice");
    expect(controllerSource).not.toContain("/creator/works/:id/voice/ice");
  });
});
