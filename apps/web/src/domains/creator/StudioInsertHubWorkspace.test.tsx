// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioInsertHubWorkspace } from "./StudioInsertHubWorkspace";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const localAsset: StudioUnifiedAssetItem = {
  id: "local:hero-sheet",
  category: "mine",
  scope: "mine",
  title: "내 주인공 시트",
  description: "표정과 의상 참고 이미지",
  categoryLabel: "내 에셋",
  keywords: ["캐릭터", "reference"],
  badges: ["내 에셋"],
  preview: { kind: "none" },
  useMode: "insert",
  useLabel: "캔버스에 삽입",
  discoverability: "standard",
  sortPriority: 10,
  source: {
    kind: "local",
    value: {
      id: "hero-sheet",
      name: "내 주인공 시트",
      dataUrl: "data:image/png;base64,AA==",
      width: 600,
      height: 900,
      createdAt: 1,
    },
  },
};

function renderWorkspace(
  options: {
    items?: readonly StudioUnifiedAssetItem[];
    selectionPlacementAvailable?: boolean;
    onUseAction?: ReturnType<typeof vi.fn>;
    onUseItem?: ReturnType<typeof vi.fn>;
    onUploadImage?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onUseAction = options.onUseAction ?? vi.fn(() => true);
  const onUseItem = options.onUseItem ?? vi.fn(() => true);
  const onUploadImage = options.onUploadImage ?? vi.fn();
  const view = render(
    <StudioInsertHubWorkspace
      items={options.items ?? []}
      legacyContent={<div>보관함</div>}
      selectionPlacementAvailable={
        options.selectionPlacementAvailable ?? false
      }
      onUseAction={onUseAction}
      onUseItem={onUseItem}
      onUploadImage={onUploadImage}
      onOpenAi={vi.fn()}
    />,
  );
  return { ...view, onUseAction, onUseItem, onUploadImage };
}

function entryCard(container: HTMLElement, id: string): HTMLElement {
  const card = container.querySelector(`[data-studio-insert-entry="${id}"]`);
  if (!(card instanceof HTMLElement)) {
    throw new Error(`삽입 카드가 없습니다: ${id}`);
  }
  return card;
}

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
});

describe("StudioInsertHubWorkspace", () => {
  it("focuses unified search with slash and searches insertion actions", () => {
    renderWorkspace();
    const search = screen.getByRole("searchbox", { name: "에셋 통합 검색" });
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: "가져오기" } });
    expect(
      screen.getByRole("button", { name: "기기 이미지 파일 선택" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "텍스트 텍스트 추가" }),
    ).toBeNull();
  });

  it("persists favorites and filters to the favorite collection", () => {
    const first = renderWorkspace();
    const textCard = entryCard(first.container, "action:text");
    fireEvent.click(
      within(textCard).getByRole("button", { name: "즐겨찾기 추가" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /즐겨찾기 1/u }));
    expect(
      first.container.querySelectorAll("[data-studio-insert-entry]"),
    ).toHaveLength(1);
    expect(
      first.container.querySelector('[data-studio-insert-entry="action:text"]'),
    ).toBeTruthy();

    first.unmount();
    const second = renderWorkspace();
    expect(
      screen.getByRole("button", { name: /즐겨찾기 1/u }),
    ).toBeTruthy();
    expect(
      within(entryCard(second.container, "action:text")).getByRole("button", {
        name: "즐겨찾기 해제",
      }),
    ).toBeTruthy();
  });

  it("records only successful insertions in MRU order", async () => {
    const onUseAction = vi.fn((actionId: string) => actionId !== "bubble");
    const view = renderWorkspace({ onUseAction });

    fireEvent.click(
      within(entryCard(view.container, "action:text")).getByRole("button", {
        name: "텍스트 텍스트 추가",
      }),
    );
    await waitFor(() => expect(onUseAction).toHaveBeenCalledWith("text"));
    expect(
      screen.getByRole("button", { name: /최근 사용 1/u }),
    ).toBeTruthy();

    fireEvent.click(
      within(entryCard(view.container, "action:bubble")).getByRole("button", {
        name: "말풍선 말풍선 열기",
      }),
    );
    expect(
      await screen.findByText(
        "현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /최근 사용 1/u }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /최근 사용 1/u }));
    expect(
      view.container.querySelectorAll("[data-studio-insert-entry]"),
    ).toHaveLength(1);
    expect(
      view.container.querySelector('[data-studio-insert-entry="action:text"]'),
    ).toBeTruthy();
  });

  it("passes chosen placement mode only to insertable local images", async () => {
    const view = renderWorkspace({ items: [localAsset] });
    const selectionButton = screen.getByRole("button", { name: "선택 영역" });
    expect(selectionButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "페이지 맞춤" }));
    fireEvent.click(
      within(entryCard(view.container, localAsset.id)).getByRole("button", {
        name: "내 주인공 시트 캔버스에 삽입",
      }),
    );
    await waitFor(() =>
      expect(view.onUseItem).toHaveBeenCalledWith(localAsset, "page"),
    );
  });

  it("enables selection placement for a valid editor selection", () => {
    renderWorkspace({
      items: [localAsset],
      selectionPlacementAvailable: true,
    });
    const selectionButton = screen.getByRole("button", { name: "선택 영역" });
    expect(selectionButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(selectionButton);
    expect(selectionButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("routes file selection through the existing image import handler", async () => {
    const onUploadImage = vi.fn();
    const view = renderWorkspace({ onUploadImage });
    const input = view.container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("파일 입력이 없습니다.");
    }
    const file = new File(["pixel"], "panel.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("기기 이미지를 캔버스에 가져왔습니다."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /최근 사용 1/u }),
    ).toBeTruthy();
  });
});
