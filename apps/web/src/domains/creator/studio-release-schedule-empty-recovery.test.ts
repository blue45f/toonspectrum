import { describe, expect, it, vi } from "vitest";

import { normalizeStudioReleaseScheduleDeferred } from "./studio-release-schedule-loader";

const { loadPlanner } = vi.hoisted(() => ({ loadPlanner: vi.fn() }));
vi.mock("./studio-release-schedule", () => {
  loadPlanner();
  throw new Error("planner chunk is unavailable");
});

describe("optional schedule failure isolation", () => {
  it("opens a manuscript with no schedule even when the planner chunk cannot load", async () => {
    await expect(normalizeStudioReleaseScheduleDeferred(undefined)).resolves.toEqual({ version: 1, items: [] });
    await expect(normalizeStudioReleaseScheduleDeferred({ version: 1, items: [] })).resolves.toEqual({ version: 1, items: [] });
    expect(loadPlanner).not.toHaveBeenCalled();
  });

  it("does not silently replace a nonempty schedule after an import failure", async () => {
    await expect(normalizeStudioReleaseScheduleDeferred({ version: 1, items: [{ id: "keep-me" }] })).rejects.toThrow();
    expect(loadPlanner).toHaveBeenCalled();
  });
});
