import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush, saveBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";

const { repository, product } = vi.hoisted(() => {
  const repository = { put: vi.fn(), getById: vi.fn() };
  return { repository, product: { repository, authority: "sqlite" } };
});
vi.mock("../studio-page-editor-runtime-loaders", () => ({
  loadStudioBrushLibrarySqliteRepository: async () => ({
    openProductBrushLibraryRepository: async () => product,
  }),
}));

describe("Brush Editor product save", () => {
  beforeEach(() => {
    product.authority = "sqlite";
    vi.resetAllMocks();
  });

  it("awaits the durable write and reads it back before reporting an applicable brush", async () => {
    const program = createBrushStudioV6Program("oil-hair-mixer");
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockImplementation(async (id) => ({ ...createBrushStudioV6ProductBrush(program), id }));
    const saved = await saveBrushStudioV6ProductBrush(program);
    expect(saved.enginePrograms?.material?.version).toBe(2);
    expect(saved.enginePrograms?.material?.runtime).toMatchObject({
      fallbackPolicy: "none",
      licenseProfile: "noncommercial-full",
    });
    expect(repository.getById).toHaveBeenLastCalledWith(saved.id);
    expect(saved.pressureCurve).toBe(1);
    expect(saved.enginePrograms?.material?.input.pressureGamma).toBe(program.input.pressureGamma);
  });

  it("refuses an unavailable engine instead of changing the selected recipe", () => {
    const base = createBrushStudioV6Program("clean-ink");
    expect(() => createBrushStudioV6ProductBrush({
      ...base,
      slots: { ...base.slots, pigment: "pigment-painter-lut" },
    })).toThrow(/pigment-painter-lut/u);
  });

  it("propagates storage failure and refuses a recipe lost during readback", async () => {
    repository.put.mockRejectedValueOnce(new Error("quota"));
    await expect(saveBrushStudioV6ProductBrush(createBrushStudioV6Program())).rejects.toThrow("quota");
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockResolvedValueOnce(null);
    await expect(saveBrushStudioV6ProductBrush(createBrushStudioV6Program())).rejects.toThrow("다시 읽지");
  });

  it("refuses session-only storage before writing a brush that would be lost on navigation", async () => {
    product.authority = "memory-session";
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockResolvedValue(createBrushStudioV6ProductBrush(createBrushStudioV6Program()));

    await expect(saveBrushStudioV6ProductBrush(createBrushStudioV6Program())).rejects.toThrow();

    expect(repository.put).not.toHaveBeenCalled();
    expect(repository.getById).not.toHaveBeenCalled();
  });
  it.each(["seed", "color", "flow", "binding"])("rejects corrupted %s despite valid version flags", async (field) => {
    const program = createBrushStudioV6Program("oil-hair-mixer");
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockImplementation(async (id) => {
      const brush = structuredClone(createBrushStudioV6ProductBrush(program));
      brush.id = id;
      const material = brush.enginePrograms!.material!;
      if (field === "seed") Object.assign(material, { seed: material.seed + 1 });
      if (field === "color") brush.color = "#abcdef";
      if (field === "flow") Object.assign(material.tuning, { flow: 0.37 });
      if (field === "binding") Object.assign(material.runtime!.bindings[0]!, { version: "future" });
      return brush;
    });
    await expect(saveBrushStudioV6ProductBrush(program)).rejects.toThrow("다시 읽지");
  });

  it("keeps zero material opacity in the actual saved tool snapshot", () => {
    const base = createBrushStudioV6Program();
    const program = { ...base, tuning: { ...base.tuning, opacity: 0 } };
    const saved = createBrushStudioV6ProductBrush(program);
    expect(saved.brushOpacity).toBe(0);
    expect(saved.enginePrograms?.material?.tuning.opacity).toBe(0);
  });

});
