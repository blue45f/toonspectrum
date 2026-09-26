import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  BatchCreatorRoleProfilesDto,
  CreatorRoleDirectoryQueryDto,
  CreatorRoleWorkspaceParamsDto,
  UpdateCreatorRoleWorkspaceDto,
} from "./creator-role-workspace.dto";
import { CreatorRoleWorkspaceService } from "./creator-role-workspace.service";

function authenticatedUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class CreatorRoleWorkspaceController {
  constructor(
    @Inject(CreatorRoleWorkspaceService)
    private readonly service: CreatorRoleWorkspaceService,
  ) {}

  @Get("/creator/role-workspaces/:projectKey")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getWorkspace(
    @Param(new ZodValidationPipe(CreatorRoleWorkspaceParamsDto))
    params: CreatorRoleWorkspaceParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getWorkspace(
      authenticatedUserId(userId),
      params.projectKey,
    );
  }

  @Put("/creator/role-workspaces/:projectKey")
  @Header("Cache-Control", "private, no-store, max-age=0")
  saveWorkspace(
    @Param(new ZodValidationPipe(CreatorRoleWorkspaceParamsDto))
    params: CreatorRoleWorkspaceParamsDto,
    @Body(new ZodValidationPipe(UpdateCreatorRoleWorkspaceDto))
    body: UpdateCreatorRoleWorkspaceDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.saveWorkspace(
      authenticatedUserId(userId),
      params.projectKey,
      body.baseRevision,
      body.document,
    );
  }

  @Post("/creator/role-profiles/batch")
  @Header("Cache-Control", "private, no-store, max-age=0")
  batchProfiles(
    @Body(new ZodValidationPipe(BatchCreatorRoleProfilesDto))
    body: BatchCreatorRoleProfilesDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.batchProfiles(authenticatedUserId(userId), body);
  }

  @Get("/creator/role-directory")
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  directory(
    @Query(new ZodValidationPipe(CreatorRoleDirectoryQueryDto))
    query: CreatorRoleDirectoryQueryDto,
  ) {
    return this.service.directory(query);
  }
}
