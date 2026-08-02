import { describe, it, expect } from "vitest";

import { Studio3DRoomBuildingKit } from "./studio-3d-room-building-kit";

describe("Studio3DRoomBuildingKit", () => {
  it("creates simple rectangular room with walls and openings", () => {
    const kit = new Studio3DRoomBuildingKit();
    const config = kit.getRoomConfig();

    expect(config.walls.length).toBe(4);
    expect(config.openings.length).toBe(2);
    expect(kit.computeTotalFloorArea()).toBe(20); // 5m * 4m = 20sqm
  });

  it("supports adding stairs and configuring ceiling transparency", () => {
    const kit = new Studio3DRoomBuildingKit();
    kit.addStair({
      id: "stair-main",
      startPoint: [0, 0, 0],
      width: 1.0,
      height: 2.8,
      stepsCount: 14,
      hasRailing: true,
    });

    kit.setCeilingVisible(false);
    kit.setCameraWallTransparency(true);

    const config = kit.getRoomConfig();
    expect(config.stairs.length).toBe(1);
    expect(config.ceilingVisible).toBe(false);
    expect(config.cameraWallTransparency).toBe(true);
  });
});
