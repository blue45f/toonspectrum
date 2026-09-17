export const STUDIO_CAPABILITY_EVIDENCE_DIMENSIONS = [
  "contract",
  "product-wiring",
  "persistence",
  "recovery",
  "collaboration",
  "interchange",
  "automated-test",
  "browser-evidence",
  "external-validation",
] as const;

export type StudioCapabilityEvidenceDimension =
  (typeof STUDIO_CAPABILITY_EVIDENCE_DIMENSIONS)[number];

export type StudioCapabilityEvidenceStatus = "verified" | "pending" | "not-applicable";

export interface StudioCapabilityEvidence {
  readonly dimension: StudioCapabilityEvidenceDimension;
  readonly status: StudioCapabilityEvidenceStatus;
  readonly reference: string;
  readonly note?: string;
}

export interface StudioCapabilityDefinition {
  readonly id: StudioCompetitorCapabilityId;
  readonly sequence: number;
  readonly title: string;
  readonly requiredDimensions: readonly StudioCapabilityEvidenceDimension[];
  readonly externalValidationRequired: boolean;
}

export interface StudioCapabilityRecord extends StudioCapabilityDefinition {
  readonly evidence: readonly StudioCapabilityEvidence[];
}

export type StudioCapabilityState =
  | "verified"
  | "external-validation-pending"
  | "incomplete";

const CORE = ["contract", "product-wiring", "automated-test"] as const;
const DURABLE = [...CORE, "persistence", "recovery"] as const;
const COLLABORATIVE = [...DURABLE, "collaboration"] as const;
const INTERCHANGE = [...CORE, "interchange"] as const;
const CERTIFICATION = [
  "contract",
  "automated-test",
  "browser-evidence",
  "external-validation",
] as const;

export const STUDIO_COMPETITOR_CAPABILITY_CATALOG = [
  { id: "project-graph-scope-revision", sequence: 1, title: "ProjectGraph, ScopeRef and Artifact Revision", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "transaction-document-authority", sequence: 2, title: "StudioTransaction and DocumentAuthority", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "immutable-revision-lifecycle", sequence: 3, title: "Working, checkpoint, review, approval and release lifecycle", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "capability-ledger-claim-gate", sequence: 4, title: "Capability ledger and marketing claim gate", requiredDimensions: CORE, externalValidationRequired: false },
  { id: "project-shell-context", sequence: 5, title: "Project shell and shared context bar", requiredDimensions: CORE, externalValidationRequired: false },
  { id: "workspace-layout", sequence: 6, title: "Versioned workspace layout", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "wysiwyg-layout-editor", sequence: 7, title: "WYSIWYG workspace layout editor", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "workflow-profiles", sequence: 8, title: "Focus, Studio, Lettering and Review profiles", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "cas-blob-store", sequence: 9, title: "Content-addressed blob store", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "revision-local-store", sequence: 10, title: "Local revision store", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "sync-outbox", sequence: 11, title: "Transactional synchronization outbox", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "cloud-revision-api", sequence: 12, title: "Cloud revision API", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "file-space", sequence: 13, title: "Project-aware file space", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "version-stack-restore", sequence: 14, title: "Version stack, compare and restore", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "share-review-link", sequence: 15, title: "External share and review link", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "sparse-tile-authority", sequence: 16, title: "Sparse tile document authority", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "pen-input-pipeline", sequence: 17, title: "Low-latency pen input pipeline", requiredDimensions: [...CORE, "browser-evidence"], externalValidationRequired: false },
  { id: "brush-studio", sequence: 18, title: "Brush graph and Brush Studio", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "vector-ink", sequence: 19, title: "Editable vector ink", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "unified-layer-graph", sequence: 20, title: "Unified non-destructive layer graph", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "selection-transform", sequence: 21, title: "Selection and non-destructive transform", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "adjustment-filter-graph", sequence: 22, title: "Adjustment and smart filter graph", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "frame-graph", sequence: 23, title: "Comic frame graph", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "balloon-text", sequence: 24, title: "Balloon and multilingual text engine", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "tone-effect-ruler", sequence: 25, title: "Tone, effect-line and ruler tools", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "episode-page-manager", sequence: 26, title: "Episode and page manager", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "platform-export", sequence: 27, title: "Platform-aware export and preflight", requiredDimensions: INTERCHANGE, externalValidationRequired: false },
  { id: "import-center", sequence: 28, title: "Import center and compatibility report", requiredDimensions: INTERCHANGE, externalValidationRequired: false },
  { id: "png-codec", sequence: 29, title: "PNG import and export codec", requiredDimensions: INTERCHANGE, externalValidationRequired: false },
  { id: "psd-baseline", sequence: 30, title: "PSD baseline structure preservation", requiredDimensions: INTERCHANGE, externalValidationRequired: false },
  { id: "psd-advanced", sequence: 31, title: "PSD advanced object preservation", requiredDimensions: INTERCHANGE, externalValidationRequired: true },
  { id: "psb-large-document", sequence: 32, title: "PSB and large document streaming", requiredDimensions: INTERCHANGE, externalValidationRequired: true },
  { id: "clip-migration", sequence: 33, title: "Truthful CLIP migration lane", requiredDimensions: INTERCHANGE, externalValidationRequired: true },
  { id: "scene-graph-outliner", sequence: 34, title: "3D scene graph and outliner", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "inference-modeling", sequence: 35, title: "Direct 3D inference and modeling", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "parametric-assets", sequence: 36, title: "Parametric webtoon assets", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "camera-scene-variant", sequence: 37, title: "Camera and scene variants", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "render-passes", sequence: 38, title: "Webtoon 3D render passes", requiredDimensions: INTERCHANGE, externalValidationRequired: false },
  { id: "3d-live-layer", sequence: 39, title: "Revision-pinned 3D live layer", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "unified-asset-library", sequence: 40, title: "Unified personal, team and project asset library", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "marketplace-search-preview", sequence: 41, title: "Marketplace search and asset preview", requiredDimensions: CORE, externalValidationRequired: false },
  { id: "license-ledger-lockfile", sequence: 42, title: "License ledger and asset lockfile", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "seller-center", sequence: 43, title: "Marketplace seller center", requiredDimensions: DURABLE, externalValidationRequired: false },
  { id: "realtime-presence", sequence: 44, title: "Realtime project presence", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "lease-service", sequence: 45, title: "Page, object and raster region leases", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "semantic-merge-conflict", sequence: 46, title: "Semantic merge and conflict center", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "review-workflow", sequence: 47, title: "Pinned review and approval workflow", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "production-bridge", sequence: 48, title: "Production task and artifact bridge", requiredDimensions: COLLABORATIVE, externalValidationRequired: false },
  { id: "desktop-sync-agent", sequence: 49, title: "Desktop synchronization agent", requiredDimensions: DURABLE, externalValidationRequired: true },
  { id: "local-folder-binding", sequence: 50, title: "Local folder binding", requiredDimensions: DURABLE, externalValidationRequired: true },
  { id: "google-drive-adapter", sequence: 51, title: "Google Drive adapter", requiredDimensions: [...CORE, "interchange"], externalValidationRequired: true },
  { id: "dropbox-adapter", sequence: 52, title: "Dropbox adapter", requiredDimensions: [...CORE, "interchange"], externalValidationRequired: true },
  { id: "performance-lab", sequence: 53, title: "Input, render and long-document performance lab", requiredDimensions: CERTIFICATION, externalValidationRequired: true },
  { id: "file-roundtrip-lab", sequence: 54, title: "File round-trip golden corpus lab", requiredDimensions: CERTIFICATION, externalValidationRequired: true },
  { id: "collaboration-fault-lab", sequence: 55, title: "Collaboration fault-injection lab", requiredDimensions: CERTIFICATION, externalValidationRequired: true },
  { id: "accessibility-security-audit", sequence: 56, title: "Accessibility and security audit", requiredDimensions: CERTIFICATION, externalValidationRequired: true },
  { id: "professional-creator-validation", sequence: 57, title: "Professional creator end-to-end validation", requiredDimensions: CERTIFICATION, externalValidationRequired: true },
] as const;

export type StudioCompetitorCapabilityId =
  (typeof STUDIO_COMPETITOR_CAPABILITY_CATALOG)[number]["id"];

export interface StudioCapabilityEvaluation {
  readonly id: StudioCompetitorCapabilityId;
  readonly state: StudioCapabilityState;
  readonly missingDimensions: readonly StudioCapabilityEvidenceDimension[];
  readonly pendingExternalReferences: readonly string[];
}

export interface StudioCapabilityLedgerEvaluation {
  readonly capabilities: readonly StudioCapabilityEvaluation[];
  readonly verifiedCount: number;
  readonly externalValidationPendingCount: number;
  readonly incompleteCount: number;
  readonly repositoryImplementationComplete: boolean;
  readonly replacementClaimAllowed: boolean;
}

export function studioCapabilityDefinition(
  id: StudioCompetitorCapabilityId,
): StudioCapabilityDefinition {
  const definition = STUDIO_COMPETITOR_CAPABILITY_CATALOG.find(
    (candidate) => candidate.id === id,
  );
  if (!definition) throw new Error(`Unknown Studio capability: ${id}`);
  return definition;
}

export function evaluateStudioCapability(
  record: StudioCapabilityRecord,
): StudioCapabilityEvaluation {
  const evidenceByDimension = new Map<
    StudioCapabilityEvidenceDimension,
    readonly StudioCapabilityEvidence[]
  >();
  for (const dimension of STUDIO_CAPABILITY_EVIDENCE_DIMENSIONS) {
    evidenceByDimension.set(
      dimension,
      record.evidence.filter((item) => item.dimension === dimension),
    );
  }
  const missingDimensions = record.requiredDimensions.filter((dimension) => {
    const evidence = evidenceByDimension.get(dimension) ?? [];
    return !evidence.some((item) => item.status === "verified");
  });
  const pendingExternalReferences = record.evidence
    .filter((item) => item.dimension === "external-validation" && item.status === "pending")
    .map((item) => item.reference);
  const nonExternalMissing = missingDimensions.filter(
    (dimension) => dimension !== "external-validation",
  );
  const state: StudioCapabilityState = nonExternalMissing.length > 0
    ? "incomplete"
    : missingDimensions.includes("external-validation")
      || (record.externalValidationRequired && pendingExternalReferences.length > 0)
      ? "external-validation-pending"
      : "verified";
  return Object.freeze({
    id: record.id,
    state,
    missingDimensions: Object.freeze([...missingDimensions]),
    pendingExternalReferences: Object.freeze(pendingExternalReferences),
  });
}

export function evaluateStudioCapabilityLedger(
  records: readonly StudioCapabilityRecord[],
): StudioCapabilityLedgerEvaluation {
  const ids = records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Studio capability ledger contains duplicate ids.");
  }
  const expectedIds = STUDIO_COMPETITOR_CAPABILITY_CATALOG.map((item) => item.id);
  const missingRecords = expectedIds.filter((id) => !ids.includes(id));
  const unknownRecords = ids.filter((id) => !expectedIds.includes(id));
  if (missingRecords.length > 0 || unknownRecords.length > 0) {
    throw new Error(
      `Studio capability ledger coverage mismatch. Missing: ${missingRecords.join(", ") || "none"}; unknown: ${unknownRecords.join(", ") || "none"}.`,
    );
  }
  const capabilities = STUDIO_COMPETITOR_CAPABILITY_CATALOG.map((definition) => {
    const record = records.find((candidate) => candidate.id === definition.id)!;
    return evaluateStudioCapability(record);
  });
  const verifiedCount = capabilities.filter((item) => item.state === "verified").length;
  const externalValidationPendingCount = capabilities.filter(
    (item) => item.state === "external-validation-pending",
  ).length;
  const incompleteCount = capabilities.filter((item) => item.state === "incomplete").length;
  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    verifiedCount,
    externalValidationPendingCount,
    incompleteCount,
    repositoryImplementationComplete: incompleteCount === 0,
    replacementClaimAllowed: verifiedCount === capabilities.length,
  });
}

export function assertStudioMarketingClaimAllowed(
  evaluation: StudioCapabilityLedgerEvaluation,
  claim: string,
): void {
  if (!evaluation.replacementClaimAllowed) {
    throw new Error(
      `Marketing claim is not evidence-backed: ${claim}. ${evaluation.incompleteCount} incomplete and ${evaluation.externalValidationPendingCount} external-validation-pending capabilities remain.`,
    );
  }
}
