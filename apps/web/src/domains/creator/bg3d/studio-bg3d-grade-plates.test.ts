import { describe, expect, it } from "vitest";

import {
  applyStudio3dCommand,
  captureStudio3dPlates,
  createStudio3dHistory,
  linePlateIsStroke,
  listOfferedStudio3dCommands,
  parseStudio3dScene,
  plateCoverage,
  serializeStudio3dScene,
  undoStudio3d,
  type Studio3dCommand,
} from "./studio-bg3d-grade-plates";

function pixelsDiffer(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return true;
  return false;
}

describe("background 3D plates and offered commands", () => {
  it("captures a line plate and a fill plate that follow the camera, light, and props", () => {
    let history = createStudio3dHistory();
    const first = captureStudio3dPlates(history.scene, 160, 90);
    expect(first.width).toBe(160);
    expect(first.height).toBe(90);
    const fill = plateCoverage(first.fill, first.width, first.height);
    expect(fill.width / first.width).toBeGreaterThanOrEqual(0.8);
    expect(fill.height / first.height).toBeGreaterThanOrEqual(0.8);
    expect(linePlateIsStroke(first.line)).toBe(true);

    history = applyStudio3dCommand(history, { id: "set-camera", yaw: 1.1, pitch: -0.2, fov: 55 });
    const movedCamera = captureStudio3dPlates(history.scene, 160, 90);
    history = applyStudio3dCommand(createStudio3dHistory(), { id: "set-light", azimuth: 0.1, elevation: 0.2, intensity: 0.35 });
    const movedLight = captureStudio3dPlates(history.scene, 160, 90);
    history = applyStudio3dCommand(createStudio3dHistory(), {
      id: "place-prop",
      propId: "desk",
      x: -0.45,
      y: 0.2,
      z: 0.1,
    });
    const movedProp = captureStudio3dPlates(history.scene, 160, 90);

    expect(pixelsDiffer(first.fill, movedCamera.fill) || pixelsDiffer(first.line, movedCamera.line)).toBe(true);
    expect(pixelsDiffer(first.fill, movedLight.fill)).toBe(true);
    expect(pixelsDiffer(first.fill, movedProp.fill) || pixelsDiffer(first.line, movedProp.line)).toBe(true);
  });

  it("persists, undoes, and reloads every offered 3D command", () => {
    const offered = listOfferedStudio3dCommands();
    expect(offered.map((command) => command.id)).toEqual(["set-camera", "set-light", "place-prop"]);
    const samples: readonly Studio3dCommand[] = [
      { id: "set-camera", yaw: 0.9, pitch: -0.25, fov: 48 },
      { id: "set-light", azimuth: 1.4, elevation: 0.3, intensity: 0.55 },
      { id: "place-prop", propId: "tree", x: 0.4, y: 0.1, z: -0.2 },
    ];
    expect(samples.map((command) => command.id)).toEqual(offered.map((command) => command.id));
    let history = createStudio3dHistory();
    const original = serializeStudio3dScene(history.scene);
    for (const command of samples) {
      const before = serializeStudio3dScene(history.scene);
      history = applyStudio3dCommand(history, command);
      const changed = serializeStudio3dScene(history.scene);
      expect(changed).not.toBe(before);
      const undone = undoStudio3d(history);
      expect(serializeStudio3dScene(undone.scene)).toBe(before);
      const reloaded = parseStudio3dScene(changed);
      expect(serializeStudio3dScene(reloaded)).toBe(changed);
      history = { scene: reloaded, past: history.past };
    }
    expect(serializeStudio3dScene(parseStudio3dScene(original))).toBe(original);
    expect(offered.some((command) => command.id === "set-camera")).toBe(true);
  });
});
