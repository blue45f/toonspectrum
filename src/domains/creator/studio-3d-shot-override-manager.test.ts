import { describe, it, expect } from "vitest";

import { Studio3DShotManager } from "./studio-3d-shot-override-manager";

describe("Studio3DShotManager", () => {
  it("initializes with active shot and default camera", () => {
    const manager = new Studio3DShotManager("shot-1", "Front View");
    const active = manager.getActiveShot();
    expect(active.shotId).toBe("shot-1");
    expect(active.name).toBe("Front View");
    expect(active.camera.fov).toBe(45);
  });

  it("adds and switches active shots with camera and node overrides", () => {
    const manager = new Studio3DShotManager("shot-1", "Front");
    manager.addShot("shot-2", "High Angle Close-Up");
    manager.setActiveShot("shot-2");

    manager.setCameraTransform("shot-2", { fov: 60, position: [0, 5, 2] });
    manager.setNodeOverride("shot-2", "wall-north", { visible: false });

    const active = manager.getActiveShot();
    expect(active.shotId).toBe("shot-2");
    expect(active.camera.fov).toBe(60);
    expect(active.nodeOverrides["wall-north"].visible).toBe(false);
  });

  it("supports JSON serialization and deserialization", () => {
    const manager = new Studio3DShotManager("shot-1", "Main");
    manager.addShot("shot-2", "Cut 2");
    manager.setCameraTransform("shot-2", { position: [1, 2, 3] });

    const json = manager.serialize();
    const manager2 = new Studio3DShotManager();
    manager2.deserialize(json);

    expect(manager2.listShots().length).toBe(2);
    expect(manager2.getActiveShot().shotId).toBe("shot-1");
  });
});
