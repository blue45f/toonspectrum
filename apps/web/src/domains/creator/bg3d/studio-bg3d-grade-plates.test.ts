import { describe, expect, it } from "vitest";

import {
  applyStudio3dCommand,
  captureStudio3dPlates,
  createStudio3dHistory,
  linePlateIsStroke,
  listOfferedStudio3dCommands,
  parseStudio3dScene,
  plateCoverage,
  redoStudio3d,
  serializeStudio3dScene,
  undoStudio3d,
  type Studio3dCommand,
} from "./studio-bg3d-grade-plates";
import { normalizeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

function pixelsDiffer(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return true;
  return false;
}

function meanFillLuma(fill: Uint8ClampedArray): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < fill.length; i += 4) {
    if (fill[i + 3] < 16) continue;
    total += (fill[i] + fill[i + 1] + fill[i + 2]) / 3;
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

function countLineInk(line: Uint8ClampedArray): number {
  let ink = 0;
  for (let i = 3; i < line.length; i += 4) if (line[i] > 16) ink += 1;
  return ink;
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
    history = applyStudio3dCommand(createStudio3dHistory(), {
      id: "set-light",
      azimuth: 0.1,
      elevation: 0.2,
      intensity: 0.35,
    });
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

  it("honors output.line width/strength/color and key+fill intensity on plates", () => {
    const base = createStudio3dHistory();
    const withProp = applyStudio3dCommand(base, {
      id: "place-prop",
      propId: "box",
      x: 0.2,
      y: 0.1,
      z: 0,
    });
    const thin = captureStudio3dPlates(
      normalizeStudioBg3dSceneDocument({
        ...withProp.scene,
        output: {
          ...withProp.scene.output,
          line: { ...withProp.scene.output.line, widthPx: 1, strength: 0.4, color: "#112233" },
        },
      }),
      120,
      80,
    );
    const thick = captureStudio3dPlates(
      normalizeStudioBg3dSceneDocument({
        ...withProp.scene,
        output: {
          ...withProp.scene.output,
          line: { ...withProp.scene.output.line, widthPx: 4, strength: 1, color: "#ff0000" },
        },
      }),
      120,
      80,
    );
    expect(countLineInk(thick.line)).toBeGreaterThan(countLineInk(thin.line));
    let sawRed = false;
    for (let i = 0; i < thick.line.length; i += 4) {
      if (thick.line[i + 3] > 200 && thick.line[i] > 200 && thick.line[i + 1] < 40) sawRed = true;
    }
    expect(sawRed).toBe(true);

    const dim = applyStudio3dCommand(createStudio3dHistory(), {
      id: "set-light",
      azimuth: 0.4,
      elevation: 0.5,
      intensity: 0.25,
    });
    const dimFill = applyStudio3dCommand(dim, {
      id: "set-fill-light",
      azimuth: -0.4,
      elevation: 0.2,
      intensity: 0.1,
    });
    const bright = applyStudio3dCommand(createStudio3dHistory(), {
      id: "set-light",
      azimuth: 0.4,
      elevation: 0.5,
      intensity: 1.4,
    });
    const brightFill = applyStudio3dCommand(bright, {
      id: "set-fill-light",
      azimuth: -0.4,
      elevation: 0.2,
      intensity: 0.9,
    });
    expect(meanFillLuma(captureStudio3dPlates(brightFill.scene, 96, 64).fill)).toBeGreaterThan(
      meanFillLuma(captureStudio3dPlates(dimFill.scene, 96, 64).fill),
    );
  });

  it("normalizes partial restored documents before offered commands mutate them", () => {
    const partialScene = {
      camera: {},
      attachments: [],
      budgets: { complexity: { maxNodes: 100 } },
    } as unknown as Parameters<typeof createStudio3dHistory>[0];
    const history = createStudio3dHistory(partialScene);
    const next = applyStudio3dCommand(history, {
      id: "place-prop",
      propId: "restored-prop",
      x: 0.25,
      y: 0.5,
      z: -0.75,
    });

    expect(history.scene.nodes).toEqual([]);
    expect(next.scene.nodes).toContainEqual(expect.objectContaining({ id: "restored-prop" }));
    expect(next.scene.lighting.key.intensity).toBeGreaterThan(0);
  });

  it("persists, undoes, redoes, and reloads every offered 3D command", () => {
    const offered = listOfferedStudio3dCommands();
    expect(offered.map((command) => command.id)).toEqual([
      "set-camera",
      "set-light",
      "set-fill-light",
      "set-background",
      "place-prop",
      "remove-prop",
    ]);
    expect(offered.length).toBeGreaterThanOrEqual(5);
    const samples: readonly Studio3dCommand[] = [
      { id: "set-camera", yaw: 0.9, pitch: -0.25, fov: 48 },
      { id: "set-light", azimuth: 1.4, elevation: 0.3, intensity: 0.55 },
      { id: "set-fill-light", azimuth: -0.8, elevation: 0.15, intensity: 0.4 },
      { id: "set-background", mode: "color", color: "#334455" },
      { id: "place-prop", propId: "tree", x: 0.4, y: 0.1, z: -0.2 },
      { id: "remove-prop", propId: "tree" },
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
      const redone = redoStudio3d(undone);
      expect(serializeStudio3dScene(redone.scene)).toBe(changed);
      const reloaded = parseStudio3dScene(changed);
      expect(serializeStudio3dScene(reloaded)).toBe(changed);
      history = { scene: reloaded, past: history.past, future: [] };
    }
    expect(serializeStudio3dScene(parseStudio3dScene(original))).toBe(original);
    expect(offered.some((command) => command.id === "set-camera")).toBe(true);
  });

  it("mutates the serialized document when lighting intensity follows the offered command path", () => {
    const start = createStudio3dHistory();
    const before = serializeStudio3dScene(start.scene);
    const next = applyStudio3dCommand(start, {
      id: "set-light",
      azimuth: Math.atan2(start.scene.lighting.key.direction[0], start.scene.lighting.key.direction[2]),
      elevation: Math.asin(Math.max(-1, Math.min(1, start.scene.lighting.key.direction[1]))),
      intensity: Math.max(0.2, start.scene.lighting.key.intensity * 0.5),
    });
    expect(serializeStudio3dScene(next.scene)).not.toBe(before);
    expect(listOfferedStudio3dCommands().map((command) => command.id)).toContain("set-light");
  });
});
