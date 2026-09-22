import { describe, expect, it } from "vitest";
import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
} from "@/domains/creator/virtual-space/studio-virtual-space-model";
import { createCampusPositionMemory } from "./campus-position-memory";

describe("campus position memory", () => {
  it("returns copies and isolates a new owner before reading coordinates", () => {
    const memory = createCampusPositionMemory();
    memory.write("owner-a", "market", { x: 123, y: 456 });

    const first = memory.read("owner-a", "market");
    expect(first).toEqual({ x: 123, y: 456 });
    if (first) (first as { x: number }).x = 999;
    expect(memory.read("owner-a", "market")).toEqual({ x: 123, y: 456 });

    expect(memory.read("owner-b", "market")).toBeNull();
    expect(memory.size).toBe(0);
  });

  it("rejects invalid points and clamps valid coordinates to the world", () => {
    const memory = createCampusPositionMemory();
    memory.write("local", "atelier", { x: Number.NaN, y: 1 });
    expect(memory.read("local", "atelier")).toBeNull();

    memory.write("local", "atelier", { x: 99_999, y: 99_999 });
    expect(memory.read("local", "atelier")).toEqual({
      x: STUDIO_VIRTUAL_SPACE_WIDTH - 20,
      y: STUDIO_VIRTUAL_SPACE_HEIGHT - 20,
    });
  });

  it("keeps only the configured number of recent districts", () => {
    const memory = createCampusPositionMemory(2);
    memory.write("local", "market", { x: 1, y: 1 });
    memory.write("local", "gallery", { x: 2, y: 2 });
    memory.write("local", "academy", { x: 3, y: 3 });

    expect(memory.read("local", "market")).toBeNull();
    expect(memory.read("local", "gallery")).not.toBeNull();
    expect(memory.read("local", "academy")).not.toBeNull();
    expect(memory.size).toBe(2);
  });
});
