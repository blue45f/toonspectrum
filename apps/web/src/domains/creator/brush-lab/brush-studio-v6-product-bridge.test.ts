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
    expect(saved.enginePrograms?.material?.version).toBe(1);
    expect(repository.getById).toHaveBeenLastCalledWith(saved.id);
    expect(saved.pressureCurve).toBe(1);
    expect(saved.enginePrograms?.material?.input.pressureGamma).toBe(program.input.pressureGamma);
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
});
