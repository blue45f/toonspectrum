export const STUDIO_AUTHORITY_DOMAINS = [
  "authoring.pages",
  "authoring.comic",
  "authoring.writer-room",
  "authoring.character-bible",
  "assets.binary",
  "history.mutations",
  "workspace.ui",
  "workflow.review",
  "workflow.approval",
  "workflow.publish",
  "presence.ephemeral",
  "renderer.derived",
] as const;

export type StudioAuthorityDomain = (typeof STUDIO_AUTHORITY_DOMAINS)[number];

export type StudioAuthorityKind =
  | "durable-product"
  | "workflow-record"
  | "ephemeral"
  | "derived";

export type StudioLocalAuthority =
  | "sqlite-opfs"
  | "opfs-cas"
  | "memory"
  | "none";

export type StudioRemoteAuthority =
  | "creator-work-revision"
  | "object-storage"
  | "review-service"
  | "publish-service"
  | "realtime-session"
  | "none";

export interface StudioAuthoritySpec {
  readonly domain: StudioAuthorityDomain;
  readonly kind: StudioAuthorityKind;
  readonly logicalOwner: string;
  readonly mutationBoundary: string;
  readonly localAuthority: StudioLocalAuthority;
  readonly remoteAuthority: StudioRemoteAuthority;
  readonly archiveSection: string | null;
  readonly versionCoordinate: string;
  readonly derivedConsumers: readonly string[];
}

export type StudioAuthorityIssueCode =
  | "duplicate-domain"
  | "missing-domain"
  | "domain-key-mismatch"
  | "durable-data-without-local-authority"
  | "workflow-without-remote-authority"
  | "derived-data-persisted"
  | "presence-not-ephemeral";

export interface StudioAuthorityIssue {
  readonly code: StudioAuthorityIssueCode;
  readonly domain: string;
  readonly message: string;
}

const AUTHORITY_MAP: Record<StudioAuthorityDomain, StudioAuthoritySpec> = {
  "authoring.pages": {
    domain: "authoring.pages",
    kind: "durable-product",
    logicalOwner: "StudioDocumentRuntime",
    mutationBoundary: "StudioMutationCoordinator",
    localAuthority: "sqlite-opfs",
    remoteAuthority: "creator-work-revision",
    archiveSection: "content.pagesList",
    versionCoordinate: "local-sequence+server-revision",
    derivedConsumers: ["renderer.derived", "workflow.review", "workflow.publish"],
  },
  "authoring.comic": {
    domain: "authoring.comic",
    kind: "durable-product",
    logicalOwner: "StudioDocumentRuntime",
    mutationBoundary: "StudioMutationCoordinator",
    localAuthority: "sqlite-opfs",
    remoteAuthority: "creator-work-revision",
    archiveSection: "content.comic",
    versionCoordinate: "local-sequence+server-revision",
    derivedConsumers: ["authoring.pages", "workflow.review", "workflow.publish"],
  },
  "authoring.writer-room": {
    domain: "authoring.writer-room",
    kind: "durable-product",
    logicalOwner: "StudioDocumentRuntime",
    mutationBoundary: "StudioMutationCoordinator",
    localAuthority: "sqlite-opfs",
    remoteAuthority: "creator-work-revision",
    archiveSection: "story.writerRoom",
    versionCoordinate: "writer-document-revision+server-revision",
    derivedConsumers: ["authoring.comic", "workflow.review"],
  },
  "authoring.character-bible": {
    domain: "authoring.character-bible",
    kind: "durable-product",
    logicalOwner: "StudioDocumentRuntime",
    mutationBoundary: "StudioMutationCoordinator",
    localAuthority: "sqlite-opfs",
    remoteAuthority: "creator-work-revision",
    archiveSection: "bible.characterBible",
    versionCoordinate: "bible-revision+server-revision",
    derivedConsumers: ["authoring.pages", "workflow.review", "workflow.publish"],
  },
  "assets.binary": {
    domain: "assets.binary",
    kind: "durable-product",
    logicalOwner: "StudioAssetRepository",
    mutationBoundary: "StudioAssetRevisionCommit",
    localAuthority: "opfs-cas",
    remoteAuthority: "object-storage",
    archiveSection: "assets.revisions",
    versionCoordinate: "asset-revision",
    derivedConsumers: ["authoring.pages", "renderer.derived", "workflow.publish"],
  },
  "history.mutations": {
    domain: "history.mutations",
    kind: "durable-product",
    logicalOwner: "StudioDurabilityRuntime",
    mutationBoundary: "StudioMutationCoordinator",
    localAuthority: "sqlite-opfs",
    remoteAuthority: "none",
    archiveSection: null,
    versionCoordinate: "local-sequence",
    derivedConsumers: ["authoring.pages", "authoring.comic"],
  },
  "workspace.ui": {
    domain: "workspace.ui",
    kind: "durable-product",
    logicalOwner: "StudioViewportRuntime",
    mutationBoundary: "StudioWorkspaceStateRepository",
    localAuthority: "sqlite-opfs",
    remoteAuthority: "none",
    archiveSection: null,
    versionCoordinate: "workspace-revision",
    derivedConsumers: [],
  },
  "workflow.review": {
    domain: "workflow.review",
    kind: "workflow-record",
    logicalOwner: "StudioWorkflowRuntime",
    mutationBoundary: "StudioReviewService",
    localAuthority: "memory",
    remoteAuthority: "review-service",
    archiveSection: null,
    versionCoordinate: "review-snapshot-id",
    derivedConsumers: ["workflow.approval", "workflow.publish"],
  },
  "workflow.approval": {
    domain: "workflow.approval",
    kind: "workflow-record",
    logicalOwner: "StudioWorkflowRuntime",
    mutationBoundary: "StudioApprovalService",
    localAuthority: "memory",
    remoteAuthority: "review-service",
    archiveSection: null,
    versionCoordinate: "approval-id",
    derivedConsumers: ["workflow.publish"],
  },
  "workflow.publish": {
    domain: "workflow.publish",
    kind: "workflow-record",
    logicalOwner: "StudioExportRuntime",
    mutationBoundary: "StudioPublishService",
    localAuthority: "memory",
    remoteAuthority: "publish-service",
    archiveSection: null,
    versionCoordinate: "publish-package-id",
    derivedConsumers: [],
  },
  "presence.ephemeral": {
    domain: "presence.ephemeral",
    kind: "ephemeral",
    logicalOwner: "StudioCollaborationRuntime",
    mutationBoundary: "StudioPresenceSession",
    localAuthority: "memory",
    remoteAuthority: "realtime-session",
    archiveSection: null,
    versionCoordinate: "session-sequence",
    derivedConsumers: [],
  },
  "renderer.derived": {
    domain: "renderer.derived",
    kind: "derived",
    logicalOwner: "StudioRenderRuntime",
    mutationBoundary: "StudioRenderProjection",
    localAuthority: "memory",
    remoteAuthority: "none",
    archiveSection: null,
    versionCoordinate: "source-document-digest",
    derivedConsumers: [],
  },
};

export const STUDIO_AUTHORITY_MAP: Readonly<
  Record<StudioAuthorityDomain, StudioAuthoritySpec>
> = Object.freeze(AUTHORITY_MAP);

export function studioAuthoritySpec(
  domain: StudioAuthorityDomain,
): StudioAuthoritySpec {
  return STUDIO_AUTHORITY_MAP[domain];
}

export function studioAuthoritySpecs(): readonly StudioAuthoritySpec[] {
  return STUDIO_AUTHORITY_DOMAINS.map((domain) => STUDIO_AUTHORITY_MAP[domain]);
}

export function validateStudioAuthoritySpecs(
  specs: readonly StudioAuthoritySpec[],
): readonly StudioAuthorityIssue[] {
  const issues: StudioAuthorityIssue[] = [];
  const counts = new Map<string, number>();

  for (const spec of specs) {
    counts.set(spec.domain, (counts.get(spec.domain) ?? 0) + 1);
    if (spec.kind === "durable-product" && spec.localAuthority === "none") {
      issues.push({
        code: "durable-data-without-local-authority",
        domain: spec.domain,
        message: `${spec.domain} durable data requires a local authority`,
      });
    }
    if (spec.kind === "workflow-record" && spec.remoteAuthority === "none") {
      issues.push({
        code: "workflow-without-remote-authority",
        domain: spec.domain,
        message: `${spec.domain} workflow records require a server authority`,
      });
    }
    if (
      spec.kind === "derived"
      && (spec.localAuthority !== "memory"
        || spec.remoteAuthority !== "none"
        || spec.archiveSection !== null)
    ) {
      issues.push({
        code: "derived-data-persisted",
        domain: spec.domain,
        message: `${spec.domain} must remain a rebuildable memory projection`,
      });
    }
    if (
      spec.kind === "ephemeral"
      && (spec.localAuthority !== "memory" || spec.archiveSection !== null)
    ) {
      issues.push({
        code: "presence-not-ephemeral",
        domain: spec.domain,
        message: `${spec.domain} must not become durable document data`,
      });
    }
  }

  for (const domain of STUDIO_AUTHORITY_DOMAINS) {
    const count = counts.get(domain) ?? 0;
    if (count === 0) {
      issues.push({
        code: "missing-domain",
        domain,
        message: `${domain} has no authority owner`,
      });
    } else if (count > 1) {
      issues.push({
        code: "duplicate-domain",
        domain,
        message: `${domain} has ${count} authority owners`,
      });
    }
  }

  return issues;
}

export function validateStudioAuthorityMap(): readonly StudioAuthorityIssue[] {
  const specs = studioAuthoritySpecs();
  const issues = [...validateStudioAuthoritySpecs(specs)];
  for (const domain of STUDIO_AUTHORITY_DOMAINS) {
    if (STUDIO_AUTHORITY_MAP[domain].domain !== domain) {
      issues.push({
        code: "domain-key-mismatch",
        domain,
        message: `${domain} map key and embedded domain differ`,
      });
    }
  }
  return issues;
}
