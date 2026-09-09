import { describe, expect, it } from "vitest";

import { createStudioScene3dDocument, type StudioScene3dAssetReference } from "./studio-scene3d-document";
import { applyStudioScene3dTemplateAtomically } from "./studio-scene3d-template-transaction";

const productionAdmission = Object.freeze({
  status: "production" as const,
  score: 98,
  blockers: Object.freeze([]),
  warnings: Object.freeze([]),
});

function asset(id: string): StudioScene3dAssetReference {
  return Object.freeze({
    id,
    kind: "mesh",
    version: "1",
    contentSha256: "a".repeat(64),
    uri: `/assets/3d/${id}.glb`,
    mime: "model/gltf-binary",
    byteSize: 1024,
    rights: Object.freeze({
      commercialUse: true,
      redistribution: true,
      derivativeUse: true,
      licenseName: "CC0-1.0",
    }),
    quality: Object.freeze({
      accepted: true,
      score: 98,
      reportUri: `/assets/3d/${id}.quality.json`,
    }),
  });
}

function template(id: string, assetId: string) {
  const base = createStudioScene3dDocument(`template:${id}`, "2026-09-10T00:00:00.000Z");
  const model = asset(assetId);
  return Object.freeze({
    id,
    label: id,
    document: Object.freeze({
      ...base,
      assets: Object.freeze([model]),
      entities: Object.freeze([{
        id: `entity:${id}`,
        name: id,
        kind: "model" as const,
        assetId: model.id,
        materialVariantId: null,
        transform: Object.freeze({
          position: Object.freeze([0, 0, 0] as const),
          rotation: Object.freeze([0, 0, 0, 1] as const),
          scale: Object.freeze([1, 1, 1] as const),
        }),
        visible: true,
        locked: false,
        castShadow: true,
        receiveShadow: true,
        parentId: null,
      }]),
    }),
  });
}

describe("Studio Scene3D atomic template switching", () => {
  it("commits every valid template selection as a new scene revision", () => {
    const initial = createStudioScene3dDocument("scene:work", "2026-09-10T00:00:00.000Z");
    const room = template("room", "room");
    const street = template("street", "street");

    const first = applyStudioScene3dTemplateAtomically(initial, room, {
      now: "2026-09-10T00:01:00.000Z",
      assetAdmissionById: new Map([["room", productionAdmission]]),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("first template should pass");
    expect(first.document.documentId).toBe("scene:work");
    expect(first.document.entities[0]?.name).toBe("room");
    expect(first.document.revision).toBe(1);

    const second = applyStudioScene3dTemplateAtomically(first.document, street, {
      now: "2026-09-10T00:02:00.000Z",
      assetAdmissionById: new Map([["street", productionAdmission]]),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("second template should pass");
    expect(second.document.entities[0]?.name).toBe("street");
    expect(second.document.revision).toBe(2);
  });

  it("leaves the previous scene byte-for-byte referenced when asset validation fails", () => {
    const initial = createStudioScene3dDocument("scene:work", "2026-09-10T00:00:00.000Z");
    const room = template("room", "room");

    const failed = applyStudioScene3dTemplateAtomically(initial, room, {
      assetAdmissionById: new Map(),
    });

    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error("template should fail");
    expect(failed.code).toBe("asset-admission-missing");
    expect(failed.document).toBe(initial);
    expect(initial.revision).toBe(0);
  });
});
