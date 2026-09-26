// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dSceneAssistantWorkspace,
  type StudioBg3dSceneAssistantHost,
} from "./StudioBg3dSceneAssistantWorkspace";

vi.mock("./StudioBg3dEditorViewport", () => ({
  StudioBg3dEditorViewport: () => <div data-testid="mock-scene-viewport" />,
}));

afterEach(() => cleanup());

function createHost(
  overrides: Partial<StudioBg3dSceneAssistantHost> = {},
): StudioBg3dSceneAssistantHost {
  return {
    open: true,
    operation: "insert",
    primitives: [],
    customModels: [],
    sharedCharacterCaptureElementIds: [],
    selectedIds: new Set<string>(),
    setSelectedIds: vi.fn(),
    modelLibrary: [],
    genericModelClassifications: new Map(),
    transformMode: "translate",
    lineArtPreview: false,
    placementActive: false,
    placementSession: { phase: "idle" },
    isCapturing: false,
    isRestoringScene: false,
    isUploadingModel: false,
    isBatchRenderingShots: false,
    applyingTemplateId: null,
    deletingModelId: null,
    insertBlocked: false,
    immersiveSceneActive: false,
    sharedStageUpdateBlockedReason: null,
    groundSelectionDisabledReason: null,
    focusSelectionDisabledReason: null,
    error: null,
    addSceneTemplate: vi.fn(() => true),
    addCustomModelToScene: vi.fn(),
    addPrimitive: vi.fn(),
    applyCameraPreset: vi.fn(),
    zoomCameraBy: vi.fn(),
    setTransformMode: vi.fn(),
    setLineArtPreview: vi.fn(),
    updateLtToneSettings: vi.fn(),
    groundSelectedEntity: vi.fn(),
    focusSelectedEntity: vi.fn(),
    duplicateSelected: vi.fn(),
    deleteSelected: vi.fn(),
    handleSaveToLibrary: vi.fn(),
    handleInsert: vi.fn(),
    setActivePanelTab: vi.fn(),
    setModelsPanelActivated: vi.fn(),
    setViewEditorSection: vi.fn(),
    setLtEditorSection: vi.fn(),
    ...overrides,
  };
}
describe("StudioBg3dSceneAssistantWorkspace", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("opens with purpose-led choices and no professional DCC terminology", () => {
    render(<StudioBg3dSceneAssistantWorkspace h={createHost()} onOpenProfessional={vi.fn()} />);

    expect(screen.getByText("무엇을 만들까요?")).toBeDefined();
    expect(screen.getByRole("button", { name: /배경·구도/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /인물·포즈/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /소품/ })).toBeDefined();
    expect(screen.queryByText(/글로벌 축|로컬 축|법선 정렬|LT/u)).toBeNull();
    expect((screen.getByRole("button", { name: "다음: 배치하기" }) as HTMLButtonElement).disabled).toBe(true);
  });


  it("refreshes asynchronous mutable host state so restored scenes never leave navigation disabled", async () => {
    const host = createHost();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);
    const next = screen.getByRole("button", { name: "다음: 배치하기" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    (host as { primitives: readonly { id: string }[] }).primitives = [{ id: "restored-scene" }];

    await waitFor(() => expect(next.disabled).toBe(false), { timeout: 1_000 });
  });

  it("blocks scene mutations until the verified source scene has finished restoring", () => {
    const host = createHost({ isRestoringScene: true });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    const sceneCard = screen.getByRole("button", { name: /교실/ }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "다음: 배치하기" }) as HTMLButtonElement;
    expect(sceneCard.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    fireEvent.click(sceneCard);
    expect(host.addSceneTemplate).not.toHaveBeenCalled();
  });

  it("turns a curated scene choice into a usable scene and camera in one action", () => {
    const host = createHost();
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /교실/ }));

    expect(host.addSceneTemplate).toHaveBeenCalledWith("classroom");
    expect(host.applyCameraPreset).toHaveBeenCalledWith("threeQuarter");
    expect(screen.getByText(/개 항목으로 장면 구성됨/)).toBeDefined();
  });

  it("frames a newly inserted scene after its selectable objects are mounted", async () => {
    const host = createHost();
    const mutableHost = host as unknown as {
      addSceneTemplate: (templateId: string) => boolean;
    };
    mutableHost.addSceneTemplate = vi.fn(() => {
      (host as { primitives: readonly { id: string }[] }).primitives = [
        { id: "classroom-floor" },
        { id: "classroom-wall" },
      ];
      (host as { selectedIds: ReadonlySet<string> }).selectedIds = new Set([
        "classroom-floor",
        "classroom-wall",
      ]);
      return true;
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /교실/ }));

    await waitFor(() => expect(host.focusSelectedEntity).toHaveBeenCalledOnce());
  });

  it("waits for selectable geometry before framing a camera preset", async () => {
    const host = createHost({
      primitives: [{ id: "scene-a" }, { id: "scene-b" }],
      selectedIds: new Set(["scene-a", "scene-b"]),
      focusSelectionDisabledReason: "선택한 객체의 지오메트리를 준비하는 중입니다.",
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" }))
      .getByRole("button", { name: "3. 구도 잡기" }));
    fireEvent.click(screen.getByRole("button", { name: /하이앵글/ }));
    expect(host.focusSelectedEntity).not.toHaveBeenCalled();

    (host as { focusSelectionDisabledReason: string | null }).focusSelectionDisabledReason = null;
    await waitFor(() => expect(host.focusSelectedEntity).toHaveBeenCalledOnce(), { timeout: 1_000 });
  });

  it("stays on scene selection when the runtime rejects a template", () => {
    const host = createHost({ addSceneTemplate: vi.fn(() => false) });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /교실/ }));

    expect(host.applyCameraPreset).not.toHaveBeenCalled();
    expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("choose");
  });

  it("confirms a background switch while delegating one atomic retained-content transaction", () => {
    const host = createHost({
      primitives: [{ id: "old-bg" }],
      customModels: [
        { id: "chair-instance", modelId: "chair-model" },
        { id: "hero-instance", modelId: "hero-model" },
      ],
      genericModelClassifications: new Map([
        ["chair-model", "prop"],
        ["hero-model", "character"],
      ]),
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "1. 시작점 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /카페/ }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("인물과 소품은 유지"));
    expect(host.addSceneTemplate).toHaveBeenCalledWith("cafe");
  });
  it("adds classified character assets without forcing the user into a separate tool", () => {
    const host = createHost({
      modelLibrary: [{ id: "hero", name: "주인공 캐릭터", thumbnail: null, canUse: true }],
      genericModelClassifications: new Map([["hero", "character"]]),
    });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /인물·포즈/ }));
    expect(screen.getByRole("link", { name: /포즈 편집기/ }).getAttribute("href")).toBe("/studio/poser");
    expect(screen.getByRole("link", { name: /새 캐릭터 만들기/ }).getAttribute("href")).toBe("/studio/character");
    fireEvent.click(screen.getByRole("button", { name: /주인공 캐릭터/ }));

    expect(host.addCustomModelToScene).toHaveBeenCalledWith("hero");
    expect(screen.getByTestId("studio-bg3d-scene-assistant").getAttribute("data-step")).toBe("arrange");
  });

  it("maps a visible creator style to renderer settings and applies the result to the current cut", () => {
    const host = createHost({ primitives: [{ id: "scene" }] });
    render(<StudioBg3dSceneAssistantWorkspace h={host} onOpenProfessional={vi.fn()} />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "장면 제작 단계" })).getByRole("button", { name: "4. 작화 적용" }));
    fireEvent.click(screen.getByRole("button", { name: /톤 배경/ }));
    fireEvent.click(screen.getByRole("button", { name: "현재 컷에 적용" }));

    expect(host.setLineArtPreview).toHaveBeenCalledWith(true);
    expect(host.updateLtToneSettings).toHaveBeenCalledWith(expect.objectContaining({
      type: "grayscale",
    }));
    expect(host.handleInsert).toHaveBeenCalledOnce();
  });

  it("opens the professional workspace only as an explicit progressive disclosure", () => {
    const openProfessional = vi.fn();
    render(
      <StudioBg3dSceneAssistantWorkspace
        h={createHost()}
        onOpenProfessional={openProfessional}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /정밀 편집/ })[0]);
    expect(openProfessional).toHaveBeenCalledOnce();
  });
});
