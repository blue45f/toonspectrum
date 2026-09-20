"use no memo";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import { BG_SCENE_TEMPLATES, instantiateSceneTemplate } from "../studio-background-3d-scene-templates";
import { createStudioBg3dHistorySnapshot, type StudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { isStudioBg3dPhysicsTransientPhase, type StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, type StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { isStudioBg3dSceneEditReady } from "./studio-bg3d-scene-edit-readiness";
import { allocateStudioBg3dTemplateInstanceNodeIds, orderStudioBg3dHierarchySelectionRootsFirst } from "./studio-bg3d-template-instance";
import { planStudioBg3dCatalogTemplateSwitch } from "./studio-bg3d-template-switch-plan";
import type { StudioBg3dCanonicalDocumentState } from "./useStudioBg3dCanonicalDocumentState";

/** Editor-owned state only: module dependencies do not live on the host bag. */
export interface StudioBg3dEditorTemplateSwitchHost {
  readonly open: boolean;
  readonly modelRenderer: unknown;
  readonly isRestoringScene: boolean;
  readonly physicsPhaseRef: { readonly current: StudioBg3dPhysicsPhase };
  readonly physicsRuntimeSourceRef: StudioBg3dCanonicalDocumentState["liveSceneRef"];
  readonly generateId: () => string;
  readonly commitImmediateHistoryTransition: (
    primitives: readonly BgPrimitive[],
    customModels: readonly BgCustomModelInstance[],
    document: StudioBg3dSceneDocument,
    before?: StudioBg3dHistorySnapshot,
  ) => void;
  readonly replaceCanonicalDocumentState: StudioBg3dCanonicalDocumentState["replaceCanonicalDocumentState"];
  readonly setError: (error: string | null) => void;
  readonly setSelectedIds: (ids: Set<string>) => void;
  addSceneTemplate: (templateId: string) => void;
}

/** Override the append-only command with one active catalog template and one history transition. */
export function attachStudioBg3dEditorTemplateSwitchHost(h: StudioBg3dEditorTemplateSwitchHost): void {
  const {
    commitImmediateHistoryTransition,
    generateId,
    physicsPhaseRef,
    physicsRuntimeSourceRef,
    replaceCanonicalDocumentState,
    setError,
    setSelectedIds,
  } = h;

  h.addSceneTemplate = (templateId: string) => {
    if (!isStudioBg3dSceneEditReady(h)) return;
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
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
    const before = createStudioBg3dHistorySnapshot({
      primitives: live.primitives,
      customModels: live.customModels,
      document: live.document,
    });
    commitImmediateHistoryTransition(
      nextPrimitives,
      nextCustomModels,
      live.document,
      before,
    );
    replaceCanonicalDocumentState({
      primitives: nextPrimitives,
      customModels: nextCustomModels,
    });
    setSelectedIds(new Set(orderStudioBg3dHierarchySelectionRootsFirst(parts)));
    setError(null);
  };
}
