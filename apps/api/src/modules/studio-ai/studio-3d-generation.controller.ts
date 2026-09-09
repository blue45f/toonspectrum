import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";

import {
  Studio3dGenerationService,
  type Studio3dGenerationCreateInput,
} from "./studio-3d-generation.service";

import type { Request, Response } from "express";

function requireUserId(userId: string | undefined): string {
  if (!userId?.trim()) throw new UnauthorizedException("3D 생성 기능을 사용하려면 로그인이 필요해요.");
  return userId.trim();
}

function clientSignal(request: Request, response: Response): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  const close = () => {
    if (!response.writableEnded) abort();
  };
  request.once("aborted", abort);
  response.once("close", close);
  if (request.aborted || response.destroyed) abort();
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      request.off("aborted", abort);
      response.off("close", close);
    },
  });
}

@Controller("studio-ai/3d")
export class Studio3dGenerationController {
  constructor(
    @Inject(Studio3dGenerationService)
    private readonly service: Studio3dGenerationService,
  ) {}

  @Get("status")
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return this.service.status();
  }

  @Get("jobs")
  @Header("Cache-Control", "no-store, max-age=0")
  async list(@Headers("x-user-id") userId: string | undefined) {
    return this.service.list(requireUserId(userId));
  }

  @Get("jobs/:jobId")
  @Header("Cache-Control", "no-store, max-age=0")
  async get(
    @Headers("x-user-id") userId: string | undefined,
    @Param("jobId") jobId: string,
  ) {
    return this.service.get(requireUserId(userId), jobId);
  }

  @Post("jobs")
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-studio-3d-provider-key") providerApiKey: string | undefined,
    @Body() input: Studio3dGenerationCreateInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new UnauthorizedException("3D 생성 작업 식별자가 필요해요.");
    }
    const client = clientSignal(request, response);
    try {
      return await this.service.create(
        requireUserId(userId),
        idempotencyKey,
        input,
        providerApiKey,
        client.signal,
      );
    } finally {
      client.dispose();
    }
  }

  @Post("jobs/:jobId/advance")
  @HttpCode(HttpStatus.OK)
  async advance(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("x-studio-3d-provider-key") providerApiKey: string | undefined,
    @Param("jobId") jobId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const client = clientSignal(request, response);
    try {
      return await this.service.advance(
        requireUserId(userId),
        jobId,
        providerApiKey,
        client.signal,
      );
    } finally {
      client.dispose();
    }
  }

  @Post("jobs/:jobId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("x-studio-3d-provider-key") providerApiKey: string | undefined,
    @Param("jobId") jobId: string,
  ) {
    return this.service.cancel(requireUserId(userId), jobId, providerApiKey);
  }

  @Get("artifacts/:revisionId")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async artifact(
    @Headers("x-user-id") userId: string | undefined,
    @Param("revisionId") revisionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.service.artifact(requireUserId(userId), revisionId);
    response.setHeader("Content-Type", artifact.revision.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.revision.modelId.replace(/[^a-z0-9_-]/giu, "_")}.glb"`,
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Studio-Asset-Revision", artifact.revision.id);
    return new StreamableFile(Buffer.from(artifact.bytes));
  }
}
