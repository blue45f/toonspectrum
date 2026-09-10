import { describe, expect, it } from "vitest";

import {
  assertStudioScene3dDocument,
  createStudioScene3dDocument,
  type StudioScene3dDocumentV1,
} from "./studio-scene3d-document";

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

function mutableDocument(): DeepMutable<StudioScene3dDocumentV1> {
  const cloned: unknown = structuredClone(
    createStudioScene3dDocument("contract-test"),
  );
  return cloned as DeepMutable<StudioScene3dDocumentV1>;
}

describe("unified Scene3D document contract hardening", () => {
  it("creates an isolated mutable fixture without weakening the readonly product contract", () => {
    const source = createStudioScene3dDocument("contract-test");
    const cloned: unknown = structuredClone(source);
    const mutable = cloned as DeepMutable<StudioScene3dDocumentV1>;

    mutable.output.semanticPasses.push("depth");

    expect(mutable.output.semanticPasses).toContain("depth");
    expect(source.output.semanticPasses).not.toContain("depth");
  });

  it("rejects unsupported render, output, environment, and duplicate pass values", () => {
    const badAa = mutableDocument();
    badAa.render.antialiasing = "fxaa" as never;
    expect(() => assertStudioScene3dDocument(badAa)).toThrowError(
      expect.objectContaining({ code: "INVALID_RENDER" }),
    );

    const badRatioMode = mutableDocument();
    badRatioMode.output.sourceAspectRatioMode = "guessed" as never;
    expect(() => assertStudioScene3dDocument(badRatioMode)).toThrowError(
      expect.objectContaining({ code: "INVALID_OUTPUT" }),
    );

    const duplicatePass = mutableDocument();
    duplicatePass.output.semanticPasses = ["beauty", "beauty"];
    expect(() => assertStudioScene3dDocument(duplicatePass)).toThrowError(
      expect.objectContaining({ code: "INVALID_OUTPUT" }),
    );

    const badFog = mutableDocument();
    badFog.environment.fog = {
      enabled: true,
      color: "#334455",
      near: 10,
      far: 5,
    };
    expect(() => assertStudioScene3dDocument(badFog)).toThrowError(
      expect.objectContaining({ code: "INVALID_ENVIRONMENT" }),
    );
  });

  it("rejects missing environment, shot, and hidden-entity references", () => {
    const missingEnvironmentAsset = mutableDocument();
    missingEnvironmentAsset.environment.mode = "asset";
    missingEnvironmentAsset.environment.assetId = "missing-env";
    expect(() => assertStudioScene3dDocument(missingEnvironmentAsset)).toThrowError(
      expect.objectContaining({ code: "MISSING_ENVIRONMENT_ASSET" }),
    );

    const missingShotCamera = mutableDocument();
    missingShotCamera.shots = [{
      id: "shot:bad-camera",
      name: "bad camera",
      cameraId: "camera:missing",
      hiddenEntityIds: [],
      renderProfileOverride: null,
    }];
    expect(() => assertStudioScene3dDocument(missingShotCamera)).toThrowError(
      expect.objectContaining({ code: "MISSING_SHOT_CAMERA" }),
    );

    const missingShotEntity = mutableDocument();
    missingShotEntity.shots = [{
      id: "shot:bad-entity",
      name: "bad entity",
      cameraId: "camera:main",
      hiddenEntityIds: ["entity:missing"],
      renderProfileOverride: null,
    }];
    expect(() => assertStudioScene3dDocument(missingShotEntity)).toThrowError(
      expect.objectContaining({ code: "MISSING_SHOT_ENTITY" }),
    );
  });

  it("rejects self-parenting and multi-node parent cycles", () => {
    const selfCycle = mutableDocument();
    selfCycle.entities = [{
      id: "entity:self",
      name: "self",
      kind: "primitive",
      primitiveKind: "box",
      color: "#ffffff",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      visible: true,
      locked: false,
      castShadow: true,
      receiveShadow: true,
      parentId: "entity:self",
    }];
    expect(() => assertStudioScene3dDocument(selfCycle)).toThrowError(
      expect.objectContaining({ code: "CYCLIC_ENTITY_PARENT" }),
    );

    const twoNodeCycle = mutableDocument();
    const base = selfCycle.entities[0]!;
    twoNodeCycle.entities = [
      { ...base, id: "entity:a", name: "a", parentId: "entity:b" },
      { ...base, id: "entity:b", name: "b", parentId: "entity:a" },
    ];
    expect(() => assertStudioScene3dDocument(twoNodeCycle)).toThrowError(
      expect.objectContaining({ code: "CYCLIC_ENTITY_PARENT" }),
    );
  });
});
