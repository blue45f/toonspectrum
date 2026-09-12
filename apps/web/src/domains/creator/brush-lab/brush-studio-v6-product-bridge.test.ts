import { describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush, saveBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";

const repository = vi.hoisted(() => ({ put: vi.fn(), getById: vi.fn() }));
vi.mock("../studio-page-editor-runtime-loaders", () => ({
  loadStudioBrushLibrarySqliteRepository: async () => ({
    openProductBrushLibraryRepository: async () => ({ repository }),
  }),
}));

describe("Brush Editor product save", () => {
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
});
