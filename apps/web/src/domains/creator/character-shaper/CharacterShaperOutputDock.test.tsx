// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { CharacterShaperOutputDock } from "./CharacterShaperOutputDock";

import type {
  CharacterCapabilityProfile,
  CharacterHostSnapshot,
  CharacterRecipe,
  CharacterSlotAvailability,
} from "./character-shaper-contract";
import type { CharacterShaperBinding, CharacterShaperDrawerMode } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const exportCharacterSemanticPsd = vi.hoisted(() => vi.fn());
const captureStudioVrmRgbaCooperatively = vi.hoisted(() => vi.fn(async () => new Uint8ClampedArray(4)));
const encodeStudioVrmCapturePngBlob = vi.hoisted(() => vi.fn(async () => new Blob(["png"])));

vi.mock("./character-shaper-semantic-psd", () => ({
  exportCharacterSemanticPsd,
  boundCharacterSemanticCaptureSize: (width: number, height: number) => ({ width, height }),
}));

vi.mock("../vrm/studio-vrm-raster-capture", () => ({
  captureStudioVrmRgbaCooperatively,
  encodeStudioVrmCapturePngBlob,
}));

vi.mock("../vrm/studio-vrm-poser-helpers", () => ({
  roundExportSize: () => ({ width: 512, height: 640 }),
}));

function makeRecipe(): CharacterRecipe {
  const slots = Object.fromEntries(
    CHARACTER_SLOT_KINDS.map((slot) => [slot, slot === "accessory" ? [] : null]),
  ) as unknown as CharacterRecipe["slots"];
  return {
    version: 1,
    slots,
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
    handSide: "both",
  };
}

function makeBinding(overrides: Partial<CharacterShaperBinding> = {}): CharacterShaperBinding {
  return {
    catalog: { version: 1, slots: [], entries: [] },
    profile: {} as CharacterCapabilityProfile,
    snapshot: {} as CharacterHostSnapshot,
    recipe: makeRecipe(),
    baselineRecipe: makeRecipe(),
    history: { canUndo: false, canRedo: false, recentLabels: [], length: 0 },
    busyReason: null,
    handSide: "both",
    compareActive: false,
    evaluate: vi.fn((): CharacterSlotAvailability => ({ status: "available", reason: null, missing: [] })),
    plan: vi.fn(),
    commitPreset: vi.fn(),
    commit: vi.fn(),
    clear: vi.fn(() => null),
    remove: vi.fn(() => null),
    setHandSide: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    setCompareActive: vi.fn(),
    resetToBaseline: vi.fn(),
    commitFaceParams: vi.fn(),
    commitSemanticMorphs: vi.fn(),
    commitHairParams: vi.fn(),
    commitColor: vi.fn(),
    ...overrides,
  };
}

function makeHost(overrides: Record<string, unknown> = {}): StudioVrmPoserHost {
  const operation = { current: null as string | null };
  return {
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
    status: "ready",
    vrm: { scene: {} },
    isCapturing: false,
    libraryEntries: [{ id: "sample", name: "샘플 캐릭터" }],
    activeModelId: "sample",
    transparentBackground: true,
    setTransparentBackground: vi.fn(),
    insertBackgroundColor: "#ffffff",
    setInsertBackgroundColor: vi.fn(),
    handleInsert: vi.fn(),
    acquireVrmCaptureHelperLease: vi.fn(() => vi.fn()),
    texturePaintDisabledReason: "",
    captureRef: { current: { gl: { domElement: document.createElement("canvas") }, scene: {}, camera: {} } },
    ...overrides,
  } as StudioVrmPoserHost;
}

function renderDock(
  options: {
    h?: StudioVrmPoserHost;
    binding?: CharacterShaperBinding;
    drawer?: CharacterShaperDrawerMode;
    compact?: boolean;
    paintActive?: boolean;
  } = {},
) {
  const h = options.h ?? makeHost();
  const binding = options.binding ?? makeBinding();
  const onOpenDrawer = vi.fn();
  const onTogglePaint = vi.fn();
  const view = render(
    <CharacterShaperOutputDock
      h={h}
      binding={binding}
      drawer={options.drawer ?? null}
      onOpenDrawer={onOpenDrawer}
      paintActive={options.paintActive ?? false}
      onTogglePaint={onTogglePaint}
      compact={options.compact ?? false}
    />,
  );
  return { ...view, h, binding, onOpenDrawer, onTogglePaint };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:x") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  exportCharacterSemanticPsd.mockResolvedValue({
    blob: new Blob(["psd"]),
    receipt: {
      width: 512,
      height: 640,
      layerNames: ["피부", "얼굴", "눈", "헤어", "상의", "하의", "신발", "음영", "하이라이트", "주선"],
      skipped: [{ pass: "surface-paint", reason: "표면 드로잉 텍스처가 없습니다." }],
      byteLength: 1024,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CharacterShaperOutputDock", () => {
  it("opens each drawer mode and marks the open one", () => {
    const { onOpenDrawer } = renderDock({ drawer: "photo" });

    expect(screen.getByRole("button", { name: "사진 포즈" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "웹캠" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "참고 이미지 AI 추천" }));
    expect(onOpenDrawer).toHaveBeenCalledWith("reference");
  });

  it("toggles 표면 드로잉 and reports the runtime's reason when it cannot run", () => {
    const { onTogglePaint } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "표면 드로잉" }));
    expect(onTogglePaint).toHaveBeenCalledTimes(1);

    cleanup();
    renderDock({ h: makeHost({ texturePaintDisabledReason: "이 모델에는 칠할 수 있는 표면이 없습니다." }) });
    const blocked = screen.getByRole("button", { name: "표면 드로잉" }) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toBe("이 모델에는 칠할 수 있는 표면이 없습니다.");
  });

  it("adds the character to the canvas through the host", () => {
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "캔버스에 추가" }));
    expect(h.handleInsert).toHaveBeenCalledTimes(1);
  });

  it("blocks the insert while the runtime is capturing", () => {
    const { h } = renderDock({ h: makeHost({ isCapturing: true }) });
    const insert = screen.getByRole("button", { name: "캔버스에 추가" }) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    fireEvent.click(insert);
    expect(h.handleInsert).not.toHaveBeenCalled();
  });

  it("switches the transparent background and reveals the background color", () => {
    const { h } = renderDock();
    expect(screen.queryByLabelText("삽입 배경색")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /투명 배경/u }));
    expect(h.setTransparentBackground).toHaveBeenCalledWith(false);

    cleanup();
    const opaque = renderDock({ h: makeHost({ transparentBackground: false }) });
    const color = screen.getByLabelText("삽입 배경색");
    fireEvent.change(color, { target: { value: "#112233" } });
    expect(opaque.h.setInsertBackgroundColor).toHaveBeenCalledWith("#112233");
  });

  it("saves a PNG from the live capture state", async () => {
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));

    expect(await screen.findByText(/PNG를 저장했습니다/u)).toBeTruthy();
    expect(captureStudioVrmRgbaCooperatively).toHaveBeenCalledTimes(1);
    expect(h.acquireVrmCaptureHelperLease).toHaveBeenCalledWith({ subjectOnly: true });
    expect(vi.mocked(h.acquireVrmCaptureHelperLease).mock.results[0]?.value).toHaveBeenCalledTimes(1);
    expect(encodeStudioVrmCapturePngBlob).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), {
      width: 1638,
      height: 2048,
    }, { signal: expect.any(AbortSignal) });
  });

  it("exports the semantic PSD and reports the receipt with the skipped passes", async () => {
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PSD 내보내기" }));

    expect(screen.getByRole("status").textContent).toContain("레이어를 나누는 중");
    expect(await screen.findByText(/PSD 레이어 10개 저장/u)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("표면 드로잉 텍스처가 없습니다.");

    const input = exportCharacterSemanticPsd.mock.calls[0]?.[0] as {
      readonly vrm: unknown;
      readonly width: number;
      readonly height: number;
    };
    expect(input.vrm).toBe(h.vrm);
    expect(h.acquireVrmCaptureHelperLease).toHaveBeenCalledWith({ subjectOnly: true });
    expect(vi.mocked(h.acquireVrmCaptureHelperLease).mock.results[0]?.value).toHaveBeenCalledTimes(1);
    expect(input.width).toBe(1638);
    expect(input.height).toBe(2048);
  });

  it("restores viewport helpers when PNG capture fails", async () => {
    captureStudioVrmRgbaCooperatively.mockImplementationOnce(() => { throw new Error("readback failed"); });
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    expect(await screen.findByText("PNG를 저장하지 못했습니다.")).toBeTruthy();
    expect(vi.mocked(h.acquireVrmCaptureHelperLease).mock.results[0]?.value).toHaveBeenCalledTimes(1);
  });

  it("restores helpers before PSD worker assembly while retaining export authority", async () => {
    let finish!: () => void;
    exportCharacterSemanticPsd.mockImplementationOnce((input: { onCaptured: () => void }) => {
      input.onCaptured();
      return new Promise((resolve) => {
        finish = () => resolve({ blob: new Blob(["psd"]), receipt: { layerNames: ["피부"], skipped: [] } });
      });
    });
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PSD 내보내기" }));
    expect(await screen.findByText("PSD 파일 만드는 중")).toBeTruthy();
    expect(h.captureOperationRef.current).toBe("export");
    const release = vi.mocked(h.acquireVrmCaptureHelperLease).mock.results[0]?.value;
    expect(release).toHaveBeenCalledOnce();
    await act(async () => { finish(); });
    expect(h.captureOperationRef.current).toBeNull();
    expect(release).toHaveBeenCalledOnce();
    expect(await screen.findByText(/PSD 레이어 1개 저장/u)).toBeTruthy();
  });

  it("says so when the scene is not ready instead of exporting", () => {
    renderDock({ h: makeHost({ captureRef: { current: { gl: null, scene: null, camera: null } } }) });
    fireEvent.click(screen.getByRole("button", { name: "PSD 내보내기" }));
    expect(exportCharacterSemanticPsd).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("캡처할 3D 장면이 아직 준비되지 않았습니다.");
  });

  it("reports a failed export instead of staying silent", async () => {
    exportCharacterSemanticPsd.mockRejectedValueOnce(new Error("레이어 캡처 크기가 올바르지 않습니다."));
    renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PSD 내보내기" }));
    expect(await screen.findByText(/PSD를 내보내지 못했습니다/u)).toBeTruthy();
  });


  it("owns the host capture lock, blocks editing, and releases it after export", async () => {
    let finish!: (value: Blob) => void;
    encodeStudioVrmCapturePngBlob.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const { h, onTogglePaint } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    expect(h.captureOperationRef.current).toBe("export");
    expect(h.setIsCapturing).toHaveBeenCalledWith(true);
    expect(h.texturePaintMutationBlockedRef.current).toBe(true);
    expect(h.wardrobeMutationBlockedRef.current).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "표면 드로잉" }));
    expect(onTogglePaint).not.toHaveBeenCalled();
    await waitFor(() => expect(encodeStudioVrmCapturePngBlob).toHaveBeenCalledTimes(1));
    await act(async () => { finish(new Blob(["png"])); });
    expect(h.captureOperationRef.current).toBeNull();
    expect(h.setIsCapturing).toHaveBeenLastCalledWith(false);
    expect(h.texturePaintMutationBlockedRef.current).toBe(false);
  });

  it("supports a 4K PNG without altering viewport framing", async () => {
    renderDock();
    fireEvent.change(screen.getByRole("combobox", { name: "파일 내보내기 해상도" }), { target: { value: "4096" } });
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    expect(await screen.findByText(/3277×4096/u)).toBeTruthy();
    expect(captureStudioVrmRgbaCooperatively).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(),
      { width: 3277, height: 4096 }, { alpha: 0 }, { signal: expect.any(AbortSignal), assertCurrent: expect.any(Function), onProgress: expect.any(Function) });
  });

  it("cancels during pixel capture before encoding and only releases authority after capture settles", async () => {
    let finish!: (pixels: Uint8ClampedArray<ArrayBuffer>) => void;
    captureStudioVrmRgbaCooperatively.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    await waitFor(() => expect(captureStudioVrmRgbaCooperatively).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "내보내기 취소" }));
    expect(h.captureOperationRef.current).toBe("export");
    await act(async () => { finish(new Uint8ClampedArray(4)); });
    expect(encodeStudioVrmCapturePngBlob).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(h.captureOperationRef.current).toBeNull();
    expect(vi.mocked(h.acquireVrmCaptureHelperLease).mock.results[0]?.value).toHaveBeenCalledOnce();
    expect(await screen.findByText("내보내기를 취소했습니다.")).toBeTruthy();
  });

  it("cancels an encoding export without downloading or leaving a capture lock", async () => {
    let finish!: (value: Blob) => void;
    encodeStudioVrmCapturePngBlob.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const { h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    await waitFor(() => expect(encodeStudioVrmCapturePngBlob).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "내보내기 취소" }));
    expect(h.captureOperationRef.current).toBe("export");
    await act(async () => { finish(new Blob(["png"])); });
    expect(h.captureOperationRef.current).toBeNull();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(await screen.findByText("내보내기를 취소했습니다.")).toBeTruthy();
  });

  it("does not download a pending export after the workshop unmounts", async () => {
    let finish!: (value: Blob) => void;
    encodeStudioVrmCapturePngBlob.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const { unmount, h } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    await waitFor(() => expect(encodeStudioVrmCapturePngBlob).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { finish(new Blob(["png"])); });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(h.captureOperationRef.current).toBeNull();
  });

  it("releases the lock and allows retry when capture helper acquisition fails", async () => {
    const h = makeHost({ acquireVrmCaptureHelperLease: vi.fn(() => { throw new Error("helper failed"); }) });
    renderDock({ h });
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    expect(await screen.findByText("PNG를 저장하지 못했습니다.")).toBeTruthy();
    expect(h.captureOperationRef.current).toBeNull();
    expect((screen.getByRole("button", { name: "PNG 저장" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("works after StrictMode remounts its effects", async () => {
    render(<StrictMode><CharacterShaperOutputDock h={makeHost()} binding={makeBinding()} drawer={null}
      onOpenDrawer={vi.fn()} paintActive={false} onTogglePaint={vi.fn()} compact={false} /></StrictMode>);
    fireEvent.click(screen.getByRole("button", { name: "PNG 저장" }));
    expect(await screen.findByText(/PNG를 저장했습니다/u)).toBeTruthy();
  });

  it("collapses to icon buttons with an overflow sheet on mobile", () => {
    renderDock({ compact: true });

    expect(screen.queryByRole("button", { name: "PNG 저장" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내보내기 더 보기" }));

    const sheet = screen.getByRole("group", { name: "내보내기" });
    expect(sheet).toBeTruthy();
    expect(screen.getByRole("button", { name: "PNG 저장" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PSD 내보내기" })).toBeTruthy();
  });
});
