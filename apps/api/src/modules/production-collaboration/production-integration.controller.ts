import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";

import {
  ProductionDocumensoEnvelopeMetadataSchema,
  ProductionIntegrationEmailDraftDto,
  ProductionIntegrationGoogleCallbackQueryDto,
  ProductionIntegrationGoogleStartQueryDto,
  ProductionGoogleDriveUploadDto,
  ProductionIntegrationMutationDto,
  ProductionIntegrationNotificationDto,
  ProductionIntegrationProjectParamsDto,
  ProductionPushSubscriptionDto,
  ProductionPushUnsubscribeDto,
  ProductionTossConfirmDto,
} from "./production-integration.dto";
import { ProductionIntegrationService } from "./production-integration.service";
import type { ProductionPdfUpload } from "./production-documenso-provider";

function authenticatedUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요합니다.");
  return userId;
}

function parseDocumensoMetadata(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 50_000) {
    throw new BadRequestException("서명 요청 metadata가 필요합니다.");
  }
  try {
    return ProductionDocumensoEnvelopeMetadataSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("서명 요청 metadata가 올바르지 않습니다.");
  }
}

@Controller("/production")
export class ProductionIntegrationController {
  constructor(
    @Inject(ProductionIntegrationService)
    private readonly service: ProductionIntegrationService,
  ) {}

  @Get("/projects/:projectId/integrations/capabilities")
  @Header("Cache-Control", "private, no-store, max-age=0")
  capabilities(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.capabilities(
      authenticatedUserId(userId),
      params.projectId,
    );
  }

  @Get("/projects/:projectId/integrations/calendar")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async calendar(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    const artifacts = await this.service.calendarArtifacts(
      authenticatedUserId(userId),
      params.projectId,
    );
    return { events: artifacts.events };
  }

  @Get("/projects/:projectId/integrations/calendar.ics")
  async calendarIcs(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId: string | undefined,
    @Res() response: Response,
  ) {
    const artifacts = await this.service.calendarArtifacts(
      authenticatedUserId(userId),
      params.projectId,
    );
    response
      .status(200)
      .set({
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="production-${params.projectId}.ics"`,
      })
      .send(artifacts.ics);
  }

  @Get("/projects/:projectId/integrations/provenance")
  @Header("Cache-Control", "private, no-store, max-age=0")
  provenance(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.provenance(
      authenticatedUserId(userId),
      params.projectId,
    );
  }
  @Get("/projects/:projectId/integrations/project-backup")
  @Header("Cache-Control", "private, no-store, max-age=0")
  projectBackup(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.projectBackup(
      authenticatedUserId(userId),
      params.projectId,
    );
  }

  @Get("/projects/:projectId/integrations/signing-package")
  @Header("Cache-Control", "private, no-store, max-age=0")
  signingPackage(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.signingPackage(
      authenticatedUserId(userId),
      params.projectId,
    );
  }

  @Get("/projects/:projectId/integrations/tax-invoices.csv")
  async taxInvoiceCsv(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId: string | undefined,
    @Res() response: Response,
  ) {
    const csv = await this.service.taxInvoiceCsv(
      authenticatedUserId(userId),
      params.projectId,
    );
    response
      .status(200)
      .set({
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tax-invoices-${params.projectId}.csv"`,
      })
      .send(csv);
  }

  @Post("/projects/:projectId/integrations/email/mailto")
  mailtoDraft(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionIntegrationEmailDraftDto))
    body: ProductionIntegrationEmailDraftDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.mailtoDraft(
      authenticatedUserId(userId),
      params.projectId,
      body,
    );
  }

  @Get("/projects/:projectId/integrations/google/connect")
  googleConnect(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Query(new ZodValidationPipe(ProductionIntegrationGoogleStartQueryDto))
    query: ProductionIntegrationGoogleStartQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.googleConnectUrl(
      authenticatedUserId(userId),
      params.projectId,
      query.redirectPath,
    );
  }

  @Get("/integrations/google/callback")
  async googleCallback(
    @Query(new ZodValidationPipe(ProductionIntegrationGoogleCallbackQueryDto))
    query: ProductionIntegrationGoogleCallbackQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.service.googleCallback(query);
    response.redirect(303, result.redirectPath);
  }

  @Delete("/projects/:projectId/integrations/google")
  disconnectGoogle(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.disconnectGoogle(
      authenticatedUserId(userId),
      params.projectId,
    );
  }
  @Post("/projects/:projectId/integrations/google/calendar/sync")
  syncGoogleCalendar(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionIntegrationMutationDto))
    body: ProductionIntegrationMutationDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.syncGoogleCalendar(
      authenticatedUserId(userId),
      params.projectId,
      body.mutationId,
    );
  }

  @Post("/projects/:projectId/integrations/google/gmail/drafts")
  createGmailDraft(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionIntegrationEmailDraftDto))
    body: ProductionIntegrationEmailDraftDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createGmailDraft(
      authenticatedUserId(userId),
      params.projectId,
      body,
    );
  }

  @Post("/projects/:projectId/integrations/google/drive/files")
  uploadGoogleDriveArtifact(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionGoogleDriveUploadDto))
    body: ProductionGoogleDriveUploadDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.uploadGoogleDriveArtifact(
      authenticatedUserId(userId),
      params.projectId,
      body,
    );
  }

  @Post("/projects/:projectId/integrations/push/subscriptions")
  subscribeWebPush(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionPushSubscriptionDto))
    body: ProductionPushSubscriptionDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.subscribeWebPush(
      authenticatedUserId(userId),
      params.projectId,
      body,
    );
  }

  @Delete("/projects/:projectId/integrations/push/subscriptions")
  unsubscribeWebPush(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionPushUnsubscribeDto))
    body: ProductionPushUnsubscribeDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.unsubscribeWebPush(
      authenticatedUserId(userId),
      params.projectId,
      body.endpoint,
    );
  }

  @Post("/projects/:projectId/integrations/notifications")
  sendNotification(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionIntegrationNotificationDto))
    body: ProductionIntegrationNotificationDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.sendNotification(
      authenticatedUserId(userId),
      params.projectId,
      body,
    );
  }
  @Post("/projects/:projectId/integrations/documenso/envelopes")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 20 * 1_024 * 1_024, files: 1 },
  }))
  createDocumensoEnvelope(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body() body: { metadata?: unknown },
    @UploadedFile() file: ProductionPdfUpload | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.createDocumensoEnvelope(
      authenticatedUserId(userId),
      params.projectId,
      parseDocumensoMetadata(body.metadata),
      file,
    );
  }

  @Post("/projects/:projectId/integrations/toss/confirm")
  confirmTossPayment(
    @Param(new ZodValidationPipe(ProductionIntegrationProjectParamsDto))
    params: ProductionIntegrationProjectParamsDto,
    @Body(new ZodValidationPipe(ProductionTossConfirmDto))
    body: ProductionTossConfirmDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.confirmTossPayment(
      authenticatedUserId(userId),
      params.projectId,
      body,
    );
  }
}
