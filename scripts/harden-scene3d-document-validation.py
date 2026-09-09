from pathlib import Path

path = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-document.ts")
text = path.read_text(encoding="utf-8")

anchor = "function ensureUnique(values: readonly string[], label: string): void {\n"
helpers = '''const STUDIO_SCENE3D_RENDER_PROFILES = new Set([
  "webtoon", "anime", "neutral", "pbr", "sketch",
]);
const STUDIO_SCENE3D_SEMANTIC_PASSES = new Set([
  "beauty", "line", "shadow", "depth", "normal", "object-id", "material-id",
]);

function isEnvironment(value: unknown): value is StudioScene3dEnvironment {
  if (!isRecord(value)) return false;
  if (!["transparent", "color", "procedural-sky", "asset"].includes(String(value.mode))) {
    return false;
  }
  if (!isString(value.color, 32)) return false;
  if (value.assetId !== null && !isString(value.assetId)) return false;
  if (value.mode === "asset" && !isString(value.assetId)) return false;
  if (
    value.proceduralSkyPresetId !== undefined
    && value.proceduralSkyPresetId !== null
    && !isString(value.proceduralSkyPresetId, 128)
  ) return false;
  if (!isFiniteNumber(value.rotationDegrees) || Math.abs(value.rotationDegrees) > 1_000_000) {
    return false;
  }
  if (!isFiniteNumber(value.intensity) || value.intensity < 0 || value.intensity > 100_000) {
    return false;
  }
  if (typeof value.groundEnabled !== "boolean") return false;
  if (!isFiniteNumber(value.groundHeight) || Math.abs(value.groundHeight) > 100_000) return false;
  if (
    !isFiniteNumber(value.groundShadowOpacity)
    || value.groundShadowOpacity < 0
    || value.groundShadowOpacity > 1
  ) return false;
  if (value.fog === undefined || value.fog === null) return true;
  return isRecord(value.fog)
    && typeof value.fog.enabled === "boolean"
    && isString(value.fog.color, 32)
    && isFiniteNumber(value.fog.near)
    && value.fog.near >= 0
    && isFiniteNumber(value.fog.far)
    && value.fog.far > value.fog.near
    && value.fog.far <= 1_000_000;
}

function isRenderSettings(value: unknown): value is StudioScene3dRenderSettings {
  if (!isRecord(value)) return false;
  if (!STUDIO_SCENE3D_RENDER_PROFILES.has(String(value.profile))) return false;
  if (value.colorSpace !== "srgb") return false;
  if (!["none", "neutral", "aces"].includes(String(value.toneMapping))) return false;
  if (!isFiniteNumber(value.exposure) || value.exposure < 0 || value.exposure > 100) {
    return false;
  }
  if (!["none", "msaa", "taa", "taau", "ssaa"].includes(String(value.antialiasing))) {
    return false;
  }
  const shadows = value.shadows;
  if (
    !isRecord(shadows)
    || typeof shadows.enabled !== "boolean"
    || !["standard", "vsm", "csm"].includes(String(shadows.mode))
    || ![1, 2, 3, 4].includes(Number(shadows.cascades))
    || ![512, 1024, 2048, 4096].includes(Number(shadows.mapSize))
  ) return false;
  const effects = value.effects;
  if (!isRecord(effects)) return false;
  for (const key of ["ssgi", "sss", "contactShadows", "bloom", "depthOfField"] as const) {
    if (typeof effects[key] !== "boolean") return false;
  }
  const toon = value.toon;
  return isRecord(toon)
    && typeof toon.enabled === "boolean"
    && Number.isSafeInteger(toon.rampSteps)
    && Number(toon.rampSteps) >= 2
    && Number(toon.rampSteps) <= 64
    && typeof toon.outline === "boolean"
    && isFiniteNumber(toon.outlineWidthPx)
    && toon.outlineWidthPx >= 0
    && toon.outlineWidthPx <= 64
    && typeof toon.semanticLines === "boolean";
}

function isOutputSettings(value: unknown): value is StudioScene3dOutputSettings {
  if (!isRecord(value)) return false;
  if (!Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)) return false;
  if (
    value.sourceAspectRatioMode !== undefined
    && !["fixed", "viewport"].includes(String(value.sourceAspectRatioMode))
  ) return false;
  if (!isFiniteNumber(value.pixelRatio)) return false;
  if (
    typeof value.transparent !== "boolean"
    || typeof value.preserveAlpha !== "boolean"
    || typeof value.smartLayer !== "boolean"
    || !Array.isArray(value.semanticPasses)
  ) return false;
  const passes = value.semanticPasses;
  return passes.every((entry) => STUDIO_SCENE3D_SEMANTIC_PASSES.has(String(entry)))
    && new Set(passes).size === passes.length;
}

function isShot(value: unknown): value is StudioScene3dShot {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)) return false;
  if (!isString(value.cameraId) || !Array.isArray(value.hiddenEntityIds)) return false;
  if (!value.hiddenEntityIds.every((entry) => isString(entry))) return false;
  if (new Set(value.hiddenEntityIds).size !== value.hiddenEntityIds.length) return false;
  return value.renderProfileOverride === null
    || STUDIO_SCENE3D_RENDER_PROFILES.has(String(value.renderProfileOverride));
}

'''
if helpers not in text:
    if text.count(anchor) != 1:
        raise SystemExit("document helper anchor changed")
    text = text.replace(anchor, helpers + anchor, 1)

old_environment = '''  if (!isRecord(value.environment) || !["transparent", "color", "procedural-sky", "asset"].includes(String(value.environment.mode))) {
    throw new StudioScene3dDocumentError("INVALID_ENVIRONMENT", "3D Scene environment가 올바르지 않습니다.");
  }
  if (!isRecord(value.render) || !["webtoon", "anime", "neutral", "pbr", "sketch"].includes(String(value.render.profile))) {
    throw new StudioScene3dDocumentError("INVALID_RENDER", "3D Scene render 설정이 올바르지 않습니다.");
  }
  if (!isRecord(value.output) || !Number.isSafeInteger(value.output.width) || !Number.isSafeInteger(value.output.height)) {
    throw new StudioScene3dDocumentError("INVALID_OUTPUT", "3D Scene output 설정이 올바르지 않습니다.");
  }
'''
new_environment = '''  if (!isEnvironment(value.environment)) {
    throw new StudioScene3dDocumentError("INVALID_ENVIRONMENT", "3D Scene environment가 올바르지 않습니다.");
  }
  if (!isRenderSettings(value.render)) {
    throw new StudioScene3dDocumentError("INVALID_RENDER", "3D Scene render 설정이 올바르지 않습니다.");
  }
  if (!isOutputSettings(value.output)) {
    throw new StudioScene3dDocumentError("INVALID_OUTPUT", "3D Scene output 설정이 올바르지 않습니다.");
  }
'''
if old_environment in text:
    text = text.replace(old_environment, new_environment, 1)
elif new_environment not in text:
    raise SystemExit("document environment/render/output validation anchor changed")

old_shots = '''  if (!Array.isArray(value.shots) || value.shots.length > 256) {
    throw new StudioScene3dDocumentError("INVALID_SHOTS", "3D Scene shot 목록이 올바르지 않습니다.");
  }
'''
new_shots = '''  if (
    !Array.isArray(value.shots)
    || value.shots.length > 256
    || !value.shots.every(isShot)
  ) {
    throw new StudioScene3dDocumentError("INVALID_SHOTS", "3D Scene shot 목록이 올바르지 않습니다.");
  }
'''
if old_shots in text:
    text = text.replace(old_shots, new_shots, 1)
elif new_shots not in text:
    raise SystemExit("document shot validation anchor changed")

unique_anchor = '''  ensureUnique(value.lights.map((light) => light.id), "light");

  const assetIds = new Set(value.assets.map((asset) => asset.id));
'''
unique_replacement = '''  ensureUnique(value.lights.map((light) => light.id), "light");
  ensureUnique(value.shots.map((shot) => shot.id), "shot");

  const assetIds = new Set(value.assets.map((asset) => asset.id));
  const entityIds = new Set(value.entities.map((entity) => entity.id));
  const cameraIds = new Set(value.cameras.map((camera) => camera.id));
  if (value.environment.assetId !== null && !assetIds.has(value.environment.assetId)) {
    throw new StudioScene3dDocumentError(
      "MISSING_ENVIRONMENT_ASSET",
      "3D Scene environment가 참조하는 asset이 없습니다.",
    );
  }
'''
if unique_anchor in text:
    text = text.replace(unique_anchor, unique_replacement, 1)
elif unique_replacement not in text:
    raise SystemExit("document cross-reference anchor changed")

loop_anchor = '''  for (const entity of value.entities) {
    if (entity.kind !== "primitive" && !assetIds.has(entity.assetId)) {
      throw new StudioScene3dDocumentError("MISSING_ENTITY_ASSET", `${entity.id}가 참조하는 asset이 없습니다.`);
    }
    if (entity.parentId !== null && !value.entities.some((parent) => parent.id === entity.parentId)) {
      throw new StudioScene3dDocumentError("MISSING_ENTITY_PARENT", `${entity.id}가 참조하는 parent가 없습니다.`);
    }
  }
'''
loop_replacement = '''  const parentByEntityId = new Map(
    value.entities.map((entity) => [entity.id, entity.parentId] as const),
  );
  for (const entity of value.entities) {
    if (entity.kind !== "primitive" && !assetIds.has(entity.assetId)) {
      throw new StudioScene3dDocumentError("MISSING_ENTITY_ASSET", `${entity.id}가 참조하는 asset이 없습니다.`);
    }
    if (entity.parentId !== null && !entityIds.has(entity.parentId)) {
      throw new StudioScene3dDocumentError("MISSING_ENTITY_PARENT", `${entity.id}가 참조하는 parent가 없습니다.`);
    }
    const visited = new Set<string>([entity.id]);
    let parentId = entity.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new StudioScene3dDocumentError(
          "CYCLIC_ENTITY_PARENT",
          `${entity.id}의 parent 그래프에 순환이 있습니다.`,
        );
      }
      visited.add(parentId);
      parentId = parentByEntityId.get(parentId) ?? null;
    }
  }
  for (const shot of value.shots) {
    if (!cameraIds.has(shot.cameraId)) {
      throw new StudioScene3dDocumentError(
        "MISSING_SHOT_CAMERA",
        `${shot.id}가 참조하는 camera가 없습니다.`,
      );
    }
    if (shot.hiddenEntityIds.some((entityId) => !entityIds.has(entityId))) {
      throw new StudioScene3dDocumentError(
        "MISSING_SHOT_ENTITY",
        `${shot.id}가 숨기려는 entity가 없습니다.`,
      );
    }
  }
'''
if loop_anchor in text:
    text = text.replace(loop_anchor, loop_replacement, 1)
elif loop_replacement not in text:
    raise SystemExit("document entity graph anchor changed")

path.write_text(text, encoding="utf-8")

contract_test = Path(
    "apps/web/src/domains/creator/scene3d/studio-scene3d-document-contract-hardening.test.ts"
)
contract_test.write_text(
    '''import { describe, expect, it } from "vitest";

import {
  assertStudioScene3dDocument,
  createStudioScene3dDocument,
} from "./studio-scene3d-document";

function mutableDocument() {
  return structuredClone(createStudioScene3dDocument("contract-test"));
}

describe("unified Scene3D document contract hardening", () => {
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
''',
    encoding="utf-8",
)
