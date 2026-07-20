import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { StudioVoiceIcePolicyController } from "./studio-voice-ice-policy.controller";
import { StudioVoiceIcePolicyService } from "./studio-voice-ice-policy.service";

describe("StudioVoiceIcePolicyController", () => {
  it("keeps screen-share ICE issuance on its dedicated authenticated service path", async () => {
    const response = {
      version: 1 as const,
      mode: "turn" as const,
      iceServers: [{
        urls: ["turn:screen.example.com"],
        username: "exp:opaque",
        credential: "credential",
        credentialType: "password" as const,
      }],
      issuedAt: "2026-07-20T00:00:00.000Z",
      expiresAt: "2026-07-20T00:15:00.000Z",
      ttlSeconds: 900,
    };
    const issueScreenShare = vi.fn().mockResolvedValue(response);
    const controller = new StudioVoiceIcePolicyController(
      { issueScreenShare } as unknown as StudioVoiceIcePolicyService
    );

    await expect(
      controller.issueScreenShare({ id: "screen-work-a" }, "screen-viewer-a")
    ).resolves.toBe(response);
    expect(issueScreenShare).toHaveBeenCalledWith("screen-viewer-a", "screen-work-a");
  });

  it("rejects unauthenticated screen-share ICE callers before issuance", async () => {
    const issueScreenShare = vi.fn();
    const controller = new StudioVoiceIcePolicyController(
      { issueScreenShare } as unknown as StudioVoiceIcePolicyService
    );

    await expect(
      controller.issueScreenShare({ id: "screen-work-b" })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(issueScreenShare).not.toHaveBeenCalled();
  });
});
