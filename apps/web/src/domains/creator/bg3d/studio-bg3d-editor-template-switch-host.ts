/* Extracted from StudioBackground3D. Closures keep original identifiers via an `any` host bag. */
// @ts-nocheck
"use no memo";

import { planStudioBg3dCatalogTemplateSwitch } from "./studio-bg3d-template-switch-plan";

/**
 * Overrides the legacy append-only built-in template command after the main scene-ops host attaches.
 * Keeping this boundary separate lets the current large host stay stable while the product contract
 * becomes one active catalog template, one history transition, and no silent attachment loss.
 */
export function attachStudioBg3dEditorTemplateSwitchHost(h) {
  const {
    BG_SCENE_TEMPLATES,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    allocateStudioBg3dTemplateInstanceNodeIds,
    commitImmediateHistoryTransition,
    generateId,
    instantiateSceneTemplate,
    orderStudioBg3dHierarchySelectionRootsFirst,
    physicsRuntimeSourceRef,
    setCustomModels,
    setError,
    setPrimitives,
    setSelectedIds,
  } = h;

  h.addSceneTemplate = (templateId: string) => {
    const template = BG_SCENE_TEMPLATES.find((entry) => entry.id === templateId);
    if (!template) return;

    const live = physicsRuntimeSourceRef.current;
    const switchPlan = planStudioBg3dCatalogTemplateSwitch({
      primitives: live.primitives,
      customModels: live.customModels,
    });
    if (!switchPlan) {
      setError("현재 템플릿에 연결된 외부 오브젝트가 있어 안전하게 전환하지 못했습니다.");
      return;
    }

    const rawParts = instantiateSceneTemplate(template, switchPlan.insertionOffset);
    if (rawParts.length === 0) return;

    const nodeLimit = Math.min(
      STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
      live.document.budgets.complexity.maxNodes,
    );
    const finalNodeCount = switchPlan.retainedPrimitives.length
      + switchPlan.retainedCustomModels.length
      + rawParts.length;
    if (finalNodeCount > nodeLimit) {
      setError(`이 장면에는 오브젝트를 최대 ${nodeLimit.toLocaleString()}개까지 둘 수 있습니다.`);
      return;
    }

    const allocation = allocateStudioBg3dTemplateInstanceNodeIds({
      sourceKind: "catalog",
      sourceId: template.id,
      insertionOffset: switchPlan.insertionOffset,
      nodeCount: rawParts.length,
      occupiedNodeIds: switchPlan.occupiedNodeIds,
      createSeed: () => generateId(),
    });
    if (!allocation) {
      setError("템플릿을 한 묶음으로 추적할 안전한 식별자를 만들지 못해 장면을 변경하지 않았습니다.");
      return;
    }

    const parts = rawParts.map((part, index) => ({
      ...part,
      id: allocation.nodeIds[index],
    }));
    const nextPrimitives = [...switchPlan.retainedPrimitives, ...parts];
    const nextCustomModels = [...switchPlan.retainedCustomModels];

    commitImmediateHistoryTransition(nextPrimitives, nextCustomModels, live.document);
    physicsRuntimeSourceRef.current = {
      ...live,
      primitives: nextPrimitives,
      customModels: nextCustomModels,
    };
    setPrimitives(nextPrimitives);
    setCustomModels(nextCustomModels);
    setSelectedIds(new Set(orderStudioBg3dHierarchySelectionRootsFirst(parts)));
    setError(null);
  };
}
