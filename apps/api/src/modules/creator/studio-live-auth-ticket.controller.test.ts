import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  getSessionAuthenticationPrincipal,
  getSessionAuthenticationSource,
} from "../../session-middleware";

import { StudioLiveAuthTicketController } from "./studio-live-auth-ticket.controller";

vi.mock("../../session-middleware", () => ({
  getSessionAuthenticationPrincipal: vi.fn(),
  getSessionAuthenticationSource: vi.fn(),
}));

describe("StudioLiveAuthTicketController", () => {
  it("rejects anonymous and signed-header callers before ticket issuance", () => {
    const issue = vi.fn();
    const controller = new StudioLiveAuthTicketController({ issue } as never);
    const request = {} as never;

    vi.mocked(getSessionAuthenticationSource).mockReturnValue(null);
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);
    expect(() => controller.issue(request, { version: 1 }))
      .toThrow(UnauthorizedException);

    vi.mocked(getSessionAuthenticationSource).mockReturnValue("header");
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue({
      userId: "header-user",
      sessionVersion: 1,
      expiresAt: Date.now() + 60_000,
    });
    expect(() => controller.issue(request, { version: 1 }))
      .toThrow(UnauthorizedException);
    expect(issue).not.toHaveBeenCalled();
  });

  it("delegates only the middleware-verified cookie principal", () => {
    const principal = {
      userId: "cookie-user",
      sessionVersion: 4,
      expiresAt: Date.now() + 60_000,
    };
    const response = {
      version: 1,
      ticket: `${"a".repeat(36)}.${"b".repeat(80)}.${"c".repeat(43)}`,
      issuedAt: "2026-08-02T00:00:00.000Z",
      expiresAt: "2026-08-02T00:01:00.000Z",
    } as const;
    const issue = vi.fn(() => response);
    const controller = new StudioLiveAuthTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationSource).mockReturnValue("cookie");
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(principal);

    expect(controller.issue(request, { version: 1 })).toBe(response);
    expect(issue).toHaveBeenCalledWith(principal, { version: 1 });
  });
});
