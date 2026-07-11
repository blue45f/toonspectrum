import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyBg3dFallbackMaterial,
  checkStudioBg3dThreeBudgets,
  cloneStudioBg3dThreeObject,
  cloneBgCustomModelInstances,
  computeAutoFitScale,
  createBgCustomModelInstance,
  disposeStudioBg3dThreeResources,
  duplicateBgCustomModelInstance,
  encodeBg3dSceneWithModelsHash,
  loadVerifiedStudioBg3dGlbWithThree,
  measureBg3dObjectSize,
  measureStudioBg3dThreeMetrics,
  parseBg3dSceneWithModelsFromDataUrl,
} from "./studio-background-3d-model";
import { createPrimitive, encodeBg3dSceneHash } from "./studio-background-3d-primitives";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  STUDIO_BG3D_GLB_MIME_TYPE,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";

import type { BgCustomModelInstance } from "./studio-background-3d-model";
import type { StudioBg3dGlbValidationSuccess } from "./studio-bg3d-glb-validation";
import type { StudioBg3dParsedGlbMetrics, StudioBg3dSceneBudgets } from "./studio-bg3d-scene-document";

const threeLoaderMocks = vi.hoisted(() => ({
  parseAsync: vi.fn(),
  skeletonClone: vi.fn(),
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class MockGltfLoader {
    parseAsync(data: ArrayBuffer | string, path: string) {
      return threeLoaderMocks.parseAsync(data, path);
    }
  },
}));

vi.mock("three/examples/jsm/utils/SkeletonUtils.js", () => ({
  clone: (root: THREE.Object3D) => threeLoaderMocks.skeletonClone(root),
}));

describe("studio-background-3d-model", () => {
  it("createBgCustomModelInstance spawns with identity scale and deterministic x-jitter that wraps every 5", () => {
    const at = (existingCount: number) => createBgCustomModelInstance("model-1", existingCount);

    expect(at(0).position).toEqual([0, 0, 0]);
    expect(at(1).position).toEqual([0.8, 0, 0]);
    expect(at(4).position).toEqual([3.2, 0, 0]);
    expect(at(5).position).toEqual([0, 0, 0]); // 5 % 5 === 0, wraps back
    expect(at(7).position).toEqual([1.6, 0, 0]);

    const inst = at(0);
    expect(inst.modelId).toBe("model-1");
    expect(inst.rotation).toEqual([0, 0, 0]);
    expect(inst.scale).toEqual([1, 1, 1]);
    expect(inst.id).toEqual(expect.any(String));
  });

  it("createBgCustomModelInstance accepts an explicit initial scale (e.g. from computeAutoFitScale) and defensively copies it", () => {
    const autoFitScale: [number, number, number] = [0.5, 0.5, 0.5];
    const inst = createBgCustomModelInstance("model-1", 0, autoFitScale);
    autoFitScale[0] = 999; // mutate the source after the fact

    expect(inst.scale).toEqual([0.5, 0.5, 0.5]);
  });

  it("duplicateBgCustomModelInstance keeps modelId/rotation/scale, assigns a new id, and offsets x/z by 0.4", () => {
    const original: BgCustomModelInstance = {
      id: "original-id",
      modelId: "model-42",
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [2, 2, 2],
    };
    const copy = duplicateBgCustomModelInstance(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.modelId).toBe(original.modelId);
    expect(copy.rotation).toEqual(original.rotation);
    expect(copy.scale).toEqual(original.scale);
    expect(copy.position).toEqual([1.4, 2, 3.4]);
  });

  it("cloneBgCustomModelInstances deep-clones tuples so mutating a clone never affects the original", () => {
    const originals: BgCustomModelInstance[] = [
      { id: "a", modelId: "model-1", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    ];
    const cloned = cloneBgCustomModelInstances(originals);
    cloned[0].position[0] = 99;
    cloned[0].scale[1] = 42;

    expect(originals[0].position).toEqual([0, 0, 0]);
    expect(originals[0].scale).toEqual([1, 1, 1]);
    expect(cloned[0].id).toBe("a"); // id/modelId preserved for undo/redo snapshot identity
    expect(cloned[0].modelId).toBe("model-1");
  });

  it("computeAutoFitScale scales the largest dimension to the target size (default 2, or a custom target)", () => {
    expect(computeAutoFitScale([1, 2, 4])).toBeCloseTo(0.5); // default target 2, max dim 4 -> 2/4
    expect(computeAutoFitScale([1, 2, 4], 10)).toBeCloseTo(2.5); // custom target 10 -> 10/4
    // 음수 치수도 절댓값 기준으로 최대 변을 잡는다.
    expect(computeAutoFitScale([-3, 2, 1])).toBeCloseTo(2 / 3);
  });

  it("computeAutoFitScale returns 1 (no-op) for degenerate or non-finite bounding size / target size", () => {
    expect(computeAutoFitScale([0, 0, 0])).toBe(1);
    expect(computeAutoFitScale([Number.NaN, 1, 1])).toBe(1);
    expect(computeAutoFitScale([Number.POSITIVE_INFINITY, 1, 1])).toBe(1);
    expect(computeAutoFitScale([1, 2, 4], 0)).toBe(1);
    expect(computeAutoFitScale([1, 2, 4], -5)).toBe(1);
  });

  it("measureBg3dObjectSize measures a mesh's world-axis-aligned bounding box size", () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6)));

    const [x, y, z] = measureBg3dObjectSize(group);
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(4);
    expect(z).toBeCloseTo(6);
  });

  it("measureBg3dObjectSize returns [0, 0, 0] for an object with no geometry", () => {
    expect(measureBg3dObjectSize(new THREE.Group())).toEqual([0, 0, 0]);
  });

  it("applyBg3dFallbackMaterial shares one neutral MeshStandardMaterial instance across every mesh and disposes the originals", () => {
    const group = new THREE.Group();
    const originalMaterial = new THREE.MeshPhongMaterial({ color: "#111111" });
    const meshA: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), originalMaterial);
    const meshB: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); // default material (no .mtl case)
    group.add(meshA, meshB);

    const disposeA = vi.spyOn(originalMaterial, "dispose");
    const disposeB = vi.spyOn(meshB.material as THREE.Material, "dispose");

    applyBg3dFallbackMaterial(group, "#334455");

    expect(meshA.material).toBe(meshB.material); // 하나의 공유 인스턴스
    expect((meshA.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("334455");
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });

  it("applyBg3dFallbackMaterial disposes every material in a multi-material mesh's array", () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const disposeSpies = materials.map((m) => vi.spyOn(m, "dispose"));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);

    applyBg3dFallbackMaterial(mesh);

    expect(Array.isArray(mesh.material)).toBe(false); // 다중 머티리얼도 단일 공유 머티리얼로 교체
    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it("encodeBg3dSceneWithModelsHash/parseBg3dSceneWithModelsFromDataUrl round-trips, stays backward-compatible with legacy hashes, and rejects malformed input", () => {
    const primitives = [createPrimitive("box", 0)];
    const customModels = [createBgCustomModelInstance("model-1", 0)];

    const hash = encodeBg3dSceneWithModelsHash(primitives, customModels);
    const restored = parseBg3dSceneWithModelsFromDataUrl(`data:image/png;base64,xyz#${hash}`);
    expect(restored?.primitives).toEqual(primitives);
    expect(restored?.customModels).toEqual(customModels);

    // 레거시(프리미티브 전용) 해시도 계속 파싱되어야 한다 — customModels는 빈 배열로 취급.
    const legacyHash = encodeBg3dSceneHash(primitives);
    const restoredLegacy = parseBg3dSceneWithModelsFromDataUrl(`data:image/png;base64,xyz#${legacyHash}`);
    expect(restoredLegacy?.primitives).toEqual(primitives);
    expect(restoredLegacy?.customModels).toEqual([]);

    // 잘못된 입력들은 전부 null.
    expect(parseBg3dSceneWithModelsFromDataUrl(undefined)).toBeNull();
    expect(parseBg3dSceneWithModelsFromDataUrl("data:image/png;base64,xyz")).toBeNull(); // '#' 없음
    expect(parseBg3dSceneWithModelsFromDataUrl("data:image/png;base64,xyz#not-json")).toBeNull();
    const foreignToolHash = encodeURIComponent(JSON.stringify({ tool: "vrm-poser", primitives: [] }));
    expect(parseBg3dSceneWithModelsFromDataUrl(`data:image/png;base64,xyz#${foreignToolHash}`)).toBeNull();
  });
});

const generousBudgets: StudioBg3dSceneBudgets = {
  complexity: {
    maxNodes: 10_000,
    maxTriangles: 10_000_000,
    maxDrawCalls: 10_000,
    maxMaterials: 10_000,
    maxLights: 1_000,
    maxModelBytes: 100 * 1024 * 1024,
  },
  textures: {
    maxTextures: 10_000,
    maxTotalBytes: 1_000_000_000,
    maxDimension: 16_384,
  },
};

function minimalGlbBytes(): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" } }));
  const paddedJsonLength = Math.ceil(json.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + paddedJsonLength);
  bytes.fill(0x20, 20);
  bytes.set(json, 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

function verifiedResult(bytes: Uint8Array = minimalGlbBytes()): StudioBg3dGlbValidationSuccess {
  return {
    ok: true,
    code: "valid",
    message: "검증 완료",
    profile: "desktop",
    verifiedSha256: `sha256:${"0".repeat(64)}`,
    verifiedBytes: bytes,
    cumulativeBytesAfter: bytes.byteLength,
    metrics: {
      byteSize: bytes.byteLength,
      jsonByteSize: 0,
      binByteSize: 0,
      nodes: 0,
      meshes: 0,
      meshPrimitives: 0,
      drawCalls: 0,
      triangles: 0,
      materials: 0,
      textures: 0,
      images: 0,
      imageBytes: 0,
      estimatedDecodedImageBytes: 0,
      maxImageDimension: 0,
      undeterminedImageDimensions: 0,
      lights: 0,
    },
  };
}

function parsedGltf(root: THREE.Object3D) {
  return {
    scene: root,
    scenes: [root],
    animations: [],
    cameras: [],
    asset: { version: "2.0" },
    parser: {},
    userData: {},
  };
}

function triangleGeometry(triangleCount: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(triangleCount * 3 * 3), 3)
  );
  return geometry;
}

describe("verified GLB Three.js safety boundary", () => {
  beforeEach(() => {
    threeLoaderMocks.parseAsync.mockReset();
    threeLoaderMocks.skeletonClone.mockReset();
  });

  it("counts instantiated/grouped scene work while deduplicating shared materials and shader-uniform textures", () => {
    const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    const materialA = new THREE.MeshBasicMaterial({ map: texture });
    const materialB = new THREE.ShaderMaterial({ uniforms: { paint: { value: texture } } });
    const geometry = triangleGeometry(4);
    geometry.addGroup(0, 6, 0);
    geometry.addGroup(6, 6, 1);

    const instanced = new THREE.InstancedMesh(geometry, [materialA, materialB], 3);
    const ordinary = new THREE.Mesh(geometry, materialA);
    const root = new THREE.Group();
    root.add(instanced, ordinary, new THREE.PointLight());

    const result = measureStudioBg3dThreeMetrics(root);

    expect(result).toEqual({
      ok: true,
      metrics: {
        nodes: 4,
        triangles: 16,
        drawCalls: 3,
        materials: 2,
        lights: 1,
        textures: 1,
        textureBytes: 64,
        maxTextureDimension: 4,
      },
    });
  });

  it("counts Line, LineSegments, and Points draw calls with drawRange/material groups but no triangles", () => {
    const geometry = triangleGeometry(2);
    geometry.setDrawRange(1, 4);
    geometry.addGroup(0, 2, 0);
    geometry.addGroup(2, 2, 1);
    geometry.addGroup(4, 2, 0);
    const materialA = new THREE.LineBasicMaterial();
    const materialB = new THREE.PointsMaterial();
    const root = new THREE.Group();
    root.add(
      new THREE.Line(geometry, materialA),
      new THREE.LineSegments(geometry, [materialA, materialB]),
      new THREE.Points(geometry, [materialA, materialB])
    );

    const result = measureStudioBg3dThreeMetrics(root);

    expect(result).toEqual({
      ok: true,
      metrics: {
        nodes: 4,
        triangles: 0,
        drawCalls: 7,
        materials: 2,
        lights: 0,
        textures: 0,
        textureBytes: 0,
        maxTextureDimension: 0,
      },
    });
  });

  it("fails closed when a line/point material group range would overflow safe arithmetic", () => {
    const geometry = triangleGeometry(2);
    geometry.addGroup(Number.MAX_SAFE_INTEGER, 1, 0);
    const root = new THREE.Points(geometry, [new THREE.PointsMaterial()]);

    expect(measureStudioBg3dThreeMetrics(root)).toMatchObject({
      ok: false,
      code: "unsafe-scene-metrics",
    });
  });

  it("uses decoded natural image dimensions rather than a smaller display size for texture memory", () => {
    const image = { width: 2, height: 2, naturalWidth: 8, naturalHeight: 4 };
    const texture = new THREE.Texture(image);
    texture.generateMipmaps = false;
    const root = new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial({ map: texture }));

    const result = measureStudioBg3dThreeMetrics(root);

    expect(result.ok && result.metrics.textureBytes).toBe(8 * 4 * 4);
    expect(result.ok && result.metrics.maxTextureDimension).toBe(8);
  });

  it("includes the full automatic integer mip chain so a 4000px RGBA texture exceeds a 64MiB budget", () => {
    const texture = new THREE.Texture({ width: 4_000, height: 4_000 });
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const root = new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial({ map: texture }));

    const result = measureStudioBg3dThreeMetrics(root);

    expect(4_000 * 4_000 * 4).toBeLessThan(64 * 1024 * 1024);
    expect(result.ok && result.metrics.textureBytes).toBe(85_332_856);
    expect(result.ok && checkStudioBg3dThreeBudgets(result.metrics, {
      ...generousBudgets,
      textures: { ...generousBudgets.textures, maxTotalBytes: 64 * 1024 * 1024 },
    })?.code).toBe("texture-byte-budget-exceeded");
  });

  it("does not allocate an automatic mip chain when its mip filter is unused or generation is disabled", () => {
    const nonMipmapFilter = new THREE.Texture({ width: 4_000, height: 4_000 });
    nonMipmapFilter.generateMipmaps = true;
    nonMipmapFilter.minFilter = THREE.LinearFilter;
    const generationDisabled = new THREE.Texture({ width: 4_000, height: 4_000 });
    generationDisabled.generateMipmaps = false;
    generationDisabled.minFilter = THREE.LinearMipmapLinearFilter;

    const nonMipmapResult = measureStudioBg3dThreeMetrics(
      new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial({ map: nonMipmapFilter }))
    );
    const disabledResult = measureStudioBg3dThreeMetrics(
      new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial({ map: generationDisabled }))
    );

    expect(nonMipmapResult.ok && nonMipmapResult.metrics.textureBytes).toBe(64_000_000);
    expect(disabledResult.ok && disabledResult.metrics.textureBytes).toBe(64_000_000);
  });

  it("treats an explicit mipmap array as the complete GPU chain without also counting source or auto levels", () => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 4_000, 4_000);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.mipmaps = [
      { data: new Uint8Array(64), width: 4, height: 4 },
      { data: new Uint8Array(16), width: 2, height: 2 },
      { data: new Uint8Array(4), width: 1, height: 1 },
    ];
    const root = new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial({ map: texture }));

    const result = measureStudioBg3dThreeMetrics(root);

    expect(result.ok && result.metrics.textureBytes).toBe(84);
    expect(result.ok && result.metrics.maxTextureDimension).toBe(4);
  });

  it("fails closed when an automatic mip-chain sum would overflow safe integer arithmetic", () => {
    const texture = new THREE.Texture({ width: 45_000_000, height: 45_000_000 });
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const root = new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial({ map: texture }));

    expect(measureStudioBg3dThreeMetrics(root)).toMatchObject({
      ok: false,
      code: "unsafe-scene-metrics",
    });
  });

  it("accepts exact metric limits and returns the stable code for every exceeded post-parse budget", () => {
    const metrics: StudioBg3dParsedGlbMetrics = {
      nodes: 2,
      triangles: 3,
      drawCalls: 4,
      materials: 5,
      lights: 1,
      textures: 2,
      textureBytes: 128,
      maxTextureDimension: 64,
    };
    const exact: StudioBg3dSceneBudgets = {
      complexity: {
        maxNodes: 2,
        maxTriangles: 3,
        maxDrawCalls: 4,
        maxMaterials: 5,
        maxLights: 1,
        maxModelBytes: 20,
      },
      textures: { maxTextures: 2, maxTotalBytes: 128, maxDimension: 64 },
    };

    expect(checkStudioBg3dThreeBudgets(metrics, exact)).toBeNull();
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, complexity: { ...exact.complexity, maxNodes: 1 },
    })?.code).toBe("node-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, complexity: { ...exact.complexity, maxTriangles: 2 },
    })?.code).toBe("triangle-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, complexity: { ...exact.complexity, maxDrawCalls: 3 },
    })?.code).toBe("draw-call-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, complexity: { ...exact.complexity, maxMaterials: 4 },
    })?.code).toBe("material-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, complexity: { ...exact.complexity, maxLights: 0 },
    })?.code).toBe("light-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, textures: { ...exact.textures, maxTextures: 1 },
    })?.code).toBe("texture-count-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, textures: { ...exact.textures, maxTotalBytes: 127 },
    })?.code).toBe("texture-byte-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets(metrics, {
      ...exact, textures: { ...exact.textures, maxDimension: 63 },
    })?.code).toBe("texture-dimension-budget-exceeded");
    expect(checkStudioBg3dThreeBudgets({ nodes: 0 } as StudioBg3dParsedGlbMetrics, exact)?.code)
      .toBe("unsafe-scene-metrics");
  });

  it("disposes every unique geometry, material, material/uniform/target texture, bone texture, target, and ImageBitmap once", () => {
    const geometry = triangleGeometry(1);
    const dataTexture = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const close = vi.fn();
    const bitmap = {
      width: 2,
      height: 2,
      close,
      [Symbol.toStringTag]: "ImageBitmap",
    } as unknown as ImageBitmap;
    const bitmapTexture = new THREE.Texture(bitmap);
    const renderTarget = new THREE.WebGLRenderTarget(2, 2);
    const materialA = new THREE.MeshBasicMaterial({ map: dataTexture });
    const materialB = new THREE.ShaderMaterial({
      uniforms: {
        bitmap: { value: bitmapTexture },
        target: { value: renderTarget },
        sharedAgain: { value: dataTexture },
      },
    });
    const skeleton = new THREE.Skeleton([new THREE.Bone()]).computeBoneTexture();
    const boneTexture = skeleton.boneTexture as THREE.DataTexture;
    const skinned = new THREE.SkinnedMesh(geometry, materialA);
    skinned.bind(skeleton);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, materialA), new THREE.Mesh(geometry, materialB), skinned);

    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialADispose = vi.spyOn(materialA, "dispose");
    const materialBDispose = vi.spyOn(materialB, "dispose");
    const textureDisposes = [dataTexture, bitmapTexture, renderTarget.texture, boneTexture]
      .map((texture) => vi.spyOn(texture, "dispose"));
    const targetDispose = vi.spyOn(renderTarget, "dispose");

    const summary = disposeStudioBg3dThreeResources(root);

    expect(summary).toEqual({ geometries: 1, materials: 2, textures: 4, renderTargets: 1, imageBitmaps: 1 });
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialADispose).toHaveBeenCalledTimes(1);
    expect(materialBDispose).toHaveBeenCalledTimes(1);
    for (const dispose of textureDisposes) expect(dispose).toHaveBeenCalledTimes(1);
    expect(targetDispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("uses ordinary clone for static content and SkeletonUtils.clone for skinned content", async () => {
    const staticRoot = new THREE.Group();
    staticRoot.add(new THREE.Mesh(triangleGeometry(1), new THREE.MeshBasicMaterial()));

    const staticClone = await cloneStudioBg3dThreeObject(staticRoot);
    expect(staticClone).not.toBe(staticRoot);
    expect(threeLoaderMocks.skeletonClone).not.toHaveBeenCalled();

    const skinnedRoot = new THREE.Group();
    skinnedRoot.add(new THREE.SkinnedMesh(triangleGeometry(1), new THREE.MeshBasicMaterial()));
    const skeletonClone = new THREE.Group();
    threeLoaderMocks.skeletonClone.mockReturnValue(skeletonClone);

    await expect(cloneStudioBg3dThreeObject(skinnedRoot)).resolves.toBe(skeletonClone);
    expect(threeLoaderMocks.skeletonClone).toHaveBeenCalledOnce();
    expect(threeLoaderMocks.skeletonClone).toHaveBeenCalledWith(skinnedRoot);

    threeLoaderMocks.skeletonClone.mockImplementationOnce(() => {
      throw new Error("private-node-name: clone detail");
    });
    let safeError: unknown;
    try {
      await cloneStudioBg3dThreeObject(skinnedRoot);
    } catch (error) {
      safeError = error;
    }
    expect(safeError).toMatchObject({
      name: "StudioBg3dThreeOperationError",
      code: "clone-failed",
      message: "3D 모델 인스턴스를 복제하지 못했습니다. 모델을 다시 불러와 주세요.",
    });
    expect((safeError as Error).message).not.toContain("private-node-name");
  });

  it("accepts the validator-owned success snapshot without reusing the caller's source bytes", async () => {
    const source = minimalGlbBytes();
    const validated = await validateStudioBg3dGlb(source, {
      declared: {
        byteSize: source.byteLength,
        sha256: "0".repeat(64),
        mimeType: STUDIO_BG3D_GLB_MIME_TYPE,
      },
      cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 },
      profile: "desktop",
      budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      digest: async () => "0".repeat(64),
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error("test GLB fixture must pass the validator");
    expect(validated.verifiedBytes).not.toBe(source);
    threeLoaderMocks.parseAsync.mockResolvedValue(parsedGltf(new THREE.Group()));

    const loaded = await loadVerifiedStudioBg3dGlbWithThree(validated, generousBudgets);

    expect(loaded).toMatchObject({ ok: true, code: "loaded" });
    if (loaded.ok) loaded.dispose();
  });

  it("parses only an immediate defensive ArrayBuffer copy with an empty base path and never calls URL/fetch", async () => {
    const geometry = triangleGeometry(1);
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    let parsedBuffer: ArrayBuffer | null = null;
    let parsedPath: string | null = null;
    threeLoaderMocks.parseAsync.mockImplementation(async (data: ArrayBuffer | string, path: string) => {
      parsedBuffer = data as ArrayBuffer;
      parsedPath = path;
      return parsedGltf(root);
    });
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const fetch = vi.spyOn(globalThis, "fetch");
    const verified = verifiedResult();
    const originalBuffer = verified.verifiedBytes.buffer;
    const mutationIndex = verified.verifiedBytes.byteLength - 1;
    const originalByte = verified.verifiedBytes[mutationIndex];

    try {
      const pending = loadVerifiedStudioBg3dGlbWithThree(verified, generousBudgets);
      verified.verifiedBytes[mutationIndex] = originalByte ^ 0xff;
      const result = await pending;

      expect(result.ok).toBe(true);
      expect(parsedPath).toBe("");
      expect(parsedBuffer).toBeInstanceOf(ArrayBuffer);
      expect(parsedBuffer).not.toBe(originalBuffer);
      expect(new Uint8Array(parsedBuffer as unknown as ArrayBuffer)[mutationIndex]).toBe(originalByte);
      expect(createObjectUrl).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      if (result.ok) {
        result.dispose();
        result.dispose();
      }
      expect(geometryDispose).toHaveBeenCalledTimes(1);
      expect(materialDispose).toHaveBeenCalledTimes(1);
    } finally {
      createObjectUrl.mockRestore();
      fetch.mockRestore();
    }
  });

  it("disposes the success-time parser resource snapshot without leaking removed owned or touching later app resources", async () => {
    const ownedGeometry = triangleGeometry(1);
    const ownedTexture = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const ownedMaterial = new THREE.MeshBasicMaterial({ map: ownedTexture });
    const ownedMesh = new THREE.Mesh(ownedGeometry, ownedMaterial);
    const root = new THREE.Group();
    root.add(ownedMesh);
    threeLoaderMocks.parseAsync.mockResolvedValue(parsedGltf(root));
    const ownedDisposes = [
      vi.spyOn(ownedGeometry, "dispose"),
      vi.spyOn(ownedMaterial, "dispose"),
      vi.spyOn(ownedTexture, "dispose"),
    ];

    const loaded = await loadVerifiedStudioBg3dGlbWithThree(verifiedResult(), generousBudgets);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("test GLB must load");

    const externalGeometry = triangleGeometry(1);
    const externalTexture = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const externalMaterial = new THREE.MeshBasicMaterial({ map: externalTexture });
    const externalMesh = new THREE.Mesh(externalGeometry, externalMaterial);
    const externalDisposes = [
      vi.spyOn(externalGeometry, "dispose"),
      vi.spyOn(externalMaterial, "dispose"),
      vi.spyOn(externalTexture, "dispose"),
    ];
    root.remove(ownedMesh);
    root.add(externalMesh);

    expect(loaded.dispose()).toEqual({
      geometries: 1,
      materials: 1,
      textures: 1,
      renderTargets: 0,
      imageBitmaps: 0,
    });
    loaded.dispose();

    for (const dispose of ownedDisposes) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of externalDisposes) expect(dispose).not.toHaveBeenCalled();
  });

  it("rejects JSON glTF/OBJ bytes before the loader and never exposes parser-controlled error strings", async () => {
    const jsonGltf = verifiedResult(new TextEncoder().encode('{"asset":{"version":"2.0"}}'));
    const obj = verifiedResult(new TextEncoder().encode("o private-file-name\nv 0 0 0"));

    await expect(loadVerifiedStudioBg3dGlbWithThree(jsonGltf, generousBudgets)).resolves.toMatchObject({
      ok: false,
      code: "invalid-verified-glb",
    });
    await expect(loadVerifiedStudioBg3dGlbWithThree(obj, generousBudgets)).resolves.toMatchObject({
      ok: false,
      code: "invalid-verified-glb",
    });
    expect(threeLoaderMocks.parseAsync).not.toHaveBeenCalled();

    threeLoaderMocks.parseAsync.mockRejectedValueOnce(new Error("private-file-name.glb: malicious parser detail"));
    const failed = await loadVerifiedStudioBg3dGlbWithThree(verifiedResult(), generousBudgets);
    expect(failed).toMatchObject({ ok: false, code: "parse-failed" });
    expect(failed.message).not.toContain("private-file-name");
    expect(failed.message).not.toContain("malicious parser detail");
  });

  it("disposes the parsed roots immediately when post-parse metrics exceed the selected budget", async () => {
    const geometry = triangleGeometry(1);
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    threeLoaderMocks.parseAsync.mockResolvedValue(parsedGltf(root));

    const failed = await loadVerifiedStudioBg3dGlbWithThree(verifiedResult(), {
      ...generousBudgets,
      complexity: { ...generousBudgets.complexity, maxTriangles: 0 },
    });

    expect(failed).toMatchObject({ ok: false, code: "triangle-budget-exceeded" });
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("enforces the scene model-byte budget before dynamically parsing", async () => {
    const failed = await loadVerifiedStudioBg3dGlbWithThree(verifiedResult(), {
      ...generousBudgets,
      complexity: { ...generousBudgets.complexity, maxModelBytes: 19 },
    });

    expect(failed).toMatchObject({ ok: false, code: "model-byte-budget-exceeded" });
    expect(threeLoaderMocks.parseAsync).not.toHaveBeenCalled();
  });
});
