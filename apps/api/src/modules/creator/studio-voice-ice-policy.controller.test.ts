import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { CreatorTeamWorkParamsDto } from "./creator.dto";
import { StudioVoiceIcePolicyController } from "./studio-voice-ice-policy.controller";
import { StudioVoiceIcePolicyService } from "./studio-voice-ice-policy.service";

describe("StudioVoiceIcePolicyController", () => {
  it("passes only the verified user and strict work id to the policy service", async () => {
    const response = {
      version: 1 as const,
      mode: "direct" as const,
      iceServers: [],
      issuedAt: "2026-07-18T00:00:00.000Z",
      expiresAt: null,
      ttlSeconds: 0,
    };
    const issue = vi.fn().mockResolvedValue(response);
    const controller = new StudioVoiceIcePolicyController(
      { issue } as unknown as StudioVoiceIcePolicyService
    );
    const params = new ZodValidationPipe(CreatorTeamWorkParamsDto).transform(
      { id: " voice-work-a " },
      { type: "param", metatype: undefined, data: undefined }
    );

    await expect(controller.issue(params, "verified-user-a")).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith("verified-user-a", "voice-work-a");
  });

  it("rejects unauthenticated callers before policy issuance", async () => {
    const issue = vi.fn();
    const controller = new StudioVoiceIcePolicyController(
      { issue } as unknown as StudioVoiceIcePolicyService
    );

    await expect(controller.issue({ id: "voice-work-b" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(issue).not.toHaveBeenCalled();
  });

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
