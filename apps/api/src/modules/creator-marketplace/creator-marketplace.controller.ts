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
    // Public catalog is intentionally viewer-agnostic so edge caches never mix account state.
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
