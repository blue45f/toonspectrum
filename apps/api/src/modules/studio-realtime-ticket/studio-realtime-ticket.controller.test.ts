import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { StudioRealtimeTicketController } from "./studio-realtime-ticket.controller";

const REQUEST = {
  version: 1,
  providerId: "cloudflare-realtime-seoul",
  sessionId: "session-1",
  scope: { workId: "work-1", roomId: "room-1" },
  workloads: ["presence"],
  capabilities: ["presence.snapshot-v1"],
} as const;

describe("StudioRealtimeTicketController", () => {
  it("requires the verified session middleware user id", () => {
    const issue = vi.fn();
    const controller = new StudioRealtimeTicketController({ issue } as never);

    expect(() => controller.issue(undefined, undefined, REQUEST))
      .toThrow(UnauthorizedException);
    expect(issue).not.toHaveBeenCalled();
  });

  it("delegates only the authenticated identity, origin, and strict request body", async () => {
    const response = {
      version: 1,
      providerId: REQUEST.providerId,
      scope: REQUEST.scope,
      workloads: REQUEST.workloads,
      capabilities: REQUEST.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    } as const;
    const issue = vi.fn(async () => response);
    const controller = new StudioRealtimeTicketController({ issue } as never);

    await expect(
      controller.issue(
        "owner",
        "https://www.toonstudio.cloud",
        REQUEST,
      ),
    ).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith(
      "owner",
      "https://www.toonstudio.cloud",
      REQUEST,
    );
  });
});
