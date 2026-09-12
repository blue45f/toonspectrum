import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { captureStudioVrmRgbaCooperatively } from "../vrm/studio-vrm-raster-capture";

import { captureCharacterSemanticPasses } from "./character-shaper-semantic-psd";

import type { CharacterSemanticCaptureDependencies, CharacterSemanticCaptureProgress } from "./character-shaper-semantic-psd";
import type { VRM } from "@pixiv/three-vrm";

/** Real Three objects and capture adapter, with a deterministic CPU readback instead of a GPU. */
class ScopeRenderer {
  readonly capabilities = { maxSamples: 4 };
  readonly outputColorSpace = THREE.SRGBColorSpace;
  readonly toneMapping = THREE.ACESFilmicToneMapping;
  readonly toneMappingExposure = 1;
  clearColor = new THREE.Color("#234567");
  clearAlpha = 0.75;
  target: THREE.WebGLRenderTarget | null = null;
  cubeFace = 2;
  mip = 1;
  reads = 0;
  lost = false;
  failRead = 0;
  readonly renderScene: () => void;

  constructor(readonly scene: THREE.Scene, renderScene: () => void) { this.renderScene = renderScene; }
  getContext() { return { isContextLost: () => this.lost }; }
  getRenderTarget() { return this.target; }
  getActiveCubeFace() { return this.cubeFace; }
  getActiveMipmapLevel() { return this.mip; }
  getClearColor(target: THREE.Color) { return target.copy(this.clearColor); }
  getClearAlpha() { return this.clearAlpha; }
  setRenderTarget(target: THREE.WebGLRenderTarget | null, face = 0, mip = 0) { this.target = target; this.cubeFace = face; this.mip = mip; }
  setClearColor(value: THREE.ColorRepresentation, alpha = 1) { this.clearColor.set(value); this.clearAlpha = alpha; }
  clear() { /* No GPU. */ }
  render(scene: THREE.Object3D) { if (scene === this.scene) this.renderScene(); }
  readRenderTargetPixels(_target: THREE.WebGLRenderTarget, _x: number, _y: number, width: number, height: number, output: Uint8Array) {
    this.reads += 1;
    if (this.reads === this.failRead) throw new Error("readback failed");
    expect(width).toBeLessThanOrEqual(1024);
    expect(height).toBeLessThanOrEqual(1024);
    output.fill(255);
  }
}

function tileFixture() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#abcdef");
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  const projection = camera.projectionMatrix.clone();
  const inverse = camera.projectionMatrixInverse.clone();
  let scopeActive = false;
  const renderer = new ScopeRenderer(scene, () => expect(scopeActive).toBe(true));
  const restore = vi.fn(() => { scopeActive = false; });
  const prepareTile = vi.fn(() => { expect(scopeActive).toBe(false); scopeActive = true; return restore; });
  const assertRestored = () => {
    expect(scopeActive).toBe(false);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(inverse)).toBe(true);
    expect(renderer.target).toBeNull();
    expect(renderer.cubeFace).toBe(2);
    expect(renderer.mip).toBe(1);
    expect(renderer.clearColor.getHexString()).toBe("234567");
    expect(renderer.clearAlpha).toBe(0.75);
    expect((scene.background as THREE.Color).getHexString()).toBe("abcdef");
  };
  const capture = (extra: Parameters<typeof captureStudioVrmRgbaCooperatively>[5] = {}) =>
    captureStudioVrmRgbaCooperatively(renderer as unknown as THREE.WebGLRenderer, scene, camera, { width: 2050, height: 3 }, {}, { prepareTile, ...extra });
  return { renderer, prepareTile, restore, assertRestored, capture };
}

describe("reversible cooperative 3D tile scopes", () => {
  it("restores the scene and renderer before every progress callback and actual task", async () => {
    const fixture = tileFixture();
    const progress = vi.fn(fixture.assertRestored);
    let ticks = 0;
    const timer = setInterval(() => { fixture.assertRestored(); ticks += 1; }, 0);
    try {
      const pixels = await fixture.capture({ onProgress: progress });
      expect(pixels.length).toBe(2050 * 3 * 4);
    } finally { clearInterval(timer); }
    expect(fixture.prepareTile).toHaveBeenCalledTimes(3);
    expect(fixture.restore).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(ticks).toBeGreaterThan(0);
    fixture.assertRestored();
  });

  it.each(["readback", "cancel", "progress", "context", "authority"])("restores after %s failure and supports retry", async (reason) => {
    const fixture = tileFixture();
    const controller = new AbortController();
    let current = true;
    if (reason === "readback") fixture.renderer.failRead = 2;
    const pending = fixture.capture({
      signal: controller.signal,
      assertCurrent: () => { if (!current) throw new Error("stale authority"); },
      onProgress: () => {
        fixture.assertRestored();
        if (reason === "cancel") controller.abort();
        if (reason === "context") fixture.renderer.lost = true;
        if (reason === "authority") current = false;
        if (reason === "progress") throw new Error("progress failed");
      },
    });
    await expect(pending).rejects.toBeInstanceOf(Error);
    fixture.assertRestored();
    expect(fixture.restore.mock.calls.length).toBe(fixture.prepareTile.mock.calls.length);
    fixture.renderer.failRead = 0;
    fixture.renderer.lost = false;
    await fixture.capture();
    fixture.assertRestored();
  });

  it("never enters a material scope after an already aborted request", async () => {
    const fixture = tileFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(fixture.capture({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.prepareTile).not.toHaveBeenCalled();
    fixture.assertRestored();
  });

  it("restores renderer state even if scope teardown throws", async () => {
    const fixture = tileFixture();
    await expect(fixture.capture({ prepareTile: () => {
      const restore = fixture.prepareTile();
      return () => { restore(); throw new Error("teardown failed"); };
    } })).rejects.toThrow("teardown failed");
    fixture.assertRestored();
  });
});

function semanticFixture() {
  const material = new THREE.MeshStandardMaterial({ color: "#ccaabb" }) as THREE.MeshStandardMaterial & {
    isMToonMaterial: boolean; shadeColorFactor: THREE.Color; shadingShiftFactor: number; shadingToonyFactor: number;
  };
  material.name = "FaceBase";
  material.isMToonMaterial = true;
  material.shadeColorFactor = new THREE.Color("#775566");
  material.shadingShiftFactor = -0.25;
  material.shadingToonyFactor = 0.9;
  const face = new THREE.Mesh(new THREE.BoxGeometry(), material);
  face.name = "Face";
  const hair = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  hair.name = "Hair";
  const root = new THREE.Group();
  root.add(face, hair);
  const scene = new THREE.Scene();
  scene.add(root);
  const capture = { gl: {} as THREE.WebGLRenderer, scene, camera: new THREE.PerspectiveCamera() };
  const input = { capture, vrm: { scene: root } as unknown as VRM, width: 4, height: 2 };
  const snapshot = () => ({
    shade: material.shadeColorFactor.getHexString(), shift: material.shadingShiftFactor, toony: material.shadingToonyFactor,
    color: material.color.getHexString(), map: material.map, transparent: material.transparent,
    visible: [face.visible, hair.visible], writes: [material.colorWrite, material.depthWrite, hair.material.colorWrite, hair.material.depthWrite],
  });
  return { input, material, face, hair, snapshot };
}

describe("semantic PSD cooperative product routing", () => {
  it("enters each flat, paint and mask scope per tile and exposes only restored state between them", async () => {
    const fixture = semanticFixture();
    const before = fixture.snapshot();
    const observations: ReturnType<typeof fixture.snapshot>[] = [];
    const progress: CharacterSemanticCaptureProgress[] = [];
    const sync = vi.fn(() => { throw new Error("sync fallback must not run"); });
    const dependencies: CharacterSemanticCaptureDependencies = {
      captureRgba: sync,
      captureRgbaCooperatively: async (_renderer, _scene, _camera, dimensions, options) => {
        for (let tile = 0; tile < 2; tile += 1) {
          options.assertCurrent?.();
          const restore = options.prepareTile?.();
          try { observations.push(fixture.snapshot()); } finally { restore?.(); }
          expect(fixture.snapshot()).toEqual(before);
          options.onProgress?.({ completedTiles: tile + 1, totalTiles: 2 });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          expect(fixture.snapshot()).toEqual(before);
        }
        return new Uint8ClampedArray(dimensions.width * dimensions.height * 4).fill(255);
      },
    };
    const result = await captureCharacterSemanticPasses({
      ...fixture.input,
      paintTextureProvider: () => new Map([[fixture.material, new THREE.Texture()]]),
      onProgress: (event) => { expect(fixture.snapshot()).toEqual(before); progress.push(event); },
    }, dependencies);
    expect(sync).not.toHaveBeenCalled();
    expect(observations.filter((entry) => entry.shift === 1 && entry.map === null)).toHaveLength(2);
    expect(observations.filter((entry) => entry.map !== null && entry.shade === "ffffff")).toHaveLength(2);
    expect(observations.some((entry) => !entry.visible[0] && entry.visible[1])).toBe(true);
    expect(result.passes.map((pass) => pass.id)).toEqual(expect.arrayContaining(["beauty", "flat", "surface-paint", "mask-face", "mask-hair"]));
    expect(progress.some((event) => event.phase === "derive" && event.pass === "line")).toBe(true);
    expect(fixture.snapshot()).toEqual(before);
  });

  it("does not fall back to synchronous rendering on cooperative failure", async () => {
    const fixture = semanticFixture();
    const sync = vi.fn(() => new Uint8ClampedArray(32));
    await expect(captureCharacterSemanticPasses(fixture.input, {
      captureRgba: sync, captureRgbaCooperatively: async () => { throw new Error("tile failure"); },
    })).rejects.toThrow("tile failure");
    expect(sync).not.toHaveBeenCalled();
  });

  it("rejects cancellation from progress before any GPU or material operation", async () => {
    const fixture = semanticFixture();
    const controller = new AbortController();
    const capture = vi.fn(() => new Uint8ClampedArray(32));
    await expect(captureCharacterSemanticPasses({
      ...fixture.input, signal: controller.signal, onProgress: () => controller.abort(),
    }, { captureRgba: capture })).rejects.toMatchObject({ name: "AbortError" });
    expect(capture).not.toHaveBeenCalled();
  });
});
