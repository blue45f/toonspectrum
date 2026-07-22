// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAssetLibraryPanel } from "./StudioBg3dAssetLibraryPanel";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import type { ComponentProps } from "react";

type PanelProps = ComponentProps<typeof StudioBg3dAssetLibraryPanel>;

function createEntry(
  id: string,
  name: string,
  patch: Partial<Bg3dModelLibraryEntry> = {},
): Bg3dModelLibraryEntry {
  return {
    id,
    name,
    format: "glb",
    source: "indexed-db",
    thumbnail: null,
    createdAt: 1,
    updatedAt: 1,
    status: "verified",
    canUse: true,
    statusMessage: "검증된 GLB 모델입니다.",
    contentHash: null,
    byteSize: 1024,
    commercialUse: true,
    ...patch,
  };
}

function createDefaultProps(): PanelProps {
  return {
    entries: [createEntry("model-1", "기본 모델")],
    libraryStatus: "ready",
    deletingModelId: null,
    isUploading: false,
    importProgress: null,
    isRestoringScene: false,
    deviceProfileLabel: "데스크톱",
    onFileChange: vi.fn(),
    onCancelImport: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
  };
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props = { ...createDefaultProps(), ...overrides };
  return { props, ...render(<StudioBg3dAssetLibraryPanel {...props} />) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioBg3dAssetLibraryPanel", () => {
  it("renders loading, error, empty, and no-result states", () => {
    const view = renderPanel({ entries: [], libraryStatus: "loading" });

    expect(screen.getByText("저장된 3D 모델을 불러오는 중입니다.")).toBeTruthy();
    expect(view.container.querySelector("section")?.getAttribute("aria-busy")).toBe("true");

    view.rerender(
      <StudioBg3dAssetLibraryPanel
        {...view.props}
        entries={[]}
        libraryStatus="error"
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("저장된 3D 모델 목록을 불러오지 못했습니다.");

    view.rerender(
      <StudioBg3dAssetLibraryPanel
        {...view.props}
        entries={[]}
        libraryStatus="ready"
      />,
    );
    expect(screen.getByText(/가져온 3D 모델이 아직 없습니다/)).toBeTruthy();

    view.rerender(
      <StudioBg3dAssetLibraryPanel
        {...view.props}
        entries={[createEntry("street", "거리 배경")]}
        libraryStatus="ready"
      />,
    );
    fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), {
      target: { value: "교실" },
    });
    expect(screen.getByText("검색·필터와 일치하는 3D 모델이 없습니다.")).toBeTruthy();
    expect(screen.getByText("표시 0/0개 · 데스크톱 기준")).toBeTruthy();
  });

  it("searches, filters, and resets twelve-item pagination", () => {
    const entries = Array.from({ length: 14 }, (_, index) =>
      createEntry(`model-${index + 1}`, `모델 ${String(index + 1).padStart(2, "0")}`, {
        canUse: index % 2 === 0,
        status: index % 2 === 0 ? "verified" : "legacy-reimport-required",
        statusMessage: index % 2 === 0 ? "검증 완료" : "다시 가져오기가 필요합니다.",
      }),
    );
    renderPanel({ entries });

    expect(screen.getByText("표시 12/14개 · 데스크톱 기준")).toBeTruthy();
    expect(screen.queryByText("모델 13")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /모델 2개 더 보기/ }));
    expect(screen.getByText("표시 14/14개 · 데스크톱 기준")).toBeTruthy();
    expect(screen.getByText("모델 13")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "처음 12개만 보기" }));
    expect(screen.queryByText("모델 13")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "사용 가능" }));
    expect(screen.getByText("표시 7/7개 · 데스크톱 기준")).toBeTruthy();
    expect(screen.getByRole("button", { name: "사용 가능" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("모델 02")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), {
      target: { value: "모델 14" },
    });
    expect(screen.getByText("표시 1/1개 · 데스크톱 기준")).toBeTruthy();
    expect(screen.getByText("모델 14")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("3D 모델 라이브러리 검색"), {
      target: { value: "" },
    });
    expect(screen.getByText("표시 12/14개 · 데스크톱 기준")).toBeTruthy();
  });

  it("owns the multi-format file input and switches the upload action to cancel", () => {
    const onFileChange = vi.fn();
    const onCancelImport = vi.fn();
    const view = renderPanel({ onFileChange, onCancelImport });
    const input = screen.getByLabelText("3D 모델 및 연결 파일 선택") as HTMLInputElement;
    const inputClick = vi.spyOn(input, "click");

    expect(input.multiple).toBe(true);
    expect(input.accept).toContain(".glb");
    expect(input.accept).toContain(".fbx");
    expect(input.accept).toContain(".mtl");
    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /구매·허가/ }));
    expect(screen.getByRole("button", { name: "3D 모델 및 연결 파일 가져오기" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/라이선스·구매처 이름/), {
      target: { value: "ACON3D 구매 라이선스" },
    });
    fireEvent.click(screen.getByLabelText("상업 작품에 사용할 수 있음"));
    fireEvent.click(screen.getByRole("button", { name: "3D 모델 및 연결 파일 가져오기" }));
    expect(inputClick).toHaveBeenCalledOnce();

    fireEvent.change(input, {
      target: { files: [new File(["glb"], "background.glb", { type: "model/gltf-binary" })] },
    });
    expect(onFileChange).toHaveBeenCalledOnce();
    expect(onFileChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "licensed",
        commercialUse: true,
        attributionRequired: false,
        licenseName: "ACON3D 구매 라이선스",
      }),
    );

    view.rerender(
      <StudioBg3dAssetLibraryPanel
        {...view.props}
        isUploading
        importProgress={{ completedModels: 1, totalModels: 3 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "가져오기 취소 · 1/3" }));
    expect(onCancelImport).toHaveBeenCalledOnce();
    expect(inputClick).toHaveBeenCalledOnce();
  });

  it("requires attribution text before allowing a rights-bound import", () => {
    renderPanel();

    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /직접 제작/ }));
    fireEvent.click(screen.getByLabelText("작품에 출처 표기가 필요함"));

    const upload = screen.getByRole("button", { name: "3D 모델 및 연결 파일 가져오기" });
    expect(upload.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("필수 권리 정보");

    fireEvent.change(screen.getByLabelText(/출처 표기 문구/), {
      target: { value: "배경 모델 · 작가 이름" },
    });
    expect(upload.hasAttribute("disabled")).toBe(false);
  });

  it("renders contained thumbnails, format, rights, and status metadata", () => {
    const view = renderPanel({
      entries: [
        createEntry("thumbnail", "썸네일 모델", {
          thumbnail: "data:image/png;base64,asset",
          commercialUse: true,
        }),
        createEntry("review", "권리 확인 모델", {
          source: "sample",
          canUse: false,
          status: "legacy-reimport-required",
          statusMessage: "다시 가져오기가 필요합니다.",
          commercialUse: false,
        }),
      ],
    });

    const thumbnail = view.container.querySelector("img");
    expect(thumbnail?.getAttribute("alt")).toBe("");
    expect(thumbnail?.className).toContain("object-contain");
    expect(screen.getAllByText("glb")).toHaveLength(2);
    expect(screen.getByText("상업 이용 가능")).toBeTruthy();
    expect(screen.getByText("상업 이용 확인 필요")).toBeTruthy();
    expect(screen.getByText("다시 가져오기가 필요합니다.")).toBeTruthy();
  });

  it("adds and deletes exactly once while keeping delete clicks out of the scene action", () => {
    const entry = createEntry("asset", "도시 모델");
    const onAdd = vi.fn();
    const onDelete = vi.fn();
    const onOuterClick = vi.fn();
    renderPanel({ entries: [entry], onAdd, onDelete });
    document.body.addEventListener("click", onOuterClick, { once: true });

    fireEvent.click(screen.getByRole("button", { name: "도시 모델 삭제" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(entry.id);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onOuterClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "도시 모델 장면에 추가" }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith(entry.id);
    expect(onOuterClick).toHaveBeenCalledOnce();
  });

  it("disables unsafe or busy scene actions and preserves mobile touch targets", () => {
    const deleting = createEntry("deleting", "삭제 중 모델");
    const unsafe = createEntry("unsafe", "사용 불가 모델", {
      canUse: false,
      status: "legacy-reimport-required",
    });
    renderPanel({
      entries: [deleting, unsafe],
      deletingModelId: deleting.id,
      isRestoringScene: true,
    });

    const deletingAdd = screen.getByRole("button", { name: "삭제 중 모델 장면에 추가" }) as HTMLButtonElement;
    const unsafeAdd = screen.getByRole("button", { name: "사용 불가 모델 장면에 추가" }) as HTMLButtonElement;
    const deleteButton = screen.getByRole("button", { name: "삭제 중 모델 삭제" }) as HTMLButtonElement;
    const search = screen.getByLabelText("3D 모델 라이브러리 검색");
    const filter = screen.getByRole("button", { name: "전체" });

    expect(deletingAdd.disabled).toBe(true);
    expect(unsafeAdd.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);
    expect(deleteButton.querySelector(".animate-spin")).toBeTruthy();
    expect(deleteButton.className).toContain("size-11");
    expect(deleteButton.className).toContain("sm:size-7");
    expect(search.className).toContain("min-h-11");
    expect(search.className).toContain("focus-visible:outline");
    expect(filter.className).toContain("min-h-11");
    expect(screen.getByRole("group", { name: "3D 모델 상태 필터" })).toBeTruthy();
  });
});
