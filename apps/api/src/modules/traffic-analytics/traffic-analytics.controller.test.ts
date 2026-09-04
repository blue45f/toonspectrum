import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { TrafficAnalyticsController } from "./traffic-analytics.controller";
import { TrafficAnalyticsService } from "./traffic-analytics.service";

import type { Request } from "express";

describe("TrafficAnalyticsController", () => {
  const service = {
    recordPageView: vi.fn().mockResolvedValue({ accepted: true }),
    recordHeartbeat: vi.fn().mockResolvedValue({ accepted: true }),
  } as unknown as TrafficAnalyticsService;
  const controller = new TrafficAnalyticsController(service);
  const request = {
    headers: {
      host: "www.toonstudio.cloud",
      "user-agent": "Test Browser",
      "x-vercel-ip-country": "KR",
    },
  } as unknown as Request;

  it("requires the non-safelisted first-party browser proof", async () => {
    await expect(
      controller.recordPageView(request, undefined, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forwards normalized request context to the collector", async () => {
    await expect(
      controller.recordPageView(request, "1", {
        visitorId: "visitor_1234567890",
        sessionId: "session_1234567890",
        path: "/studio",
      }),
    ).resolves.toEqual({ accepted: true });
    expect(service.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/studio" }),
      expect.objectContaining({
        host: "www.toonstudio.cloud",
        countryCode: "KR",
      }),
    );
  });
});
