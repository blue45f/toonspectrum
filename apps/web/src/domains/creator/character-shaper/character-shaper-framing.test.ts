import { Group, Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { CHARACTER_OUTPUT_ASPECTS, characterFrameRect, characterFramedExportSize, cloneCharacterCaptureCamera, createCharacterFramedCamera } from "./character-shaper-framing";

import type { CharacterOutputAspect } from "./character-shaper-framing";

describe("character production framing", () => {
  it.each([[1920, 1080], [390, 844], [320, 520], [2048, 2048]])("keeps all output aspects inside %sx%s", (w, h) => {
    for (const preset of CHARACTER_OUTPUT_ASPECTS) {
      const frame = characterFrameRect(w, h, preset.id);
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(1);
      expect(frame.y + frame.height).toBeLessThanOrEqual(1);
      expect(frame.x * 2 + frame.width).toBeCloseTo(1, 12);
      expect(frame.y * 2 + frame.height).toBeCloseTo(1, 12);
      if (preset.id !== "viewport") expect(w * frame.width / (h * frame.height)).toBeCloseTo(preset.width / preset.height, 12);
    }
  });
  it.each([1024, 2048, 4096] as const)("produces stable dimensions at %s", (edge) => {
    for (const aspect of ["square", "portrait", "webtoon", "landscape", "cinema"] as const) {
      expect(characterFramedExportSize(1920, 1080, edge, aspect)).toEqual(characterFramedExportSize(390, 844, edge, aspect));
    }
    expect(characterFramedExportSize(1920, 1080, edge, "webtoon")).toEqual({ width: edge * 9 / 16, height: edge });
  });
  it("rejects invalid dimensions, aspects and resolutions", () => {
    for (const bad of [0, -1, NaN, Infinity]) expect(() => characterFrameRect(bad, 1, "square")).toThrow();
    expect(() => characterFrameRect(1, 1, "other" as CharacterOutputAspect)).toThrow();
    expect(() => characterFramedExportSize(1, 1, 9 as 1024, "square")).toThrow();
  });
  it.each(["perspective", "orthographic"])("matches crops with shifted, zoomed, rolled %s projections", (kind) => {
    const camera = kind === "perspective" ? new PerspectiveCamera(38, 16 / 9, 0.1, 100) : new OrthographicCamera(-3, 3, 2, -2, 0.1, 100);
    camera.zoom = 1.7;
    camera.position.set(0.4, 1.2, 5);
    camera.rotation.set(-0.1, 0.15, 0.3);
    camera.setViewOffset(1600, 900, 70, -40, 1600, 900);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const before = camera.projectionMatrix.clone();
    for (const preset of CHARACTER_OUTPUT_ASPECTS) {
      const frame = characterFrameRect(1600, 900, preset.id);
      const result = createCharacterFramedCamera(camera, frame);
      for (const point of [new Vector3(0, 1, 0), new Vector3(-0.2, 0, 0.6), new Vector3(0.5, 2, -0.5)]) {
        const original = point.clone().project(camera);
        const cropped = point.clone().project(result.camera);
        expect(cropped.x).toBeCloseTo((original.x + 1 - 2 * frame.x - frame.width) / frame.width, 10);
        expect(cropped.y).toBeCloseTo((original.y + 2 * frame.y + frame.height - 1) / frame.height, 10);
        expect(cropped.z).toBeCloseTo(original.z, 10);
      }
      expect(result.screenOutlineScale).toBeCloseTo(1 / frame.height);
      const identity = result.camera.projectionMatrix.clone().multiply(result.camera.projectionMatrixInverse);
      identity.elements.forEach((value, index) => expect(value).toBeCloseTo(new Matrix4().elements[index], 10));
    }
    expect(camera.projectionMatrix.equals(before)).toBe(true);
  });
  it("detaches parented cameras in world space without changing the source", () => {
    const parent = new Group();
    parent.position.set(4, 2, -1);
    parent.rotation.set(0.1, 0.7, -0.2);
    parent.scale.set(1.2, 0.8, 1.5);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 4);
    parent.add(camera);
    parent.updateMatrixWorld(true);
    const copy = cloneCharacterCaptureCamera(camera);
    expect(copy.parent).toBeNull();
    expect(copy.matrixWorld.equals(camera.matrixWorld)).toBe(true);
    expect(copy.matrixWorldInverse.equals(camera.matrixWorldInverse)).toBe(true);
    expect(camera.parent).toBe(parent);
  });
  it("rejects out-of-frame crops", () => {
    const camera = new PerspectiveCamera();
    for (const frame of [{ x: -0.1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }, { x: 0.5, y: 0, width: 1, height: 1 }]) {
      expect(() => createCharacterFramedCamera(camera, frame)).toThrow();
    }
  });
});
