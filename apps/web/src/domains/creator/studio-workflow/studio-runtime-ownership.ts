import {
  STUDIO_AUTHORITY_DOMAINS,
  studioAuthoritySpecs,
  type StudioAuthorityDomain,
} from "../studio-foundation/studio-authority-map";

export const STUDIO_OWNER_IDS = [
  "StudioDocumentRuntime",
  "StudioToolRuntime",
  "StudioViewportRuntime",
  "StudioRenderRuntime",
  "StudioDurabilityRuntime",
  "StudioCollaborationRuntime",
  "StudioGenerationRuntime",
  "StudioWorkflowRuntime",
  "StudioExportRuntime",
  "StudioAssetRepository",
] as const;

export type StudioOwnerId = (typeof STUDIO_OWNER_IDS)[number];

export type StudioOwnerKind = "runtime" | "repository";

export type StudioPersistencePort =
  | "none"
  | "sqlite-opfs"
  | "opfs-cas"
  | "creator-work-api"
  | "review-api"
  | "publish-api"
  | "realtime";

export interface StudioRuntimeOwnerSpec {
  readonly id: StudioOwnerId;
  readonly kind: StudioOwnerKind;
  readonly owns: readonly StudioAuthorityDomain[];
  readonly dependsOn: readonly StudioOwnerId[];
  readonly persistencePorts: readonly StudioPersistencePort[];
  readonly responsibilities: readonly string[];
}

export type StudioRuntimeOwnershipIssueCode =
  | "duplicate-owner"
  | "missing-owner"
  | "unknown-dependency"
  | "dependency-cycle"
  | "duplicate-domain-owner"
  | "missing-domain-owner"
  | "authority-owner-mismatch"
  | "renderer-owns-canonical-data"
  | "viewport-owns-authoring-data"
  | "ui-owner-has-server-workflow-port"
  | "repository-owns-non-asset-domain";

export interface StudioRuntimeOwnershipIssue {
  readonly code: StudioRuntimeOwnershipIssueCode;
  readonly ownerId?: string;
  readonly domain?: string;
  readonly message: string;
}

const DEFAULT_SPECS: readonly StudioRuntimeOwnerSpec[] = Object.freeze([
  {
    id: "StudioDocumentRuntime",
    kind: "runtime",
    owns: [
      "authoring.pages",
      "authoring.comic",
      "authoring.writer-room",
      "authoring.character-bible",
    ],
    dependsOn: ["StudioAssetRepository"],
    persistencePorts: [],
    responsibilities: [
      "lossless authoring snapshot",
      "domain selectors",
      "cross-document identity bindings",
    ],
  },
  {
    id: "StudioToolRuntime",
    kind: "runtime",
    owns: [],
    dependsOn: ["StudioDocumentRuntime", "StudioViewportRuntime"],
    persistencePorts: [],
    responsibilities: ["active tool", "preview sessions", "tool options"],
  },
  {
    id: "StudioViewportRuntime",
    kind: "runtime",
    owns: ["workspace.ui"],
    dependsOn: ["StudioDocumentRuntime"],
    persistencePorts: ["sqlite-opfs"],
    responsibilities: ["selection", "zoom", "pan", "guides", "workspace layout"],
  },
  {
    id: "StudioRenderRuntime",
    kind: "runtime",
    owns: ["renderer.derived"],
    dependsOn: [
      "StudioDocumentRuntime",
      "StudioViewportRuntime",
      "StudioAssetRepository",
    ],
    persistencePorts: [],
    responsibilities: ["renderer adapters", "texture cache", "dirty regions"],
  },
  {
    id: "StudioDurabilityRuntime",
    kind: "runtime",
    owns: ["history.mutations"],
    dependsOn: ["StudioDocumentRuntime", "StudioAssetRepository"],
    persistencePorts: ["sqlite-opfs", "opfs-cas", "creator-work-api"],
    responsibilities: ["journal", "snapshots", "recovery", "sync outbox"],
  },
  {
    id: "StudioCollaborationRuntime",
    kind: "runtime",
    owns: ["presence.ephemeral"],
    dependsOn: ["StudioDocumentRuntime", "StudioDurabilityRuntime"],
    persistencePorts: ["realtime"],
    responsibilities: ["presence", "soft locks", "team comment transport"],
  },
  {
    id: "StudioGenerationRuntime",
    kind: "runtime",
    owns: [],
    dependsOn: [
      "StudioDocumentRuntime",
      "StudioAssetRepository",
      "StudioDurabilityRuntime",
    ],
    persistencePorts: ["creator-work-api"],
    responsibilities: ["generation jobs", "candidate lineage", "input snapshots"],
  },
  {
    id: "StudioWorkflowRuntime",
    kind: "runtime",
    owns: ["workflow.review", "workflow.approval"],
    dependsOn: ["StudioDocumentRuntime", "StudioDurabilityRuntime"],
    persistencePorts: ["review-api", "creator-work-api"],
    responsibilities: ["review snapshots", "threads", "approval records"],
  },
  {
    id: "StudioExportRuntime",
    kind: "runtime",
    owns: ["workflow.publish"],
    dependsOn: [
      "StudioDocumentRuntime",
      "StudioRenderRuntime",
      "StudioAssetRepository",
      "StudioWorkflowRuntime",
    ],
    persistencePorts: ["publish-api"],
    responsibilities: ["preflight", "render plan", "package manifest"],
  },
  {
    id: "StudioAssetRepository",
    kind: "repository",
    owns: ["assets.binary"],
    dependsOn: [],
    persistencePorts: ["opfs-cas", "creator-work-api"],
    responsibilities: ["immutable revisions", "content hashes", "license pins"],
  },
]);

export const STUDIO_RUNTIME_OWNERSHIP: readonly StudioRuntimeOwnerSpec[] = DEFAULT_SPECS;

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function cyclePaths(
  specs: readonly StudioRuntimeOwnerSpec[],
): readonly string[] {
  const byId = new Map(specs.map((spec) => [spec.id, spec]));
  const visiting = new Set<StudioOwnerId>();
  const visited = new Set<StudioOwnerId>();
  const stack: StudioOwnerId[] = [];
  const cycles = new Set<string>();

  const visit = (id: StudioOwnerId) => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.add([...stack.slice(start), id].join(" -> "));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const spec of specs) visit(spec.id);
  return [...cycles];
}

export function validateStudioRuntimeOwnership(
  specs: readonly StudioRuntimeOwnerSpec[] = STUDIO_RUNTIME_OWNERSHIP,
): readonly StudioRuntimeOwnershipIssue[] {
  const issues: StudioRuntimeOwnershipIssue[] = [];
  const ownerIds = specs.map((spec) => spec.id);
  for (const id of duplicateValues(ownerIds)) {
    issues.push({
      code: "duplicate-owner",
      ownerId: id,
      message: `Studio owner ${id} is declared more than once.`,
    });
  }
  const knownOwners = new Set(ownerIds);
  for (const expected of STUDIO_OWNER_IDS) {
    if (!knownOwners.has(expected)) {
      issues.push({
        code: "missing-owner",
        ownerId: expected,
        message: `Studio owner ${expected} is missing.`,
      });
    }
  }

  const domainOwners = new Map<StudioAuthorityDomain, StudioOwnerId[]>();
  for (const spec of specs) {
    for (const dependency of spec.dependsOn) {
      if (!knownOwners.has(dependency)) {
        issues.push({
          code: "unknown-dependency",
          ownerId: spec.id,
          message: `${spec.id} depends on unknown owner ${dependency}.`,
        });
      }
    }
    for (const domain of spec.owns) {
      const owners = domainOwners.get(domain) ?? [];
      owners.push(spec.id);
      domainOwners.set(domain, owners);
      if (spec.id === "StudioRenderRuntime" && domain !== "renderer.derived") {
        issues.push({
          code: "renderer-owns-canonical-data",
          ownerId: spec.id,
          domain,
          message: "The renderer can own only rebuildable derived state.",
        });
      }
      if (spec.id === "StudioViewportRuntime" && domain.startsWith("authoring.")) {
        issues.push({
          code: "viewport-owns-authoring-data",
          ownerId: spec.id,
          domain,
          message: "Viewport state cannot become authoring document authority.",
        });
      }
      if (spec.kind === "repository" && domain !== "assets.binary") {
        issues.push({
          code: "repository-owns-non-asset-domain",
          ownerId: spec.id,
          domain,
          message: "The Studio asset repository can own only binary asset revisions.",
        });
      }
    }
    if (
      (spec.id === "StudioToolRuntime" || spec.id === "StudioViewportRuntime")
      && spec.persistencePorts.some((port) => port === "review-api" || port === "publish-api")
    ) {
      issues.push({
        code: "ui-owner-has-server-workflow-port",
        ownerId: spec.id,
        message: `${spec.id} cannot mutate server review or publish authority.`,
      });
    }
  }

  for (const domain of STUDIO_AUTHORITY_DOMAINS) {
    const owners = domainOwners.get(domain) ?? [];
    if (owners.length === 0) {
      issues.push({
        code: "missing-domain-owner",
        domain,
        message: `No runtime owner is registered for ${domain}.`,
      });
    } else if (owners.length > 1) {
      issues.push({
        code: "duplicate-domain-owner",
        domain,
        message: `${domain} is owned by ${owners.join(", ")}.`,
      });
    }
  }

  const authorityOwners = new Map(
    studioAuthoritySpecs().map((spec) => [spec.domain, spec.logicalOwner]),
  );
  for (const [domain, owners] of domainOwners) {
    if (owners.length !== 1) continue;
    const authorityOwner = authorityOwners.get(domain);
    if (authorityOwner !== owners[0]) {
      issues.push({
        code: "authority-owner-mismatch",
        ownerId: owners[0],
        domain,
        message: `${domain} is owned by ${owners[0]}, but the authority map requires ${authorityOwner}.`,
      });
    }
  }

  for (const path of cyclePaths(specs)) {
    issues.push({
      code: "dependency-cycle",
      message: `Studio runtime dependency cycle: ${path}`,
    });
  }
  return issues;
}

export function studioRuntimeOwner(
  id: StudioOwnerId,
): StudioRuntimeOwnerSpec {
  const owner = STUDIO_RUNTIME_OWNERSHIP.find((spec) => spec.id === id);
  if (!owner) throw new Error(`Unknown Studio owner: ${id}`);
  return owner;
}
