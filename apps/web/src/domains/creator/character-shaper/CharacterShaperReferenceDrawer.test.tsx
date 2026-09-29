// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { CharacterShaperReferenceDrawer } from "./CharacterShaperReferenceDrawer";

import type {
  CharacterCapabilityProfile,
  CharacterHostSnapshot,
  CharacterRecipe,
  CharacterSlotAvailability,
  CharacterSlotEntry,
} from "./character-shaper-contract";
import type { CharacterShaperBinding, CharacterShaperCommitResult, CharacterShaperDrawerMode } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const extractCharacterReferencePalette = vi.hoisted(() => vi.fn());
const rememberStudioVrmWebcamSessionConsent = vi.hoisted(() => vi.fn());

vi.mock("./character-shaper-palette-extract", () => ({ extractCharacterReferencePalette }));

vi.mock("../vrm/studio-vrm-poser-preferences-sqlite", () => ({
  rememberStudioVrmWebcamSessionConsent,
  hasStudioVrmWebcamSessionConsent: () => false,
}));

vi.mock("../vrm/useStudioVrmAvatarReferenceCatalogue", () => ({
  studioVrmAvatarReferenceCatalogueDiagnosticMessage: () => "추천 기준을 불러오지 못했습니다.",
}));

vi.mock("../vrm/StudioVrmAvatarReferenceRecommendationsPanel", () => ({
  StudioVrmAvatarReferenceRecommendationsPanel: ({
    disabled,
    onApply,
  }: {
    disabled?: boolean;
    onApply: (selection: { presetId: string }) => void;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onApply({ presetId: "preset-a" })}>
      추천 프리셋 적용
    </button>
  ),
}));

vi.mock("../vrm/StudioVrmPhotoPoseScanner", () => ({
  StudioVrmPhotoPoseScanner: ({
    handoff,
    onApply,
  }: {
    handoff?: { file: File; token: number } | null;
    onApply: (payload: { sourceName: string }) => boolean;
  }) => (
    <>
      <button type="button" onClick={() => onApply({ sourceName: "pose.png" })}>
        사진 포즈 적용
      </button>
      <p data-testid="photo-handoff">{handoff ? `${handoff.file.name}#${handoff.token}` : "none"}</p>
    </>
  ),
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
  return {
    status: "ready",
    vrm: { scene: {} },
    activePanelTab: "pose",
    activeCharacterSection: "library",
    handlePanelTabChange: vi.fn(),
    handleCharacterSectionChange: vi.fn(),
    avatarForgeReferenceCatalogue: { catalogue: null, status: "idle", diagnosticCode: null, retry: vi.fn() },
    avatarForgeReferenceInteractionBlocked: () => false,
    handleAvatarForgeReferencePreview: vi.fn(),
    handleAvatarForgeReferenceApply: vi.fn(),
    setAvatarForgeReferencePreview: vi.fn(),
    handlePhotoPoseApply: vi.fn(() => true),
    wardrobeState: { top: { itemId: "shirt", color: "#2b3a5e", fit: 1, fitMode: "auto", fabricId: "cotton" } },
    updateWardrobeEquip: vi.fn(),
    webcamActive: false,
    webcamLoading: false,
    webcamError: null,
    showConsent: false,
    webcamConsentGranted: false,
    faceDetected: false,
    trackingOptions: { mirrorMode: true, gazeLock: false, fingerTracking: false, sensitivity: 1, smoothing: 0.5 },
    setTrackingOptions: vi.fn(),
    setWebcamActive: vi.fn(),
    setWebcamError: vi.fn(),
    setShowConsent: vi.fn(),
    setWebcamConsentGranted: vi.fn(),
    handleCapturePose: vi.fn(),
    videoRef: { current: null },
    ...overrides,
  } as StudioVrmPoserHost;
}

function renderDrawer(
  options: { mode?: Exclude<CharacterShaperDrawerMode, null>; h?: StudioVrmPoserHost; binding?: CharacterShaperBinding } = {},
) {
  const h = options.h ?? makeHost();
  const binding = options.binding ?? makeBinding();
  const onModeChange = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <CharacterShaperReferenceDrawer
      h={h}
      binding={binding}
      mode={options.mode ?? "reference"}
      onModeChange={onModeChange}
      onClose={onClose}
    />,
  );
  // The drawer does not own `mode` — the shell does. Switching tabs in a test therefore means
  // re-rendering the same element with the mode the shell would have set.
  const setMode = (next: Exclude<CharacterShaperDrawerMode, null>) => {
    view.rerender(
      <CharacterShaperReferenceDrawer
        h={h}
        binding={binding}
        mode={next}
        onModeChange={onModeChange}
        onClose={onClose}
      />,
    );
  };
  return { ...view, h, binding, onModeChange, onClose, setMode };
}

beforeEach(() => {
  vi.clearAllMocks();
  extractCharacterReferencePalette.mockReturnValue({
    swatches: ["#112233", "#445566"],
    skin: "#f5c6a0",
    hair: "#1f1a1c",
    accent: "#b45309",
  });
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: vi.fn(async () => ({ width: 400, height: 500, close: vi.fn() })),
  });
  const context2d = {
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((
    ((contextId: string) => contextId === "2d" ? context2d : null) as
      typeof HTMLCanvasElement.prototype.getContext
  ));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CharacterShaperReferenceDrawer tabs", () => {
  it("marks the active tab and switches modes by click and by arrow key", () => {
    const { onModeChange } = renderDrawer({ mode: "reference" });

    expect(screen.getByRole("tab", { name: "참고 이미지 AI 추천" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "사진 포즈" }));
    expect(onModeChange).toHaveBeenCalledWith("photo");

    fireEvent.keyDown(screen.getByRole("tab", { name: "참고 이미지 AI 추천" }), { key: "ArrowRight" });
    expect(onModeChange).toHaveBeenLastCalledWith("photo");

    fireEvent.keyDown(screen.getByRole("tab", { name: "참고 이미지 AI 추천" }), { key: "End" });
    expect(onModeChange).toHaveBeenLastCalledWith("webcam");
  });

  it("puts the initial focus on the active tab", async () => {
    renderDrawer({ mode: "webcam" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: "웹캠" })));
  });

  it("closes through the header button", () => {
    const { onClose } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "참고 도구 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("claims the forge surface while the recommendation tab is open and restores it on close", () => {
    const { h, unmount } = renderDrawer({ mode: "reference" });
    expect(h.handlePanelTabChange).toHaveBeenCalledWith("character");
    expect(h.handleCharacterSectionChange).toHaveBeenCalledWith("forge");

    unmount();
    expect(h.handlePanelTabChange).toHaveBeenLastCalledWith("pose");
    expect(h.handleCharacterSectionChange).toHaveBeenLastCalledWith("library");
  });
});

describe("CharacterShaperReferenceDrawer reference tab", () => {
  it("states that the analysis stays on the device", () => {
    renderDrawer({ mode: "reference" });
    expect(screen.getByText("MediaPipe 이미지 임베더 · 기기 내 처리 · 업로드 없음")).toBeTruthy();
  });

  it("extracts a palette from the chosen image and applies a swatch to hair, iris and top", async () => {
    const { binding, h } = renderDrawer({ mode: "reference" });

    const input = screen.getByLabelText("참고 이미지 선택");
    const file = new File(["binary"], "ref.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "헤어 색으로" })).toBeTruthy());
    expect(extractCharacterReferencePalette).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "헤어 색으로" }));
    expect(binding.commitColor).toHaveBeenCalledWith("hairBase", "#1f1a1c");

    fireEvent.click(screen.getByRole("button", { name: "색 #445566 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "눈동자 색으로" }));
    expect(binding.commitColor).toHaveBeenLastCalledWith("iris", "#445566");

    fireEvent.click(screen.getByRole("button", { name: "상의 색으로" }));
    expect(h.updateWardrobeEquip).toHaveBeenCalledWith("top", { color: "#445566" });
    expect(screen.getByRole("status", { name: "팔레트 적용 결과" }).textContent).toContain("#445566");
  });

  it("blocks the top color when no garment is equipped and says why", async () => {
    renderDrawer({ mode: "reference", h: makeHost({ wardrobeState: {} }) });

    const input = screen.getByLabelText("참고 이미지 선택");
    fireEvent.change(input, { target: { files: [new File(["binary"], "ref.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "상의 색으로" })).toBeTruthy());

    const top = screen.getByRole("button", { name: "상의 색으로" }) as HTMLButtonElement;
    expect(top.disabled).toBe(true);
    expect(top.title).toBe("상의를 먼저 입혀야 색을 바꿀 수 있습니다.");
  });

  it("refuses a non-image file with a reason", async () => {
    renderDrawer({ mode: "reference" });
    const input = screen.getByLabelText("참고 이미지 선택");
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });

    expect(await screen.findByText("이미지 파일만 읽을 수 있습니다.")).toBeTruthy();
    expect(extractCharacterReferencePalette).not.toHaveBeenCalled();
  });

  it("hands the already-chosen reference image to the photo tab so it is picked only once", async () => {
    const { onModeChange, setMode } = renderDrawer({ mode: "reference" });

    const input = screen.getByLabelText("참고 이미지 선택");
    const file = new File(["binary"], "ref.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    const handoffButton = await screen.findByRole("button", { name: "이 사진에서 포즈도 읽기" });
    fireEvent.click(handoffButton);
    expect(onModeChange).toHaveBeenCalledWith("photo");

    setMode("photo");
    expect(screen.getByTestId("photo-handoff").textContent).toBe("ref.png#1");
  });

  it("offers no photo handoff for a file the palette refused", async () => {
    renderDrawer({ mode: "reference" });
    const input = screen.getByLabelText("참고 이미지 선택");
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });

    expect(await screen.findByText("이미지 파일만 읽을 수 있습니다.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "이 사진에서 포즈도 읽기" })).toBeNull();
  });

  it("forwards the recommendation panel's apply to the host", () => {
    const { h } = renderDrawer({ mode: "reference" });
    fireEvent.click(screen.getByRole("button", { name: "추천 프리셋 적용" }));
    expect(h.handleAvatarForgeReferenceApply).toHaveBeenCalledWith({ presetId: "preset-a" });
  });

  it("이미지 읽기 실패 시 이전 추천 입력을 지우고 같은 이미지 재시도와 다른 파일 선택을 제공한다", async () => {
    renderDrawer();
    const input = screen.getByLabelText("참고 이미지 선택");
    fireEvent.change(input, { target: { files: [new File(["old"], "old.png", { type: "image/png" })] } });
    await screen.findByRole("button", { name: "참고 실루엣으로 프리셋 추천 적용" });

    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("decode failed"));
    fireEvent.change(input, { target: { files: [new File(["new"], "new.png", { type: "image/png" })] } });
    expect(screen.queryByRole("button", { name: "참고 실루엣으로 프리셋 추천 적용" })).toBeNull();
    const retry = await screen.findByRole("button", { name: "이 이미지 다시 읽기" });
    const replacement = screen.getByRole("button", { name: "다른 이미지 고르기" });
    expect(replacement.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    const inputClick = vi.spyOn(input, "click");
    fireEvent.click(replacement);
    expect(inputClick).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    await screen.findByRole("button", { name: "참고 실루엣으로 프리셋 추천 적용" });
    expect(createImageBitmap).toHaveBeenCalledTimes(3);
    // 읽기 오류는 사라진다. 1px 테스트 이미지에는 실루엣이 없어 조합 분석 알림은 별도로 남을 수 있다.
    expect(screen.queryByText("이미지를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.")).toBeNull();
  });

  it.each(["invalid-type", "oversized"])("새 파일이 %s로 거절된 뒤 이전 읽기 완료가 오류와 적용 대상을 덮지 않는다", async (rejection) => {
    let resolveRead: ((bitmap: { width: number; height: number; close: () => void }) => void) | undefined;
    const read = new Promise<{ width: number; height: number; close: () => void }>((resolve) => {
      resolveRead = resolve;
    });
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: vi.fn(() => read) });
    renderDrawer();
    const input = screen.getByLabelText("참고 이미지 선택");
    fireEvent.change(input, { target: { files: [new File(["old"], "old.png", { type: "image/png" })] } });
    const rejected = rejection === "invalid-type"
      ? new File(["x"], "notes.txt", { type: "text/plain" })
      : new File(["x"], "large.png", { type: "image/png" });
    if (rejection === "oversized") Object.defineProperty(rejected, "size", { value: 24 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [rejected] } });
    const expectedError = screen.getByRole("alert").textContent;
    const close = vi.fn();
    await act(async () => {
      resolveRead?.({ width: 1, height: 1, close });
      await read;
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe(expectedError);
    expect(screen.queryByRole("button", { name: "참고 실루엣으로 프리셋 추천 적용" })).toBeNull();
    expect(screen.queryByRole("button", { name: "이 사진에서 포즈도 읽기" })).toBeNull();
    expect(extractCharacterReferencePalette).not.toHaveBeenCalled();
  });

  it("이미지 디코딩 미지원에서도 직접 편집과 사진 입력 경로를 유지한다", async () => {
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: undefined });
    const { onClose, onModeChange } = renderDrawer();
    fireEvent.change(screen.getByLabelText("참고 이미지 선택"), {
      target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] },
    });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "이 브라우저에서는 이미지를 읽을 수 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "이 사진에서 포즈도 읽기" }));
    expect(onModeChange).toHaveBeenCalledWith("photo");
    fireEvent.click(screen.getByRole("button", { name: "참고 도구 닫고 직접 편집" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CharacterShaperReferenceDrawer 2D reference combination", () => {
  const FIGURE_WIDTH = 77;
  const FIGURE_HEIGHT = 96;

  /** 짧은 두 줄기 다리의 전신 실루엣을 흰 배경에 그린다 (77×96). */
  function paintFigure(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(FIGURE_WIDTH * FIGURE_HEIGHT * 4);
    const paint = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * FIGURE_WIDTH + x) * 4;
          data[index] = r;
          data[index + 1] = g;
          data[index + 2] = b;
          data[index + 3] = 255;
        }
      }
    };
    paint(0, 0, FIGURE_WIDTH, FIGURE_HEIGHT, 255, 255, 255);
    paint(33, 8, 43, 20, 60, 50, 45); // head
    paint(33, 20, 43, 60, 200, 110, 110); // torso (상의 색상 근거용)
    paint(31, 60, 35, 80, 80, 100, 190); // left leg (하의 색상 근거용)
    paint(39, 60, 43, 80, 80, 100, 190); // right leg
    return data;
  }

  function mockFigureDecode() {
    const data = paintFigure();
    const context2d = {
      drawImage: vi.fn(),
      getImageData: () => ({ data, width: FIGURE_WIDTH, height: FIGURE_HEIGHT }),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((contextId: string) => (contextId === "2d" ? context2d : null)) as typeof HTMLCanvasElement.prototype.getContext,
    );
  }

  function uploadReference() {
    const input = screen.getByLabelText("참고 이미지 선택");
    fireEvent.change(input, { target: { files: [new File(["binary"], "ref.png", { type: "image/png" })] } });
  }

  function getComboRegion() {
    return screen.getByRole("region", { name: "2D 설정화 프리셋 조합 추천" });
  }

  function makeCommitResult(ok: boolean, reason: string | null = null) {
    return (item: CharacterSlotEntry): CharacterShaperCommitResult => ({
      ok,
      plan: {
        entryId: item.id,
        slot: item.slot,
        label: item.label,
        steps: [],
        availability: { status: "available", reason: null, missing: [] },
      },
      reason,
    });
  }

  it("recommends a preset combination from the reference silhouette and applies one dimension on click", async () => {
    mockFigureDecode();
    const commit = vi.fn(makeCommitResult(true));
    const { container } = renderDrawer({ mode: "reference", binding: makeBinding({ commit }) });

    uploadReference();
    await waitFor(() => expect(getComboRegion()).toBeTruthy());

    const bodyCard = container.querySelector('[data-character-combo-dimension="body"]') as HTMLElement;
    expect(bodyCard.textContent).toContain("체형");

    const bodyApply = within(bodyCard).getByRole("button", { name: "이 프리셋 적용" });
    fireEvent.click(bodyApply);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0].id).toBe("body:runway-9");

    const topCard = container.querySelector('[data-character-combo-dimension="top"]') as HTMLElement;
    expect(topCard.textContent).toContain("상의");
    // 상의 밴드의 대표색이 근거 색으로 보인다.
    expect(topCard.textContent).toContain("#C86E6E");
  });

  it("shows the unavailable reason with retry and manual options when no silhouette is found", async () => {
    const { onClose } = renderDrawer({ mode: "reference" });
    const unavailableReason = "이미지에서 인물 실루엣을 찾지 못했습니다. 흰 배경의 전신 설정화(PNG·JPG)를 올려 주세요.";

    uploadReference();
    await waitFor(() => expect(getComboRegion()).toBeTruthy());
    expect(await screen.findByText(unavailableReason)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다시 분석" }));
    await waitFor(() => expect(getComboRegion()).toBeTruthy());
    expect(await screen.findByText(unavailableReason)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "프리셋 직접 고르기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports a per-dimension failure honestly and skips unavailable entries on apply-all", async () => {
    mockFigureDecode();
    const commit = vi.fn(makeCommitResult(true));
    const evaluate = vi.fn((entry: CharacterSlotEntry): CharacterSlotAvailability =>
      entry.id === "bottom:shorts"
        ? { status: "unavailable", reason: "이 체형에는 맞지 않습니다.", missing: [] }
        : { status: "available", reason: null, missing: [] },
    );
    const { container } = renderDrawer({ mode: "reference", binding: makeBinding({ commit, evaluate }) });

    uploadReference();
    await waitFor(() => expect(getComboRegion()).toBeTruthy());

    const statusNotice = () => screen.getByRole("status", { name: "팔레트 적용 결과" });

    commit.mockImplementation(makeCommitResult(false, "바지를 입힐 수 없습니다."));
    const topCard = container.querySelector('[data-character-combo-dimension="top"]') as HTMLElement;
    fireEvent.click(within(topCard).getByRole("button", { name: "이 프리셋 적용" }));
    await waitFor(() => expect(statusNotice().textContent).toContain("바지를 입힐 수 없습니다."));

    const bottomCard = container.querySelector('[data-character-combo-dimension="bottom"]') as HTMLElement;
    const bottomApply = within(bottomCard).getByRole("button", { name: "이 프리셋 적용" }) as HTMLButtonElement;
    expect(bottomApply.disabled).toBe(true);
    expect(bottomCard.textContent).toContain("이 체형에는 맞지 않습니다.");

    commit.mockClear();
    commit.mockImplementation(makeCommitResult(true));
    fireEvent.click(screen.getByRole("button", { name: "조합 전체 적용" }));
    const committedIds = commit.mock.calls.map((call) => (call[0] as CharacterSlotEntry).id);
    expect(committedIds).toContain("body:runway-9");
    expect(committedIds).not.toContain("bottom:shorts");
    await waitFor(() => expect(statusNotice().textContent).toContain("추천 조합 4개 중 3개를 적용했습니다."));
  });
});

describe("CharacterShaperReferenceDrawer photo and webcam tabs", () => {
  it("forwards a photo pose apply to the host", () => {
    const { h } = renderDrawer({ mode: "photo" });
    fireEvent.click(screen.getByRole("button", { name: "사진 포즈 적용" }));
    expect(h.handlePhotoPoseApply).toHaveBeenCalledWith({ sourceName: "pose.png" });
  });

  it("asks for consent before turning the camera on", () => {
    const { h } = renderDrawer({ mode: "webcam" });
    fireEvent.click(screen.getByRole("button", { name: /트래킹 시작/u }));
    expect(h.setShowConsent).toHaveBeenCalledWith(true);
    expect(h.setWebcamActive).not.toHaveBeenCalled();
  });

  it("remembers the session consent and starts tracking after the creator agrees", () => {
    const { h } = renderDrawer({ mode: "webcam", h: makeHost({ showConsent: true }) });
    fireEvent.click(screen.getByRole("button", { name: "동의하고 카메라 켜기" }));
    expect(rememberStudioVrmWebcamSessionConsent).toHaveBeenCalledTimes(1);
    expect(h.setWebcamConsentGranted).toHaveBeenCalledWith(true);
    expect(h.setWebcamActive).toHaveBeenCalledWith(true);
  });

  it("freezes the current expression and flips the tracking toggles while running", () => {
    const h = makeHost({ webcamActive: true, faceDetected: true });
    renderDrawer({ mode: "webcam", h });

    fireEvent.click(screen.getByRole("button", { name: /표정 굳히기/u }));
    expect(h.handleCapturePose).toHaveBeenCalledTimes(1);

    const mirror = screen.getByRole("switch", { name: /거울 모드/u });
    expect(mirror.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(mirror);
    const updater = (h.setTrackingOptions as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(updater({ mirrorMode: true })).toEqual({ mirrorMode: false });
  });

  it("권한 거부 시 복구 안내와 명시적 재시도를 제공하고 동의를 건너뛰지 않는다", () => {
    const h = makeHost({ webcamError: "카메라 권한이 거부되었습니다.", webcamErrorStage: "camera" });
    renderDrawer({ mode: "webcam", h });
    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("브라우저의 사이트 설정에서 카메라 권한");
    const retry = screen.getByRole("button", { name: "카메라 다시 시도" });
    expect(retry.getAttribute("aria-describedby")).toBe(error.id);
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    expect(h.setWebcamError).toHaveBeenCalledWith(null);
    expect(h.setShowConsent).toHaveBeenCalledWith(true);
    expect(h.setWebcamActive).not.toHaveBeenCalled();
  });

  it("모델 준비 실패를 권한 거부와 구분하고 이미 동의한 세션만 직접 재시작한다", () => {
    const h = makeHost({ webcamError: "추적 준비 실패", webcamErrorStage: "engine", webcamConsentGranted: true });
    renderDrawer({ mode: "webcam", h });
    expect(screen.getByRole("alert").textContent).toContain("추적 모델을 준비하지 못했습니다.");
    expect(screen.getByRole("alert").textContent).not.toContain("사이트 설정");
    fireEvent.click(screen.getByRole("button", { name: "카메라 다시 시도" }));
    expect(h.setWebcamActive).toHaveBeenCalledWith(true);
    expect(h.setShowConsent).not.toHaveBeenCalled();
  });

  it("웹캠 준비 중에도 취소할 수 있다", () => {
    const h = makeHost({ webcamActive: true, webcamLoading: true });
    renderDrawer({ mode: "webcam", h });
    const cancel = screen.getByRole("button", { name: "카메라 준비 취소" });
    expect(cancel.hasAttribute("disabled")).toBe(false);
    fireEvent.click(cancel);
    expect(h.setWebcamActive).toHaveBeenCalledWith(false);
  });

  it.each(["photo", "reference"] as const)("%s 대체 입력을 선택하면 카메라를 중지하고 해당 탭으로 포커스를 옮긴다", async (next) => {
    const h = makeHost({ webcamActive: true });
    const { onModeChange, setMode } = renderDrawer({ mode: "webcam", h });
    fireEvent.click(screen.getByRole("button", {
      name: next === "photo" ? "카메라 없이 사진 포즈 사용" : "참고 이미지 사용",
    }));
    expect(h.setWebcamActive).toHaveBeenCalledWith(false);
    expect(h.setShowConsent).toHaveBeenCalledWith(false);
    expect(onModeChange).toHaveBeenCalledWith(next);
    setMode(next);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", {
      name: next === "photo" ? "사진 포즈" : "참고 이미지 AI 추천",
    })));
  });

  it("사진 탭에서 다른 파일 선택 안내와 웹캠·직접 편집 경로를 제공한다", () => {
    const { onModeChange, onClose } = renderDrawer({ mode: "photo" });
    expect(screen.getByText(/사진을 읽지 못하면 ‘사진 선택’/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "웹캠으로 전환" }));
    expect(onModeChange).toHaveBeenCalledWith("webcam");
    fireEvent.click(screen.getByRole("button", { name: "참고 도구 닫고 직접 편집" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
