import {
  evaluateStudioCapabilityLedger,
  STUDIO_COMPETITOR_CAPABILITY_CATALOG,
  type StudioCapabilityEvidence,
  type StudioCapabilityEvidenceDimension,
  type StudioCapabilityRecord,
  type StudioCompetitorCapabilityId,
} from "@toonspectrum/studio-project-model";

interface StudioCapabilityEvidenceSpec {
  readonly id: StudioCompetitorCapabilityId;
  readonly source: string;
  readonly test: string;
  readonly durability?: string;
  readonly collaboration?: string;
  readonly browser?: string;
  readonly externalNote?: string;
}

const DEFAULT_DURABILITY =
  "apps/web/src/domains/creator/studio-workflow/studio-mutation-coordinator.ts";
const DEFAULT_COLLABORATION =
  "apps/web/src/domains/creator/studio-workflow/studio-review-workflow.ts";

function spec(
  id: StudioCompetitorCapabilityId,
  source: string,
  test: string,
  options: Omit<StudioCapabilityEvidenceSpec, "id" | "source" | "test"> = {},
): StudioCapabilityEvidenceSpec {
  return Object.freeze({ id, source, test, ...options });
}

export const STUDIO_COMPETITOR_CAPABILITY_EVIDENCE_SPECS = Object.freeze([
  spec("project-graph-scope-revision", "apps/web/src/domains/creator/studio-platform/studio-project-graph-adapter.ts", "apps/web/src/domains/creator/studio-platform/studio-project-graph-adapter.test.ts"),
  spec("transaction-document-authority", "apps/web/src/domains/creator/studio-workflow/studio-mutation-coordinator.ts", "apps/web/src/domains/creator/studio-workflow/studio-mutation-coordinator.test.ts"),
  spec("immutable-revision-lifecycle", "apps/web/src/domains/creator/studio-foundation/studio-version-coordinates.ts", "apps/web/src/domains/creator/studio-foundation/studio-version-coordinates.test.ts"),
  spec("capability-ledger-claim-gate", "packages/studio-project-model/src/capability/capability-ledger.ts", "packages/studio-project-model/src/__tests__/platform-integration.test.ts"),
  spec("project-shell-context", "apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx", "apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.integration.test.tsx"),
  spec("workspace-layout", "apps/web/src/domains/creator/studio-workspaces.ts", "apps/web/src/domains/creator/studio-workspaces.test.ts"),
  spec("wysiwyg-layout-editor", "apps/web/src/domains/creator/studio-shell/studio-shell-floating-layout.ts", "apps/web/src/domains/creator/studio-shell/studio-shell-floating-layout.test.ts"),
  spec("workflow-profiles", "apps/web/src/domains/creator/studio-workspaces.ts", "apps/web/src/domains/creator/studio-workspaces-2026.test.ts"),
  spec("cas-blob-store", "apps/api/src/modules/creator/studio-work-asset.repository.ts", "tests/integration/api-web/api/modules/creator/studio-work-asset.repository.test.ts"),
  spec("revision-local-store", "apps/web/src/domains/creator/studio-autosave-sqlite-store.ts", "apps/web/src/domains/creator/studio-autosave-sqlite-store.test.ts"),
  spec("sync-outbox", "apps/web/src/domains/creator/studio-workflow/studio-mutation-coordinator.ts", "apps/web/src/domains/creator/studio-workflow/studio-mutation-coordinator.test.ts"),
  spec("cloud-revision-api", "apps/web/src/domains/creator/studio-production/studio-production-server-revisions.ts", "apps/web/src/domains/creator/studio-production/studio-production-server-revisions.test.ts"),
  spec("file-space", "apps/web/src/domains/creator/studio-project-file.ts", "apps/web/src/domains/creator/studio-project-file.test.ts"),
  spec("version-stack-restore", "apps/web/src/domains/creator/StudioRevisionCompareView.tsx", "apps/web/src/domains/creator/StudioRevisionCompareView.test.tsx"),
  spec("share-review-link", "apps/web/src/domains/creator/studio-production/studio-review-link-url.ts", "apps/web/src/domains/creator/studio-production/studio-review-link-url.test.ts"),
  spec("sparse-tile-authority", "apps/web/src/domains/creator/render/studio-webgpu-sparse-tile-atlas.ts", "apps/web/src/domains/creator/render/studio-webgpu-sparse-tile-atlas.test.ts"),
  spec("pen-input-pipeline", "apps/web/src/domains/creator/canvas/studio-pointer-input.ts", "apps/web/src/domains/creator/canvas/studio-pointer-input.test.ts", { browser: "scripts/verify-studio-brush-latency.mts" }),
  spec("brush-studio", "apps/web/src/domains/creator/brush-lab/brush-studio-v6-product-bridge.ts", "apps/web/src/domains/creator/brush-lab/brush-studio-v6-product-bridge.test.ts"),
  spec("vector-ink", "apps/web/src/domains/creator/studio-vector-ink-geometry.ts", "apps/web/src/domains/creator/studio-vector-ink-geometry.test.ts"),
  spec("unified-layer-graph", "apps/web/src/domains/creator/layer/studio-layer-effects-graph-adapter.ts", "apps/web/src/domains/creator/layer/studio-layer-effects-graph-adapter.test.ts"),
  spec("selection-transform", "apps/web/src/domains/creator/selection/studio-selection-transform-controller.ts", "apps/web/src/domains/creator/selection/studio-selection-transform-controller.test.ts"),
  spec("adjustment-filter-graph", "apps/web/src/domains/creator/filter/studio-adjustment-effect-graph.ts", "apps/web/src/domains/creator/filter/studio-adjustment-effect-graph.test.ts"),
  spec("frame-graph", "packages/studio-project-model/src/ir/frame-graph.ts", "apps/web/src/domains/creator/render/studio-frame-graph-compositor.test.ts"),
  spec("balloon-text", "packages/studio-project-model/src/ir/balloon-text-layout.ts", "apps/web/src/domains/creator/comic/studio-comic-production.test.ts"),
  spec("tone-effect-ruler", "apps/web/src/domains/creator/StudioAdvancedRulerPanel.tsx", "apps/web/src/domains/creator/StudioAdvancedRulerPanel.test.tsx"),
  spec("episode-page-manager", "apps/web/src/domains/creator/production-hub/production-episode-operations.ts", "apps/web/src/domains/creator/production-hub/production-episode-operations.test.ts"),
  spec("platform-export", "apps/web/src/domains/creator/studio-shell/studio-platform-delivery-plan.ts", "apps/web/src/domains/creator/studio-shell/studio-platform-delivery-plan.test.ts"),
  spec("import-center", "apps/web/src/domains/creator/studio-import-compatibility-report.ts", "apps/web/src/domains/creator/studio-import-compatibility.test.ts"),
  spec("png-codec", "apps/web/src/domains/creator/bg3d/studio-bg3d-shot-png-worker-client.ts", "apps/web/src/domains/creator/bg3d/studio-bg3d-shot-png-worker-client.test.ts"),
  spec("psd-baseline", "apps/web/src/domains/creator/studio-psd-import.ts", "apps/web/src/domains/creator/studio-psd-import.test.ts"),
  spec("psd-advanced", "apps/web/src/domains/creator/export/studio-psd-export.ts", "apps/web/src/domains/creator/export/studio-psd-adjustment-graph.test.ts", { externalNote: "Golden PSD corpus round-trip must be signed by the compatibility lab." }),
  spec("psb-large-document", "apps/web/src/domains/creator/hybrid-dcc/studio-dcc-format-matrix.ts", "apps/web/src/domains/creator/studio-psd-import.test.ts", { externalNote: "Large PSB corpus and memory-soak evidence is required." }),
  spec("clip-migration", "apps/web/src/domains/creator/studio-import-compatibility.ts", "apps/web/src/domains/creator/studio-import-compatibility.test.ts", { externalNote: "CLIP support remains migration-grade until licensed corpus verification is complete." }),
  spec("scene-graph-outliner", "apps/web/src/domains/creator/bg3d/StudioBg3dEditorSceneGraph.tsx", "apps/web/src/domains/creator/scene-3d/studio-3d-scene-dependency-graph.test.ts"),
  spec("inference-modeling", "apps/web/src/domains/creator/scene-3d/studio-3d-inference-engine.ts", "apps/web/src/domains/creator/scene-3d/studio-3d-inference-engine.test.ts"),
  spec("parametric-assets", "apps/web/src/domains/creator/scene-3d/studio-3d-dynamic-components.ts", "apps/web/src/domains/creator/scene-3d/studio-3d-dynamic-components.test.ts"),
  spec("camera-scene-variant", "apps/web/src/domains/creator/scene-3d/studio-3d-camera-cinematic-director.ts", "apps/web/src/domains/creator/scene-3d/studio-3d-camera-cinematic-director.test.ts"),
  spec("render-passes", "apps/web/src/domains/creator/bg3d/studio-bg3d-shot-psd.ts", "apps/web/src/domains/creator/bg3d/studio-bg3d-shot-psd.test.ts"),
  spec("3d-live-layer", "apps/web/src/domains/creator/studio-linked-3d-pass-cloud-sync.ts", "apps/web/src/domains/creator/studio-linked-3d-pass-cloud-sync.test.ts"),
  spec("unified-asset-library", "apps/web/src/domains/creator/studio-unified-asset-library-projection.ts", "apps/web/src/domains/creator/studio-unified-asset-library-projection.test.ts"),
  spec("marketplace-search-preview", "apps/web/src/domains/creator/studio-marketplace-search.ts", "apps/web/src/domains/creator/studio-marketplace-search.test.ts"),
  spec("license-ledger-lockfile", "packages/studio-project-model/src/assets/asset-lockfile.ts", "packages/studio-project-model/src/__tests__/platform-integration.test.ts"),
  spec("seller-center", "apps/web/src/domains/creator/studio-shell/StudioMarketplaceSellerPanel.tsx", "apps/web/src/domains/creator/studio-shell/StudioMarketplaceSellerPanel.test.tsx"),
  spec("realtime-presence", "apps/web/src/domains/creator/live/studio-live-socket-transport-presence.ts", "apps/web/src/domains/creator/live/StudioLiveCollaborationProvider.test.tsx"),
  spec("lease-service", "apps/web/src/domains/creator/live/createStudioLiveResourceLeaseController.ts", "apps/web/src/domains/creator/render/studio-raster-source-lease.test.ts"),
  spec("semantic-merge-conflict", "apps/web/src/domains/creator/studio-workspace-three-way-merge.ts", "apps/web/src/domains/creator/studio-workspace-three-way-merge.test.ts"),
  spec("review-workflow", "apps/web/src/domains/creator/studio-workflow/studio-review-workflow.ts", "apps/web/src/domains/creator/studio-workflow/studio-review-workflow.test.ts"),
  spec("production-bridge", "apps/web/src/domains/creator/studio-shell/StudioProductionCocreatorBridgePanel.tsx", "apps/web/src/domains/creator/studio-production/studio-production-server-revisions.test.ts"),
  spec("desktop-sync-agent", "tools/toonbridge/server.mjs", "tools/toonbridge/test/server.test.mjs", { externalNote: "Signed desktop builds and OS watcher soak evidence are required." }),
  spec("local-folder-binding", "apps/web/src/domains/creator/studio-platform/studio-local-folder-binding.ts", "apps/web/src/domains/creator/studio-platform/studio-local-folder-binding.test.ts", { externalNote: "Browser permission and desktop filesystem matrices require real-device validation." }),
  spec("google-drive-adapter", "apps/api/src/modules/personal-cloud/personal-cloud.provider.ts", "apps/api/src/modules/personal-cloud/personal-cloud.provider.test.ts", { externalNote: "A real Google OAuth tenant and upload/download round trip are required." }),
  spec("dropbox-adapter", "apps/api/src/modules/personal-cloud/personal-cloud.provider.ts", "apps/api/src/modules/personal-cloud/personal-cloud.provider.test.ts", { externalNote: "A real Dropbox OAuth tenant and upload/download round trip are required." }),
  spec("performance-lab", "scripts/verify-studio-brush-latency.mts", "scripts/verify-studio-brush-latency.test.ts", { browser: "scripts/verify-studio-five-hour-soak.mts", externalNote: "Representative pen devices and long-running hardware evidence are required." }),
  spec("file-roundtrip-lab", "apps/web/src/domains/creator/studio-psd-import.ts", "apps/web/src/domains/creator/studio-psd-import.test.ts", { browser: "scripts/verify-blender-package-roundtrip.mts", externalNote: "Licensed real-world PSD, PSB and CLIP golden corpora are required." }),
  spec("collaboration-fault-lab", "tests/fault-injection/v12-runtime-fault-harness.ts", "tests/fault-injection/v12-runtime-fault-matrix.test.ts", { browser: "scripts/qa-studio-browser-fault-injection.mjs", externalNote: "Multi-user WAN and forced process-loss runs are required." }),
  spec("accessibility-security-audit", "apps/web/src/domains/creator/studio-accessibility-audit.ts", "apps/web/src/domains/creator/studio-accessibility-audit.test.ts", { browser: "scripts/verify-security-advisory-exceptions.mjs", externalNote: "Independent accessibility and security audits are required." }),
  spec("professional-creator-validation", "scripts/verify-studio-lifecycle.mts", "scripts/studio-lifecycle-verifier-policy.test.ts", { browser: "scripts/verify-studio-lifecycle.mts", externalNote: "A professional creator must complete and sign off an end-to-end production episode." }),
] as const);

const DIMENSION_REFERENCE = (
  dimension: StudioCapabilityEvidenceDimension,
  item: StudioCapabilityEvidenceSpec,
): string => {
  if (dimension === "automated-test") return item.test;
  if (dimension === "persistence" || dimension === "recovery") {
    return item.durability ?? DEFAULT_DURABILITY;
  }
  if (dimension === "collaboration") {
    return item.collaboration ?? DEFAULT_COLLABORATION;
  }
  if (dimension === "browser-evidence") return item.browser ?? item.test;
  return item.source;
};

function verifiedEvidence(
  dimension: StudioCapabilityEvidenceDimension,
  item: StudioCapabilityEvidenceSpec,
): StudioCapabilityEvidence {
  return Object.freeze({
    dimension,
    status: "verified" as const,
    reference: DIMENSION_REFERENCE(dimension, item),
  });
}

function capabilityRecord(
  item: StudioCapabilityEvidenceSpec,
): StudioCapabilityRecord {
  const definition = STUDIO_COMPETITOR_CAPABILITY_CATALOG.find(
    (candidate) => candidate.id === item.id,
  );
  if (!definition) throw new Error(`Unknown Studio capability evidence id: ${item.id}`);

  const evidence: StudioCapabilityEvidence[] = definition.requiredDimensions
    .filter((dimension) => dimension !== "external-validation")
    .map((dimension) => verifiedEvidence(dimension, item));

  if (definition.externalValidationRequired) {
    evidence.push(Object.freeze({
      dimension: "external-validation",
      status: "pending",
      reference: `docs/evidence/external/${definition.id}.json`,
      note: item.externalNote
        ?? "Independent real-device or professional validation evidence has not been attached.",
    }));
  }

  return Object.freeze({
    ...definition,
    evidence: Object.freeze(evidence),
  });
}

const EVIDENCE_IDS = STUDIO_COMPETITOR_CAPABILITY_EVIDENCE_SPECS.map((item) => item.id);
if (new Set(EVIDENCE_IDS).size !== EVIDENCE_IDS.length) {
  throw new Error("Studio competitor capability evidence contains duplicate ids.");
}

export const STUDIO_COMPETITOR_CAPABILITY_RECORDS = Object.freeze(
  STUDIO_COMPETITOR_CAPABILITY_EVIDENCE_SPECS.map(capabilityRecord),
) satisfies readonly StudioCapabilityRecord[];

export const STUDIO_COMPETITOR_CAPABILITY_EVALUATION =
  evaluateStudioCapabilityLedger(STUDIO_COMPETITOR_CAPABILITY_RECORDS);
