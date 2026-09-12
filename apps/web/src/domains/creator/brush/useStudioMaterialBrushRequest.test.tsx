// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { useStudioMaterialBrushRequest } from "./useStudioMaterialBrushRequest";

const getById = vi.hoisted(() => vi.fn());
vi.mock("../studio-page-editor-runtime-loaders", () => ({
  loadStudioBrushLibrarySqliteRepository: async () => ({
    openProductBrushLibraryRepository: async () => ({ repository: { getById } }),
  }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("requested saved material brush", () => {
  it("applies a committed recipe once even when unrelated route parameters change", async () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program());
    getById.mockResolvedValue(saved);
    const apply = vi.fn();
    const error = vi.fn();
    const { rerender } = renderHook(({ search }) => useStudioMaterialBrushRequest(search, apply, error), {
      initialProps: { search: `?materialBrush=${saved.id}` },
    });
    await waitFor(() => expect(apply).toHaveBeenCalledWith(saved));
    rerender({ search: `?materialBrush=${saved.id}&id=work` });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("reports missing recipes and never replaces the active brush with a fallback", async () => {
    getById.mockResolvedValue(null);
    const apply = vi.fn();
    const error = vi.fn();
    renderHook(() => useStudioMaterialBrushRequest("?materialBrush=missing", apply, error));
    await waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not apply a completed asynchronous read after leaving the editor", async () => {
    let resolveRead: (value: unknown) => void = () => undefined;
    getById.mockReturnValue(new Promise((resolve) => { resolveRead = resolve; }));
    const apply = vi.fn();
    const { unmount } = renderHook(() => useStudioMaterialBrushRequest("?materialBrush=closed", apply, vi.fn()));
    await waitFor(() => expect(getById).toHaveBeenCalled());
    unmount();
    resolveRead(createBrushStudioV6ProductBrush(createBrushStudioV6Program()));
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
  });
});
