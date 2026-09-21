import { describe, expect, it, vi } from "vitest";

const observations = vi.hoisted(() => ({ moduleLoaded: vi.fn() }));
vi.mock("../../../../../../packages/studio-format-gateway/src/krita-bundle", () => {
  observations.moduleLoaded();
  class KritaBundleError extends Error {}
  return {
    KritaBundleError,
    importKritaBundle: async () => { throw new KritaBundleError("Invalid fixture"); },
  };
});

describe("Krita archive parser intent boundary", () => {
  it("does not load with the router and retains the typed import error on explicit use", async () => {
    expect(observations.moduleLoaded).not.toHaveBeenCalled();
    const router = await import("./studio-brush-pack-import");
    expect(observations.moduleLoaded).not.toHaveBeenCalled();
    await expect(router.importStudioKritaBundleBytes(new Uint8Array())).rejects.toMatchObject({
      name: "StudioBrushProgramImportError",
      format: "bundle",
      message: "Krita 브러시 번들(.bundle)을 읽지 못했어요. Invalid fixture",
      cause: expect.objectContaining({ message: "Invalid fixture" }),
    });
    expect(observations.moduleLoaded).toHaveBeenCalledOnce();
  });
});
