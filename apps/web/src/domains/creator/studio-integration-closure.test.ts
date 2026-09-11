import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PERMANENT_WORKFLOW = ".github/workflows/toonstudio-integration.yml";
const TRANSIENT_WORKFLOWS = [
  ".github/workflows/pr1307-final-squash-rebase.yml",
  ".github/workflows/pr1307-integration-validation.yml",
  ".github/workflows/pr1307-integration-validation-v2.yml",
  ".github/workflows/pr1307-sync-main-once.yml",
  ".github/workflows/toonstudio-menu-contract-repair.yml",
  ".github/workflows/toonstudio-rebase-reconcile.yml",
  ".github/workflows/apply-toonstudio-ui-lint-fixes.yml",
  ".github/workflows/attest-toonstudio-session-complete.yml",
  ".github/workflows/cleanup-toonstudio-session-workflows.yml",
  ".github/workflows/commit-toonstudio-session-fixes.yml",
  ".github/workflows/diagnose-toonstudio-session-types.yml",
  ".github/workflows/ensure-toonstudio-session-complete.yml",
  ".github/workflows/finalize-toonstudio-session-verified.yml",
  ".github/workflows/finalize-toonstudio-session.yml",
  ".github/workflows/pr1289-ci-delta-optimizer.yml",
  ".github/workflows/repair-and-publish-toonstudio-session.yml",
  ".github/workflows/retire-toonstudio-session-branch.yml",
  ".github/workflows/toonstudio-session-orchestrator.yml",
  ".github/workflows/toonstudio-session-self-heal.yml",
  ".github/workflows/toonstudio-session-verify.yml",
  ".github/workflows/verify-toonstudio-pr-head.yml",
  ".github/workflows/apply-ci-optimization-fixes-once.yml",
  ".github/workflows/apply-ci-source-fixes-once.yml",
  ".github/workflows/apply-toonstudio-project-contract-repair.yml",
  ".github/workflows/complete-toonstudio-session-all-features.yml",
  ".github/workflows/finalize-toonstudio-session-integration.yml",
  ".github/workflows/finalize-toonstudio-session-integration-v2.yml",
  ".github/workflows/repair-toonstudio-session-all-features.yml",
  ".github/workflows/verify-and-autofix-toonstudio-final.yml",
] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("ToonStudio integration closure", () => {
  it("keeps one read-only permanent validation owner and removes branch-mutating helpers", () => {
    for (const path of TRANSIENT_WORKFLOWS) {
      expect(existsSync(path), `${path} must not remain in the product branch`).toBe(false);
    }

    const workflow = source(PERMANENT_WORKFLOW);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("NODE_OPTIONS: --max-old-space-size=8192");
    expect(workflow).toContain("studio-integration-closure.test.ts");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("git push");
    expect(workflow).not.toContain("--force-with-lease");
  });

  it("routes canonical project sections through the integrated runtime instead of a shell-only page", () => {
    const routePages = source("apps/web/src/app/routes/groups/creator-route-pages.ts");
    const routes = source("apps/web/src/app/routes/groups/creator.routes.tsx");
    const productIa = source("apps/web/src/domains/creator/studio-product-ia.ts");

    expect(routePages).toContain('import("@/domains/creator/studio-shell/StudioProjectIntegratedPage")');
    expect(routePages).toContain("default: module.StudioProjectIntegratedPage");
    for (const section of ["overview", "story", "production", "assets", "review", "export", "settings"]) {
      expect(routes).toContain(`path: "/studio/p/:projectId/${section}"`);
      expect(routes).toContain(`StudioProjectShellPage section="${section}"`);
    }
    expect(productIa).toContain('primaryRoute: "/studio"');
    expect(productIa).toContain('primaryRoute: "/studio/p/:projectId/story"');
    expect(productIa).toContain('primaryRoute: "/studio/p/:projectId/export"');
  });

  it("keeps canonical document URLs mounted on one editor runtime across workspace changes", () => {
    const route = source("apps/web/src/domains/creator/studio-shell/StudioDocumentWorkspaceRoute.tsx");
    const layout = source("apps/web/src/domains/creator/studio-router/StudioDocumentLayout.tsx");
    const switcher = source("apps/web/src/domains/creator/studio-shell/StudioDocumentWorkspaceSwitcher.tsx");
    const dock = source("apps/web/src/domains/creator/studio-shell/StudioDocumentWorkspaceDock.tsx");

    expect(route).toContain("<StudioEditorRoute resolution={routeResolution} />");
    expect(route).toContain("resolveStudioRoute");
    expect(route).not.toContain("legacyEditorHref");
    expect(layout).toContain("<StudioDocumentWorkspaceSwitcher />");
    expect(layout).toContain("<StudioDocumentWorkspaceDock />");
    expect(switcher).toContain("studioDocumentHref");
    expect(switcher).toContain("STUDIO_DOCUMENT_WORKSPACES");
    expect(switcher).toContain("projectId: resolution.projectId");
    expect(switcher).toContain("documentId: resolution.documentId");
    expect(switcher).toContain("draftId: resolution.draftId");

    for (const workspace of [
      "comic",
      "design",
      "slides",
      "storyboard",
      "whiteboard",
      '"3d"',
      "animation",
      "motion",
      "audio",
      "localization",
      "review",
    ]) {
      expect(dock).toContain(`${workspace}: {`);
    }
    expect(dock).toContain("StudioProjectFeatureSuitePanel");
    expect(dock).toContain("StudioLocalizationPanel");
    expect(dock).toContain("StudioReviewPanel");
  });

  it("mounts persisted project workflows, diagnostics and feature implementations on route-reachable pages", () => {
    const integrated = source("apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx");
    const shell = source("apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx");
    const suite = source("apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx");

    for (const component of [
      "StudioProjectFeatureSuitePanel",
      "StudioLocalizationPanel",
      "StudioSeriesKitPanel",
      "StudioReviewPanel",
      "StudioExportPanel",
      "StudioProjectAssistantPanel",
    ]) {
      expect(integrated).toContain(`<${component}`);
    }
    expect(shell).toContain("<StudioProjectDiagnosticsBridge");
    expect(shell).toContain("<StudioProjectReadinessPanel");

    for (const implementation of [
      "aggregateStudioAnalytics",
      "planStudioAutomationRecipe",
      "auditStudioPresentation",
      "analyzeStudioProductionPipeline",
      "analyzeStudioStoryContinuity",
      "planStudioStoryboard",
      "planStudioTemplateApplication",
      "buildStudioMotionSchedule",
      "planStudioVoiceRegeneration",
      "planStudioWebtoon3dRender",
      "analyzeStudioWebtoonQuality",
    ]) {
      expect(suite).toContain(implementation);
    }
  });

  it("mounts recovered import and AI handoffs in the real canvas host", () => {
    const hosts = source("apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorHosts.tsx");
    expect(hosts).toContain('import { StudioImportHandoffHost } from "./StudioImportHandoffHost"');
    expect(hosts).toContain('import { StudioAiProjectHandoffHost } from "../ai/StudioAiProjectHandoffHost"');
    expect(hosts).toContain("<StudioImportHandoffHost");
    expect(hosts).toContain("<StudioAiProjectHandoffHost");
    expect(hosts).toContain("onBrushPack={handleBrushPackImportFromMenu}");
    expect(hosts).toContain("onProjectJson={handleImportProject}");
  });

  it("keeps V5 catalogue recovery and V6 program ownership reachable from one brush route", () => {
    const page = source("apps/web/src/domains/creator/brush-lab/StudioBrushLabPage.tsx");
    const workbench = source("apps/web/src/domains/creator/brush-lab/StudioBrushIntegratedWorkbench.tsx");
    const versionBridge = source("apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.ts");
    const routes = source("apps/web/src/app/routes/groups/creator.routes.tsx");

    expect(page).toContain("<StudioBrushIntegratedWorkbench");
    expect(page).toContain("<StudioBrushLegacyCataloguePanel");
    expect(workbench).toContain('"toonspectrum:brush-v6-program"');
    expect(workbench).toContain("<MarketplaceBrushStudioBridge");
    expect(versionBridge).toContain("BRUSH_QUALITY_CATALOG");
    expect(versionBridge).toContain("BRUSH_STUDIO_V6_RECIPES");
    expect(routes).toContain('path: "/studio/assets/brushes/new"');
    expect(routes).toContain('path: "/studio/assets/brushes/:brushId/edit"');
  });
});
