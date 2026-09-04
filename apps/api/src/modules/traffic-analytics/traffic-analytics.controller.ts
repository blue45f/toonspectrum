import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";

import { TOONSPECTRUM_CSRF_HEADER_VALUE } from "../../../../../lib/csrf";

import {
  TrafficAnalyticsService,
  type TrafficRequestContext,
} from "./traffic-analytics.service";

import type { Request } from "express";

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requestContext(request: Request): TrafficRequestContext {
  return {
    userId: singleHeader(request.headers["x-user-id"]),
    userAgent: singleHeader(request.headers["user-agent"]),
    host: singleHeader(request.headers.host),
    referer: singleHeader(request.headers.referer),
    countryCode:
      singleHeader(request.headers["x-vercel-ip-country"])
      ?? singleHeader(request.headers["cf-ipcountry"]),
  };
}

@Controller("analytics/traffic")
export class TrafficAnalyticsController {
  constructor(
    @Inject(TrafficAnalyticsService)
    private readonly trafficAnalyticsService: TrafficAnalyticsService,
  ) {}

  private requireBrowserProof(proof: string | undefined): void {
    if (proof !== TOONSPECTRUM_CSRF_HEADER_VALUE) {
      throw new ForbiddenException("트래픽 수집 요청의 출처를 확인할 수 없습니다.");
    }
  }

  @Post("page-view")
  @HttpCode(202)
  async recordPageView(
    @Req() request: Request,
    @Headers("x-toonspectrum-csrf") proof: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireBrowserProof(proof);
    return this.trafficAnalyticsService.recordPageView(
      body,
      requestContext(request),
    );
  }

  @Post("heartbeat")
  @HttpCode(202)
  async recordHeartbeat(
    @Req() request: Request,
    @Headers("x-toonspectrum-csrf") proof: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireBrowserProof(proof);
    return this.trafficAnalyticsService.recordHeartbeat(
      body,
      requestContext(request),
    );
  }
}
