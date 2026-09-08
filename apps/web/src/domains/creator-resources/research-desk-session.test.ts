import { describe, expect, it } from "vitest";

import {
  clearResearchSearchHistory,
  createResearchDeskSession,
  isResearchDeskSessionEmpty,
  parseResearchDeskSession,
  recordResearchSearch,
  researchDeskBriefContext,
  researchIntentById,
  sanitizeResearchDeskSession,
  serializeResearchDeskSession,
  updateResearchDeskFocus,
} from "./research-desk-session";

describe("research desk session persistence", () => {
  it("sanitizes focus fields, validates enums, deduplicates history, and keeps the newest eight entries", () => {
    const history = Array.from({ length: 11 }, (_, index) => ({
      mode: index % 2 ? "books" : "assets",
      query: ` query ${index} `,
      searchedAt: `2026-09-${String(9 - Math.min(index, 8)).padStart(2, "0")}T00:00:00.000Z`,
    }));
    history.splice(1, 0, { mode: "assets", query: "query 0", searchedAt: "2026-09-09T01:00:00.000Z" });
    const session = sanitizeResearchDeskSession({
      version: 1,
      title: `  ${"A".repeat(100)}  `,
      question: "  야간   기차역의  구조는? ",
      context: "  1920년대   겨울밤 ",
      intent: "unknown",
      lastMode: "invalid",
      history,
    });

    expect(session.title).toHaveLength(80);
    expect(session.question).toBe("야간 기차역의 구조는?");
    expect(session.context).toBe("1920년대 겨울밤");
    expect(session.intent).toBe("scene");
    expect(session.lastMode).toBe("assets");
    expect(session.history).toHaveLength(8);
    expect(session.history.filter((entry) => entry.query === "query 0")).toHaveLength(1);
  });

  it("rejects malformed, oversized, and unsupported persisted payloads", () => {
    expect(() => parseResearchDeskSession("{")).toThrow("JSON");
    expect(() => parseResearchDeskSession(JSON.stringify({ version: 2 }))).toThrow("버전");
    expect(() => parseResearchDeskSession("x".repeat(32_769))).toThrow("크기");
  });

  it("serializes only the bounded versioned shape", () => {
    const raw = serializeResearchDeskSession(updateResearchDeskFocus(createResearchDeskSession(), {
      title: "Night station",
      intent: "character",
      lastMode: "books",
    }));
    expect(parseResearchDeskSession(raw)).toMatchObject({
      version: 1,
      title: "Night station",
      intent: "character",
      lastMode: "books",
    });
  });
});

describe("research desk focus and search history", () => {
  it("keeps the latest duplicate at the front and caps history without inventing searches", () => {
    let session = createResearchDeskSession();
    for (let index = 0; index < 10; index += 1) {
      session = recordResearchSearch(session, index % 2 ? "books" : "assets", `query ${index}`, new Date(`2026-09-09T0${index}:00:00.000Z`));
    }
    expect(session.history).toHaveLength(8);
    expect(session.history[0]).toMatchObject({ mode: "books", query: "query 9" });

    session = recordResearchSearch(session, "books", "  query   7 ", new Date("2026-09-10T00:00:00.000Z"));
    expect(session.history[0]).toMatchObject({ mode: "books", query: "query 7", searchedAt: "2026-09-10T00:00:00.000Z" });
    expect(session.history.filter((entry) => entry.mode === "books" && entry.query === "query 7")).toHaveLength(1);
    expect(recordResearchSearch(session, "assets", "x")).toBe(session);
  });

  it("tracks meaningful focus separately from the creator workspace and can clear only search history", () => {
    const focused = updateResearchDeskFocus(createResearchDeskSession(), {
      title: "1화 역무실",
      question: "역무원은 야간에 어떤 도구를 사용했을까?",
      context: "1920년대 · 겨울",
      intent: "prop",
    });
    const searched = recordResearchSearch(focused, "assets", "1920 railway station tools", new Date("2026-09-09T04:00:00.000Z"));
    expect(isResearchDeskSessionEmpty(searched)).toBe(false);
    expect(clearResearchSearchHistory(searched)).toMatchObject({
      title: "1화 역무실",
      question: "역무원은 야간에 어떤 도구를 사용했을까?",
      history: [],
    });
    expect(researchIntentById("prop").defaultMode).toBe("assets");
    expect(researchDeskBriefContext(searched)).toMatchObject({
      title: "1화 역무실",
      intentLabel: "소품·기술",
      recentSearches: [{ mode: "assets", query: "1920 railway station tools" }],
    });
  });
});
