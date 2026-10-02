import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { studioEntityIdSchema } from "@toonstudio/studio-project-model";

import { ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { authenticatedStudioUserId } from "../studio-project-graph.controller";
import { ManuscriptVersionShareService } from "./manuscript-version-share.service";

const privateResponse = () => applyDecorators(
  Header("Cache-Control", "private, no-store, max-age=0"),
  Header("Referrer-Policy", "no-referrer"),
  Header("X-Content-Type-Options", "nosniff"),
  Header("X-Robots-Tag", "noindex, nofollow"),
);

class ArtifactParams extends createZodDto(
  z.object({ artifactId: studioEntityIdSchema }).strict(),
) {}
class SnapshotParams extends createZodDto(
  z.object({
    artifactId: studioEntityIdSchema,
    snapshotId: studioEntityIdSchema,
  }).strict(),
) {}
class ShareParams extends createZodDto(
  z.object({
    artifactId: studioEntityIdSchema,
    linkId: studioEntityIdSchema,
  }).strict(),
) {}
class ResolveParams extends createZodDto(
  z.object({
    // 로컬 모델이 만드는 토큰 규격(24자)과 서버 마이그레이션 토큰을 함께 허용한다.
    token: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/u),
  }).strict(),
) {}

class CreateSnapshotBody extends createZodDto(
  z.object({
    id: studioEntityIdSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    memo: z.string().max(500).optional(),
    revisionId: studioEntityIdSchema,
    createdAt: z.string().datetime().optional(),
  }).strict(),
) {}
class UpdateSnapshotMemoBody extends createZodDto(
  z.object({ memo: z.string().max(500) }).strict(),
) {}
class CreateShareBody extends createZodDto(
  z.object({
    id: studioEntityIdSchema.optional(),
    snapshotId: studioEntityIdSchema,
    token: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/u),
    permission: z.enum(["view", "comment", "edit"]),
    expiresInDays: z.number().int().min(0).max(3650).nullable(),
    watermark: z.boolean(),
    password: z.string().min(1).max(128).optional(),
  }).strict(),
) {}

/**
 * CT-1: 원고 버전 스냅샷·공유 링크의 서버 정본 API.
 * 베이스 경로는 기존 studio-project-graph와 같고, 인증은 x-user-id(게이트웨이 주입)를
 * authenticatedStudioUserId로 강제한다 — 미로그인은 전부 403.
 * 권한(view/edit)은 저장소가 아티팩트 ACL로 서버에서 강제한다.
 */
@Controller("/studio-project-graph")
export class ManuscriptVersionShareController {
  constructor(
    @Inject(ManuscriptVersionShareService)
    private readonly service: ManuscriptVersionShareService,
  ) {}

  @Get("artifacts/:artifactId/manuscript-snapshots") @privateResponse()
  listSnapshots(
    @Param(new ZodValidationPipe(ArtifactParams)) params: ArtifactParams,
    @Headers("x-user-id") actor?: string,
  ) {
    return this.service.listSnapshots(
      authenticatedStudioUserId(actor),
      params.artifactId,
    );
  }

  @Post("artifacts/:artifactId/manuscript-snapshots") @HttpCode(200) @privateResponse()
  createSnapshot(
    @Param(new ZodValidationPipe(ArtifactParams)) params: ArtifactParams,
    @Body(new ZodValidationPipe(CreateSnapshotBody)) body: CreateSnapshotBody,
    @Headers("x-user-id") actor?: string,
  ) {
    return this.service.createSnapshot(
      authenticatedStudioUserId(actor),
      params.artifactId,
      body,
    );
  }

  @Patch("artifacts/:artifactId/manuscript-snapshots/:snapshotId") @HttpCode(200) @privateResponse()
  updateSnapshotMemo(
    @Param(new ZodValidationPipe(SnapshotParams)) params: SnapshotParams,
    @Body(new ZodValidationPipe(UpdateSnapshotMemoBody)) body: UpdateSnapshotMemoBody,
    @Headers("x-user-id") actor?: string,
  ) {
    return this.service.updateSnapshotMemo(
      authenticatedStudioUserId(actor),
      params.artifactId,
      params.snapshotId,
      body.memo,
    );
  }

  @Get("artifacts/:artifactId/version-shares") @privateResponse()
  listShares(
    @Param(new ZodValidationPipe(ArtifactParams)) params: ArtifactParams,
    @Headers("x-user-id") actor?: string,
  ) {
    return this.service.listShares(
      authenticatedStudioUserId(actor),
      params.artifactId,
    );
  }

  @Post("artifacts/:artifactId/version-shares") @HttpCode(200) @privateResponse()
  createShare(
    @Param(new ZodValidationPipe(ArtifactParams)) params: ArtifactParams,
    @Body(new ZodValidationPipe(CreateShareBody)) body: CreateShareBody,
    @Headers("x-user-id") actor?: string,
  ) {
    return this.service.createShare(
      authenticatedStudioUserId(actor),
      params.artifactId,
      body,
    );
  }

  @Post("artifacts/:artifactId/version-shares/:linkId/revoke") @HttpCode(200) @privateResponse()
  revokeShare(
    @Param(new ZodValidationPipe(ShareParams)) params: ShareParams,
    @Headers("x-user-id") actor?: string,
  ) {
    return this.service.revokeShare(
      authenticatedStudioUserId(actor),
      params.artifactId,
      params.linkId,
    );
  }

  /**
   * 공유 링크 해석. 로그인한 사용자만 부를 수 있고(x-user-id 강제),
   * 토큰 자격·만료·회수·비밀번호는 서비스/저장소가 서버에서 판정한다.
   * 비밀번호는 쿼리스트링이 아니라 헤더로 받는다(로그·히스토리 노출 방지).
   */
  @Get("version-shares/:token") @privateResponse()
  resolveShare(
    @Param(new ZodValidationPipe(ResolveParams)) params: ResolveParams,
    @Headers("x-version-share-password") password: string | undefined,
    @Headers("x-user-id") actor?: string,
  ) {
    authenticatedStudioUserId(actor);
    return this.service.resolveShare(params.token, password || undefined);
  }
}
