import { describe, expect, it } from "vitest";

import {
  addResearchNotebookEntry,
  buildResearchNotebookMarkdown,
  createResearchNotebook,
  isResearchNoteTextValid,
  mergeResearchNotebooks,
  parseResearchNotebook,
  RESEARCH_NOTE_LIMIT,
  RESEARCH_NOTE_SOURCE_LIMIT,
  removeResearchNotebookEntry,
  researchNotebookEntryId,
  researchNotebookSearchQuery,
  sanitizeResearchNotebook,
  serializeResearchNotebook,
  summarizeResearchNotebook,
  updateResearchNotebookEntry,
} from "./research-notebook";

import type { CreatorResource } from "@/shared/lib/creator-resources";

function resource(id: string, title: string): CreatorResource {
  return {
    id,
    provider: "met",
    title,
    creator: "Creator",
    description: "Reference",
    sourceUrl: `https://www.metmuseum.org/art/collection/search/${encodeURIComponent(id)}`,
    license: "CC0",
    licenseUrl: "",
    credit: "The Met",
    fetchedAt: "2026-09-09T00:00:00.000Z",
  };
}

describe("research notebook persistence", () => {
  it("sanitizes bounded notes, rejects malformed rows, deduplicates ids, and caps linked sources", () => {
    const entries = Array.from({ length: RESEARCH_NOTE_LIMIT + 4 }, (_, index) => ({
      id: `note-${index}`,
      kind: index % 3 === 0 ? "observation" : index % 3 === 1 ? "question" : "decision",
      text: `  관찰   ${index}  `,
      sourceIds: Array.from({ length: RESEARCH_NOTE_SOURCE_LIMIT + 3 }, (_value, sourceIndex) => `source-${sourceIndex}`),
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T01:00:00.000Z",
    }));
    entries.splice(1, 0, { ...entries[0]!, text: "중복 아이디" });
    entries.splice(2, 0, { ...entries[0]!, id: "bad", kind: "unsupported" as "observation", text: "x" });

    const notebook = sanitizeResearchNotebook({ version: 1, entries });
    expect(notebook.entries).toHaveLength(RESEARCH_NOTE_LIMIT);
    expect(notebook.entries[0]).toMatchObject({ id: "note-0", text: "관찰 0" });
    expect(notebook.entries.filter((entry) => entry.id === "note-0")).toHaveLength(1);
    expect(notebook.entries[0]!.sourceIds).toHaveLength(RESEARCH_NOTE_SOURCE_LIMIT);
  });

  it("rejects malformed, oversized, and unsupported backups", () => {
    expect(() => parseResearchNotebook("{")).toThrow("JSON");
    expect(() => parseResearchNotebook(JSON.stringify({ version: 2, entries: [] }))).toThrow("버전");
    expect(() => parseResearchNotebook("x".repeat(65_537))).toThrow("크기");
  });

  it("serializes only the validated versioned shape", () => {
    const notebook = addResearchNotebookEntry(createResearchNotebook(), {
      id: "note-a",
      kind: "observation",
      text: "  역무실   벽시계 위치 ",
      now: new Date("2026-09-09T03:00:00.000Z"),
    });
    expect(parseResearchNotebook(serializeResearchNotebook(notebook))).toEqual(notebook);
  });
});

describe("research notebook editing", () => {
  it("adds, reclassifies, links, removes, and summarizes creator-authored notes", () => {
    let notebook = createResearchNotebook();
    notebook = addResearchNotebookEntry(notebook, {
      id: "note-observation",
      kind: "observation",
      text: "역무실 벽시계는 승강장 방향에서 보인다.",
      sourceIds: ["met:station"],
      now: new Date("2026-09-09T03:00:00.000Z"),
    });
    notebook = addResearchNotebookEntry(notebook, {
      id: "note-question",
      kind: "question",
      text: "야간 근무용 조명은 어떤 연료를 사용했을까?",
      now: new Date("2026-09-09T04:00:00.000Z"),
    });
    notebook = updateResearchNotebookEntry(notebook, "note-question", {
      kind: "decision",
      sourceIds: ["met:lamp"],
    }, new Date("2026-09-09T05:00:00.000Z"));

    expect(summarizeResearchNotebook(notebook)).toEqual({
      total: 2,
      observationCount: 1,
      questionCount: 0,
      decisionCount: 1,
      linkedCount: 2,
      unlinkedDecisionCount: 0,
    });
    expect(notebook.entries[0]).toMatchObject({ kind: "decision", sourceIds: ["met:lamp"], updatedAt: "2026-09-09T05:00:00.000Z" });
    expect(removeResearchNotebookEntry(notebook, "note-observation").entries).toHaveLength(1);
  });

  it("merges backups without replacing current entries that share an id", () => {
    const current = addResearchNotebookEntry(createResearchNotebook(), {
      id: "same",
      kind: "decision",
      text: "현재 장면 결정",
      now: new Date("2026-09-09T05:00:00.000Z"),
    });
    let incoming = addResearchNotebookEntry(createResearchNotebook(), {
      id: "same",
      kind: "question",
      text: "백업의 이전 질문",
      now: new Date("2026-09-08T05:00:00.000Z"),
    });
    incoming = addResearchNotebookEntry(incoming, {
      id: "new",
      kind: "observation",
      text: "백업의 새 관찰",
      now: new Date("2026-09-08T06:00:00.000Z"),
    });

    const merged = mergeResearchNotebooks(current, incoming);
    expect(merged.entries.map((entry) => entry.id)).toEqual(["same", "new"]);
    expect(merged.entries[0]!.text).toBe("현재 장면 결정");
  });

  it("builds safe search seeds and deterministic ids without inventing valid short notes", () => {
    expect(isResearchNoteTextValid("x")).toBe(false);
    expect(researchNotebookSearchQuery("  1920년대   야간 역무실의 조명 방식  ")).toBe("1920년대 야간 역무실의 조명 방식");
    expect(researchNotebookEntryId(1_000, () => 0.5)).toBe("note-rs-i00000");
  });
});

describe("research notebook exports", () => {
  it("exports grouped creator decisions with linked source provenance and explicit limitations", () => {
    let notebook = createResearchNotebook();
    notebook = addResearchNotebookEntry(notebook, {
      id: "observation",
      kind: "observation",
      text: "역무실 벽시계가 출입문 맞은편에 보인다.",
      sourceIds: ["met:station"],
      now: new Date("2026-09-09T03:00:00.000Z"),
    });
    notebook = addResearchNotebookEntry(notebook, {
      id: "decision",
      kind: "decision",
      text: "첫 컷은 벽시계와 출입문을 같은 축에 둔다.",
      sourceIds: ["missing"],
      now: new Date("2026-09-09T04:00:00.000Z"),
    });

    const markdown = buildResearchNotebookMarkdown(notebook, [resource("met:station", "Station interior")]);
    expect(markdown).toContain("## 근거에서 장면 결정으로");
    expect(markdown).toContain("### 확인한 근거");
    expect(markdown).toContain("[Station interior](https://www.metmuseum.org/art/collection/search/met%3Astation)");
    expect(markdown).toContain("현재 저장 보드에서 찾을 수 없음");
    expect(markdown).toContain("사실 확인이나 권리 확보를 자동 보증하지는 않습니다");
  });
});
