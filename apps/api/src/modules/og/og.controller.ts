import { Controller, Get, Headers, Inject, Query, Res } from "@nestjs/common";

import { getAuthorData } from "../../../../../packages/core/src/server";
import { getFanPost } from "../../server/community";
import { getGovernedCafeBySlug } from "../../server/community-governance";
import {
  getCreatorPublicProfile,
  getSeries,
  getWork,
} from "../../server/creator";
import { CollaborationRepository } from "../collaboration/collaboration.repository";
import { CreatorMarketplaceService } from "../creator-marketplace/creator-marketplace.service";
import { PromotionService } from "../promotion/promotion.service";
import { renderOgPage } from "./og-page";
import { PUBLIC_SHARE_OG_READERS } from "./og-readers";

import type { Response } from "express";

@Controller()
export class OgController {
  private readonly collaboration = new CollaborationRepository();
  private readonly promotion = new PromotionService();

  constructor(
    @Inject(CreatorMarketplaceService)
    private readonly marketplace: CreatorMarketplaceService,
  ) {}

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
        ...PUBLIC_SHARE_OG_READERS,
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
