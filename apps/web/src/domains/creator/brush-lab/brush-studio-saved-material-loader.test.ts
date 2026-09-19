import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBrushStudioSavedMaterial } from "./brush-studio-saved-material-loader";
import { createBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";
import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "./brush-studio-v6-material-receipt";

const { getById, put, product } = vi.hoisted(() => {
  const getById = vi.fn(), put = vi.fn();
  return { getById, put, product: { authority: "sqlite", repository: { getById, put } } };
});
vi.mock("../studio-page-editor-runtime-loaders", () => ({
  loadStudioBrushLibrarySqliteRepository: async () => ({ openProductBrushLibraryRepository: async () => product }),
}));
beforeEach(() => { vi.clearAllMocks(); product.authority = "sqlite"; });

describe("opening a saved material brush without recipe approximation", () => {
  it("reads the saved identity and all effective material values without writing", async () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
    saved.name = "내 실제 브러시"; saved.strokeWidth = 91; saved.brushOpacity = 0; saved.color = "#aaccee";
    const before = structuredClone(saved);
    getById.mockResolvedValue(saved);
    const result = await loadBrushStudioSavedMaterial(saved.id);
    expect(result.program.name).toBe(saved.name);
    expect(result.persistent).toBe(true);
    expect(createBrushStudioV6MaterialReceipt(result.program)).toEqual({ ...saved.enginePrograms!.material!,
      tuning: { ...saved.enginePrograms!.material!.tuning, size: 91, opacity: 0, primaryColor: "#aaccee" } });
    expect(saved).toEqual(before); expect(put).not.toHaveBeenCalled();
  });
  it("refuses a missing brush rather than opening a default recipe", async () => {
    getById.mockResolvedValue(null);
    await expect(loadBrushStudioSavedMaterial("missing")).rejects.toThrow("찾지 못했습니다");
    expect(put).not.toHaveBeenCalled();
  });
  it("refuses a saved non-material brush and never guesses a matching recipe", async () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program());
    saved.enginePrograms = null; getById.mockResolvedValue(saved);
    await expect(loadBrushStudioSavedMaterial(saved.id)).rejects.toThrow("아직 지원하지 않습니다");
  });
  it("preserves the explicit session-only storage status", async () => {
    product.authority = "memory-session";
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program());
    getById.mockResolvedValue(saved);
    expect((await loadBrushStudioSavedMaterial(saved.id)).persistent).toBe(false);
  });
  it("propagates storage failures without attempting a fallback write", async () => {
    getById.mockRejectedValue(new Error("corrupt-storage"));
    await expect(loadBrushStudioSavedMaterial("id")).rejects.toThrow("corrupt-storage");
    expect(put).not.toHaveBeenCalled();
  });
});
