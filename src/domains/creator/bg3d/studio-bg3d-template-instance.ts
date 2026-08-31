import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

const TEMPLATE_INSTANCE_NODE_ID_PREFIX = "bg3dti1";
const TEMPLATE_INSTANCE_NODE_ID_PATTERN =
  /^bg3dti1~([cu])~([0-9a-f]{16})~([0-9a-f]{12})~([0-9a-z]+)~([0-9a-z]+)$/u;
const MAX_TEMPLATE_INSTANCE_ALLOCATION_ATTEMPTS = 64;

export type StudioBg3dTemplateSourceKind = "catalog" | "user";

export interface StudioBg3dTemplateInstanceAllocation {
  readonly instanceId: string;
  readonly sourceKind: StudioBg3dTemplateSourceKind;
  readonly sourceKey: string;
  readonly insertionOffset: number;
  readonly nodeIds: readonly string[];
}

export interface StudioBg3dTemplateInstanceNode {
  readonly id: string;
  readonly ordinal: number;
  readonly parentId: string | null;
  readonly locked: boolean;
}

export interface StudioBg3dTemplateInstance {
  readonly id: string;
  readonly sourceKind: StudioBg3dTemplateSourceKind;
  readonly sourceKey: string;
  readonly insertionOffset: number;
  readonly nodes: readonly StudioBg3dTemplateInstanceNode[];
  readonly rootNodeIds: readonly string[];
  readonly firstSceneIndex: number;
  readonly hasDuplicateOrdinals: boolean;
}

export interface StudioBg3dHierarchyEntity {
  readonly id: string;
  readonly parentId?: string | null;
}

export interface StudioBg3dHierarchyTransformEntity extends StudioBg3dHierarchyEntity {
  readonly position: readonly [number, number, number];
}

type TemplateRuntimeNode = Pick<
  BgPrimitive | BgCustomModelInstance,
  "id" | "parentId" | "locked"
>;

function hashToken(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${
    (right >>> 0).toString(16).padStart(8, "0")
  }`;
}

function randomAllocationSeed(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36)}`;
}

function sourceKindCode(kind: StudioBg3dTemplateSourceKind): "c" | "u" {
  return kind === "catalog" ? "c" : "u";
}

function sourceKindFromCode(code: string): StudioBg3dTemplateSourceKind | null {
  if (code === "c") return "catalog";
  if (code === "u") return "user";
  return null;
}

function parseBase36Integer(value: string): number | null {
  const parsed = Number.parseInt(value, 36);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Keeps every hierarchy root ahead of its descendants so the transform driver is never a child. */
export function orderStudioBg3dHierarchySelectionRootsFirst(
  entities: readonly StudioBg3dHierarchyEntity[],
): readonly string[] {
  const ids = new Set(entities.map((entity) => entity.id));
  const rootIds = entities
    .filter((entity) => !entity.parentId || !ids.has(entity.parentId))
    .map((entity) => entity.id);
  const roots = new Set(rootIds);
  return Object.freeze([
    ...rootIds,
    ...entities.filter((entity) => !roots.has(entity.id)).map((entity) => entity.id),
  ]);
}

export function hasStudioBg3dSelectedAncestor(
  entity: StudioBg3dHierarchyEntity,
  selectedIds: ReadonlySet<string>,
  readEntity: (id: string) => StudioBg3dHierarchyEntity | undefined,
): boolean {
  const visited = new Set<string>();
  let parentId = entity.parentId ?? null;
  while (parentId && !visited.has(parentId)) {
    if (selectedIds.has(parentId)) return true;
    visited.add(parentId);
    parentId = readEntity(parentId)?.parentId ?? null;
  }
  return false;
}

/** Reparents a clone to its cloned parent and lets only selected roots receive clone offset. */
export function resolveStudioBg3dDuplicateHierarchyPatch(input: {
  readonly source: StudioBg3dHierarchyTransformEntity;
  readonly clone: StudioBg3dHierarchyTransformEntity;
  readonly cloneIdBySourceId: ReadonlyMap<string, string>;
}): {
  readonly parentId: string | null;
  readonly position: readonly [number, number, number];
} {
  const clonedParentId = input.source.parentId
    ? input.cloneIdBySourceId.get(input.source.parentId)
    : null;
  return Object.freeze({
    parentId: clonedParentId ?? input.source.parentId ?? null,
    position: Object.freeze([...(clonedParentId
      ? input.source.position
      : input.clone.position)] as [number, number, number]),
  });
}

/**
 * Stable, compact lookup key for a template source. The full source id intentionally stays out of
 * scene-node ids so a valid 80-character library id cannot overflow the canonical node-id budget.
 * Callers resolve the key against the current catalog/library and fail closed on a collision.
 */
export function hashStudioBg3dTemplateSourceId(sourceId: string): string {
  return hashToken(sourceId.trim());
}

export function allocateStudioBg3dTemplateInstanceNodeIds(input: {
  readonly sourceKind: StudioBg3dTemplateSourceKind;
  readonly sourceId: string;
  readonly insertionOffset: number;
  readonly nodeCount: number;
  readonly occupiedNodeIds: ReadonlySet<string>;
  readonly createSeed?: (attempt: number) => string;
}): StudioBg3dTemplateInstanceAllocation | null {
  if (
    !input.sourceId.trim() ||
    !Number.isSafeInteger(input.insertionOffset) ||
    input.insertionOffset < 0 ||
    !Number.isSafeInteger(input.nodeCount) ||
    input.nodeCount <= 0 ||
    input.nodeCount > 512
  ) {
    return null;
  }

  const sourceKey = hashStudioBg3dTemplateSourceId(input.sourceId);
  const kindCode = sourceKindCode(input.sourceKind);
  const insertionOffset = input.insertionOffset.toString(36);
  for (let attempt = 0; attempt < MAX_TEMPLATE_INSTANCE_ALLOCATION_ATTEMPTS; attempt += 1) {
    let seed: string;
    try {
      seed = input.createSeed?.(attempt) ?? randomAllocationSeed();
    } catch {
      continue;
    }
    const instanceToken = hashToken(`${seed}:${attempt}`).slice(0, 12);
    const instanceId = [
      TEMPLATE_INSTANCE_NODE_ID_PREFIX,
      kindCode,
      sourceKey,
      instanceToken,
      insertionOffset,
    ].join("~");
    const nodeIds = Array.from({ length: input.nodeCount }, (_, ordinal) =>
      `${instanceId}~${ordinal.toString(36)}`
    );
    if (
      nodeIds.every((id) => id.length <= 80 && !input.occupiedNodeIds.has(id)) &&
      new Set(nodeIds).size === nodeIds.length
    ) {
      return Object.freeze({
        instanceId,
        sourceKind: input.sourceKind,
        sourceKey,
        insertionOffset: input.insertionOffset,
        nodeIds: Object.freeze(nodeIds),
      });
    }
  }
  return null;
}

export function parseStudioBg3dTemplateInstanceNodeId(id: string): {
  readonly instanceId: string;
  readonly sourceKind: StudioBg3dTemplateSourceKind;
  readonly sourceKey: string;
  readonly insertionOffset: number;
  readonly ordinal: number;
} | null {
  const match = TEMPLATE_INSTANCE_NODE_ID_PATTERN.exec(id);
  if (!match) return null;
  const sourceKind = sourceKindFromCode(match[1]!);
  const insertionOffset = parseBase36Integer(match[4]!);
  const ordinal = parseBase36Integer(match[5]!);
  if (!sourceKind || insertionOffset === null || ordinal === null || ordinal >= 512) return null;
  return Object.freeze({
    instanceId: id.slice(0, id.lastIndexOf("~")),
    sourceKind,
    sourceKey: match[2]!,
    insertionOffset,
    ordinal,
  });
}

/** Collects only explicitly tagged template nodes; older/ordinary nodes are never guessed. */
export function collectStudioBg3dTemplateInstances(
  primitives: readonly TemplateRuntimeNode[],
  customModels: readonly TemplateRuntimeNode[],
): readonly StudioBg3dTemplateInstance[] {
  const groups = new Map<string, {
    sourceKind: StudioBg3dTemplateSourceKind;
    sourceKey: string;
    insertionOffset: number;
    firstSceneIndex: number;
    nodes: StudioBg3dTemplateInstanceNode[];
  }>();
  const entities = [...primitives, ...customModels];
  entities.forEach((entity, sceneIndex) => {
    const provenance = parseStudioBg3dTemplateInstanceNodeId(entity.id);
    if (!provenance) return;
    const group = groups.get(provenance.instanceId) ?? {
      sourceKind: provenance.sourceKind,
      sourceKey: provenance.sourceKey,
      insertionOffset: provenance.insertionOffset,
      firstSceneIndex: sceneIndex,
      nodes: [],
    };
    group.nodes.push({
      id: entity.id,
      ordinal: provenance.ordinal,
      parentId: entity.parentId ?? null,
      locked: entity.locked === true,
    });
    groups.set(provenance.instanceId, group);
  });

  return Object.freeze([...groups.entries()]
    .sort((left, right) => left[1].firstSceneIndex - right[1].firstSceneIndex)
    .map(([id, group]) => {
      const nodes = [...group.nodes].sort((left, right) =>
        left.ordinal - right.ordinal || left.id.localeCompare(right.id)
      );
      const memberIds = new Set(nodes.map((node) => node.id));
      const ordinals = new Set(nodes.map((node) => node.ordinal));
      return Object.freeze({
        id,
        sourceKind: group.sourceKind,
        sourceKey: group.sourceKey,
        insertionOffset: group.insertionOffset,
        nodes: Object.freeze(nodes),
        rootNodeIds: Object.freeze(nodes
          .filter((node) => node.parentId === null || !memberIds.has(node.parentId))
          .map((node) => node.id)),
        firstSceneIndex: group.firstSceneIndex,
        hasDuplicateOrdinals: ordinals.size !== nodes.length,
      });
    }));
}

/** Resolves exactly one source. A hash collision is treated as unavailable, never guessed. */
export function resolveStudioBg3dTemplateSourceByKey<Source extends { readonly id: string }>(
  sourceKey: string,
  sources: readonly Source[],
): Source | null {
  const matches = sources.filter(
    (source) => hashStudioBg3dTemplateSourceId(source.id) === sourceKey,
  );
  return matches.length === 1 ? matches[0]! : null;
}
