import { describe, expect, it, vi } from "vitest";
import { saveCampusPaletteToStudio } from "./campus-palette-adapter";

function palettePort(commit = vi.fn(async () => undefined)) {
  return {
    commit,
    create: (name: string, colors: string[]) => ({
      id: "palette-A",
      name,
      colors,
      createdAt: 1,
      updatedAt: 1,
    }),
  };
}

describe("fortune to Studio palette handoff", () => {
  it("passes only validated colors into the existing Studio palette authority", async () => {
    const port = palettePort();
    const assertCurrent = vi.fn();
    const receipt = await saveCampusPaletteToStudio(
      ["#112233", "#AABBCC"],
      assertCurrent,
      async () => port,
    );
    expect(receipt).toEqual({ paletteId: "palette-A", colorCount: 2, authority: "studio-sqlite" });
    expect(port.commit).toHaveBeenCalledWith({
      upsert: [expect.objectContaining({
        id: "palette-A",
        name: "별빛 관측소에서 고른 색",
        colors: ["#112233", "#AABBCC"],
      })],
      expected: { items: [{ id: "palette-A", value: null }] },
      assertCurrent,
    });
    expect(JSON.stringify(port.commit.mock.calls)).not.toContain("birth");
    expect(JSON.stringify(port.commit.mock.calls)).not.toContain("question");
  });

  it.each([
    { colors: [] },
    { colors: ["red"] },
    { colors: ["#123456", "secret"] },
    { colors: Array.from({ length: 17 }, () => "#123456") },
  ])("rejects invalid color payload $colors before opening storage", async ({ colors }) => {
    const load = vi.fn(async () => palettePort());
    await expect(saveCampusPaletteToStudio(colors, () => undefined, load)).rejects.toThrow(/색상 형식/);
    expect(load).not.toHaveBeenCalled();
  });
  it("aborts a stale handoff before commit when the actor or route changed", async () => {
    const port = palettePort();
    let current = true;
    const assertCurrent = () => {
      if (!current) throw new DOMException("changed", "AbortError");
    };
    const load = async () => {
      current = false;
      return port;
    };
    await expect(saveCampusPaletteToStudio(["#112233"], assertCurrent, load))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(port.commit).not.toHaveBeenCalled();
  });

  it("rechecks context after commit before claiming a receipt", async () => {
    let current = true;
    const port = palettePort(vi.fn(async () => { current = false; }));
    const assertCurrent = () => {
      if (!current) throw new DOMException("changed", "AbortError");
    };
    await expect(saveCampusPaletteToStudio(["#112233"], assertCurrent, async () => port))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
