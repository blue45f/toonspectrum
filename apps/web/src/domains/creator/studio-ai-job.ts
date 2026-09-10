export const STUDIO_AI_SKILLS = [
  "story-outline",
  "dialogue-rewrite",
  "storyboard",
  "character-consistency",
  "image-fill",
  "image-expand",
  "line-cleanup",
  "flat-color",
  "relight",
  "localization",
  "voice",
  "animatic",
  "promotion-design",
  "publishing-copy",
] as const;

export type StudioAiSkillId = (typeof STUDIO_AI_SKILLS)[number];
export type StudioAiJobStatus =
  | "draft"
  | "awaiting-confirmation"
  | "queued"
  | "running"
  | "preview-ready"
  | "approved"
  | "applied"
  | "failed"
  | "cancelled";
export type StudioAiPrivacyClass = "local" | "cloud-private" | "cloud-provider";
export type StudioAiCostClass = "free" | "metered" | "quoted";
export type StudioAiApplicationMode = "copy" | "selection";

export interface StudioAiJobRequest {
  readonly prompt: string;
  readonly inputSnapshotId: string;
  readonly selectionId?: string;
  readonly references: readonly string[];
  readonly seed?: number;
}

export interface StudioAiJobPreview {
  readonly previewId: string;
  readonly outputRefs: readonly string[];
  readonly providerReceiptId?: string;
  readonly estimatedCreditsUsed: number;
  readonly warnings: readonly string[];
}

export interface StudioAiJobApplication {
  readonly mode: StudioAiApplicationMode;
  readonly targetDocumentId: string;
  readonly targetSelectionId?: string;
  readonly createdObjectIds: readonly string[];
}

export interface StudioAiAuditEntry {
  readonly at: string;
  readonly action: string;
  readonly status: StudioAiJobStatus;
  readonly detail?: string;
}

export interface StudioAiJob {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly skill: StudioAiSkillId;
  readonly providerId: string;
  readonly privacy: StudioAiPrivacyClass;
  readonly cost: StudioAiCostClass;
  readonly estimatedCredits: number;
  readonly requiresExternalTransfer: boolean;
  readonly request: StudioAiJobRequest;
  readonly status: StudioAiJobStatus;
  readonly progress: number;
  readonly consentAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly preview?: StudioAiJobPreview;
  readonly application?: StudioAiJobApplication;
  readonly error?: { readonly code: string; readonly message: string };
  readonly audit: readonly StudioAiAuditEntry[];
}

export type StudioAiJobEvent =
  | { readonly type: "request-confirmation"; readonly at: string }
  | { readonly type: "confirm"; readonly at: string; readonly accepted: boolean }
  | { readonly type: "start"; readonly at: string }
  | { readonly type: "progress"; readonly at: string; readonly value: number }
  | { readonly type: "preview"; readonly at: string; readonly preview: StudioAiJobPreview }
  | { readonly type: "approve"; readonly at: string }
  | { readonly type: "apply"; readonly at: string; readonly application: StudioAiJobApplication }
  | { readonly type: "retry"; readonly at: string }
  | { readonly type: "fail"; readonly at: string; readonly code: string; readonly message: string }
  | { readonly type: "cancel"; readonly at: string; readonly reason?: string };

const SKILL_SET = new Set<string>(STUDIO_AI_SKILLS);

function validId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || value.trim() !== value) {
    return false;
  }
  return value !== "." && value !== ".." && !value.includes("\\");
}

function validAt(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function audit(
  job: StudioAiJob,
  at: string,
  action: string,
  status: StudioAiJobStatus,
  detail?: string,
): readonly StudioAiAuditEntry[] {
  if (!validAt(at)) throw new Error("AI job transitions require a valid timestamp.");
  return Object.freeze([
    ...job.audit,
    Object.freeze({ at, action, status, ...(detail ? { detail } : {}) }),
  ]);
}

function assertStatus(job: StudioAiJob, allowed: readonly StudioAiJobStatus[], event: string): void {
  if (!allowed.includes(job.status)) {
    throw new Error(`AI job event ${event} is not allowed from ${job.status}.`);
  }
}

function validatePreview(preview: StudioAiJobPreview): void {
  if (!validId(preview.previewId) || preview.outputRefs.length === 0) {
    throw new Error("AI preview requires an identity and at least one output.");
  }
  if (!Number.isFinite(preview.estimatedCreditsUsed) || preview.estimatedCreditsUsed < 0) {
    throw new Error("AI preview credits must be a non-negative number.");
  }
}

function validateApplication(application: StudioAiJobApplication): void {
  if (!validId(application.targetDocumentId) || application.createdObjectIds.length === 0) {
    throw new Error("AI application requires a target document and created objects.");
  }
  if (application.mode === "selection" && !validId(application.targetSelectionId)) {
    throw new Error("Selection application requires a target selection.");
  }
}

export function isStudioAiSkill(value: unknown): value is StudioAiSkillId {
  return typeof value === "string" && SKILL_SET.has(value);
}

export function createStudioAiJob(input: {
  readonly id: string;
  readonly skill: StudioAiSkillId;
  readonly providerId: string;
  readonly privacy: StudioAiPrivacyClass;
  readonly cost: StudioAiCostClass;
  readonly estimatedCredits?: number;
  readonly request: StudioAiJobRequest;
  readonly at: string;
}): StudioAiJob {
  if (!validId(input.id) || !validId(input.providerId) || !isStudioAiSkill(input.skill)) {
    throw new Error("AI job metadata is invalid.");
  }
  if (!validId(input.request.inputSnapshotId) || input.request.prompt.trim().length === 0) {
    throw new Error("AI jobs require a prompt and immutable input snapshot.");
  }
  const estimatedCredits = input.estimatedCredits ?? 0;
  if (!Number.isFinite(estimatedCredits) || estimatedCredits < 0) {
    throw new Error("Estimated AI credits must be a non-negative number.");
  }
  if (!validAt(input.at)) throw new Error("AI jobs require a valid creation time.");
  const requiresExternalTransfer = input.privacy !== "local";
  return Object.freeze({
    schemaVersion: 1,
    id: input.id,
    skill: input.skill,
    providerId: input.providerId,
    privacy: input.privacy,
    cost: input.cost,
    estimatedCredits,
    requiresExternalTransfer,
    request: Object.freeze({ ...input.request, references: Object.freeze([...input.request.references]) }),
    status: "draft",
    progress: 0,
    audit: Object.freeze([
      Object.freeze({ at: input.at, action: "created", status: "draft" as const }),
    ]),
  });
}

export function transitionStudioAiJob(
  job: StudioAiJob,
  event: StudioAiJobEvent,
): StudioAiJob {
  switch (event.type) {
    case "request-confirmation": {
      assertStatus(job, ["draft"], event.type);
      return Object.freeze({
        ...job,
        status: "awaiting-confirmation",
        audit: audit(job, event.at, event.type, "awaiting-confirmation"),
      });
    }
    case "confirm": {
      assertStatus(job, ["awaiting-confirmation"], event.type);
      if (!event.accepted) {
        return Object.freeze({
          ...job,
          status: "cancelled",
          completedAt: event.at,
          audit: audit(job, event.at, event.type, "cancelled", "user-declined"),
        });
      }
      return Object.freeze({
        ...job,
        status: "queued",
        consentAt: event.at,
        progress: 0,
        audit: audit(job, event.at, event.type, "queued"),
      });
    }
    case "start": {
      assertStatus(job, ["queued"], event.type);
      return Object.freeze({
        ...job,
        status: "running",
        startedAt: event.at,
        progress: 0,
        error: undefined,
        audit: audit(job, event.at, event.type, "running"),
      });
    }
    case "progress": {
      assertStatus(job, ["running"], event.type);
      if (!Number.isFinite(event.value) || event.value < job.progress || event.value < 0 || event.value > 1) {
        throw new Error("AI job progress must move monotonically between zero and one.");
      }
      return Object.freeze({
        ...job,
        progress: event.value,
        audit: audit(job, event.at, event.type, "running", String(event.value)),
      });
    }
    case "preview": {
      assertStatus(job, ["running"], event.type);
      validatePreview(event.preview);
      return Object.freeze({
        ...job,
        status: "preview-ready",
        progress: 1,
        preview: Object.freeze({
          ...event.preview,
          outputRefs: Object.freeze([...event.preview.outputRefs]),
          warnings: Object.freeze([...event.preview.warnings]),
        }),
        completedAt: event.at,
        audit: audit(job, event.at, event.type, "preview-ready"),
      });
    }
    case "approve": {
      assertStatus(job, ["preview-ready"], event.type);
      if (!job.preview) throw new Error("AI output cannot be approved without a preview.");
      return Object.freeze({
        ...job,
        status: "approved",
        audit: audit(job, event.at, event.type, "approved"),
      });
    }
    case "apply": {
      assertStatus(job, ["approved"], event.type);
      if (!job.preview) throw new Error("AI output cannot be applied without a preview.");
      validateApplication(event.application);
      return Object.freeze({
        ...job,
        status: "applied",
        application: Object.freeze({
          ...event.application,
          createdObjectIds: Object.freeze([...event.application.createdObjectIds]),
        }),
        completedAt: event.at,
        audit: audit(job, event.at, event.type, "applied", event.application.mode),
      });
    }
    case "retry": {
      assertStatus(job, ["failed", "preview-ready", "approved"], event.type);
      return Object.freeze({
        ...job,
        status: "queued",
        progress: 0,
        preview: undefined,
        application: undefined,
        error: undefined,
        completedAt: undefined,
        audit: audit(job, event.at, event.type, "queued"),
      });
    }
    case "fail": {
      assertStatus(job, ["queued", "running"], event.type);
      if (!validId(event.code) || event.message.trim().length === 0) {
        throw new Error("AI job failures require an actionable code and message.");
      }
      return Object.freeze({
        ...job,
        status: "failed",
        completedAt: event.at,
        error: Object.freeze({ code: event.code, message: event.message }),
        audit: audit(job, event.at, event.type, "failed", event.code),
      });
    }
    case "cancel": {
      assertStatus(
        job,
        ["draft", "awaiting-confirmation", "queued", "running", "preview-ready", "approved", "failed"],
        event.type,
      );
      return Object.freeze({
        ...job,
        status: "cancelled",
        completedAt: event.at,
        audit: audit(job, event.at, event.type, "cancelled", event.reason),
      });
    }
  }
}

export function canApplyStudioAiJob(job: StudioAiJob): boolean {
  return job.status === "approved" && job.preview !== undefined;
}

export function studioAiJobUserState(job: StudioAiJob): {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly requiresAttention: boolean;
} {
  switch (job.status) {
    case "draft":
      return { labelKo: "요청 준비", labelEn: "Preparing request", requiresAttention: false };
    case "awaiting-confirmation":
      return { labelKo: "확인 필요", labelEn: "Confirmation needed", requiresAttention: true };
    case "queued":
      return { labelKo: "처리 대기", labelEn: "Queued", requiresAttention: false };
    case "running":
      return { labelKo: "처리 중", labelEn: "Processing", requiresAttention: false };
    case "preview-ready":
      return { labelKo: "결과 확인", labelEn: "Review result", requiresAttention: true };
    case "approved":
      return { labelKo: "적용 준비", labelEn: "Ready to apply", requiresAttention: true };
    case "applied":
      return { labelKo: "사본으로 적용됨", labelEn: "Applied as a copy", requiresAttention: false };
    case "failed":
      return { labelKo: "다시 확인 필요", labelEn: "Needs attention", requiresAttention: true };
    case "cancelled":
      return { labelKo: "취소됨", labelEn: "Cancelled", requiresAttention: false };
  }
}
