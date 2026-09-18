import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const AUTHORITY = "apps/web/src/domains/creator/scene3d/studio-scene3d-authority.ts";
const LINKED_LAYER = "apps/web/src/domains/creator/scene3d/studio-scene3d-linked-layer-bridge.ts";
const NPR_GRAPH = "apps/web/src/domains/creator/scene3d/studio-scene3d-npr-render-graph.ts";
const RUNTIME_RECOVERY = "apps/web/src/domains/creator/scene3d/studio-scene3d-runtime-recovery.ts";

describe("Studio Scene3D professional integration boundary", () => {
  it("keeps canonical authority, Linked Layer, and NPR planning renderer-neutral", () => {
    for (const path of [AUTHORITY, LINKED_LAYER, NPR_GRAPH, RUNTIME_RECOVERY]) {
      const contents = source(path);
      expect(contents).not.toMatch(/from\s+["']three(?:\/|["'])/u);
      expect(contents).not.toMatch(/from\s+["']@babylonjs\//u);
      expect(contents).not.toMatch(/new\s+(?:THREE|BABYLON)\./u);
    }
    const renderGraph = source(NPR_GRAPH);
    expect(renderGraph).toContain('"three-primary"');
    expect(renderGraph).toContain('"babylon-specialist"');
    expect(renderGraph).toContain('runtime: "babylon"');
  });

  it("wires the complete live BG3D scene into the professional runtime read model", () => {
    const sidebar = source(
      "apps/web/src/domains/creator/bg3d/StudioBg3dEditorSidebarExtras.tsx",
    );
    const viewPanel = source(
      "apps/web/src/domains/creator/bg3d/StudioBg3dViewPanel.tsx",
    );
    const proSuite = source(
      "apps/web/src/domains/creator/bg3d/StudioBg3dProSuitePanelContent.tsx",
    );
    expect(sidebar).toContain('import("./studio-bg3d-professional-runtime-readiness")');
    expect(sidebar).toContain("resolveStudioBg3dProfessionalRuntimeReadiness");
    expect(sidebar).not.toContain('from "./studio-bg3d-professional-runtime-readiness"');
    expect(sidebar).toContain("attachmentByStorageModelId: attachmentByStorageModelIdRef.current");
    expect(sidebar).toContain("canonicalRevision, savedShots");
    expect(sidebar).toContain("sharedSceneSession");
    expect(sidebar).toContain("professionalReadiness={professionalRuntimeReadiness}");
    expect(viewPanel).toContain("professionalReadiness: props.professionalReadiness");
    expect(proSuite).toContain("StudioBg3dProfessionalReadinessPanel");
    const editorHost = source(
      "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
    );
    expect(editorHost).toContain("resolveStudioScene3dLinkedLayerEditSource");
    expect(editorHost).not.toContain("studio-scene3d-linked-layer-bridge");
    expect(editorHost).toContain("return { scene: linkedScene }");
  });

  it("routes canonical document replacement through one atomic state owner", () => {
    const state = source(
      "apps/web/src/domains/creator/bg3d/useStudioBg3dEditorState.ts",
    );
    const canonicalState = source(
      "apps/web/src/domains/creator/bg3d/useStudioBg3dCanonicalDocumentState.ts",
    );
    expect(state).toContain("useStudioBg3dCanonicalDocumentState");
    expect(state).toContain("replaceCanonicalDocumentState");
    expect(canonicalState).toContain("canonicalRevision");
    expect(canonicalState).toContain("liveSceneRef.current = next");
    expect(canonicalState).toContain("setCanonicalRevision(next.revision)");

    for (const path of [
      "apps/web/src/domains/creator/bg3d/studio-bg3d-editor-model-import-actions.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-editor-placement-host.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-editor-scene-ops-host.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-editor-template-switch-host.ts",
    ]) {
      expect(source(path)).toContain("replaceCanonicalDocumentState");
    }
  });

  it("keeps runtime recovery explicit and document preserving", () => {
    const recovery = source(RUNTIME_RECOVERY);
    expect(recovery).toContain('readonly preservesDocumentAuthority: true');
    expect(recovery).toContain('"offer-explicit-webgl2-switch"');
    expect(recovery).toContain('"disable-specialist-and-continue"');
    expect(recovery).toContain("30 * 60 * 1_000");
  });
});
