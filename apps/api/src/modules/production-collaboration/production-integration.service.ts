import { randomBytes, randomUUID } from "node:crypto";

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import type {
  ProductionProjectAggregate,
} from "@toonspectrum/core/production";

import { ProductionCollaborationService } from "./production-collaboration.service";
import {
  buildMailtoDraft,
  buildProductionCalendarEvents,
  buildProductionCalendarIcs,
  buildProductionGoogleDriveArtifact,
  buildProductionProvenanceManifest,
  buildProductionProjectBackup,
  buildProductionSigningPackage,
  buildProductionTaxInvoiceCsv,
  canonicalJson,
  sha256Digest,
} from "./production-integration-artifacts";
import {
  resolveProductionIntegrationConfig,
  type ProductionIntegrationConfig,
} from "./production-integration-config";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
  type GoogleCredentialEnvelope,
} from "./production-integration-crypto";
import {
  ProductionDocumensoEnvelopeMetadataSchema,
  type ProductionGoogleDriveUpload,
  type ProductionIntegrationEmailDraft,
  type ProductionIntegrationNotification,
  type ProductionPushSubscription,
  type ProductionTossConfirm,
} from "./production-integration.dto";
import {
  createDocumensoEnvelope,
  documensoFailureState,
  type ProductionPdfUpload,
} from "./production-documenso-provider";import {
  createGoogleGmailDraft,
  exchangeGoogleAuthorizationCode,
  googleAuthorizationUrl,
  googleUserInfo,
  refreshGoogleCredential,
  syncGoogleCalendar,
  uploadGoogleDriveArtifact,
} from "./production-google-workspace";
import {
  ProductionExternalHttpError,
} from "./production-integration-http";
import {
  ProductionIntegrationMutationConflictError,
  ProductionIntegrationMutationInFlightError,
  ProductionIntegrationRepository,
  type ProductionIntegrationProvider,
} from "./production-integration.repository";
import {
  sendProductionNotification,
} from "./production-notification-provider";
import {
  confirmTossPayment,
  type TossPaymentResponse,
} from "./production-toss-provider";

interface ProjectRecord {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: {
    readonly view: boolean;
    readonly comment: boolean;
    readonly edit: boolean;
    readonly manage: boolean;
    readonly owner: boolean;
    readonly role: string | null;
  };
}

interface FencedOperationResult {
  readonly response: Record<string, unknown>;
  readonly externalId?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("integration provider returned a non-object response");
  }
  return value as Record<string, unknown>;
}

function appendQuery(path: string, values: Record<string, string>): string {
  const url = new URL(path, "https://toonspectrum.invalid");
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
}

function nextUtcDay(now = new Date()): Date {
  return new Date(utcDayStart(now).getTime() + 24 * 60 * 60 * 1_000);
}

@Injectable()
export class ProductionIntegrationService {
  private readonly config: ProductionIntegrationConfig;

  constructor(
    @Inject(ProductionCollaborationService)
    private readonly productionService: ProductionCollaborationService,
    @Inject(ProductionIntegrationRepository)
    private readonly repository: ProductionIntegrationRepository,
  ) {
    this.config = resolveProductionIntegrationConfig(process.env);
  }

  private async project(
    actorUserId: string,
    projectId: string,
    capability: "view" | "edit" | "manage" = "view",
  ): Promise<ProjectRecord> {
    const record = await this.productionService.getProject(actorUserId, projectId);
    if (capability === "edit" && !record.access.edit) {
      throw new ForbiddenException("프로젝트 편집 권한이 필요합니다.");
    }
    if (capability === "manage" && !record.access.manage) {
      throw new ForbiddenException("프로젝트 운영 권한이 필요합니다.");
    }
    return record;
  }

  private mapMutationFence(error: unknown): never {
    if (error instanceof ProductionIntegrationMutationConflictError) {
      throw new ConflictException(
        "같은 외부 연동 요청 식별자가 다른 내용에 사용되었습니다.",
      );
    }
    if (error instanceof ProductionIntegrationMutationInFlightError) {
      throw new ConflictException({
        message: error.state === "uncertain"
          ? "외부 서비스 처리 결과가 불확실합니다. 공급자 상태를 확인한 뒤 재조정해 주세요."
          : "같은 외부 연동 요청이 아직 처리 중입니다.",
        state: error.state,
        externalId: error.externalId,
      });
    }
    throw error;
  }

  private providerFailure(error: unknown): {
    readonly uncertain: boolean;
    readonly code: string;
    readonly externalId: string | null;
  } {
    if (error instanceof ProductionExternalHttpError) {
      return {
        uncertain: error.uncertain,
        code: error.code,
        externalId: null,
      };
    }
    return {
      uncertain: false,
      code: error instanceof Error
        ? error.message.slice(0, 160)
        : "integration_unknown_error",
      externalId: null,
    };
  }
  private async fenced<T extends Record<string, unknown>>(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly mutationId: string;
    readonly provider: ProductionIntegrationProvider;
    readonly operation: string;
    readonly request: unknown;
    readonly run: () => Promise<FencedOperationResult>;
    readonly dailyLimit?: number;
    readonly classifyFailure?: (error: unknown) => {
      readonly uncertain: boolean;
      readonly code: string;
      readonly externalId: string | null;
    };
  }): Promise<T> {
    const requestDigest = sha256Digest(canonicalJson(input.request));
    let replay: Record<string, unknown> | null;
    try {
      ({ replay } = await this.repository.beginMutation({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        mutationId: input.mutationId,
        provider: input.provider,
        operation: input.operation,
        requestDigest,
      }));
    } catch (error) {
      this.mapMutationFence(error);
    }
    if (replay) return replay as T;

    try {
      if (input.dailyLimit !== undefined) {
        const used = await this.repository.countMutationsSince({
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          operation: input.operation,
          since: utcDayStart(),
        });
        if (input.dailyLimit <= 0 || used > input.dailyLimit) {
          throw new Error("zero_cost_daily_limit_reached");
        }
      }
      const result = await input.run();
      await this.repository.completeMutation({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        mutationId: input.mutationId,
        externalId: result.externalId,
        response: result.response,
      });
      return result.response as T;
    } catch (error) {
      const failure = input.classifyFailure?.(error)
        ?? this.providerFailure(error);
      await this.repository.failMutation({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        mutationId: input.mutationId,
        state: failure.uncertain ? "uncertain" : "failed",
        errorCode: failure.code,
        externalId: failure.externalId,
      });
      if (
        failure.code.endsWith("_not_configured")
        || failure.code === "toss_live_payment_disabled"
        || failure.code === "invalid_pdf_upload"
      ) {
        throw new BadRequestException(failure.code);
      }
      if (failure.code === "zero_cost_daily_limit_reached") {
        throw new HttpException({
          message: "무료 운용 보호를 위한 오늘의 외부 연동 한도에 도달했습니다.",
          code: failure.code,
          resetsAt: nextUtcDay().toISOString(),
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (failure.uncertain) {
        throw new ServiceUnavailableException({
          message: "외부 서비스 처리 결과가 불확실합니다.",
          code: failure.code,
          externalId: failure.externalId,
        });
      }
      throw new BadGatewayException({
        message: "외부 서비스 요청이 실패했습니다.",
        code: failure.code,
      });
    }
  }
  async capabilities(actorUserId: string, projectId: string) {
    await this.project(actorUserId, projectId);
    const googleConnection = await this.repository.getConnection(
      projectId,
      actorUserId,
    );
    const since = utcDayStart();
    const [
      calendarUsed,
      gmailUsed,
      driveUsed,
      notificationUsed,
      documensoUsed,
    ] = await Promise.all([
      this.repository.countMutationsSince({
        projectId,
        actorUserId,
        operation: "sync-events",
        since,
      }),
      this.repository.countMutationsSince({
        projectId,
        actorUserId,
        operation: "create-draft",
        since,
      }),
      this.repository.countMutationsSince({
        projectId,
        actorUserId,
        operation: "upload-artifact",
        since,
      }),
      this.repository.countMutationsSince({
        projectId,
        actorUserId,
        operation: "send-notification",
        since,
      }),
      this.repository.countMutationsSince({
        projectId,
        actorUserId,
        operation: "create-envelope",
        since,
      }),
    ]);
    const notification = this.config.notification;
    const limits = this.config.dailyLimits;
    const used = {
      googleCalendarSyncs: calendarUsed,
      gmailDrafts: gmailUsed,
      googleDriveUploads: driveUsed,
      notifications: notificationUsed,
      documensoEnvelopes: documensoUsed,
    };
    return Object.freeze({
      version: 1,
      zeroCostFirst: true,
      costPolicy: this.config.costPolicy,
      budget: {
        resetsAt: nextUtcDay().toISOString(),
        limits,
        used,
        remaining: Object.fromEntries(
          Object.entries(limits).map(([key, limit]) => [
            key,
            Math.max(0, limit - used[key as keyof typeof used]),
          ]),
        ),
      },
      calendar: {
        icsExport: true,
        googleTemplateLinks: true,
        googleApiConfigured: this.config.google.configured,
        googleConnected: Boolean(googleConnection),
      },
      email: {
        mailtoDraft: true,
        gmailApiConfigured: this.config.google.configured,
        googleConnected: Boolean(googleConnection),
      },
      drive: {
        googleApiConfigured: this.config.google.configured,
        googleConnected: Boolean(googleConnection),
        scope: "drive.file",
        artifacts: [
          "project-backup",
          "calendar-ics",
          "provenance-json",
          "tax-invoice-csv",
          "tax-invoice-sheet",
        ],
      },
      notifications: {
        webPush: Boolean(
          notification.vapidSubject
          && notification.vapidPublicKey
          && notification.vapidPrivateKey,
        ),
        vapidPublicKey: notification.vapidPublicKey,
        genericWebhook: Boolean(
          notification.genericWebhookUrl
          && notification.genericWebhookSecret,
        ),
        discord: Boolean(notification.discordWebhookUrl),
        ntfy: Boolean(notification.ntfyBaseUrl && notification.ntfyTopic),
      },
      signatures: {
        documensoConfigured: this.config.documenso.configured,
        selfHosted: this.config.documenso.selfHosted,
        hostedAllowed: this.config.documenso.hostedAllowed,
        manualSigningPackage: true,
        fallback: "download-pdf-and-sign-manually",
      },
      payments: {
        tossConfigured: this.config.toss.configured,
        mode: !this.config.toss.configured
          ? "disabled"
          : this.config.toss.testMode
            ? "test"
            : this.config.toss.liveAllowed
              ? "live-explicitly-enabled"
              : "live-blocked",
      },
      taxInvoice: {
        csvExport: true,
        googleSheetExport: this.config.google.configured,
        automaticIssuance: false,
      },
      provenance: {
        hashManifest: true,
        c2paDraft: true,
        trustedCertificateSigning: false,
      },
    });
  }

  async calendarArtifacts(actorUserId: string, projectId: string) {
    const { aggregate } = await this.project(actorUserId, projectId);
    return {
      events: buildProductionCalendarEvents(
        aggregate,
        this.config.publicOrigin,
      ),
      ics: buildProductionCalendarIcs(
        aggregate,
        this.config.publicOrigin,
      ),
    };
  }

  async provenance(actorUserId: string, projectId: string) {
    const { aggregate } = await this.project(actorUserId, projectId);
    return buildProductionProvenanceManifest(aggregate);
  }

  async projectBackup(actorUserId: string, projectId: string) {
    const { aggregate } = await this.project(actorUserId, projectId, "manage");
    return buildProductionProjectBackup(aggregate);
  }

  async signingPackage(actorUserId: string, projectId: string) {
    const { aggregate } = await this.project(actorUserId, projectId, "manage");
    return buildProductionSigningPackage(aggregate);
  }

  async taxInvoiceCsv(actorUserId: string, projectId: string) {
    const { aggregate } = await this.project(actorUserId, projectId, "manage");
    return buildProductionTaxInvoiceCsv(aggregate);
  }

  async mailtoDraft(
    actorUserId: string,
    projectId: string,
    input: ProductionIntegrationEmailDraft,
  ) {
    await this.project(actorUserId, projectId);
    return {
      url: buildMailtoDraft(input),
      mode: "local-client",
    };
  }
  async googleConnectUrl(
    actorUserId: string,
    projectId: string,
    redirectPath: string,
  ) {
    await this.project(actorUserId, projectId);
    if (!this.config.google.configured) {
      throw new BadRequestException("google_workspace_not_configured");
    }
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);
    await this.repository.createOauthState({
      stateHash: sha256Digest(state),
      projectId,
      actorUserId,
      redirectPath,
      expiresAt,
    });
    return {
      authorizationUrl: googleAuthorizationUrl(this.config, state),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async googleCallback(input: {
    readonly state: string;
    readonly code?: string;
    readonly error?: string;
  }) {
    const state = await this.repository.consumeOauthState(
      sha256Digest(input.state),
    );
    if (!state) {
      throw new BadRequestException("Google 연결 요청이 만료되었거나 이미 사용되었습니다.");
    }
    if (input.error) {
      return {
        redirectPath: appendQuery(state.redirectPath, {
          integration: "google",
          status: "denied",
          error: input.error,
        }),
      };
    }
    if (!input.code) throw new BadRequestException("Google 승인 코드가 없습니다.");
    await this.project(state.actorUserId, state.projectId);
    if (!this.config.google.encryptionKey) {
      throw new BadRequestException("google_workspace_not_configured");
    }
    const credential = await exchangeGoogleAuthorizationCode(
      this.config,
      input.code,
    );
    const user = await googleUserInfo(this.config, credential);
    await this.repository.upsertConnection({
      projectId: state.projectId,
      actorUserId: state.actorUserId,
      ciphertext: encryptIntegrationCredential(
        credential,
        this.config.google.encryptionKey,
      ),
      externalAccountId: user.email ?? user.sub,
      scopes: credential.scope.split(/\s+/u).filter(Boolean),
      expiresAt: new Date(credential.expiresAt),
    });
    return {
      redirectPath: appendQuery(state.redirectPath, {
        integration: "google",
        status: "connected",
      }),
    };
  }

  async disconnectGoogle(actorUserId: string, projectId: string) {
    await this.project(actorUserId, projectId);
    await this.repository.deleteConnection(projectId, actorUserId);
    return { disconnected: true };
  }
  private async googleCredential(
    actorUserId: string,
    projectId: string,
  ): Promise<GoogleCredentialEnvelope> {
    const encryptionKey = this.config.google.encryptionKey;
    if (!this.config.google.configured || !encryptionKey) {
      throw new BadRequestException("google_workspace_not_configured");
    }
    const connection = await this.repository.getConnection(
      projectId,
      actorUserId,
    );
    if (!connection) {
      throw new BadRequestException("google_workspace_not_connected");
    }
    const current = decryptIntegrationCredential(
      connection.ciphertext,
      encryptionKey,
    );
    const credential = await refreshGoogleCredential(this.config, current);
    if (credential.accessToken !== current.accessToken) {
      await this.repository.upsertConnection({
        projectId,
        actorUserId,
        ciphertext: encryptIntegrationCredential(credential, encryptionKey),
        externalAccountId: connection.externalAccountId,
        scopes: credential.scope.split(/\s+/u).filter(Boolean),
        expiresAt: new Date(credential.expiresAt),
      });
    }
    return credential;
  }

  async syncGoogleCalendar(
    actorUserId: string,
    projectId: string,
    mutationId: string,
  ) {
    const { aggregate } = await this.project(actorUserId, projectId);
    const events = buildProductionCalendarEvents(
      aggregate,
      this.config.publicOrigin,
    );
    if (events.length > 250) {
      throw new BadRequestException(
        "한 번에 Google Calendar로 동기화할 수 있는 일정은 250개 이하입니다.",
      );
    }
    return this.fenced({
      actorUserId,
      projectId,
      mutationId,
      provider: "google-calendar",
      operation: "sync-events",
      dailyLimit: this.config.dailyLimits.googleCalendarSyncs,
      request: {
        aggregateRevision: aggregate.revision,
        events: events.map((event) => ({
          key: event.key,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        })),
      },
      run: async () => {
        const credential = await this.googleCredential(actorUserId, projectId);
        const result = await syncGoogleCalendar({
          config: this.config,
          credential,
          projectId,
          events,
        });
        return { response: asRecord(result) };
      },
    });
  }

  async createGmailDraft(
    actorUserId: string,
    projectId: string,
    input: ProductionIntegrationEmailDraft,
  ) {
    await this.project(actorUserId, projectId);
    return this.fenced({
      actorUserId,
      projectId,
      mutationId: input.mutationId,
      provider: "google-gmail",
      operation: "create-draft",
      dailyLimit: this.config.dailyLimits.gmailDrafts,
      request: input,
      run: async () => {
        const credential = await this.googleCredential(actorUserId, projectId);
        const draft = await createGoogleGmailDraft({
          config: this.config,
          credential,
          to: input.to,
          cc: input.cc,
          subject: input.subject,
          body: input.body,
        });
        return {
          response: asRecord(draft),
          externalId: draft.id,
        };
      },
    });
  }
  async uploadGoogleDriveArtifact(
    actorUserId: string,
    projectId: string,
    input: ProductionGoogleDriveUpload,
  ) {
    const sensitiveArtifact = input.artifact === "project-backup"
      || input.artifact.startsWith("tax-invoice-");
    const { aggregate } = await this.project(
      actorUserId,
      projectId,
      sensitiveArtifact ? "manage" : "view",
    );
    const generated = buildProductionGoogleDriveArtifact(
      aggregate,
      input.artifact,
      this.config.publicOrigin,
    );
    return this.fenced({
      actorUserId,
      projectId,
      mutationId: input.mutationId,
      provider: "google-drive",
      operation: "upload-artifact",
      dailyLimit: this.config.dailyLimits.googleDriveUploads,
      request: {
        aggregateRevision: aggregate.revision,
        artifact: input.artifact,
        folderId: input.folderId ?? null,
        digest: generated.digest,
      },
      run: async () => {
        const credential = await this.googleCredential(actorUserId, projectId);
        const file = await uploadGoogleDriveArtifact({
          config: this.config,
          credential,
          projectId,
          artifact: input.artifact,
          fileName: generated.fileName,
          sourceMimeType: generated.sourceMimeType,
          googleMimeType: generated.googleMimeType,
          content: generated.content,
          folderId: input.folderId,
        });
        return {
          response: asRecord({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink ?? null,
            created: file.created,
            digest: generated.digest,
            artifact: input.artifact,
          }),
          externalId: file.id,
        };
      },
    });
  }

  async subscribeWebPush(
    actorUserId: string,
    projectId: string,
    subscription: ProductionPushSubscription,
  ) {
    await this.project(actorUserId, projectId);
    const endpointHash = sha256Digest(subscription.endpoint);
    await this.repository.upsertPushSubscription({
      projectId,
      actorUserId,
      endpointHash,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expirationTime: subscription.expirationTime,
    });
    return {
      subscribed: true,
      endpointHash,
    };
  }

  async unsubscribeWebPush(
    actorUserId: string,
    projectId: string,
    endpoint: string,
  ) {
    await this.project(actorUserId, projectId);
    await this.repository.deletePushSubscription(
      projectId,
      actorUserId,
      sha256Digest(endpoint),
    );
    return { unsubscribed: true };
  }

  private safeNotificationUrl(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.startsWith("/production")) return value;
    if (!this.config.publicOrigin) {
      throw new BadRequestException("알림 URL은 제작 화면 내부 경로여야 합니다.");
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException("알림 URL이 올바르지 않습니다.");
    }
    if (
      url.origin !== this.config.publicOrigin
      || !url.pathname.startsWith("/production")
    ) {
      throw new BadRequestException("알림 URL은 제작 화면 내부 경로여야 합니다.");
    }
    return url.toString();
  }

  async sendNotification(
    actorUserId: string,
    projectId: string,
    input: ProductionIntegrationNotification,
  ) {
    const { aggregate } = await this.project(actorUserId, projectId, "edit");
    const notification = {
      ...input,
      url: this.safeNotificationUrl(input.url),
    };
    const subscriptions = input.channel === "web-push"
      ? await this.repository.listPushSubscriptions(projectId)
      : [];
    return this.fenced({
      actorUserId,
      projectId,
      mutationId: input.mutationId,
      provider: input.channel,
      operation: "send-notification",
      dailyLimit: this.config.dailyLimits.notifications,
      request: notification,
      run: async () => {
        const result = await sendProductionNotification({
          config: this.config,
          projectId,
          projectTitle: aggregate.title,
          notification,
          subscriptions,
        });
        await Promise.all(
          result.removedEndpointHashes.map((endpointHash) =>
            this.repository.deletePushSubscriptionByHash(endpointHash)
          ),
        );
        return {
          response: asRecord({
            channel: input.channel,
            sent: result.sent,
            removedExpired: result.removedEndpointHashes.length,
            providerResponse: result.providerResponse,
          }),
        };
      },
    });
  }
  async createDocumensoEnvelope(
    actorUserId: string,
    projectId: string,
    metadataValue: unknown,
    file: ProductionPdfUpload | undefined,
  ) {
    await this.project(actorUserId, projectId, "manage");
    const metadata = ProductionDocumensoEnvelopeMetadataSchema.parse(
      metadataValue,
    );
    if (!file) throw new BadRequestException("서명할 PDF 파일이 필요합니다.");
    return this.fenced({
      actorUserId,
      projectId,
      mutationId: metadata.mutationId,
      provider: "documenso",
      operation: "create-envelope",
      dailyLimit: this.config.dailyLimits.documensoEnvelopes,
      request: {
        metadata,
        file: {
          name: file.originalname,
          size: file.size,
          digest: sha256Digest(file.buffer),
        },
      },
      run: async () => {
        const result = await createDocumensoEnvelope({
          config: this.config,
          metadata,
          file,
        });
        return {
          response: asRecord({
            envelopeId: result.envelope.id,
            status: result.envelope.status ?? (result.distributed
              ? "PENDING"
              : "DRAFT"),
            distributed: result.distributed,
            selfHosted: this.config.documenso.selfHosted,
          }),
          externalId: result.envelope.id,
        };
      },
      classifyFailure: documensoFailureState,
    });
  }

  private paymentVerifierAssignment(
    aggregate: ProductionProjectAggregate,
    actorUserId: string,
  ): string {
    const partyId = aggregate.parties.find(
      (party) => party.accountUserId === actorUserId,
    )?.id;
    const assignment = aggregate.assignments.find(
      (entry) => entry.partyId === partyId && entry.status === "active",
    );
    if (!assignment) {
      throw new ForbiddenException(
        "활성 역할 배정이 있는 프로젝트 구성원만 결제를 검증할 수 있습니다.",
      );
    }
    return assignment.id;
  }

  private async recordTossPayment(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly payment: TossPaymentResponse;
    readonly invoiceId: string;
  }) {
    const record = await this.project(
      input.actorUserId,
      input.projectId,
      "manage",
    );
    const invoice = record.aggregate.invoices.find(
      (entry) => entry.id === input.invoiceId,
    );
    if (!invoice) throw new BadRequestException("청구서를 찾을 수 없습니다.");
    const assignmentId = this.paymentVerifierAssignment(
      record.aggregate,
      input.actorUserId,
    );
    const paymentId = `payment:toss:${sha256Digest(
      input.payment.paymentKey,
    ).slice(7, 31)}`;
    const paymentRecord = {
      id: paymentId,
      projectId: input.projectId,
      agreementId: invoice.agreementId,
      invoiceId: invoice.id,
      payerPartyId: invoice.recipientPartyId,
      payeePartyId: invoice.issuerPartyId,
      amountMinor: input.payment.totalAmount,
      currency: input.payment.currency,
      status: "verified-paid" as const,
      provider: this.config.toss.testMode
        ? "toss-payments-test"
        : "toss-payments-live",
      externalPaymentRef: input.payment.paymentKey,
      evidenceRefs: input.payment.receipt?.url
        ? [input.payment.receipt.url]
        : [],
      verifiedByAssignmentId: assignmentId,
      paidAt: input.payment.approvedAt ?? new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    return this.productionService.executeCommand(
      input.actorUserId,
      input.projectId,
      {
        expectedRevision: record.aggregate.revision,
        mutationId: randomUUID(),
        command: {
          type: "upsert-commercial-record",
          record: { kind: "payment", value: paymentRecord },
        },
      },
    );
  }
  async confirmTossPayment(
    actorUserId: string,
    projectId: string,
    input: ProductionTossConfirm,
  ) {
    const { aggregate } = await this.project(actorUserId, projectId, "manage");
    const invoice = aggregate.invoices.find(
      (entry) => entry.id === input.invoiceId,
    );
    if (!invoice) throw new BadRequestException("청구서를 찾을 수 없습니다.");
    if (invoice.currency !== "KRW" || invoice.amountMinor !== input.amount) {
      throw new BadRequestException(
        "결제 승인 금액과 청구서의 금액·통화가 일치하지 않습니다.",
      );
    }
    if (!["issued", "verified", "disputed"].includes(invoice.status)) {
      throw new BadRequestException("현재 상태의 청구서는 결제할 수 없습니다.");
    }
    this.paymentVerifierAssignment(aggregate, actorUserId);
    return this.fenced({
      actorUserId,
      projectId,
      mutationId: input.mutationId,
      provider: "toss-payments",
      operation: "confirm-payment",
      request: {
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
        invoiceId: input.invoiceId,
        testMode: this.config.toss.testMode,
      },
      run: async () => {
        const payment = await confirmTossPayment({
          config: this.config,
          request: input,
        });
        if (payment.currency !== invoice.currency) {
          throw new Error("toss_payment_currency_mismatch");
        }
        const mutation = await this.recordTossPayment({
          actorUserId,
          projectId,
          payment,
          invoiceId: input.invoiceId,
        });
        return {
          externalId: payment.paymentKey,
          response: asRecord({
            paymentKey: payment.paymentKey,
            orderId: payment.orderId,
            status: payment.status,
            currency: payment.currency,
            totalAmount: payment.totalAmount,
            approvedAt: payment.approvedAt ?? null,
            receiptUrl: payment.receipt?.url ?? null,
            testMode: this.config.toss.testMode,
            aggregateRevision: mutation.aggregate.revision,
          }),
        };
      },
    });
  }
}
