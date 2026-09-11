import { describe, expect, it } from "vitest";

import {
  consumeStudioAiProjectHandoff,
  createStudioAiProjectHandoff,
  STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY,
  writeStudioAiProjectHandoff,
} from "./studio-ai-project-handoff";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Studio AI project handoff", () => {
  it("round-trips a bounded handoff and consumes it once", () => {
    const storage = memoryStorage();
    const requestedAt = new Date("2026-09-11T03:00:00.000Z");
    const handoff = createStudioAiProjectHandoff({
      projectId: "project-12",
      documentId: "episode-3",
      tool: "composition",
      prompt: "  컷 12~16의 긴장감을 높여줘  ",
      source: "story",
      now: requestedAt,
    });

    writeStudioAiProjectHandoff(storage, handoff);
    expect(storage.getItem(STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY)).toBeTruthy();

    const consumed = consumeStudioAiProjectHandoff(
      storage,
      "project-12",
      new Date("2026-09-11T03:05:00.000Z"),
    );
    expect(consumed).toMatchObject({
      projectId: "project-12",
      documentId: "episode-3",
      tool: "composition",
      prompt: "컷 12~16의 긴장감을 높여줘",
      source: "story",
    });
    expect(consumeStudioAiProjectHandoff(storage, "project-12", requestedAt)).toBeNull();
  });

  it("drops expired, malformed and cross-project requests", () => {
    const storage = memoryStorage();
    const now = new Date("2026-09-11T03:00:00.000Z");
    writeStudioAiProjectHandoff(storage, createStudioAiProjectHandoff({
      projectId: "project-a",
      tool: "dialogue",
      prompt: "대사를 다듬어줘",
      source: "project-shell",
      now,
    }));

    expect(consumeStudioAiProjectHandoff(storage, "project-b", now)).toBeNull();

    storage.setItem(STUDIO_AI_PROJECT_HANDOFF_STORAGE_KEY, "not-json");
    expect(consumeStudioAiProjectHandoff(storage, "project-a", now)).toBeNull();

    writeStudioAiProjectHandoff(storage, createStudioAiProjectHandoff({
      projectId: "project-a",
      tool: "dialogue",
      prompt: "대사를 다듬어줘",
      source: "project-shell",
      now,
    }));
    expect(consumeStudioAiProjectHandoff(
      storage,
      "project-a",
      new Date("2026-09-11T03:16:00.000Z"),
    )).toBeNull();
  });

  it("rejects empty project and prompt values before anything is persisted", () => {
    expect(() => createStudioAiProjectHandoff({
      projectId: " ",
      tool: "palette",
      prompt: "무드 팔레트",
      source: "project-shell",
    })).toThrow(/project and prompt/u);
    expect(() => createStudioAiProjectHandoff({
      projectId: "project-1",
      tool: "palette",
      prompt: " ",
      source: "project-shell",
    })).toThrow(/project and prompt/u);
  });
});
