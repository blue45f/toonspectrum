// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioTranslationMemoryEntry,
  saveStudioTranslationMemory,
  STUDIO_TRANSLATION_MEMORY_KIND,
  STUDIO_TRANSLATION_MEMORY_STORAGE_KEY,
} from "./studio-translation-memory";
import {
  StudioDialogueTranslationMemoryPanel,
  type StudioDialogueTranslationMemoryPanelProps,
} from "./StudioDialogueTranslationMemoryPanel";

const BASE_PROPS: StudioDialogueTranslationMemoryPanelProps = {
  workScope: "episode-01",
  sourceText: "오늘도 정말 반가워, 민수야!",
  speaker: "유나",
  sourceLocale: "ko-KR",
  targetLocale: "en-US",
  sourceRevision: "revision-1",
  storage: window.localStorage,
  onReuse: () => {},
};

function renderPanel(
  overrides: Partial<StudioDialogueTranslationMemoryPanelProps> = {}
) {
  const onReuse = vi.fn();
  const result = render(
    <StudioDialogueTranslationMemoryPanel
      {...BASE_PROPS}
      onReuse={onReuse}
      {...overrides}
    />
  );
  return { ...result, onReuse };
}

function seedApproved(
  overrides: Partial<Parameters<typeof createStudioTranslationMemoryEntry>[0]> = {}
) {
  const created = createStudioTranslationMemoryEntry({
    workScope: "episode-01",
    sourceText: "오늘도 정말 반가워, 민수야!",
    speaker: "유나",
    sourceLocale: "ko-KR",
    targetLocale: "en-US",
    sourceRevision: "revision-1",
    translation: "It is so good to see you again, Minsu!",
    status: "approved",
    now: 100,
    ...overrides,
  });
  if (!created.ok) throw new Error(created.error);
  expect(saveStudioTranslationMemory(localStorage, [created.entry]).ok).toBe(
    true
  );
  return created.entry;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioDialogueTranslationMemoryPanel local-only contract", () => {
  it("honestly discloses local-only persistence and bounded JSON controls", () => {
    const { container } = renderPanel({ onClose: vi.fn() });

    expect(
      container
        .querySelector("[data-studio-translation-memory]")
        ?.getAttribute("data-studio-translation-memory")
    ).toBe("local-only");
    expect(screen.getByText("이 브라우저에만 로컬 저장")).toBeTruthy();
    expect(
      screen.getByText(/서버·팀원·다른 기기에는 자동 동기화하지 않습니다/u)
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "JSON 내보내기" }).hasAttribute(
        "disabled"
      )
    ).toBe(true);
    expect(screen.getByText("JSON 가져오기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "번역 메모리 닫기" })).toBeTruthy();
    expect(screen.getByText("작품 episode-01")).toBeTruthy();
    expect(screen.getByText("ko-KR → en-US")).toBeTruthy();
    expect(screen.getByText("화자 유나")).toBeTruthy();
  });

  it("falls back to session memory without pretending it was persisted", () => {
    renderPanel({ storage: null, initialTranslation: "Hello" });

    expect(screen.getByText("현재 탭 메모리에서만 유지")).toBeTruthy();
    expect(screen.getByText(/새로고침하면 사라질 수 있습니다/u)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "번역을 초안으로 저장" })
    );
    expect(
      screen.getAllByText(/로컬 저장소가 없어 현재 탭에서만 유지됩니다/u)
        .length
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("StudioDialogueTranslationMemoryPanel author workflow", () => {
  it("saves, reviews, approves, explicitly reuses and invalidates an exact entry", () => {
    const { onReuse } = renderPanel();
    const editor = screen.getByRole("textbox", { name: "번역문 초안" });

    fireEvent.change(editor, {
      target: { value: "It is great to see you again, Minsu!" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "번역을 초안으로 저장" })
    );

    expect(screen.getByRole("region", { name: "정확히 일치하는 번역" })).toBeTruthy();
    expect(screen.getByText("초안")).toBeTruthy();
    expect(
      JSON.parse(
        localStorage.getItem(STUDIO_TRANSLATION_MEMORY_STORAGE_KEY) ?? "{}"
      )
    ).toMatchObject({
      kind: STUDIO_TRANSLATION_MEMORY_KIND,
      entries: [{ status: "draft" }],
    });

    fireEvent.click(screen.getByRole("button", { name: "검토 완료" }));
    expect(screen.getByText("검토됨")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByText("승인됨")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "번역 재사용" }));
    expect(onReuse).toHaveBeenCalledWith(
      "It is great to see you again, Minsu!",
      expect.objectContaining({ status: "approved" })
    );

    fireEvent.click(screen.getByRole("button", { name: "무효화" }));
    expect(screen.getByText("원문 변경 · 재검토 필요")).toBeTruthy();
    expect(screen.getByText("초안")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "번역 재사용" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("shows fuzzy entries as manual suggestions and never auto-applies them", () => {
    seedApproved();
    const { onReuse } = renderPanel({
      sourceText: "오늘도 정말 반가워 민수야!",
      sourceRevision: "revision-2",
    });

    expect(screen.getByRole("region", { name: "유사 번역 제안" })).toBeTruthy();
    expect(screen.getByText(/유사 번역은/u)).toBeTruthy();
    expect(screen.getByText(/자동 적용하지 않습니다/u)).toBeTruthy();
    expect(onReuse).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "번역 재사용" }));
    expect(onReuse).toHaveBeenCalledTimes(1);
  });

  it("blocks reuse and approval when the current glossary conflicts", () => {
    seedApproved({
      sourceText: "민수가 왔다.",
      translation: "Minsoo is here.",
    });
    renderPanel({
      sourceText: "민수가 왔다.",
      speaker: "유나",
      glossaryRules: [{ sourceTerm: "민수", targetTerm: "Minsu" }],
    });

    expect(screen.getByText("용어집 충돌 1건")).toBeTruthy();
    expect(screen.getByText(/Minsu/u)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "번역 재사용" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  it("surfaces revision drift as stale and lets the author persist invalidation", () => {
    seedApproved();
    renderPanel({ sourceRevision: "revision-2" });

    expect(screen.getByText("원문 변경 · 재검토 필요")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "번역 재사용" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "승인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "무효화" }));
    expect(screen.getByText(/재검토 대상으로 표시했습니다/u)).toBeTruthy();
    expect(
      JSON.parse(
        localStorage.getItem(STUDIO_TRANSLATION_MEMORY_STORAGE_KEY) ?? "{}"
      ).entries[0]
    ).toMatchObject({ stale: true, status: "draft" });
  });
});
