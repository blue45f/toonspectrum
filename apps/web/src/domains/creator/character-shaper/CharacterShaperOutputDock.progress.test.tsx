// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterShaperOutputDock } from "./CharacterShaperOutputDock";

import type { ExportCharacterSemanticPsdInput } from "./character-shaper-semantic-psd";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const exportPsd = vi.hoisted(() => vi.fn());
vi.mock("./character-shaper-semantic-psd", () => ({
  exportCharacterSemanticPsd: exportPsd,
  boundCharacterSemanticCaptureSize: (width: number, height: number) => ({ width, height }),
}));
vi.mock("../vrm/studio-vrm-raster-capture", () => ({
  captureStudioVrmRgbaCooperatively: vi.fn(),
  encodeStudioVrmCapturePngBlob: vi.fn(),
}));
vi.mock("../vrm/studio-vrm-poser-helpers", () => ({
  roundExportSize: () => ({ width: 512, height: 640 }),
}));

function fixture() {
  const operation = { current: null as string | null };
  const releaseHelpers = vi.fn();
  const host = {
    captureOperationRef: operation,
    acquireVrmCaptureOperation: vi.fn((kind: string) => {
      if (operation.current !== null) return false;
      operation.current = kind;
      return true;
    }),
    releaseVrmCaptureOperation: vi.fn(() => { operation.current = null; }),
    setIsCapturing: vi.fn(),
    texturePaintMutationBlockedRef: { current: false },
    wardrobeMutationBlockedRef: { current: false },
    status: "ready", vrm: { scene: {} }, activeModelId: "sample", isCapturing: false,
    libraryEntries: [{ id: "sample", name: "샘플 캐릭터" }],
    transparentBackground: true, setTransparentBackground: vi.fn(),
    insertBackgroundColor: "#ffffff", setInsertBackgroundColor: vi.fn(),
    handleInsert: vi.fn(), acquireVrmCaptureHelperLease: vi.fn(() => releaseHelpers),
    texturePaintDisabledReason: "",
    captureRef: { current: { gl: { domElement: document.createElement("canvas") }, scene: {}, camera: {} } },
  } as unknown as StudioVrmPoserHost;
  const binding = { busyReason: null, previewEntryId: null } as unknown as CharacterShaperBinding;
  const element = (h = host) => <CharacterShaperOutputDock h={h} binding={binding} drawer={null}
    onOpenDrawer={vi.fn()} paintActive={false} onTogglePaint={vi.fn()} compact={false} />;
  return { host, operation, releaseHelpers, element };
}

function deferredExport() {
  let input: ExportCharacterSemanticPsdInput | undefined;
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((accept, fail) => { resolve = accept; reject = fail; });
  exportPsd.mockImplementationOnce((value: ExportCharacterSemanticPsdInput) => { input = value; return promise; });
  return { promise, resolve, reject, getInput: () => {
    if (!input) throw new Error("export has not started");
    return input;
  } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:psd") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function start() {
  const state = fixture();
  const deferred = deferredExport();
  const view = render(state.element());
  fireEvent.click(screen.getByRole("button", { name: "PSD 내보내기" }));
  await waitFor(() => expect(exportPsd).toHaveBeenCalledTimes(1));
  return { ...state, ...deferred, view, input: deferred.getInput() };
}

async function rejectCancelled(state: Awaited<ReturnType<typeof start>>) {
  await act(async () => {
    state.reject(new DOMException("cancelled", "AbortError"));
    await state.promise.catch(() => undefined);
  });
}

describe("CharacterShaperOutputDock cooperative progress", () => {
  it("renders per-pass progress without resizing the viewport and transitions to encoding", async () => {
    const state = await start();
    act(() => state.input.onProgress?.({ pass: "flat", phase: "render", completed: 1, total: 4 }));
    expect(screen.getByRole("status").textContent).toContain("PSD 밑색 렌더링 중 · 25%");
    expect(screen.getByRole("status").parentElement?.className).toContain("absolute");
    act(() => state.input.onProgress?.({ pass: "line", phase: "derive", completed: 12, total: 16 }));
    expect(screen.getByRole("status").textContent).toContain("PSD 주선 계산 중 · 75%");
    act(() => state.input.onProgress?.({ pass: "mask-eyes", phase: "render", completed: 2, total: 2 }));
    expect(screen.getByRole("status").textContent).toContain("눈 마스크 렌더링 중 · 100%");
    act(() => state.input.onCaptured?.());
    expect(screen.getByRole("status").textContent).toContain("PSD 파일 만드는 중");
    expect(state.releaseHelpers).toHaveBeenCalledTimes(1);
    await act(async () => {
      state.resolve({ blob: new Blob(["psd"]), receipt: { layerNames: ["밑색"], skipped: [] } });
      await state.promise;
    });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("PSD 레이어 1개 저장"));
    expect(state.operation.current).toBeNull();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it("ignores late progress and prevents downloads after explicit cancellation", async () => {
    const state = await start();
    act(() => state.input.onProgress?.({ pass: "flat", phase: "render", completed: 1, total: 4 }));
    const before = screen.getByRole("status").textContent;
    fireEvent.click(screen.getByRole("button", { name: "내보내기 취소" }));
    expect(state.input.signal?.aborted).toBe(true);
    act(() => state.input.onProgress?.({ pass: "line", phase: "derive", completed: 1, total: 1 }));
    expect(screen.getByRole("status").textContent).toBe(before);
    await rejectCancelled(state);
    expect(screen.getByRole("status").textContent).toContain("내보내기를 취소했습니다.");
    expect(state.operation.current).toBeNull();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("aborts when the model changes and does not display stale progress", async () => {
    const state = await start();
    const nextHost = { ...state.host, activeModelId: "another" };
    state.view.rerender(state.element(nextHost));
    expect(state.input.signal?.aborted).toBe(true);
    const before = screen.getByRole("status").textContent;
    act(() => state.input.onProgress?.({ pass: "mask-face", phase: "render", completed: 1, total: 1 }));
    expect(screen.getByRole("status").textContent).toBe(before);
    await rejectCancelled(state);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("releases capture authority after unmount without publishing late progress or a file", async () => {
    const state = await start();
    state.view.unmount();
    expect(state.input.signal?.aborted).toBe(true);
    act(() => state.input.onProgress?.({ pass: "flat", phase: "render", completed: 1, total: 1 }));
    await rejectCancelled(state);
    expect(screen.queryByRole("status")).toBeNull();
    expect(state.operation.current).toBeNull();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
});
