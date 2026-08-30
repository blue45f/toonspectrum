import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  CreatorMarketplaceResourceListQueryDto,
  CreatorMarketplaceResourceParamsDto,
  PublishCreatorMarketplaceResourceDto,
} from "./creator-marketplace.dto";
import { CreatorMarketplaceService } from "./creator-marketplace.service";

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller("/creator/marketplace/resources")
export class CreatorMarketplaceController {
  constructor(
    @Inject(CreatorMarketplaceService)
    private readonly marketplaceService: CreatorMarketplaceService
  ) {}

  @Get()
  @Header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=300")
  async list(
    @Query(new ZodValidationPipe(CreatorMarketplaceResourceListQueryDto))
    query: CreatorMarketplaceResourceListQueryDto
  ) {
    // Public catalog/search is intentionally viewer-agnostic so edge caches never mix account
    // state. It remains ungated here: anonymous requests have no sound privacy-preserving actor
    // key, and persisting raw or caller-supplied IP/identity would create a spoofable PII boundary.
    // Volumetric protection belongs at the trusted edge, outside this ownership-aware API gate.
    return this.marketplaceService.list(query);
  }

  @Get("/mine")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async listMine(
    @Query(new ZodValidationPipe(CreatorMarketplaceResourceListQueryDto))
    query: CreatorMarketplaceResourceListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const publisherId = requireUserId(userId);
    return this.marketplaceService.list(query, {
      publisherId,
      viewerId: publisherId,
    });
  }

  @Get("/:id")
  @Header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=300")
  async getById(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto
  ) {
    // Public detail is byte-for-byte viewer-agnostic. Ownership is available only from the
    // private `/mine` projection; otherwise a shared edge cache could replay `isOwner: true`
    // from a publisher request to another viewer (or the inverse).
    return this.marketplaceService.getById(params.id);
  }

  @Post()
  @Header("Cache-Control", "private, no-store, max-age=0")
  async publish(
    @Body(new ZodValidationPipe(PublishCreatorMarketplaceResourceDto))
    body: PublishCreatorMarketplaceResourceDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.marketplaceService.publish(requireUserId(userId), body);
  }

  @Delete("/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async deleteOwned(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.marketplaceService.deleteOwned(requireUserId(userId), params.id);
  }
}
