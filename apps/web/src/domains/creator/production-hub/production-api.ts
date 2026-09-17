import type {
  ChangeRequest,
  ClarificationThread,
  AssetRequirement,
  CompensationPlan,
  ContractChangeOrder,
  ContractMilestone,
  ContributionRecord,
  CreditManifest,
  CutPlan,
  DecisionRecord,
  DeliveryRevision,
  CreativeBranch,
  CreativeCharter,
  CreativeMergeRequest,
  DecisionAuthorityRule,
  Deliverable,
  EpisodeCollaboration,
  EpisodePlan,
  PaymentRecord,
  ProcurementProposal,
  ProductionAgreement,
  ProductionDispute,
  ProductionInvoice,
  ProductionOperationsRecord,
  ProductionProjectAggregate,
  ProductionStudioRevisionLink,
  ProductionRisk,
  ProductionRiskPolicy,
  ProductionRiskResponse,
  ProductionRiskResponseStatus,
  ProductionRiskSignal,
  ProductionRiskAssessment,
  ProductionRiskStatus,
  ProductionTaskForecast,
  ProjectBrief,
  ProductionTask,
  ReviewDecision,
  ReviewPolicy,
  ScenePlan,
  SeasonPlan,
  SeriesMaster,
  RightsInterest,
  RoleAssignment,
  ScheduleBaseline,
  ScopePackage,
  Submission,
  StoryToArtHandoffPackage,
  CollaborationParty,
} from "@toonspectrum/core/production";

import { api, apiPath } from "@/infrastructure/api";

export type ProductionPlanningRecord =
  | { readonly kind: "project-brief"; readonly value: ProjectBrief }
  | { readonly kind: "series-master"; readonly value: SeriesMaster }
  | { readonly kind: "season-plan"; readonly value: SeasonPlan }
  | { readonly kind: "episode-plan"; readonly value: EpisodePlan }
  | { readonly kind: "scene-plan"; readonly value: ScenePlan }
  | { readonly kind: "cut-plan"; readonly value: CutPlan }
  | { readonly kind: "asset-requirement"; readonly value: AssetRequirement }
  | { readonly kind: "risk"; readonly value: ProductionRisk }
  | { readonly kind: "decision"; readonly value: DecisionRecord };

export type ProductionCommercialRecord =
  | { readonly kind: "proposal"; readonly value: ProcurementProposal }
  | { readonly kind: "agreement"; readonly value: ProductionAgreement }
  | { readonly kind: "change-order"; readonly value: ContractChangeOrder }
  | { readonly kind: "milestone"; readonly value: ContractMilestone }
  | { readonly kind: "delivery-revision"; readonly value: DeliveryRevision }
  | { readonly kind: "invoice"; readonly value: ProductionInvoice }
  | { readonly kind: "payment"; readonly value: PaymentRecord }
  | { readonly kind: "dispute"; readonly value: ProductionDispute };

export interface ProductionProjectAccess {
  readonly view: boolean;
  readonly comment: boolean;
  readonly edit: boolean;
  readonly manage: boolean;
  readonly owner: boolean;
  readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer" | null;
}

export interface ProductionProjectRecord {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
}

export interface ProductionProjectSummary {
  readonly projectId: string;
  readonly workId: string;
  readonly title: string;
  readonly collaborationModel: ProductionProjectAggregate["collaborationModel"];
  readonly revision: number;
  readonly updatedAt: string;
  readonly access: ProductionProjectAccess;
  readonly healthScore: number;
  readonly activeEpisodeCount: number;
  readonly readyBufferCount: number;
  readonly criticalRiskCount: number;
  readonly overdueTaskCount: number;
  readonly blockedTaskCount: number;
  readonly unassignedTaskCount: number;
  readonly reviewTaskCount: number;
  readonly nextReleaseAt: string | null;
  readonly forecastFinishAt: string | null;
  readonly scheduleConfidencePercent: number | null;
}

export interface ProductionProjectListResponse {
  readonly projects: readonly ProductionProjectSummary[];
}

export interface ProductionPersonalInboxItem {
  readonly bucket: "dueToday" | "inProgress" | "review" | "ready" | "waitingInput" | "blockingOthers";
  readonly projectId: string;
  readonly projectTitle: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly processKey: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly estimateHours: number;
  readonly episodeId: string | null;
}

export interface ProductionPersonalInboxResponse {
  readonly items: readonly ProductionPersonalInboxItem[];
  readonly counts: Readonly<Record<ProductionPersonalInboxItem["bucket"], number>>;
}

export interface ProductionMutationResponse {
  readonly aggregate: ProductionProjectAggregate;
  readonly derived?: unknown;
}

export type ProductionClientCommand =
  | { readonly type: "upsert-planning-record"; readonly record: ProductionPlanningRecord }
  | { readonly type: "create-planning-snapshot"; readonly snapshot: Omit<import("@toonspectrum/core/production").PlanningSnapshot, "digest"> }
  | { readonly type: "upsert-commercial-record"; readonly record: ProductionCommercialRecord }
  | {
      readonly type: "configure-collaboration";
      readonly parties: readonly CollaborationParty[];
      readonly assignments: readonly RoleAssignment[];
      readonly authorityRules: readonly DecisionAuthorityRule[];
      readonly charter?: CreativeCharter;
    }
  | { readonly type: "upsert-episode"; readonly episode: EpisodeCollaboration }
  | { readonly type: "upsert-handoff"; readonly handoff: StoryToArtHandoffPackage }
  | { readonly type: "upsert-clarification"; readonly clarification: ClarificationThread }
  | { readonly type: "upsert-branch"; readonly branch: CreativeBranch }
  | { readonly type: "upsert-merge-request"; readonly mergeRequest: CreativeMergeRequest }
  | { readonly type: "upsert-deliverable"; readonly deliverable: Deliverable }
  | { readonly type: "upsert-submission"; readonly submission: Submission }
  | { readonly type: "upsert-studio-revision-link"; readonly link: ProductionStudioRevisionLink }
  | { readonly type: "upsert-review-policy"; readonly policy: ReviewPolicy }
  | { readonly type: "record-review-decision"; readonly policyId: string; readonly decision: ReviewDecision }
  | { readonly type: "upsert-task"; readonly task: ProductionTask }
  | { readonly type: "upsert-task-batch"; readonly tasks: readonly ProductionTask[] }
  | { readonly type: "upsert-operations-record"; readonly record: ProductionOperationsRecord }
  | { readonly type: "apply-schedule-scenario"; readonly baseline: ScheduleBaseline; readonly tasks: readonly ProductionTask[] }
  | {
      readonly type: "upsert-episode-operations";
      readonly episodeId: string;
      readonly episode?: EpisodeCollaboration;
      readonly episodePlan?: EpisodePlan;
      readonly tasks: readonly ProductionTask[];
    }
  | {
      readonly type: "upsert-change-request";
      readonly request: ChangeRequest;
      readonly impactHints?: {
        readonly affectedApprovalIds?: readonly string[];
        readonly touchesDialogue?: boolean;
        readonly touchesCanon?: boolean;
        readonly touchesVisualAsset?: boolean;
        readonly touchesRightsMetadata?: boolean;
        readonly agreementScoped?: boolean;
      };
    }
  | { readonly type: "publish-scope-package"; readonly scopePackage: Omit<ScopePackage, "digest"> }
  | {
      readonly type: "amend-scope-package";
      readonly previousPackageId: string;
      readonly replacement: Omit<ScopePackage, "digest">;
      readonly addendumId: string;
      readonly reason: string;
      readonly createdAt: string;
    }
  | { readonly type: "upsert-contribution"; readonly contribution: ContributionRecord }
  | {
      readonly type: "upsert-credit-manifest";
      readonly manifest: CreditManifest;
      readonly requiredApproverAssignmentIds?: readonly string[];
    }
  | { readonly type: "upsert-rights-interest"; readonly interest: RightsInterest }
  | { readonly type: "upsert-compensation-plan"; readonly plan: CompensationPlan }
  | { readonly type: "upsert-risk"; readonly risk: ProductionRisk }
  | { readonly type: "transition-risk"; readonly riskId: string; readonly toStatus: ProductionRiskStatus; readonly reason: string; readonly expectedRiskRevision: number }
  | { readonly type: "upsert-risk-response"; readonly response: ProductionRiskResponse }
  | { readonly type: "transition-risk-response"; readonly responseId: string; readonly toStatus: ProductionRiskResponseStatus; readonly actualEffect: string | null }
  | { readonly type: "suppress-risk-signal"; readonly signalId: string; readonly reason: string; readonly suppressedByAssignmentId: string; readonly expiresAt: string | null }
  | { readonly type: "update-risk-policy"; readonly policy: ProductionRiskPolicy }
  | { readonly type: "evaluate-risks" }
  | { readonly type: "rebaseline-task"; readonly taskId: string; readonly newDueAt: string; readonly reason: string; readonly sourceChangeRequestId: string | null };

function mutationId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

export function listProductionProjects(): Promise<ProductionProjectListResponse> {
  return api.get("/production/projects");
}

export function getProductionPersonalInbox(): Promise<ProductionPersonalInboxResponse> {
  return api.get("/production/inbox");
}

export function getProductionProject(projectId: string): Promise<ProductionProjectRecord> {
  return api.get(`/production/projects/${encodeURIComponent(projectId)}`);
}

export function getProductionProjectByWork(workId: string): Promise<ProductionProjectRecord> {
  return api.get(`/production/works/${encodeURIComponent(workId)}/project`);
}

export interface ProductionRiskListResponse {
  readonly summary: {
    readonly critical: number;
    readonly high: number;
    readonly warning: number;
    readonly actualOverdue: number;
    readonly forecastSlip: number;
    readonly blocked: number;
    readonly affectedEpisodeCount: number;
  };
  readonly items: readonly {
    readonly risk: ProductionRisk;
    readonly signal: ProductionRiskSignal | null;
    readonly responseCount: number;
  }[];
  readonly nextCursor: string | null;
  readonly evaluatedAt: string;
}

export function getProductionRisks(
  projectId: string,
  params?: Record<string, string | number | undefined>,
): Promise<ProductionRiskListResponse> {
  return api.get(`/production/projects/${encodeURIComponent(projectId)}/risks`, { params });
}

export function getProductionRisk(
  projectId: string,
  riskId: string,
): Promise<{
  readonly risk: ProductionRisk;
  readonly signal: ProductionRiskSignal | null;
  readonly responses: readonly ProductionRiskResponse[];
  readonly assessment: ProductionRiskAssessment | null;
  readonly taskForecasts: readonly ProductionTaskForecast[];
  readonly evaluatedAt: string;
}> {
  return api.get(`/production/projects/${encodeURIComponent(projectId)}/risks/${encodeURIComponent(riskId)}`);
}

export function createProductionProject(input: {
  readonly projectId: string;
  readonly workId: string;
  readonly organizationId?: string | null;
  readonly title: string;
  readonly collaborationModel:
    | "solo"
    | "co-creator"
    | "story-led-commission"
    | "art-led-commission"
    | "adaptation"
    | "studio-production"
    | "anthology"
    | "replacement";
  readonly ownerPartyId: string;
  readonly ownerDisplayName: string;
}): Promise<ProductionMutationResponse> {
  return api.post("/production/projects", {
    ...input,
    clientMutationId: mutationId(),
  });
}

export function executeProductionCommand(
  projectId: string,
  expectedRevision: number,
  command: ProductionClientCommand,
): Promise<ProductionMutationResponse> {
  return api.post(`/production/projects/${encodeURIComponent(projectId)}/commands`, {
    expectedRevision,
    mutationId: mutationId(),
    command,
  });
}

export interface ProductionExternalReviewView {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly review: {
    readonly id: string;
    readonly label: string;
    readonly watermark: boolean;
    readonly permissions: readonly ("view" | "comment" | "approve" | "download")[];
    readonly expiresAt: string;
    readonly responses: readonly {
      readonly id: string;
      readonly reviewerName: string;
      readonly decision: "comment" | "approve" | "request-changes";
      readonly note: string;
      readonly createdAt: string;
    }[];
  };
  readonly submissions: readonly {
    readonly id: string;
    readonly status: string;
    readonly submittedAt: string;
    readonly revisionRef: {
      readonly id: string;
      readonly lineage: "narrative" | "visual" | "integrated";
      readonly revision: number;
      readonly digest: string;
      readonly createdAt: string;
    };
    readonly evidenceRefs: readonly string[];
    readonly deliverable: {
      readonly id: string;
      readonly type: string;
      readonly expectedFormat: string;
      readonly completionCriteria: readonly string[];
    } | null;
  }[];
}

function externalReviewAuthorization(token: string): { readonly headers: Readonly<Record<string, string>> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function getProductionExternalReview(
  projectId: string,
  reviewId: string,
  token: string,
): Promise<ProductionExternalReviewView> {
  return api.get(
    `/production/public-reviews/${encodeURIComponent(projectId)}/${encodeURIComponent(reviewId)}`,
    externalReviewAuthorization(token),
  );
}

export function submitProductionExternalReview(
  projectId: string,
  reviewId: string,
  input: {
    readonly token: string;
    readonly reviewerName: string;
    readonly decision: "comment" | "approve" | "request-changes";
    readonly note: string;
  },
): Promise<ProductionExternalReviewView> {
  const { token, ...review } = input;
  return api.post(`/production/public-reviews/${encodeURIComponent(projectId)}/${encodeURIComponent(reviewId)}/responses`, {
    responseId: mutationId(),
    ...review,
  }, externalReviewAuthorization(token));
}

export type ProductionGoogleDriveArtifact =
  | "project-backup"
  | "calendar-ics"
  | "provenance-json"
  | "tax-invoice-csv"
  | "tax-invoice-sheet";

export interface ProductionIntegrationBudget {
  readonly resetsAt: string;
  readonly limits: Readonly<Record<string, number>>;
  readonly used: Readonly<Record<string, number>>;
  readonly remaining: Readonly<Record<string, number>>;
}

export interface ProductionIntegrationCapabilities {
  readonly version: 1;
  readonly zeroCostFirst: true;
  readonly costPolicy: "zero-cost-only" | "explicit-cost-enabled";
  readonly budget: ProductionIntegrationBudget;
  readonly calendar: {
    readonly icsExport: boolean;
    readonly googleTemplateLinks: boolean;
    readonly googleApiConfigured: boolean;
    readonly googleConnected: boolean;
  };
  readonly email: {
    readonly mailtoDraft: boolean;
    readonly gmailApiConfigured: boolean;
    readonly googleConnected: boolean;
  };
  readonly drive: {
    readonly googleApiConfigured: boolean;
    readonly googleConnected: boolean;
    readonly scope: "drive.file";
    readonly artifacts: readonly ProductionGoogleDriveArtifact[];
  };
  readonly notifications: {
    readonly webPush: boolean;
    readonly vapidPublicKey: string | null;
    readonly genericWebhook: boolean;
    readonly discord: boolean;
    readonly ntfy: boolean;
  };
  readonly signatures: {
    readonly documensoConfigured: boolean;
    readonly selfHosted: boolean;
    readonly hostedAllowed: boolean;
    readonly manualSigningPackage: boolean;
    readonly fallback: string;
  };
  readonly payments: {
    readonly tossConfigured: boolean;
    readonly mode: "disabled" | "test" | "live-explicitly-enabled" | "live-blocked";
  };
  readonly taxInvoice: {
    readonly csvExport: boolean;
    readonly googleSheetExport: boolean;
    readonly automaticIssuance: false;
  };
  readonly provenance: {
    readonly hashManifest: boolean;
    readonly c2paDraft: boolean;
    readonly trustedCertificateSigning: false;
  };
}

export interface ProductionCalendarIntegrationEvent {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly url: string;
  readonly googleCalendarUrl: string;
}

export function newProductionMutationId(): string {
  return mutationId();
}

function integrationPath(projectId: string, suffix: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}/integrations/${suffix}`;
}
export function getProductionIntegrationCapabilities(
  projectId: string,
): Promise<ProductionIntegrationCapabilities> {
  return api.get(integrationPath(projectId, "capabilities"));
}

export function getProductionCalendarEvents(
  projectId: string,
): Promise<{ readonly events: readonly ProductionCalendarIntegrationEvent[] }> {
  return api.get(integrationPath(projectId, "calendar"));
}

export function productionCalendarIcsUrl(projectId: string): string {
  return apiPath(integrationPath(projectId, "calendar.ics"));
}

export function productionTaxInvoiceCsvUrl(projectId: string): string {
  return apiPath(integrationPath(projectId, "tax-invoices.csv"));
}

export function getProductionProvenance(
  projectId: string,
): Promise<Record<string, unknown>> {
  return api.get(integrationPath(projectId, "provenance"));
}

export function getProductionProjectBackup(
  projectId: string,
): Promise<Record<string, unknown>> {
  return api.get(integrationPath(projectId, "project-backup"));
}

export function getProductionSigningPackage(
  projectId: string,
): Promise<Record<string, unknown>> {
  return api.get(integrationPath(projectId, "signing-package"));
}

export function createProductionMailtoDraft(
  projectId: string,
  input: {
    readonly to: readonly string[];
    readonly cc?: readonly string[];
    readonly subject: string;
    readonly body: string;
  },
): Promise<{ readonly url: string; readonly mode: string }> {
  return api.post(integrationPath(projectId, "email/mailto"), {
    mutationId: mutationId(),
    ...input,
  });
}

export function getGoogleProductionConnectUrl(
  projectId: string,
  redirectPath: string,
): Promise<{ readonly authorizationUrl: string; readonly expiresAt: string }> {
  return api.get(integrationPath(projectId, "google/connect"), {
    params: { redirectPath },
  });
}

export function disconnectGoogleProduction(
  projectId: string,
): Promise<{ readonly disconnected: true }> {
  return api.delete(integrationPath(projectId, "google"));
}

export function syncProductionGoogleCalendar(
  projectId: string,
): Promise<{ readonly synced: number }> {
  return api.post(integrationPath(projectId, "google/calendar/sync"), {
    mutationId: mutationId(),
  });
}
export function createProductionGmailDraft(
  projectId: string,
  input: {
    readonly to: readonly string[];
    readonly cc?: readonly string[];
    readonly subject: string;
    readonly body: string;
  },
): Promise<{ readonly id: string }> {
  return api.post(integrationPath(projectId, "google/gmail/drafts"), {
    mutationId: mutationId(),
    ...input,
  });
}

export function uploadProductionGoogleDriveArtifact(
  projectId: string,
  input: {
    readonly artifact: ProductionGoogleDriveArtifact;
    readonly folderId?: string;
  },
): Promise<{
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly webViewLink: string | null;
  readonly created: boolean;
  readonly digest: string;
}> {
  return api.post(integrationPath(projectId, "google/drive/files"), {
    mutationId: mutationId(),
    ...input,
  });
}

export function registerProductionPushSubscription(
  projectId: string,
  subscription: PushSubscriptionJSON,
): Promise<{ readonly subscribed: true; readonly endpointHash: string }> {
  return api.post(integrationPath(projectId, "push/subscriptions"), {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: subscription.keys,
  });
}

export function unregisterProductionPushSubscription(
  projectId: string,
  endpoint: string,
): Promise<{ readonly unsubscribed: true }> {
  return api.raw
    .delete(apiPath(integrationPath(projectId, "push/subscriptions")), {
      json: { endpoint },
    })
    .json<{ readonly unsubscribed: true }>();
}

export function sendProductionIntegrationNotification(
  projectId: string,
  input: {
    readonly channel: "web-push" | "generic-webhook" | "discord" | "ntfy";
    readonly title: string;
    readonly body: string;
    readonly url?: string;
  },
): Promise<{ readonly sent: number }> {
  return api.post(integrationPath(projectId, "notifications"), {
    mutationId: mutationId(),
    ...input,
  });
}

export async function createProductionDocumensoEnvelope(
  projectId: string,
  input: {
    readonly file: File;
    readonly title: string;
    readonly distribute: boolean;
    readonly recipients: readonly {
      readonly email: string;
      readonly name: string;
      readonly role: "SIGNER" | "APPROVER" | "CC" | "VIEWER";
    }[];
  },
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("metadata", JSON.stringify({
    mutationId: mutationId(),
    title: input.title,
    distribute: input.distribute,
    recipients: input.recipients,
  }));
  return api.raw
    .post(apiPath(integrationPath(projectId, "documenso/envelopes")), {
      body: form,
    })
    .json<Record<string, unknown>>();
}
export function confirmProductionTossPayment(
  projectId: string,
  input: {
    readonly paymentKey: string;
    readonly orderId: string;
    readonly amount: number;
    readonly invoiceId: string;
  },
): Promise<Record<string, unknown>> {
  return api.post(integrationPath(projectId, "toss/confirm"), {
    mutationId: mutationId(),
    ...input,
  });
}
