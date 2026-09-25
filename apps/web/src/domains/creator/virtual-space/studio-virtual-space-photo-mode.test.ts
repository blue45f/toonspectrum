// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { captureStudioVirtualPhoto } from "./studio-virtual-space-photo-mode";

afterEach(() => vi.restoreAllMocks());

describe("Virtual Studio photo mode", () => {
  it("downloads only the rendered world canvas with a deterministic filename", async () => {
    document.body.innerHTML = '<div class="studio-vspace-phaser-canvas"><canvas width="640" height="480"></canvas></div>';
    const canvas = document.querySelector("canvas")!;
    const blob = new Blob(["png"], { type: "image/png" });
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(blob));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:virtual-studio");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const capture = await captureStudioVirtualPhoto(document, Date.UTC(2026, 8, 25, 8, 30));
    expect(capture).toEqual({
      filename: "toonspectrum-virtual-studio-2026-09-25T08-30-00-000Z.png",
      bytes: 3,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:virtual-studio");
  });

  it("fails closed when a rendered canvas is unavailable", async () => {
    document.body.innerHTML = "<main />";
    await expect(captureStudioVirtualPhoto(document)).rejects.toThrow("photo-canvas-unavailable");
  });
});
