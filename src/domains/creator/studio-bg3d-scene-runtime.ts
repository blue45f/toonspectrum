/**
 * Pure boundary between StudioBackground3D's legacy runtime arrays and the engine-neutral scene
 * document. IndexedDB model ids are accepted only as ephemeral lookup keys and are never copied
 * into a persisted document.
 */

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_PRIMITIVE_KINDS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  normalizeStudioBg3dGlbAttachment,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
  type StudioBg3dSceneNode,
} from "./studio-bg3d-scene-document";

import type { BgCustomModelInstance } from "./studio-background-3d-model";
import type {
  BgPrimitive,
  BgPrimitiveKind,
} from "./studio-background-3d-primitives";

export const STUDIO_BG3D_RUNTIME_ADAPTER_MAX_SCAN_ITEMS =
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES * 4;
export const STUDIO_BG3D_RUNTIME_ADAPTER_MAX_DIAGNOSTICS = 128;

export type StudioBg3dRuntimeAdapterDirection =
  | "runtime-to-document"
  | "document-to-runtime";

export type StudioBg3dRuntimeAdapterDiagnosticCode =
  | "invalid-base-document"
  | "invalid-scene-document"
  | "invalid-runtime-collection"
  | "input-scan-limit-exceeded"
  | "invalid-primitive"
  | "invalid-custom-model"
  | "duplicate-node-id"
  | "node-budget-exceeded"
  | "unresolved-storage-model"
  | "invalid-attachment-binding"
  | "unsafe-identity-binding"
  | "conflicting-attachment-id"
  | "conflicting-attachment-hash"
  | "attachment-budget-exceeded"
  | "model-byte-budget-exceeded"
  | "persistence-byte-budget-exceeded"
  | "unresolved-attachment"
  | "invalid-storage-binding"
  | "conflicting-storage-binding";

export interface StudioBg3dRuntimeAdapterDiagnostic {
  readonly direction: StudioBg3dRuntimeAdapterDirection;
  readonly code: StudioBg3dRuntimeAdapterDiagnosticCode;
  readonly source: "base" | "primitive" | "custom-model" | "document";
  /** Input-array index; intentionally absent for aggregate or document-level diagnostics. */
  readonly sourceIndex?: number;
  /** Included only when it is already a canonical-safe scene node id. */
  readonly nodeId?: string;
  /** Number of affected records represented by this bounded diagnostic. */
  readonly count: number;
}

export interface StudioBg3dRuntimeAdapterCounts {
  readonly inputPrimitives: number;
  readonly inputCustomModels: number;
  readonly emittedPrimitives: number;
  readonly emittedCustomModels: number;
  readonly droppedPrimitives: number;
  readonly droppedCustomModels: number;
}

export interface StudioBg3dRuntimeToDocumentInput {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  /** Ephemeral IndexedDB id -> verified, scene-local canonical attachment metadata. */
  readonly attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>;
  /** Only settings are preserved; base nodes and attachments are intentionally replaced. */
  readonly baseDocument?: StudioBg3dSceneDocument;
}

export interface StudioBg3dRuntimeToDocumentResult {
  readonly document: StudioBg3dSceneDocument;
  readonly serialized: string;
  readonly diagnostics: readonly StudioBg3dRuntimeAdapterDiagnostic[];
  readonly omittedDiagnosticCount: number;
  readonly counts: StudioBg3dRuntimeAdapterCounts;
}

export interface StudioBg3dDocumentToRuntimeInput {
  readonly document: StudioBg3dSceneDocument;
  /** Canonical attachment id -> ephemeral IndexedDB id for this device/session. */
  readonly storageModelIdByAttachmentId: ReadonlyMap<string, string>;
}

export interface StudioBg3dDocumentToRuntimeResult {
  readonly ok: boolean;
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly diagnostics: readonly StudioBg3dRuntimeAdapterDiagnostic[];
  readonly omittedDiagnosticCount: number;
  readonly counts: StudioBg3dRuntimeAdapterCounts;
}

interface PendingNode {
  readonly node: StudioBg3dSceneNode;
  readonly source: "primitive" | "custom-model";
  readonly sourceIndex: number;
}

interface StrictRoundTrip {
  readonly document: StudioBg3dSceneDocument;
  readonly serialized: string;
}

const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const COLOR_PATTERN = /^#[a-f0-9]{6}$/iu;
const FORBIDDEN_ID_SET = new Set(["constructor", "prototype", "__proto__"]);
const PRIMITIVE_KIND_SET = new Set<string>(STUDIO_BG3D_PRIMITIVE_KINDS);
const UTF8_ENCODER = new TextEncoder();

class DiagnosticCollector {
  readonly #direction: StudioBg3dRuntimeAdapterDirection;
  readonly #items: StudioBg3dRuntimeAdapterDiagnostic[] = [];
  #total = 0;

  constructor(direction: StudioBg3dRuntimeAdapterDirection) {
    this.#direction = direction;
  }

  add(
    code: StudioBg3dRuntimeAdapterDiagnosticCode,
    source: StudioBg3dRuntimeAdapterDiagnostic["source"],
    options: { readonly sourceIndex?: number; readonly nodeId?: string; readonly count?: number } = {}
  ): void {
    const count = Math.max(1, Math.floor(options.count ?? 1));
    this.#total += 1;
    if (this.#items.length >= STUDIO_BG3D_RUNTIME_ADAPTER_MAX_DIAGNOSTICS) return;
    this.#items.push(Object.freeze({
      direction: this.#direction,
      code,
      source,
      ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
      ...(options.nodeId === undefined ? {} : { nodeId: options.nodeId }),
      count,
    }));
  }

  finish(): {
    readonly diagnostics: readonly StudioBg3dRuntimeAdapterDiagnostic[];
    readonly omittedDiagnosticCount: number;
  } {
    return {
      diagnostics: Object.freeze([...this.#items]),
      omittedDiagnosticCount: Math.max(0, this.#total - this.#items.length),
    };
  }
}

function isSafeNodeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NODE_ID_PATTERN.test(value) &&
    !FORBIDDEN_ID_SET.has(value.toLowerCase())
  );
}

function isFiniteVec3(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

function isSafeStorageModelId(value: unknown): value is string {
  if (typeof value !== "string" || !value || UTF8_ENCODER.encode(value).byteLength > 512) {
    return false;
  }
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 0x1f || point === 0x7f) return false;
  }
  return true;
}

function strictRoundTrip(raw: unknown): StrictRoundTrip | null {
  const serialized = serializeStudioBg3dSceneDocument(raw);
  if (!serialized) return null;
  const document = parseStudioBg3dSceneDocument(serialized);
  if (!document || serializeStudioBg3dSceneDocument(document) !== serialized) return null;
  return { document, serialized };
}

/** Internal runtime arrays are editor state, so sanitize them explicitly before persistence. */
function normalizedRuntimeRoundTrip(raw: unknown): StrictRoundTrip | null {
  return strictRoundTrip(normalizeStudioBg3dSceneDocument(raw));
}

function settingsOnlyDocument(
  base: StudioBg3dSceneDocument,
  attachments: readonly StudioBg3dModelAttachment[],
  nodes: readonly StudioBg3dSceneNode[]
): StudioBg3dSceneDocument {
  return {
    kind: base.kind,
    version: base.version,
    camera: base.camera,
    render: base.render,
    background: base.background,
    lighting: base.lighting,
    quality: base.quality,
    output: base.output,
    budgets: base.budgets,
    attachments,
    nodes,
  };
}

function canonicalBaseDocument(
  raw: StudioBg3dSceneDocument | undefined,
  diagnostics: DiagnosticCollector
): StudioBg3dSceneDocument {
  if (!raw) return DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
  const roundTrip = strictRoundTrip(raw);
  if (roundTrip) return roundTrip.document;
  diagnostics.add("invalid-base-document", "base");
  return DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
}

function readMapValue<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key): Value | undefined {
  try {
    return map.get(key);
  } catch {
    return undefined;
  }
}

function primitiveNodeFromRuntime(value: BgPrimitive): StudioBg3dSceneNode | null {
  if (
    !isSafeNodeId(value?.id) ||
    typeof value?.kind !== "string" ||
    !PRIMITIVE_KIND_SET.has(value.kind) ||
    !isFiniteVec3(value.position) ||
    !isFiniteVec3(value.rotation) ||
    !isFiniteVec3(value.scale) ||
    typeof value.color !== "string" ||
    !COLOR_PATTERN.test(value.color)
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.kind,
    kind: "primitive",
    primitiveKind: value.kind as BgPrimitiveKind,
    color: value.color,
    transform: {
      position: [...value.position],
      rotation: [...value.rotation],
      scale: [...value.scale],
    },
    visible: value.visible !== false,
    locked: value.locked === true,
    castsShadow: true,
    receivesShadow: true,
  };
}

function modelNodeFromRuntime(
  value: BgCustomModelInstance,
  attachmentId: string
): StudioBg3dSceneNode | null {
  if (
    !isSafeNodeId(value?.id) ||
    !isFiniteVec3(value.position) ||
    !isFiniteVec3(value.rotation) ||
    !isFiniteVec3(value.scale)
  ) {
    return null;
  }
  return {
    id: value.id,
    name: "GLB 모델",
    kind: "model",
    attachmentId,
    transform: {
      position: [...value.position],
      rotation: [...value.rotation],
      scale: [...value.scale],
    },
    visible: value.visible !== false,
    locked: value.locked === true,
    castsShadow: true,
    receivesShadow: true,
  };
}

function nodesMatchPrefix(
  pending: readonly PendingNode[],
  count: number,
  document: StudioBg3dSceneDocument
): boolean {
  if (document.nodes.length !== count) return false;
  for (let index = 0; index < count; index += 1) {
    const expected = pending[index]?.node;
    const actual = document.nodes[index];
    if (
      !expected ||
      !actual ||
      expected.id !== actual.id ||
      expected.kind !== actual.kind ||
      (expected.kind === "model" &&
        (actual.kind !== "model" || expected.attachmentId !== actual.attachmentId))
    ) {
      return false;
    }
  }
  return true;
}

function fitPendingNodes(
  base: StudioBg3dSceneDocument,
  pending: readonly PendingNode[],
  orderedAttachments: readonly StudioBg3dModelAttachment[]
): { readonly roundTrip: StrictRoundTrip; readonly count: number } {
  let lower = 0;
  let upper = pending.length;
  let best: { readonly roundTrip: StrictRoundTrip; readonly count: number } | null = null;
  while (lower <= upper) {
    const count = Math.floor((lower + upper) / 2);
    const nodes = pending.slice(0, count).map((entry) => entry.node);
    const referenced = new Set(
      nodes.flatMap((node) => node.kind === "model" ? [node.attachmentId] : [])
    );
    const attachments = orderedAttachments.filter((attachment) => referenced.has(attachment.id));
    const roundTrip = normalizedRuntimeRoundTrip(settingsOnlyDocument(base, attachments, nodes));
    if (roundTrip && nodesMatchPrefix(pending, count, roundTrip.document)) {
      best = { roundTrip, count };
      lower = count + 1;
    } else {
      upper = count - 1;
    }
  }
  if (best) return best;
  const empty = normalizedRuntimeRoundTrip(
    settingsOnlyDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, [], [])
  );
  if (!empty) throw new Error("Invalid internal Studio BG3D runtime adapter defaults.");
  return { roundTrip: empty, count: 0 };
}

/** Converts legacy runtime arrays to a strict, persistence-safe canonical scene document. */
export function adaptStudioBg3dRuntimeToDocument(
  input: StudioBg3dRuntimeToDocumentInput
): StudioBg3dRuntimeToDocumentResult {
  const diagnostics = new DiagnosticCollector("runtime-to-document");
  const base = canonicalBaseDocument(input.baseDocument, diagnostics);
  const primitives = Array.isArray(input.primitives) ? input.primitives : [];
  const customModels = Array.isArray(input.customModels) ? input.customModels : [];
  if (!Array.isArray(input.primitives)) diagnostics.add("invalid-runtime-collection", "primitive");
  if (!Array.isArray(input.customModels)) {
    diagnostics.add("invalid-runtime-collection", "custom-model");
  }

  const pending: PendingNode[] = [];
  const nodeIds = new Set<string>();
  const attachments: StudioBg3dModelAttachment[] = [];
  const attachmentById = new Map<string, { attachment: StudioBg3dModelAttachment; json: string }>();
  const attachmentIdByHash = new Map<string, string>();
  let cumulativeModelBytes = 0;
  const nodeLimit = Math.min(
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    base.budgets.complexity.maxNodes
  );

  const primitiveScanCount = Math.min(
    primitives.length,
    STUDIO_BG3D_RUNTIME_ADAPTER_MAX_SCAN_ITEMS
  );
  for (let index = 0; index < primitiveScanCount; index += 1) {
    const node = primitiveNodeFromRuntime(primitives[index] as BgPrimitive);
    if (!node) {
      diagnostics.add("invalid-primitive", "primitive", { sourceIndex: index });
      continue;
    }
    if (nodeIds.has(node.id)) {
      diagnostics.add("duplicate-node-id", "primitive", {
        sourceIndex: index,
        nodeId: node.id,
      });
      continue;
    }
    if (pending.length >= nodeLimit) {
      diagnostics.add("node-budget-exceeded", "primitive", {
        sourceIndex: index,
        nodeId: node.id,
      });
      continue;
    }
    pending.push({ node, source: "primitive", sourceIndex: index });
    nodeIds.add(node.id);
  }
  if (primitives.length > primitiveScanCount) {
    diagnostics.add("input-scan-limit-exceeded", "primitive", {
      count: primitives.length - primitiveScanCount,
    });
  }

  const customModelScanCount = Math.min(
    customModels.length,
    STUDIO_BG3D_RUNTIME_ADAPTER_MAX_SCAN_ITEMS
  );
  for (let index = 0; index < customModelScanCount; index += 1) {
    const instance = customModels[index] as BgCustomModelInstance;
    if (
      !instance ||
      !isSafeNodeId(instance.id) ||
      !isSafeStorageModelId(instance.modelId) ||
      !isFiniteVec3(instance.position) ||
      !isFiniteVec3(instance.rotation) ||
      !isFiniteVec3(instance.scale)
    ) {
      diagnostics.add("invalid-custom-model", "custom-model", { sourceIndex: index });
      continue;
    }
    if (nodeIds.has(instance.id)) {
      diagnostics.add("duplicate-node-id", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }
    if (pending.length >= nodeLimit) {
      diagnostics.add("node-budget-exceeded", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }

    const rawAttachment = readMapValue(input.attachmentByStorageModelId, instance.modelId);
    if (rawAttachment === undefined) {
      diagnostics.add("unresolved-storage-model", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }
    const attachment = normalizeStudioBg3dGlbAttachment(rawAttachment);
    if (!attachment) {
      diagnostics.add("invalid-attachment-binding", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }
    if (attachment.id === instance.modelId) {
      diagnostics.add("unsafe-identity-binding", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }

    const json = JSON.stringify(attachment);
    const existingById = attachmentById.get(attachment.id);
    if (existingById && existingById.json !== json) {
      diagnostics.add("conflicting-attachment-id", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }
    const existingIdForHash = attachmentIdByHash.get(attachment.hash);
    if (existingIdForHash && existingIdForHash !== attachment.id) {
      diagnostics.add("conflicting-attachment-hash", "custom-model", {
        sourceIndex: index,
        nodeId: instance.id,
      });
      continue;
    }
    if (!existingById) {
      if (attachments.length >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS) {
        diagnostics.add("attachment-budget-exceeded", "custom-model", {
          sourceIndex: index,
          nodeId: instance.id,
        });
        continue;
      }
      if (
        cumulativeModelBytes + attachment.byteSize >
        base.budgets.complexity.maxModelBytes
      ) {
        diagnostics.add("model-byte-budget-exceeded", "custom-model", {
          sourceIndex: index,
          nodeId: instance.id,
        });
        continue;
      }
      attachments.push(attachment);
      attachmentById.set(attachment.id, { attachment, json });
      attachmentIdByHash.set(attachment.hash, attachment.id);
      cumulativeModelBytes += attachment.byteSize;
    }

    const node = modelNodeFromRuntime(instance, attachment.id);
    if (!node) {
      diagnostics.add("invalid-custom-model", "custom-model", { sourceIndex: index });
      continue;
    }
    pending.push({ node, source: "custom-model", sourceIndex: index });
    nodeIds.add(node.id);
  }
  if (customModels.length > customModelScanCount) {
    diagnostics.add("input-scan-limit-exceeded", "custom-model", {
      count: customModels.length - customModelScanCount,
    });
  }

  const fitted = fitPendingNodes(base, pending, attachments);
  if (fitted.count < pending.length) {
    const tail = pending.slice(fitted.count);
    const droppedPrimitives = tail.filter((entry) => entry.source === "primitive").length;
    const droppedModels = tail.length - droppedPrimitives;
    if (droppedPrimitives > 0) {
      diagnostics.add("persistence-byte-budget-exceeded", "primitive", {
        count: droppedPrimitives,
      });
    }
    if (droppedModels > 0) {
      diagnostics.add("persistence-byte-budget-exceeded", "custom-model", {
        count: droppedModels,
      });
    }
  }

  const emittedPrimitives = fitted.roundTrip.document.nodes.filter(
    (node) => node.kind === "primitive"
  ).length;
  const emittedCustomModels = fitted.roundTrip.document.nodes.length - emittedPrimitives;
  const finished = diagnostics.finish();
  return {
    document: fitted.roundTrip.document,
    serialized: fitted.roundTrip.serialized,
    ...finished,
    counts: Object.freeze({
      inputPrimitives: primitives.length,
      inputCustomModels: customModels.length,
      emittedPrimitives,
      emittedCustomModels,
      droppedPrimitives: primitives.length - emittedPrimitives,
      droppedCustomModels: customModels.length - emittedCustomModels,
    }),
  };
}

/** Hydrates a strict canonical document into fresh legacy runtime arrays using explicit bindings. */
export function hydrateStudioBg3dDocumentToRuntime(
  input: StudioBg3dDocumentToRuntimeInput
): StudioBg3dDocumentToRuntimeResult {
  const diagnostics = new DiagnosticCollector("document-to-runtime");
  const canonical = strictRoundTrip(input.document);
  if (!canonical) {
    diagnostics.add("invalid-scene-document", "document");
    const finished = diagnostics.finish();
    return {
      ok: false,
      primitives: [],
      customModels: [],
      ...finished,
      counts: Object.freeze({
        inputPrimitives: 0,
        inputCustomModels: 0,
        emittedPrimitives: 0,
        emittedCustomModels: 0,
        droppedPrimitives: 0,
        droppedCustomModels: 0,
      }),
    };
  }

  const primitives: BgPrimitive[] = [];
  const customModels: BgCustomModelInstance[] = [];
  const attachmentIdByStorageModelId = new Map<string, string>();
  let inputPrimitives = 0;
  let inputCustomModels = 0;
  for (let index = 0; index < canonical.document.nodes.length; index += 1) {
    const node = canonical.document.nodes[index];
    if (node.kind === "primitive") {
      inputPrimitives += 1;
      primitives.push({
        id: node.id,
        kind: node.primitiveKind,
        color: node.color,
        position: [...node.transform.position],
        rotation: [...node.transform.rotation],
        scale: [...node.transform.scale],
        visible: node.visible !== false,
        locked: node.locked === true,
      });
      continue;
    }

    inputCustomModels += 1;
    const storageModelId = readMapValue(
      input.storageModelIdByAttachmentId,
      node.attachmentId
    );
    if (storageModelId === undefined) {
      diagnostics.add("unresolved-attachment", "custom-model", {
        sourceIndex: index,
        nodeId: node.id,
      });
      continue;
    }
    if (!isSafeStorageModelId(storageModelId)) {
      diagnostics.add("invalid-storage-binding", "custom-model", {
        sourceIndex: index,
        nodeId: node.id,
      });
      continue;
    }
    if (storageModelId === node.attachmentId) {
      diagnostics.add("unsafe-identity-binding", "custom-model", {
        sourceIndex: index,
        nodeId: node.id,
      });
      continue;
    }
    const existingAttachmentId = attachmentIdByStorageModelId.get(storageModelId);
    if (existingAttachmentId && existingAttachmentId !== node.attachmentId) {
      diagnostics.add("conflicting-storage-binding", "custom-model", {
        sourceIndex: index,
        nodeId: node.id,
      });
      continue;
    }
    attachmentIdByStorageModelId.set(storageModelId, node.attachmentId);
    customModels.push({
      id: node.id,
      modelId: storageModelId,
      position: [...node.transform.position],
      rotation: [...node.transform.rotation],
      scale: [...node.transform.scale],
      visible: node.visible !== false,
      locked: node.locked === true,
    });
  }

  const finished = diagnostics.finish();
  return {
    ok: true,
    primitives,
    customModels,
    ...finished,
    counts: Object.freeze({
      inputPrimitives,
      inputCustomModels,
      emittedPrimitives: primitives.length,
      emittedCustomModels: customModels.length,
      droppedPrimitives: inputPrimitives - primitives.length,
      droppedCustomModels: inputCustomModels - customModels.length,
    }),
  };
}
