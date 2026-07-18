import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_GLB_MIME,
  normalizeStudioBg3dGlbAttachment,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";

import type { BgCustomModelInstance } from "./studio-background-3d-model";
import type { BgPrimitive } from "./studio-background-3d-primitives";

function hash(index: number): string {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}

function attachment(
  id: string,
  index: number,
  overrides: Record<string, unknown> = {}
): StudioBg3dModelAttachment {
  const normalized = normalizeStudioBg3dGlbAttachment({
    id,
    name: `검증된 배경 ${index}.glb`,
    mime: STUDIO_BG3D_GLB_MIME,
    byteSize: 1_000_000 + index,
    hash: hash(index),
    rights: {
      status: "owned",
      commercialUse: true,
      attributionRequired: false,
    },
    source: "local-library",
    ...overrides,
  });
  if (!normalized) throw new Error("Invalid attachment test fixture.");
  return normalized;
}

function primitive(id: string, offset = 0): BgPrimitive {
  return {
    id,
    kind: "box",
    position: [offset, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#C9A876",
    parentId: null,
    name: undefined,
  };
}

function customModel(
  id: string,
  modelId: string,
  offset = 0
): BgCustomModelInstance {
  return {
    id,
    modelId,
    position: [offset, 0, 1],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 2, 1],
    parentId: null,
    name: undefined,
  };
}

function canonicalDocument(
  overrides: Partial<StudioBg3dSceneDocument>
): StudioBg3dSceneDocument {
  const serialized = serializeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    ...overrides,
  });
  const parsed = parseStudioBg3dSceneDocument(serialized ?? "");
  if (!parsed) {
    const raw = JSON.parse(serialized ?? "{}");
    throw new Error("Invalid canonical document test fixture. Serialized:\n" + JSON.stringify(raw, null, 2));
  }
  return parsed;
}

function diagnosticCodes(
  diagnostics: readonly { readonly code: string }[]
): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("Studio BG3D runtime to document adapter", () => {
  it("preserves per-instance material edits across runtime/document hydration", () => {
    const storageId = "idb-material-model";
    const model = {
      ...customModel("material-node", storageId),
      materialOverride: {
        ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
        colorMode: "replace" as const,
        color: "#ff8844",
        colorStrength: 0.8,
        opacityMultiplier: 0.6,
        roughness: 0.25,
        wireframe: true,
      },
      animation: {
        clipIndex: 1,
        playing: true,
        loop: "repeat" as const,
        timeSeconds: 0.75,
        timeScale: 1.5,
        weight: 0.9,
      },
      pose: {
        enabled: true,
        weight: 0.6,
        joints: [{
          jointKey: "skin-0:joint-4",
          rotationOffset: [0.7071067811865475, 0, 0, 0.7071067811865475] as const,
        }],
      },
      morph: {
        enabled: true,
        weight: 0.7,
        targets: [{ targetKey: "mesh-1:target-0", weightOffset: -0.25 }],
      },
      constraints: {
        enabled: true,
        aims: [{
          jointKey: "skin-0:joint-4",
          target: [1, 2, 3] as const,
          axis: "+z" as const,
          weight: 0.8,
        }],
      },
    };
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives: [],
      customModels: [model],
      attachmentByStorageModelId: new Map([[storageId, attachment("material-attachment", 17)]]),
    });
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: adapted.document,
      storageModelIdByAttachmentId: new Map([["material-attachment", storageId]]),
    });

    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.document.nodes[0]).toMatchObject({
      kind: "model",
      materialOverride: model.materialOverride,
      animation: model.animation,
      pose: model.pose,
      morph: model.morph,
      constraints: model.constraints,
    });
    expect(hydrated.ok).toBe(true);
    expect(hydrated.customModels[0]?.materialOverride).toEqual(model.materialOverride);
    expect(hydrated.customModels[0]?.materialOverride).not.toBe(model.materialOverride);
    expect(hydrated.customModels[0]?.animation).toEqual(model.animation);
    expect(hydrated.customModels[0]?.animation).not.toBe(model.animation);
    expect(hydrated.customModels[0]?.pose).toEqual(model.pose);
    expect(hydrated.customModels[0]?.pose).not.toBe(model.pose);
    expect(hydrated.customModels[0]?.pose?.joints[0]).not.toBe(model.pose.joints[0]);
    expect(hydrated.customModels[0]?.morph).toEqual(model.morph);
    expect(hydrated.customModels[0]?.morph?.targets[0]).not.toBe(model.morph.targets[0]);
    expect(hydrated.customModels[0]?.constraints).toEqual(model.constraints);
    expect(hydrated.customModels[0]?.constraints?.aims[0]).not.toBe(model.constraints.aims[0]);
    expect(hydrated.customModels[0]?.constraints?.aims[0]?.target).not.toBe(model.constraints.aims[0].target);
  });

  it("preserves settings, maps runtime order deterministically, and never persists storage ids", () => {
    const firstStorageId = "idb-private-storage-key-alpha";
    const secondStorageId = "idb-private-storage-key-beta";
    const firstAttachment = attachment("scene-attachment-a", 1);
    const secondAttachment = attachment("scene-attachment-b", 2);
    const primitives = [primitive("primitive-a", 1), primitive("primitive-b", 2)];
    const customModels = [
      customModel("model-node-a", firstStorageId, 3),
      customModel("model-node-b", secondStorageId, 4),
    ];
    const base = canonicalDocument({
      camera: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, position: [9, 4, 7], target: [0, 1, 0], fovDegrees: 42 },
      background: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background, mode: "color", color: "#223344", skyPresetId: "night" },
      output: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
        exportHeight: 1280,
      },
    });
    const primitiveSnapshot = JSON.stringify(primitives);
    const modelSnapshot = JSON.stringify(customModels);
    const baseSnapshot = serializeStudioBg3dSceneDocument(base);
    const bindings = new Map([
      [firstStorageId, firstAttachment],
      [secondStorageId, secondAttachment],
    ]);

    const first = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: bindings,
      baseDocument: base,
    });
    const second = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: bindings,
      baseDocument: base,
    });

    expect(first.serialized).toBe(second.serialized);
    expect(first.document.nodes.map((node) => node.id)).toEqual([
      "primitive-a",
      "primitive-b",
      "model-node-a",
      "model-node-b",
    ]);
    expect(first.document.attachments.map((item) => item.id)).toEqual([
      "scene-attachment-a",
      "scene-attachment-b",
    ]);
    expect(first.document.camera.fovDegrees).toBe(42);
    expect(first.document.background.color).toBe("#223344");
    expect(first.document.output.exportHeight).toBe(1280);
    expect(first.document.nodes[0]).toMatchObject({
      kind: "primitive",
      primitiveKind: "box",
      color: "#c9a876",
      transform: { position: [1, 0.5, 0] },
    });
    expect(first.serialized).not.toContain(firstStorageId);
    expect(first.serialized).not.toContain(secondStorageId);
    expect(parseStudioBg3dSceneDocument(first.serialized)).toEqual(first.document);
    expect(serializeStudioBg3dSceneDocument(first.document)).toBe(first.serialized);
    expect(first.counts).toEqual({
      inputPrimitives: 2,
      inputCustomModels: 2,
      emittedPrimitives: 2,
      emittedCustomModels: 2,
      droppedPrimitives: 0,
      droppedCustomModels: 0,
    });
    expect(first.diagnostics).toEqual([]);
    expect(JSON.stringify(primitives)).toBe(primitiveSnapshot);
    expect(JSON.stringify(customModels)).toBe(modelSnapshot);
    expect(serializeStudioBg3dSceneDocument(base)).toBe(baseSnapshot);
    expect(first.document.nodes[0]?.transform.position).not.toBe(primitives[0]?.position);
  });

  it("drops unresolved, invalid, and identity bindings with bounded diagnostics", () => {
    const validStorageId = "idb-valid-model";
    const repeatedStorageId = "idb-valid-model-alias";
    const invalidStorageId = "idb-invalid-model";
    const identityStorageId = "same-as-attachment";
    const validAttachment = attachment("logical-attachment", 10);
    const bindings = new Map<string, StudioBg3dModelAttachment>([
      [validStorageId, validAttachment],
      [repeatedStorageId, validAttachment],
      [identityStorageId, attachment(identityStorageId, 11)],
    ]);
    bindings.set(
      invalidStorageId,
      { ...validAttachment, mime: "model/gltf+json" } as unknown as StudioBg3dModelAttachment
    );
    const result = adaptStudioBg3dRuntimeToDocument({
      primitives: [],
      customModels: [
        customModel("unresolved-node", "idb-missing"),
        customModel("invalid-node", invalidStorageId),
        customModel("identity-node", identityStorageId),
        customModel("valid-node", validStorageId),
        customModel("valid-node-2", repeatedStorageId),
      ],
      attachmentByStorageModelId: bindings,
    });

    expect(result.document.nodes.map((node) => node.id)).toEqual([
      "valid-node",
      "valid-node-2",
    ]);
    expect(result.document.attachments).toHaveLength(1);
    expect(result.counts.droppedCustomModels).toBe(3);
    expect(diagnosticCodes(result.diagnostics)).toEqual(expect.arrayContaining([
      "unresolved-storage-model",
      "invalid-attachment-binding",
      "unsafe-identity-binding",
    ]));
    expect(result.diagnostics.every((diagnostic) => !("modelId" in diagnostic))).toBe(true);
  });

  it("rejects conflicting attachment ids, hashes, duplicate node ids, and invalid primitives", () => {
    const first = attachment("logical-a", 21);
    const sameIdConflict = attachment("logical-a", 22);
    const sameHashConflict = attachment("logical-b", 21);
    const result = adaptStudioBg3dRuntimeToDocument({
      primitives: [
        primitive("shared-node"),
        { ...primitive("invalid/node"), color: "not-a-color" },
      ],
      customModels: [
        customModel("valid-model", "idb-valid"),
        customModel("same-id-conflict", "idb-same-id"),
        customModel("same-hash-conflict", "idb-same-hash"),
        customModel("shared-node", "idb-valid"),
      ],
      attachmentByStorageModelId: new Map([
        ["idb-valid", first],
        ["idb-same-id", sameIdConflict],
        ["idb-same-hash", sameHashConflict],
      ]),
    });

    // The first encountered metadata is determined by runtime order; later conflicting values drop.
    expect(result.document.nodes.map((node) => node.id)).toEqual([
      "shared-node",
      "valid-model",
    ]);
    expect(result.document.attachments.map((item) => item.hash)).toEqual([hash(21)]);
    expect(result.counts).toMatchObject({
      droppedPrimitives: 1,
      droppedCustomModels: 3,
    });
    expect(diagnosticCodes(result.diagnostics)).toEqual(expect.arrayContaining([
      "invalid-primitive",
      "conflicting-attachment-hash",
      "duplicate-node-id",
      "conflicting-attachment-id",
    ]));
  });

  it("honors the canonical node budget and keeps the earliest runtime records", () => {
    const base = canonicalDocument({
      budgets: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets,
        complexity: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity,
          maxNodes: 3,
        },
      },
    });
    const result = adaptStudioBg3dRuntimeToDocument({
      primitives: [
        primitive("p-1"),
        primitive("p-2"),
        primitive("p-3"),
        primitive("p-4"),
      ],
      customModels: [customModel("m-1", "idb-model")],
      attachmentByStorageModelId: new Map([["idb-model", attachment("logical", 30)]]),
      baseDocument: base,
    });

    expect(result.document.nodes.map((node) => node.id)).toEqual(["p-1", "p-2", "p-3"]);
    expect(result.document.attachments).toEqual([]);
    expect(result.counts).toMatchObject({
      emittedPrimitives: 3,
      emittedCustomModels: 0,
      droppedPrimitives: 1,
      droppedCustomModels: 1,
    });
    expect(diagnosticCodes(result.diagnostics)).toContain("node-budget-exceeded");
  });

  it("falls back to default settings for a hostile base without mutating input arrays", () => {
    const frozenPrimitive = Object.freeze({
      ...primitive("safe-node"),
      position: Object.freeze([0, 0.5, 0]) as unknown as [number, number, number],
      rotation: Object.freeze([0, 0, 0]) as unknown as [number, number, number],
      scale: Object.freeze([1, 1, 1]) as unknown as [number, number, number],
    });
    const primitives = Object.freeze([frozenPrimitive]);
    const hostileBase = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: null,
    } as unknown as StudioBg3dSceneDocument;
    const result = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels: [],
      attachmentByStorageModelId: new Map(),
      baseDocument: hostileBase,
    });

    expect(result.document.camera).toEqual(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera);
    expect(diagnosticCodes(result.diagnostics)).toContain("invalid-base-document");
    expect(primitives[0]?.position).toEqual([0, 0.5, 0]);
  });
});

describe("Studio BG3D document to runtime adapter", () => {
  it("hydrates fresh arrays through explicit attachment bindings without mutating the document", () => {
    const firstStorageId = "device-idb-key-one";
    const secondStorageId = "device-idb-key-two";
    const source = adaptStudioBg3dRuntimeToDocument({
      primitives: [primitive("primitive-a")],
      customModels: [
        customModel("model-a", "source-idb-one"),
        customModel("model-b", "source-idb-two"),
      ],
      attachmentByStorageModelId: new Map([
        ["source-idb-one", attachment("attachment-a", 40)],
        ["source-idb-two", attachment("attachment-b", 41)],
      ]),
    });
    const documentSnapshot = source.serialized;
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: source.document,
      storageModelIdByAttachmentId: new Map([
        ["attachment-a", firstStorageId],
        ["attachment-b", secondStorageId],
      ]),
    });

    expect(hydrated.ok).toBe(true);
    expect(hydrated.primitives).toEqual([
      { ...primitive("primitive-a"), color: "#c9a876", visible: true, locked: false, parentId: null, name: undefined },
    ]);
    expect(hydrated.customModels.map((model) => [model.id, model.modelId])).toEqual([
      ["model-a", firstStorageId],
      ["model-b", secondStorageId],
    ]);
    expect(hydrated.counts.droppedCustomModels).toBe(0);
    expect(hydrated.primitives[0]?.position).not.toBe(
      source.document.nodes[0]?.transform.position
    );
    expect(serializeStudioBg3dSceneDocument(source.document)).toBe(documentSnapshot);
  });

  it("drops missing, identity, invalid, and conflicting storage bindings deterministically", () => {
    const source = adaptStudioBg3dRuntimeToDocument({
      primitives: [],
      customModels: [
        customModel("model-a", "source-a"),
        customModel("model-b", "source-b"),
        customModel("model-c", "source-c"),
        customModel("model-d", "source-d"),
      ],
      attachmentByStorageModelId: new Map([
        ["source-a", attachment("attachment-a", 50)],
        ["source-b", attachment("attachment-b", 51)],
        ["source-c", attachment("attachment-c", 52)],
        ["source-d", attachment("attachment-d", 53)],
      ]),
    });
    const sharedStorageId = "shared-idb-key";
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: source.document,
      storageModelIdByAttachmentId: new Map([
        ["attachment-a", sharedStorageId],
        ["attachment-b", sharedStorageId],
        ["attachment-c", "attachment-c"],
        ["attachment-d", "bad\u0000storage-key"],
      ]),
    });

    expect(hydrated.customModels.map((model) => model.id)).toEqual(["model-a"]);
    expect(hydrated.counts.droppedCustomModels).toBe(3);
    expect(diagnosticCodes(hydrated.diagnostics)).toEqual(expect.arrayContaining([
      "conflicting-storage-binding",
      "unsafe-identity-binding",
      "invalid-storage-binding",
    ]));

    const missing = hydrateStudioBg3dDocumentToRuntime({
      document: source.document,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(missing.customModels).toEqual([]);
    expect(missing.counts.droppedCustomModels).toBe(4);
    expect(diagnosticCodes(missing.diagnostics)).toContain("unresolved-attachment");
  });

  it("fails closed for an incomplete current document", () => {
    const result = hydrateStudioBg3dDocumentToRuntime({
      document: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        nodes: null,
      } as unknown as StudioBg3dSceneDocument,
      storageModelIdByAttachmentId: new Map(),
    });

    expect(result.ok).toBe(false);
    expect(result.primitives).toEqual([]);
    expect(result.customModels).toEqual([]);
    expect(diagnosticCodes(result.diagnostics)).toEqual(["invalid-scene-document"]);
  });
});
