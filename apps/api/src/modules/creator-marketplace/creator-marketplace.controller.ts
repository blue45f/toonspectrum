import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { isAdminUser } from "../../server/app-config";

import {
  CreatorMarketplaceModerationQueryDto,
  DismissCreatorMarketplaceOrphanReportDto,
  CreatorMarketplaceOwnedHistoryQueryDto,
  CreatorMarketplaceResourceHistoryQueryDto,
  CreatorMarketplaceResourceListQueryDto,
  CreatorMarketplaceResourceParamsDto,
  ModerateCreatorMarketplaceResourceDto,
  PublishCreatorMarketplaceResourceDto,
  ReportCreatorMarketplaceResourceDto,
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
  @Header("Cache-Control", "no-store, max-age=0")
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

  @Get("/identity/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  async getIdentity(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto
  ) {
    // Legacy Studio rows contain only an exact, high-entropy release UUID. Reconciliation needs
    // publisher/package/kind even after owner delist or moderation, so this intentionally reveals
    // that bounded identity and a coarse availability reason to any caller already holding the
    // UUID. Every existing state follows one response shape; manifests, versions, rights,
    // moderation evidence, entitlement, and raw account/profile state remain private.
    return this.marketplaceService.getIdentity(params.id);
  }

  @Get("/history/:id")
  @Header("Cache-Control", "no-store, max-age=0")
  async history(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto,
    @Query(new ZodValidationPipe(CreatorMarketplaceResourceHistoryQueryDto))
    query: CreatorMarketplaceResourceHistoryQueryDto
  ) {
    return this.marketplaceService.history(params.id, query);
  }

  @Get("/moderation")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async listModeration(
    @Query(new ZodValidationPipe(CreatorMarketplaceModerationQueryDto))
    query: CreatorMarketplaceModerationQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    const reviewerId = requireUserId(userId);
    if (!(await isAdminUser(reviewerId))) {
      throw new ForbiddenException("관리자만 마켓 신고를 검수할 수 있습니다.");
    }
    return this.marketplaceService.listModeration(query);
  }

  @Patch("/moderation/reports/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async dismissOrphanReport(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto,
    @Body(new ZodValidationPipe(DismissCreatorMarketplaceOrphanReportDto))
    body: DismissCreatorMarketplaceOrphanReportDto,
    @Headers("x-user-id") userId?: string
  ) {
    const reviewerId = requireUserId(userId);
    if (!(await isAdminUser(reviewerId))) {
      throw new ForbiddenException("관리자만 고아 마켓 신고를 종결할 수 있습니다.");
    }
    return this.marketplaceService.dismissOrphanReport(
      reviewerId,
      params.id,
      body
    );
  }

  @Get("/mine/history")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async listOwnedHistory(
    @Query(new ZodValidationPipe(CreatorMarketplaceOwnedHistoryQueryDto))
    query: CreatorMarketplaceOwnedHistoryQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.marketplaceService.listOwnedHistory(requireUserId(userId), query);
  }

  @Get("/mine/heads")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async listOwnedHeads(
    @Query(new ZodValidationPipe(CreatorMarketplaceResourceListQueryDto))
    query: CreatorMarketplaceResourceListQueryDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.marketplaceService.listOwnedHeads(requireUserId(userId), query);
  }

  /** @deprecated Use `/mine/heads` for lifecycle-aware package management. */
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
  @Header("Cache-Control", "no-store, max-age=0")
  async getById(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto
  ) {
    // Public detail is byte-for-byte viewer-agnostic. Ownership is available only from the
    // private `/mine` projection; otherwise a shared edge cache could replay `isOwner: true`
    // from a publisher request to another viewer (or the inverse).
    return this.marketplaceService.getById(params.id);
  }

  @Post("/:id/report")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async report(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto,
    @Body(new ZodValidationPipe(ReportCreatorMarketplaceResourceDto))
    body: ReportCreatorMarketplaceResourceDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.marketplaceService.report(requireUserId(userId), params.id, body);
  }

  @Post("/:id/relist")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async relistOwned(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.marketplaceService.relistOwned(requireUserId(userId), params.id);
  }

  @Patch("/:id/moderation")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async moderate(
    @Param(new ZodValidationPipe(CreatorMarketplaceResourceParamsDto))
    params: CreatorMarketplaceResourceParamsDto,
    @Body(new ZodValidationPipe(ModerateCreatorMarketplaceResourceDto))
    body: ModerateCreatorMarketplaceResourceDto,
    @Headers("x-user-id") userId?: string
  ) {
    const reviewerId = requireUserId(userId);
    if (!(await isAdminUser(reviewerId))) {
      throw new ForbiddenException("관리자만 마켓 신고를 검수할 수 있습니다.");
    }
    return this.marketplaceService.moderate(reviewerId, params.id, body);
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
