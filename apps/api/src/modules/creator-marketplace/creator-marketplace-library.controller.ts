import {
  Body,
  Controller,
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

import {
  ConfirmCreatorMarketplaceStudioInstallDto,
  CreatorMarketplaceLibraryIdParamsDto,
  CreatorMarketplaceLibraryListQueryDto,
  SetCreatorMarketplaceLibraryArchiveDto,
} from "./creator-marketplace-library.dto";
import { CreatorMarketplaceLibraryService } from "./creator-marketplace-library.service";

function requireLibraryUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller("/creator/marketplace/library")
export class CreatorMarketplaceLibraryController {
  constructor(
    @Inject(CreatorMarketplaceLibraryService)
    private readonly libraryService: CreatorMarketplaceLibraryService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  async list(
    @Query(new ZodValidationPipe(CreatorMarketplaceLibraryListQueryDto))
    query: CreatorMarketplaceLibraryListQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.libraryService.list(requireLibraryUserId(userId), query);
  }

  @Get("/acquisition-target/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async resolveAcquisitionTarget(
    @Param(new ZodValidationPipe(CreatorMarketplaceLibraryIdParamsDto))
    params: CreatorMarketplaceLibraryIdParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.libraryService.resolveAcquisitionTarget(
      requireLibraryUserId(userId),
      params.id,
    );
  }

  @Post("/acquisitions/:id")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async acquire(
    @Param(new ZodValidationPipe(CreatorMarketplaceLibraryIdParamsDto))
    params: CreatorMarketplaceLibraryIdParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.libraryService.acquire(requireLibraryUserId(userId), params.id);
  }

  @Post("/install-confirmations/:id")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  async confirmStudioInstall(
    @Param(new ZodValidationPipe(CreatorMarketplaceLibraryIdParamsDto))
    params: CreatorMarketplaceLibraryIdParamsDto,
    @Body(new ZodValidationPipe(ConfirmCreatorMarketplaceStudioInstallDto))
    body: ConfirmCreatorMarketplaceStudioInstallDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.libraryService.confirmStudioInstall(
      requireLibraryUserId(userId),
      params.id,
      body,
    );
  }

  @Patch("/:id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async setArchived(
    @Param(new ZodValidationPipe(CreatorMarketplaceLibraryIdParamsDto))
    params: CreatorMarketplaceLibraryIdParamsDto,
    @Body(new ZodValidationPipe(SetCreatorMarketplaceLibraryArchiveDto))
    body: SetCreatorMarketplaceLibraryArchiveDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.libraryService.setArchived(
      requireLibraryUserId(userId),
      params.id,
      body,
    );
  }
}
