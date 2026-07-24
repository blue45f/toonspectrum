import { describe, expect, it } from "vitest";

import {
  STUDIO_ROOM_LAYOUT_PRESETS,
  StudioMultiObjectLayoutManager,
} from "./studio-multi-object-layout";

describe("StudioMultiObjectLayoutManager", () => {
  it("adds and duplicates 3D object instances", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const obj1 = manager.addObject({
      modelUrl: "/desk.glb",
      name: "책상",
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    });

    expect(obj1.id).toBeDefined();
    expect(manager.getAllObjects()).toHaveLength(1);

    const dup = manager.duplicateObject(obj1.id);
    expect(dup).toBeDefined();
    expect(dup?.name).toContain("복사본");
    expect(manager.getAllObjects()).toHaveLength(2);
  });

  it("snaps object to floor level y=0", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const obj = manager.addObject({
      modelUrl: "/chair.glb",
      name: "의자",
      position: [1, 2.5, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    });

    const snapped = manager.snapToFloor(obj.id);
    expect(snapped?.position[1]).toBe(0);
  });

  it("loads room layout presets (classroom, cafe)", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const classroomObjs = manager.loadPreset("classroom");
    expect(classroomObjs.length).toBeGreaterThan(0);
    expect(STUDIO_ROOM_LAYOUT_PRESETS.length).toBeGreaterThanOrEqual(2);
  });
});
