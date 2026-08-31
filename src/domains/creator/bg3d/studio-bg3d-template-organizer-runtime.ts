// Template organization is not needed to paint the first BG3D editor frame. Keep the heavier
// arrangement/reset/delete planners behind the organizer action boundary so opening BG3D does not
// pay for them before the artist uses the Templates tab.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  planStudioBg3dTemplateInstanceArrangement,
  planStudioBg3dTemplateInstanceReset,
} from "./studio-bg3d-template-organizer-plans";

export type StudioBg3dTemplateOrganizerCommand =
  | "arrange-one"
  | "arrange-all"
  | "reset-one"
  | "reset-all"
  | "delete-one"
  | "delete-all";

function resolveInstances(
  h: any,
  command: StudioBg3dTemplateOrganizerCommand,
  instanceId?: string,
): readonly any[] {
  const instances: readonly any[] = h.templateInstances ?? [];
  if (command.endsWith("-all")) return instances;
  const instance = instances.find((candidate: any) => candidate.id === instanceId);
  return instance ? [instance] : [];
}

function resolveSource(h: any, instance: any): any {
  return h.resolveTemplateInstanceSource(instance);
}

function arrangementFailureMessage(reason: string): string {
  switch (reason) {
    case "locked-node":
      return "잠긴 템플릿 객체가 있어 정돈하지 않았습니다. 잠금을 먼저 해제해 주세요.";
    case "external-parent":
      return "템플릿 최상위 객체가 다른 그룹에 연결되어 있어 정돈하지 않았습니다.";
    case "cyclic-hierarchy":
      return "템플릿 내부 그룹 구조에 순환이 있어 정돈하지 않았습니다.";
    case "missing-bounds":
    case "invalid-bounds":
      return "템플릿 지오메트리를 준비하는 중입니다. 장면이 표시된 뒤 다시 시도해 주세요.";
    case "duplicate-ordinal":
      return "템플릿 묶음 식별자가 충돌해 정돈하지 않았습니다.";
    default:
      return "템플릿 배치를 정돈할 수 없습니다.";
  }
}

function arrange(h: any, instances: readonly any[]): void {
  const boundsByNodeId = new Map();
  for (const instance of instances) {
    for (const node of instance.nodes) {
      const bounds = h.readStudioBg3dObjectWorldBounds(
        h.primitiveObjectsRef.current.get(node.id),
      );
      if (bounds) boundsByNodeId.set(node.id, bounds);
    }
  }
  const plan = planStudioBg3dTemplateInstanceArrangement({
    instances,
    boundsByNodeId,
    gapMeters: 1,
  });
  if (!plan.ok) {
    h.setError(arrangementFailureMessage(plan.reason));
    return;
  }
  const live = h.physicsRuntimeSourceRef.current;
  const translationById = new Map(
    plan.translations.map((translation: any) => [translation.nodeId, translation.delta]),
  );
  const translate = (entity: any) => {
    const delta = translationById.get(entity.id);
    if (!delta) return entity;
    return {
      ...entity,
      position: [
        entity.position[0] + delta[0],
        entity.position[1] + delta[1],
        entity.position[2] + delta[2],
      ],
    };
  };
  const nextPrimitives = live.primitives.map(translate);
  const nextCustomModels = live.customModels.map(translate);
  h.commitImmediateHistoryTransition(
    nextPrimitives,
    nextCustomModels,
    live.document,
    h.createStudioBg3dHistorySnapshot(live),
  );
  h.physicsRuntimeSourceRef.current = {
    ...live,
    primitives: nextPrimitives,
    customModels: nextCustomModels,
  };
  h.setPrimitives(nextPrimitives);
  h.setCustomModels(nextCustomModels);
  h.selectTemplateInstances(instances);
}

function sourceLayouts(h: any, instance: any): readonly any[] | null {
  const source = resolveSource(h, instance);
  if (!source) return null;
  if (instance.sourceKind === "catalog") {
    return h.instantiateSceneTemplate(source, instance.insertionOffset)
      .map((primitive: any, ordinal: number) => ({
      ordinal,
      kind: "primitive",
      parentOrdinal: null,
      position: primitive.position,
      rotation: primitive.rotation,
      scale: primitive.scale,
      }));
  }
  const ordinalByNodeId = new Map(
    source.document.nodes.map((node: any, ordinal: number) => [node.id, ordinal]),
  );
  return source.document.nodes.map((node: any, ordinal: number) => ({
    ordinal,
    kind: node.kind,
    parentOrdinal: node.parentId === null || node.parentId === undefined
      ? null
      : ordinalByNodeId.get(node.parentId) ?? null,
    position: node.transform.position,
    rotation: node.transform.rotation,
    scale: node.transform.scale,
  }));
}

function reset(h: any, instances: readonly any[]): void {
  const live = h.physicsRuntimeSourceRef.current;
  const entitiesById = new Map<string, any>([
    ...live.primitives.map((primitive: any) => [primitive.id, {
      id: primitive.id,
      kind: "primitive",
      parentId: primitive.parentId,
      locked: primitive.locked,
    }]),
    ...live.customModels.map((model: any) => [model.id, {
      id: model.id,
      kind: "model",
      parentId: model.parentId,
      locked: model.locked,
    }]),
  ]);
  const updates: any[] = [];
  for (const instance of instances) {
    const sourceNodes = sourceLayouts(h, instance);
    if (!sourceNodes) {
      h.setError("이 템플릿의 원본을 찾지 못해 초기화하지 않았습니다. 내 템플릿 목록을 다시 불러와 주세요.");
      return;
    }
    const plan = planStudioBg3dTemplateInstanceReset({
      instance,
      entitiesById,
      sourceNodes,
    });
    if (!plan.ok) {
      h.setError(plan.reason === "locked-node"
        ? "잠긴 템플릿 객체가 있어 초기화하지 않았습니다. 잠금을 먼저 해제해 주세요."
        : "템플릿의 객체 종류 또는 그룹 구조가 달라져 원래 배치로 안전하게 초기화할 수 없습니다.");
      return;
    }
    updates.push(...plan.updates);
  }
  const updateById = new Map<string, any>(
    updates.map((update: any) => [update.nodeId, update]),
  );
  const resetEntity = (entity: any) => {
    const update = updateById.get(entity.id);
    return update ? {
      ...entity,
      position: [...update.position],
      rotation: [...update.rotation],
      scale: [...update.scale],
    } : entity;
  };
  const nextPrimitives = live.primitives.map(resetEntity);
  const nextCustomModels = live.customModels.map(resetEntity);
  h.commitImmediateHistoryTransition(
    nextPrimitives,
    nextCustomModels,
    live.document,
    h.createStudioBg3dHistorySnapshot(live),
  );
  h.physicsRuntimeSourceRef.current = {
    ...live,
    primitives: nextPrimitives,
    customModels: nextCustomModels,
  };
  h.setPrimitives(nextPrimitives);
  h.setCustomModels(nextCustomModels);
  h.selectTemplateInstances(instances);
}

function remove(h: any, instances: readonly any[]): void {
  const ids = new Set<string>(instances.flatMap((instance: any) =>
    instance.nodes.map((node: any) => node.id)
  ));
  if (ids.size === 0) return;
  const live = h.physicsRuntimeSourceRef.current;
  const plan = h.planStudioBg3dSceneEntityRemoval({
    snapshot: live,
    entityIds: ids,
  });
  if (!plan.ok) {
    h.setError("템플릿 객체의 자식 월드 변환을 보존할 수 없어 일괄 삭제를 취소했습니다.");
    return;
  }
  h.commitImmediateHistoryTransition(
    plan.snapshot.primitives,
    plan.snapshot.customModels,
    plan.snapshot.document,
    h.createStudioBg3dHistorySnapshot(live),
  );
  h.commitSceneEntityRemoval(plan);
  h.setSelectedIds((current: Set<string>) =>
    new Set([...current].filter((id) => !ids.has(id)))
  );
  h.setIsTransforming(false);
  h.setError(null);
}

export function runStudioBg3dTemplateOrganizerCommand(
  h: any,
  command: StudioBg3dTemplateOrganizerCommand,
  instanceId?: string,
): void {
  if (h.templateOrganizationBlockedReason) {
    h.setError(h.templateOrganizationBlockedReason);
    return;
  }
  const instances = resolveInstances(h, command, instanceId);
  if (instances.length === 0) return;
  if (command.startsWith("arrange-")) arrange(h, instances);
  else if (command.startsWith("reset-")) reset(h, instances);
  else remove(h, instances);
}
