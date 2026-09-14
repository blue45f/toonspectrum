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

import {
  StudioInsertHubWorkspace,
  type StudioInsertHubWorkspaceProps,
} from "./StudioInsertHubWorkspace";

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

function createLocalAsset(
  id: string,
  title: string,
  keywords: readonly string[],
  caution = false,
): StudioUnifiedAssetItem {
  return {
    ...localAsset,
    id: `local:${id}`,
    title,
    description: `${title} 제작 에셋`,
    keywords,
    badges: caution ? ["권리 미확인"] : ["내 에셋"],
    discoverability: caution ? "caution" : "standard",
    source: {
      kind: "local",
      value: {
        id,
        name: title,
        dataUrl: "data:image/png;base64,AA==",
        width: 1_200,
        height: 800,
        createdAt: 1,
      },
    },
  };
}

function renderWorkspace(
  options: {
    items?: readonly StudioUnifiedAssetItem[];
    selectionPlacementAvailable?: boolean;
    onUseAction?: StudioInsertHubWorkspaceProps["onUseAction"];
    onUseItem?: StudioInsertHubWorkspaceProps["onUseItem"];
    onUploadImage?: StudioInsertHubWorkspaceProps["onUploadImage"];
  } = {},
) {
  const onUseAction =
    options.onUseAction ??
    vi.fn<StudioInsertHubWorkspaceProps["onUseAction"]>(() => true);
  const onUseItem =
    options.onUseItem ??
    vi.fn<StudioInsertHubWorkspaceProps["onUseItem"]>(() => true);
  const onUploadImage =
    options.onUploadImage ??
    vi.fn<StudioInsertHubWorkspaceProps["onUploadImage"]>();
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
        name: "내 주인공 시트 적용 전 검토",
      }),
    );
    expect(screen.getByRole("region", {
      name: "내 주인공 시트 적용 전 검토",
    })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {
      name: "내 주인공 시트 캔버스에 삽입 확정",
    }));
    await waitFor(() =>
      expect(view.onUseItem).toHaveBeenCalledWith(localAsset, "page"),
    );
  });

  it("filters catalog entries by webtoon production intent", () => {
    const dialogue = createLocalAsset(
      "dialogue",
      "옥상 2인 대화",
      ["대사", "긴장", "night"],
    );
    const chase = createLocalAsset(
      "chase",
      "야간 추격",
      ["액션", "속도", "night"],
    );
    const view = renderWorkspace({ items: [dialogue, chase] });

    fireEvent.click(screen.getByRole("button", { name: "2인 대화" }));
    expect(view.container.querySelector(
      `[data-studio-insert-entry="${dialogue.id}"]`,
    )).toBeTruthy();
    expect(view.container.querySelector(
      `[data-studio-insert-entry="${chase.id}"]`,
    )).toBeNull();
    expect(screen.getByText(/2인 대화 결과/u)).toBeTruthy();
  });

  it("requires an explicit rights acknowledgement before applying caution assets", () => {
    const caution = createLocalAsset(
      "external-background",
      "외부 배경",
      ["배경"],
      true,
    );
    const view = renderWorkspace({ items: [caution] });
    fireEvent.click(
      within(entryCard(view.container, caution.id)).getByRole("button", {
        name: "외부 배경 적용 전 검토",
      }),
    );
    const confirm = screen.getByRole("button", {
      name: "외부 배경 캔버스에 삽입 확정",
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", {
      name: "라이선스와 원본 출처를 확인했습니다.",
    }));
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);
    expect(view.onUseItem).toHaveBeenCalledWith(caution, "auto");
  });

  it("does not carry rights acknowledgement to another caution asset", () => {
    const first = createLocalAsset(
      "external-background-a",
      "외부 배경 A",
      ["배경"],
      true,
    );
    const second = createLocalAsset(
      "external-background-b",
      "외부 배경 B",
      ["배경"],
      true,
    );
    const view = renderWorkspace({ items: [first, second] });

    fireEvent.click(
      within(entryCard(view.container, first.id)).getByRole("button", {
        name: "외부 배경 A 적용 전 검토",
      }),
    );
    fireEvent.click(screen.getByRole("checkbox", {
      name: "라이선스와 원본 출처를 확인했습니다.",
    }));
    expect(screen.getByRole("button", {
      name: "외부 배경 A 캔버스에 삽입 확정",
    }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(
      within(entryCard(view.container, second.id)).getByRole("button", {
        name: "외부 배경 B 적용 전 검토",
      }),
    );
    expect(screen.getByRole("button", {
      name: "외부 배경 B 캔버스에 삽입 확정",
    }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps selected asset candidates in a visible comparison tray", () => {
    const dialogue = createLocalAsset("dialogue", "대화 장면", ["대화"]);
    const chase = createLocalAsset("chase", "추격 장면", ["액션"]);
    const view = renderWorkspace({ items: [dialogue, chase] });
    fireEvent.click(within(entryCard(view.container, dialogue.id)).getByRole(
      "button",
      { name: "대화 장면 비교 추가" },
    ));
    fireEvent.click(within(entryCard(view.container, chase.id)).getByRole(
      "button",
      { name: "추격 장면 비교 추가" },
    ));
    expect(screen.getByRole("region", { name: "에셋 비교함" })).toBeTruthy();
    expect(screen.getByText("비교함 2/3")).toBeTruthy();
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
