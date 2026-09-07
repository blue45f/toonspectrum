import { describe, expect, it, vi } from "vitest";

import { createStudioLayerCompHandlers } from "./createStudioLayerCompHandlers";
import { captureLayerComp } from "./studio-layer-comps";

import type { PageState } from "../studio-page-state";

const comp = captureLayerComp("선화", [{ id: "ink", visible: false, opacity: 0.4 }], "comp-1", 1000);

function fixture() {
  let page: PageState = {
    id: "page-1", bg: "#fff", bgGrad: null, canvasH: 1080, layerComps: [comp],
    elements: [{ id: "ink", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, src: "" }],
  };
  const options = {
    prepare: vi.fn(() => true),
    getPage: () => page,
    canMutate: vi.fn(() => true),
    captureMutationTicket: vi.fn(() => ({ generation: 1 })),
    canApplyMutation: vi.fn(() => true),
    acquire: vi.fn(async () => true),
    release: vi.fn(),
    commit: vi.fn(() => true),
    reportError: vi.fn(),
  };
  return { options, handlers: createStudioLayerCompHandlers(options), getPage: () => page,
    setPage: (next: PageState) => { page = next; } };
}

describe("createStudioLayerCompHandlers", () => {
  it.each(["capture", "update", "rename", "delete"] as const)(
    "preserves newly flushed document elements while handling %s metadata",
    (operation) => {
      const { options, handlers, getPage, setPage } = fixture();
      const latest = { ...getPage(), elements: getPage().elements.map((element) => ({ ...element, opacity: 0.3 })) };
      options.prepare.mockImplementation(() => { setPage(latest); return true; });
      const result = operation === "capture" || operation === "update"
        ? handlers.onCaptureLayerComp("새 콤프", operation === "update" ? comp.id : undefined)
        : handlers.onChangeLayerComps(operation === "rename" ? [{ ...comp, name: "새 이름" }] : []);

      expect(result).toBe(true);
      expect(options.commit).toHaveBeenCalledExactlyOnceWith(latest.elements,
        { layerComps: expect.any(Array) }, latest.id);
      expect(options.acquire).not.toHaveBeenCalled();
      expect(options.captureMutationTicket).not.toHaveBeenCalled();
    },
  );

  it("captures the mutation ticket after flushing and applies through a page lease", async () => {
    const { options, handlers, getPage } = fixture();
    const ticket = { generation: 2 };
    options.prepare.mockImplementation(() => {
      options.captureMutationTicket.mockReturnValue(ticket);
      return true;
    });
    expect(await handlers.onApplyLayerComp(comp)).toBe(true);
    expect(options.canApplyMutation).toHaveBeenCalledWith(ticket);
    expect(options.acquire).toHaveBeenCalledExactlyOnceWith(null);
    expect(options.commit).toHaveBeenCalledExactlyOnceWith(
      [expect.objectContaining({ id: "ink", hidden: true, opacity: 0.4 })], {}, getPage().id,
    );
    expect(options.release).toHaveBeenCalledTimes(1);
  });

  it("keeps rejected retained strokes outside a new transaction", async () => {
    const { options, handlers } = fixture();
    options.prepare.mockReturnValue(false);
    expect(await handlers.onApplyLayerComp(comp)).toBe(false);
    expect(options.captureMutationTicket).not.toHaveBeenCalled();
    expect(options.acquire).not.toHaveBeenCalled();
    expect(options.commit).not.toHaveBeenCalled();
  });

  it.each(["locked", "stale-ticket", "page-change"] as const)(
    "revalidates %s after asynchronous lease acquisition and releases ownership",
    async (change) => {
      const { options, handlers, getPage, setPage } = fixture();
      options.acquire.mockImplementation(async () => {
        if (change === "locked") options.canMutate.mockReturnValue(false);
        if (change === "stale-ticket") options.canApplyMutation.mockReturnValue(false);
        if (change === "page-change") setPage({ ...getPage(), id: "page-2" });
        return true;
      });
      expect(await handlers.onApplyLayerComp(comp)).toBe(false);
      expect(options.commit).not.toHaveBeenCalled();
      expect(options.reportError).toHaveBeenCalledTimes(1);
      expect(options.release).toHaveBeenCalledTimes(1);
    },
  );
});
