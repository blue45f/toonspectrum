import { describe, expect, it, vi } from "vitest";

import {
  localizeStudioMainMenuGroups,
  type StudioMainMenuLocalizationState,
} from "./studio-main-menu-localization";

import type { StudioMainMenuGroup } from "./studio-main-menu-model";

const BASE_STATE: StudioMainMenuLocalizationState = {
  sharedNonOwnerSave: false,
  hasWorkId: false,
  filterDisabled: false,
  filterUnavailableReason: null,
  canvasRotation: 90,
  pageSequenceOpen: false,
  quickAccessPaletteOpen: false,
  quickAccessPaletteLoading: false,
  leftPanelOpen: false,
  rightPanelOpen: false,
  lastFilterDraft: null,
};

function translator(dictionary: Readonly<Record<string, string>>) {
  return (key: string) => dictionary[key] ?? key;
}

function groups(): StudioMainMenuGroup[] {
  const onSelect = vi.fn();
  return [
    {
      id: "file",
      label: "파일",
      items: [
        { id: "save-draft", label: "임시저장", onSelect },
        { id: "publish", label: "게시", onSelect },
      ],
    },
    {
      id: "view",
      label: "보기",
      items: [
        { id: "reset-rotation", label: "보기 회전 초기화 (90°)", onSelect },
        { id: "page-sequence", label: "페이지 시퀀스 열기", onSelect },
        { id: "quick-access-palette", label: "빠른 액세스 열기", onSelect },
        { id: "left-panel", label: "왼쪽 패널 보이기", onSelect },
        { id: "right-panel", label: "속성 패널 보이기", onSelect },
        {
          id: "color-vision-grayscale",
          label: "흑백 명암",
          unavailableReason: "미리보기를 사용할 수 없습니다.",
          onSelect,
        },
      ],
    },
    {
      id: "filter",
      label: "필터",
      items: [
        {
          id: "last-filter",
          label: "마지막 필터…",
          unavailableReason: "다시 열 필터가 없습니다.",
          onSelect,
        },
        {
          id: "gaussian-blur",
          label: "가우시안 블러",
          unavailableReason: "필터를 사용할 수 없습니다.",
          onSelect,
        },
      ],
    },
  ];
}

function item(
  projected: readonly StudioMainMenuGroup[],
  groupId: string,
  itemId: string,
) {
  const found = projected
    .find((group) => group.id === groupId)
    ?.items.find((candidate) => candidate.id === itemId);
  if (!found) throw new Error(`Missing ${groupId}/${itemId}`);
  return found;
}

describe("localizeStudioMainMenuGroups", () => {
  it("projects dynamic translation keys without mutating catalogue groups or callbacks", () => {
    const source = groups();
    const onSelect = source[0].items[0].onSelect;
    const projected = localizeStudioMainMenuGroups(
      source,
      {
        ...BASE_STATE,
        sharedNonOwnerSave: true,
        hasWorkId: true,
        pageSequenceOpen: true,
        quickAccessPaletteLoading: true,
        leftPanelOpen: true,
        rightPanelOpen: true,
        lastFilterDraft: { kind: "gaussian-blur" },
      },
      translator({
        "studio.mainMenu.group.file.label": "File",
        "studio.mainMenu.item.file.save-draft.shared": "Shared save",
        "studio.mainMenu.item.file.publish.has-work": "Update publish",
        "studio.mainMenu.item.view.reset-rotation": "Reset rotation ({angle}°)",
        "studio.mainMenu.item.view.page-sequence.open": "Close sequence",
        "studio.mainMenu.item.view.quick-access-palette.loading": "Opening quick access…",
        "studio.mainMenu.item.view.left-panel.open": "Hide left panel",
        "studio.mainMenu.item.view.right-panel.open": "Hide properties",
        "studio.mainMenu.item.filter.last-filter.ready": "Reopen last filter",
      }),
    );

    expect(source[0].label).toBe("파일");
    expect(projected[0].label).toBe("File");
    expect(item(projected, "file", "save-draft").label).toBe("Shared save");
    expect(item(projected, "file", "publish").label).toBe("Update publish");
    expect(item(projected, "view", "reset-rotation").label).toBe("Reset rotation (90°)");
    expect(item(projected, "view", "page-sequence").label).toBe("Close sequence");
    expect(item(projected, "view", "quick-access-palette").label).toBe("Opening quick access…");
    expect(item(projected, "view", "left-panel").label).toBe("Hide left panel");
    expect(item(projected, "view", "right-panel").label).toBe("Hide properties");
    expect(item(projected, "filter", "last-filter").label).toBe("Reopen last filter");
    expect(item(projected, "file", "save-draft").onSelect).toBe(onSelect);
  });

  it("uses explicit command keys, contextual unavailable copy, and Korean fallbacks", () => {
    const source = groups();
    const editItem = {
      id: "undo",
      label: "실행 취소",
      labelKey: "studio.mainMenu.edit.command.undo",
      onSelect: vi.fn(),
    };
    const projected = localizeStudioMainMenuGroups(
      [...source, { id: "edit", label: "편집", items: [editItem] }],
      {
        ...BASE_STATE,
        filterDisabled: true,
        filterUnavailableReason: "재생 중에는 필터를 적용할 수 없습니다.",
      },
      translator({
        "studio.mainMenu.edit.command.undo": "Undo",
        "studio.mainMenu.item.filter.unavailable": "Stop playback to use filters.",
        "studio.mainMenu.item.view.color-vision.unavailable": "Preview unavailable.",
      }),
    );

    expect(item(projected, "edit", "undo").label).toBe("Undo");
    expect(item(projected, "filter", "last-filter").unavailableReason).toBe(
      "Stop playback to use filters.",
    );
    expect(item(projected, "filter", "gaussian-blur").unavailableReason).toBe(
      "Stop playback to use filters.",
    );
    expect(item(projected, "view", "color-vision-grayscale").unavailableReason).toBe(
      "Preview unavailable.",
    );
    expect(projected.find((group) => group.id === "view")?.label).toBe("보기");
  });

  it("uses the empty-last-filter unavailable key when filters are otherwise available", () => {
    const projected = localizeStudioMainMenuGroups(
      groups(),
      BASE_STATE,
      translator({
        "studio.mainMenu.item.filter.last-filter.empty": "Last filter…",
        "studio.mainMenu.item.filter.last-filter.empty-unavailable": "No filter settings yet.",
      }),
    );

    expect(item(projected, "filter", "last-filter")).toMatchObject({
      label: "Last filter…",
      unavailableReason: "No filter settings yet.",
    });
    expect(item(projected, "filter", "gaussian-blur").unavailableReason).toBe(
      "필터를 사용할 수 없습니다.",
    );
  });
});
