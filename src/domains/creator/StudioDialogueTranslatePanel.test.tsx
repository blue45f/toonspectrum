// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  openStudioLocalDatabase,
  type StudioLocalDatabase,
} from "./studio-local-database";
import {
  createStudioTranslationMemoryEntry,
} from "./studio-translation-memory";
import { createStudioTranslationMemorySqlitePersistence } from "./studio-translation-memory-sqlite-persistence";
import { StudioDialogueTranslatePanel } from "./StudioDialogueTranslatePanel";

const databaseRuntime = vi.hoisted(() => ({ acquire: vi.fn() }));

vi.mock("./studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: databaseRuntime.acquire,
}));

const pages = [
  {
    id: "page-1",
    elements: [
      {
        id: "bubble-1",
        type: "bubble",
        text: "다시 만나서 반가워.",
        x: 20,
        y: 40,
      },
    ],
  },
] as const;

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof StudioDialogueTranslatePanel>> = {}
) {
  const onDraftChange = vi.fn();
  render(
    <StudioDialogueTranslatePanel
      pages={pages}
      configured
      activeLocale="source"
      availableLocales={[]}
      coverageFor={() => ({ total: 1, translated: 0 })}
      targetLocale="en-US"
      onTargetLocaleChange={vi.fn()}
      glossary=""
      onGlossaryChange={vi.fn()}
      busy={false}
      progress={null}
      error={null}
      draft={new Map([["bubble-1", "Good to see you again."]])}
      onGenerate={vi.fn()}
      onDraftChange={onDraftChange}
      onApplyDraft={vi.fn()}
      onDiscardDraft={vi.fn()}
      onSwitchLocale={vi.fn()}
      onClose={vi.fn()}
      workScope="work-translation-1"
      {...overrides}
    />
  );
  return { onDraftChange };
}

let database: StudioLocalDatabase;

beforeEach(async () => {
  localStorage.clear();
  database = await openStudioLocalDatabase({ vfs: "memory" });
  databaseRuntime.acquire.mockResolvedValue(database);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  databaseRuntime.acquire.mockReset();
  await database.close();
});

describe("StudioDialogueTranslatePanel translation-memory bridge", () => {
  it("opens a local translation-memory surface from each draft row", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "메모리" }));

    expect(
      await screen.findByRole("heading", { name: "번역 메모리" })
    ).toBeTruthy();
    expect(screen.getByText("작품 work-translation-1")).toBeTruthy();
    expect(screen.getByText("source → en-US")).toBeTruthy();
    expect(screen.getByText("다시 만나서 반가워.")).toBeTruthy();
  });

  it("reuses an explicitly approved match without applying it to the canvas", async () => {
    const created = createStudioTranslationMemoryEntry({
      workScope: "work-translation-1",
      sourceText: "다시 만나서 반가워.",
      sourceLocale: "source",
      targetLocale: "en-US",
      sourceRevision: "page-1:bubble-1:다시 만나서 반가워.",
      translation: "It is good to see you again.",
      status: "approved",
      now: 1,
    });
    if (!created.ok) throw new Error(created.error);
    const persistence = createStudioTranslationMemorySqlitePersistence({
      acquireDatabase: async () => database,
    });
    await expect(persistence.save([created.entry])).resolves.toEqual({ ok: true });
    const { onDraftChange } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "메모리" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "번역 재사용" })
    );

    expect(onDraftChange).toHaveBeenCalledWith(
      "bubble-1",
      "It is good to see you again."
    );
    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();
  });
});
