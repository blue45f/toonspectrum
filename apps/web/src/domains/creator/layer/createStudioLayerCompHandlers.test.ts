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
  const release = vi.fn();
  const options = {
    captureLeaseRelease: vi.fn(() => release),
    prepare: vi.fn(() => true),
    getPage: () => page,
    canMutate: vi.fn(() => true),
    captureMutationTicket: vi.fn(() => ({ generation: 1 })),
    canApplyMutation: vi.fn(() => true),
    acquire: vi.fn(async () => true),
    createSynchronizationBarrier: vi.fn(() => vi.fn<() => Promise<void>>(async () => undefined)), release,
    commit: vi.fn(() => true),
    reportError: vi.fn(),
  };
  return { options, handlers: createStudioLayerCompHandlers(options), getPage: () => page,
    setPage: (next: PageState) => { page = next; } };
}

describe("createStudioLayerCompHandlers", () => {
  it.each(["capture", "update", "rename", "delete"] as const)(
    "preserves newly flushed document elements while handling %s metadata",
    async (operation) => {
      const { options, handlers, getPage, setPage } = fixture();
      const latest = { ...getPage(), elements: getPage().elements.map((element) => ({ ...element, opacity: 0.3 })) };
      options.prepare.mockImplementation(() => { setPage(latest); return true; });
      const result = operation === "capture" || operation === "update"
        ? await handlers.onCaptureLayerComp("새 콤프", operation === "update" ? comp.id : undefined)
        : await handlers.onChangeLayerComps(operation === "rename" ? [{ ...comp, name: "새 이름" }] : []);

      expect(result).toBe(true);
      expect(options.commit).toHaveBeenCalledExactlyOnceWith(latest.elements,
        { layerComps: expect.any(Array) }, latest.id);
      expect(options.acquire).toHaveBeenCalledExactlyOnceWith(null);
      expect(options.release).toHaveBeenCalledOnce();
      expect(options.captureMutationTicket).toHaveBeenCalledOnce();
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

  it.each(["capture", "update", "rename"] as const)(
    "uses the real aggregate page serializer before accepting %s metadata",
    async (operation) => {
      const { options, handlers, getPage, setPage } = fixture();
      const current: PageState = {
        ...getPage(),
        elements: Array.from({ length: 96 }, (_, index) => ({
          id: `layer-${index}-${"x".repeat(24)}`, type: "image", x: 0, y: 0,
          width: 10, height: 10, rotation: 0, src: "",
        })),
      };
      setPage(current);
      const result = operation === "rename"
        ? await handlers.onChangeLayerComps([{ ...comp, name: "수정", notes: "x".repeat(8_192) }])
        : await handlers.onCaptureLayerComp("추가", operation === "update" ? comp.id : undefined);

      expect(result).toBe(false);
      expect(options.commit).not.toHaveBeenCalled();
      expect(options.reportError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("콤프 저장 용량"));
      expect(getPage()).toBe(current);
      expect(options.acquire).toHaveBeenCalledExactlyOnceWith(null);
      expect(options.release).toHaveBeenCalledOnce();
      expect(options.captureMutationTicket).toHaveBeenCalledOnce();
    },
  );

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

  it.each(["capture", "update", "rename", "delete"] as const)(
    "rejects a stale mutation ticket before accepting %s after the page lease", async (operation) => {
      const { options, handlers, getPage } = fixture();
      options.acquire.mockImplementation(async () => { options.canApplyMutation.mockReturnValue(false); return true; });
      const result = operation === "capture" || operation === "update"
        ? await handlers.onCaptureLayerComp("새 캡처", operation === "update" ? comp.id : undefined)
        : await handlers.onChangeLayerComps(operation === "rename" ? [{ ...comp, name: "새 이름" }] : [], getPage().layerComps);
      expect(result).toBe(false);
      expect(options.prepare).toHaveBeenCalledOnce();
      expect(options.captureMutationTicket).toHaveBeenCalledOnce();
      expect(options.canApplyMutation).toHaveBeenCalledWith({ generation: 1 });
      expect(options.commit).not.toHaveBeenCalled();
      expect(options.release).toHaveBeenCalledOnce();
    },
  );

  it("passes the rendered comp list to the leased transaction instead of accepting an obsolete replacement", async () => {
    const { options, handlers, getPage, setPage } = fixture();
    const rendered = getPage().layerComps!;
    setPage({ ...getPage(), layerComps: [...rendered, { ...comp, id: "peer-comp" }] });
    expect(await handlers.onChangeLayerComps([], rendered)).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.release).toHaveBeenCalledOnce();
  });


  it("captures one synchronization generation for both waits even if the active runtime changes", async () => {
    const { options, handlers } = fixture();
    const captured = vi.fn<() => Promise<void>>(async () => undefined);
    const replacement = vi.fn<() => Promise<void>>(async () => undefined);
    options.createSynchronizationBarrier.mockReturnValue(captured);
    options.acquire.mockImplementation(async () => {
      options.createSynchronizationBarrier.mockReturnValue(replacement);
      return true;
    });
    expect(await handlers.onCaptureLayerComp("동일 세대")).toBe(true);
    expect(options.createSynchronizationBarrier).toHaveBeenCalledOnce();
    expect(captured).toHaveBeenCalledTimes(2);
    expect(replacement).not.toHaveBeenCalled();
  });


  it("retains the release closure captured for its own lease across a later operation", async () => {
    const { options, handlers } = fixture();
    const oldRelease = vi.fn();
    const nextRelease = vi.fn();
    let finishOldDelivery!: () => void;
    const oldDelivery = new Promise<void>((resolve) => { finishOldDelivery = resolve; });
    const firstSynchronization = vi.fn<() => Promise<void>>(async () => undefined).mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => oldDelivery);
    options.createSynchronizationBarrier.mockReturnValueOnce(firstSynchronization)
      .mockReturnValueOnce(vi.fn<() => Promise<void>>(async () => undefined));
    options.captureLeaseRelease.mockReturnValueOnce(oldRelease).mockReturnValueOnce(nextRelease);
    const first = handlers.onCaptureLayerComp("이전 작업");
    await vi.waitFor(() => expect(firstSynchronization).toHaveBeenCalledTimes(2));
    expect(oldRelease).not.toHaveBeenCalled();
    expect(await handlers.onCaptureLayerComp("다음 작업")).toBe(true);
    expect(nextRelease).toHaveBeenCalledOnce();
    finishOldDelivery();
    expect(await first).toBe(true);
    expect(oldRelease).toHaveBeenCalledOnce();
    expect(nextRelease).toHaveBeenCalledOnce();
    expect(options.captureLeaseRelease).toHaveBeenCalledTimes(2);
  });

});
