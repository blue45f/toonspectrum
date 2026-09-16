import { Controller, Get, Headers, Query, Res } from "@nestjs/common";

import { CreatorMarketplaceService } from "../creator-marketplace/creator-marketplace.service";
import { renderOgPage } from "./og-page";

import type { Response } from "express";

@Controller()
export class OgController {
  constructor(private readonly marketplace: CreatorMarketplaceService) {}

  @Get("og")
  async render(
    @Query() query: Record<string, unknown>,
    @Headers("user-agent") userAgent: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const page = await renderOgPage({
      query,
      userAgent,
      canonicalHost: process.env.CANONICAL_HOST,
      readers: {
        readMarketResource: (identifier) => this.marketplace.getById(identifier),
      },
    });
    response.status(200);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", page.cacheControl);
    response.setHeader("X-ToonSpectrum-OG-Source", `render-core:${page.source}`);
    response.send(page.html);
  }
}
