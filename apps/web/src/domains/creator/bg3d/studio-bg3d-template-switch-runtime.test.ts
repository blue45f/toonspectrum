import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const attachHostsSource = readFileSync(
  new URL("./studio-bg3d-editor-attach-hosts.ts", import.meta.url),
  "utf8",
);
const templateSwitchHostSource = readFileSync(
  new URL("./studio-bg3d-editor-template-switch-host.ts", import.meta.url),
  "utf8",
);

describe("BG3D built-in template switch runtime boundary", () => {
  it("overrides the legacy scene-ops command before downstream hosts capture it", () => {
    const sceneOps = attachHostsSource.indexOf("attachStudioBg3dEditorSceneOpsHost(h)");
    const templateSwitch = attachHostsSource.indexOf("attachStudioBg3dEditorTemplateSwitchHost(h)");
    const transform = attachHostsSource.indexOf("attachStudioBg3dEditorTransformHost(h)");

    expect(sceneOps).toBeGreaterThan(-1);
    expect(templateSwitch).toBeGreaterThan(sceneOps);
    expect(transform).toBeGreaterThan(templateSwitch);
  });

  it("plans one catalog slot and refuses silent dependent-object deletion", () => {
    expect(templateSwitchHostSource).toContain("planStudioBg3dCatalogTemplateSwitch({");
    expect(templateSwitchHostSource).toContain("if (!switchPlan)");
    expect(templateSwitchHostSource).toContain("switchPlan.retainedPrimitives");
    expect(templateSwitchHostSource).toContain("switchPlan.retainedCustomModels");
    expect(templateSwitchHostSource).not.toContain("live.primitives.length");
  });

  it("commits one history transition before publishing both runtime collections", () => {
    const history = templateSwitchHostSource.indexOf("commitImmediateHistoryTransition(");
    const runtime = templateSwitchHostSource.indexOf("physicsRuntimeSourceRef.current =");
    const primitives = templateSwitchHostSource.indexOf("setPrimitives(nextPrimitives)");
    const models = templateSwitchHostSource.indexOf("setCustomModels(nextCustomModels)");

    expect(history).toBeGreaterThan(-1);
    expect(runtime).toBeGreaterThan(history);
    expect(primitives).toBeGreaterThan(runtime);
    expect(models).toBeGreaterThan(runtime);
  });

  it("selects the replacement hierarchy and clears stale errors only after success", () => {
    expect(templateSwitchHostSource).toContain(
      "setSelectedIds(new Set(orderStudioBg3dHierarchySelectionRootsFirst(parts)))",
    );
    expect(templateSwitchHostSource).toContain("setError(null)");
  });
});
