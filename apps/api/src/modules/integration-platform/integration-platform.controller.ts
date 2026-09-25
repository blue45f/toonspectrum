import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { requireAdminUser } from "../admin/admin-types";
import {
  FeedPreviewSchema,
  IntegrationRecipeSchema,
  PublishPackageSchema,
  type FeedPreviewDto,
  type IntegrationRecipeDto,
  type PublishPackageDto,
} from "./integration-platform.dto";
import { IntegrationPlatformService } from "./integration-platform.service";

function requireIntegrationUser(userId?: string): string {
  if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}

@Controller("integrations")
export class IntegrationPlatformController {
  constructor(
    @Inject(IntegrationPlatformService)
    private readonly service: IntegrationPlatformService,
  ) {}

  @Get("catalog")
  @Header("Cache-Control", "private, no-store, max-age=0")
  catalog(@Headers("x-user-id") userId?: string) {
    requireIntegrationUser(userId);
    return this.service.catalog();
  }

  @Get("recipes")
  @Header("Cache-Control", "private, no-store, max-age=0")
  recipes(@Headers("x-user-id") userId?: string) {
    requireIntegrationUser(userId);
    return this.service.recipes();
  }

  @Get("runtime")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async runtime(@Headers("x-user-id") userId?: string) {
    const uid = requireIntegrationUser(userId);
    await requireAdminUser(uid);
    return this.service.runtime();
  }

  @Post("automation/validate")
  validateRecipe(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(IntegrationRecipeSchema)) body: IntegrationRecipeDto,
  ) {
    requireIntegrationUser(userId);
    return this.service.validateRecipe(body);
  }

  @Post("publish/package")
  buildPublishPackage(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(PublishPackageSchema)) body: PublishPackageDto,
  ) {
    requireIntegrationUser(userId);
    return this.service.buildPublishPackage(body);
  }

  @Post("feeds/preview")
  buildFeedPreview(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(FeedPreviewSchema)) body: FeedPreviewDto,
  ) {
    requireIntegrationUser(userId);
    return this.service.buildFeedPreview(body);
  }

  @Get("developer-manifest")
  @Header("Cache-Control", "public, max-age=300, s-maxage=300")
  developerManifest() {
    return this.service.developerManifest();
  }
}
