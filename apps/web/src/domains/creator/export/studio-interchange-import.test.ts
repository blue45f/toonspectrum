import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioInterchangeImportOrchestration, type StudioInterchangeImportOrchestrationInput } from "./studio-interchange-import";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { PageState } from "../studio-page-state";
import type { PsdImportResult } from "../studio-psd-import";
import type { StudioPsdImportOptions } from "../studio-psd-import-progress";
import type { ChangeEvent } from "react";

const { importPsd } = vi.hoisted(() => ({ importPsd: vi.fn() }));
vi.mock("./studio-document-export-loaders", () => ({
  loadStudioPsdImportModule: async () => ({ importPsdFile: importPsd, psdImportResultMessage: () => "원본 레이어 1개" }),
}));

const result: PsdImportResult = {
  layerPixelStorage: "native-png", sourceWidth: 100, sourceHeight: 100, scale: 1, skipped: [],
  elements: [{ id: "layer", type: "image", src: "data:image/png;base64,AAAA", x: 0, y: 0, width: 100, height: 100, rotation: 0 }],
};
function fileEvent(): ChangeEvent<HTMLInputElement> {
  return { target: { files: [new File([], "original.psd")], value: "original.psd" } } as unknown as ChangeEvent<HTMLInputElement>;
}
function setup() {
  const page = { id: "page", elements: [] } as unknown as PageState;
  const input: StudioInterchangeImportOrchestrationInput = {
    interchangeImportBusy: false, psdImportBusy: false, pages: [page], activePage: page,
    master: { elements: [] }, isMobile: false, collaborationDocumentLocked: false,
    activePageMutationLocked: false, pendingInterchangeImport: null,
    interchangeImportChoice: "new-page", willImportChoice: null,
    documentImportEpochRef: { current: 0 }, documentImportOperationRef: { current: null },
    interchangeImportAbortRef: { current: null },
    captureStudioMutationTicket: vi.fn(() => ({} as StudioEditorMutationTicket)),
    canApplyStudioMutation: vi.fn(() => true), commitPages: vi.fn(() => true),
    setCurrentPageId: vi.fn(), setError: vi.fn(), setInterchangeImportBusy: vi.fn(),
    setInterchangeImportStatus: vi.fn(), setPsdImportBusy: vi.fn(), setPsdImportStatus: vi.fn(),
    setPendingInterchangeImport: vi.fn(), setInterchangeImportChoice: vi.fn(),
    setWillImportChoice: vi.fn(), setProjectActionsOpen: vi.fn(),
  };
  return { input, handlers: createStudioInterchangeImportOrchestration(input) };
}

beforeEach(() => { importPsd.mockReset().mockResolvedValue(result); });

describe("PSD import operation ownership", () => {
  it("uses native-pixel import with a signal and retains the existing loss preview confirmation", async () => {
    const { input, handlers } = setup();
    const event = fileEvent();
    await handlers.handleImportPsd(event);
    expect(event.target.value).toBe("");
    expect(importPsd).toHaveBeenCalledTimes(1);
    expect(importPsd.mock.calls[0]?.[3]).toMatchObject({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) });
    expect(input.setPendingInterchangeImport).toHaveBeenCalledWith(expect.objectContaining({ kind: "psd", result }));
    expect(input.commitPages).not.toHaveBeenCalled();
    expect(input.setPsdImportBusy).toHaveBeenLastCalledWith(false);
    expect(input.interchangeImportAbortRef.current).toBeNull();
  });

  it("cancels before lazy imports finish without invoking the decoder", async () => {
    const { input, handlers } = setup();
    const pending = handlers.handleImportPsd(fileEvent());
    handlers.cancelInterchangeImport();
    await pending;
    expect(importPsd).not.toHaveBeenCalled();
    expect(input.documentImportOperationRef.current).toBeNull();
    expect(input.setPsdImportBusy).toHaveBeenLastCalledWith(false);
    expect(input.setPendingInterchangeImport).not.toHaveBeenCalled();
  });

  it("ignores late progress and results after cancellation", async () => {
    let finish!: (value: PsdImportResult) => void;
    importPsd.mockImplementation(() => new Promise<PsdImportResult>((resolve) => { finish = resolve; }));
    const { input, handlers } = setup();
    const pending = handlers.handleImportPsd(fileEvent());
    await vi.waitFor(() => expect(importPsd).toHaveBeenCalledTimes(1));
    const options = importPsd.mock.calls[0]?.[3] as StudioPsdImportOptions;
    handlers.cancelInterchangeImport();
    expect(options.signal?.aborted).toBe(true);
    const statusCalls = vi.mocked(input.setPsdImportStatus).mock.calls.length;
    options.onProgress?.({ stage: "complete", completedLayers: 1, totalLayers: 1 });
    expect(vi.mocked(input.setPsdImportStatus).mock.calls).toHaveLength(statusCalls);
    finish(result);
    await pending;
    expect(input.setPendingInterchangeImport).not.toHaveBeenCalled();
    expect(input.commitPages).not.toHaveBeenCalled();
    expect(input.setError).not.toHaveBeenCalled();
  });

  it("an older cancelled import cannot clear the newer import's busy state or controller", async () => {
    const completions: ((value: PsdImportResult) => void)[] = [];
    importPsd.mockImplementation(() => new Promise<PsdImportResult>((resolve) => { completions.push(resolve); }));
    const { input, handlers } = setup();
    const first = handlers.handleImportPsd(fileEvent());
    await vi.waitFor(() => expect(importPsd).toHaveBeenCalledTimes(1));
    handlers.cancelInterchangeImport();
    const second = handlers.handleImportPsd(fileEvent());
    await vi.waitFor(() => expect(importPsd).toHaveBeenCalledTimes(2));
    const secondController = input.interchangeImportAbortRef.current;
    completions[0]?.(result);
    await first;
    expect(input.interchangeImportAbortRef.current).toBe(secondController);
    expect(input.setPsdImportBusy).toHaveBeenLastCalledWith(true);
    expect(input.setPendingInterchangeImport).not.toHaveBeenCalled();
    completions[1]?.(result);
    await second;
    expect(input.setPendingInterchangeImport).toHaveBeenCalledTimes(1);
    expect(input.setPsdImportBusy).toHaveBeenLastCalledWith(false);
  });

  it("does not apply a result to a document whose mutation ticket is no longer valid", async () => {
    const { input, handlers } = setup();
    importPsd.mockImplementation(async () => {
      vi.mocked(input.canApplyStudioMutation).mockReturnValue(false);
      return result;
    });
    await handlers.handleImportPsd(fileEvent());
    expect(input.setPendingInterchangeImport).not.toHaveBeenCalled();
    expect(input.commitPages).not.toHaveBeenCalled();
    expect(input.setPsdImportBusy).toHaveBeenLastCalledWith(false);
  });
});
