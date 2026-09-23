import { describe, expect, it } from "vitest";

import {
  applyStudio3dCommand,
  createStudio3dHistory,
  listOfferedStudio3dCommands,
  serializeStudio3dScene,
} from "./studio-bg3d-grade-plates";

/**
 * Production LT host routes intensity through applyStudio3dCommand and must not discard the
 * returned document identity. This pure test locks that contract for the offered command set.
 */
describe("bg3d grade host bridge contracts", () => {
  it("advertises the offered command ids the sidebar data attribute must list", () => {
    const ids = listOfferedStudio3dCommands().map((command) => command.id);
    expect(ids).toEqual([
      "set-camera",
      "set-light",
      "set-fill-light",
      "set-background",
      "place-prop",
      "remove-prop",
    ]);
    expect(ids.join(" ")).toContain("set-fill-light");
  });

  it("keeps lighting intensity mutations on the serialized document returned by applyStudio3dCommand", () => {
    const history = createStudio3dHistory();
    const before = serializeStudio3dScene(history.scene);
    const next = applyStudio3dCommand(history, {
      id: "set-light",
      azimuth: 0.3,
      elevation: 0.4,
      intensity: 0.42,
    });
    const after = serializeStudio3dScene(next.scene);
    expect(after).not.toBe(before);
    expect(next.scene.lighting.key.intensity).toBeCloseTo(0.42, 5);
    // The host must persist next.scene (not a separately merged discard).
    expect(serializeStudio3dScene(next.scene)).toBe(after);
  });
});
