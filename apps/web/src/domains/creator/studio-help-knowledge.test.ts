import { describe, expect, it } from "vitest";

import {
  STUDIO_HELP_ARTICLES,
  recommendStudioHelpArticles,
  searchStudioHelpArticles,
  validateStudioHelpKnowledge,
} from "./studio-help-knowledge";

describe("studio help knowledge", () => {
  it("keeps article and guide references internally valid", () => {
    expect(validateStudioHelpKnowledge()).toEqual([]);
    expect(new Set(STUDIO_HELP_ARTICLES.map((article) => article.id)).size).toBe(
      STUDIO_HELP_ARTICLES.length,
    );
  });

  it("finds Korean symptoms and familiar English editor terms", () => {
    expect(searchStudioHelpArticles("선 떨림", "ko")[0]?.id).toBe("clean-lines");
    expect(searchStudioHelpArticles("paint bucket gap", "en")[0]?.id).toBe(
      "fill-without-gaps",
    );
    expect(searchStudioHelpArticles("unsaved draft", "en")[0]?.id).toBe(
      "recover-work",
    );
  });

  it("recommends guidance from the active tool instead of a fixed popularity list", () => {
    const pen = recommendStudioHelpArticles({ toolCommandId: "tool.pen", limit: 3 });
    const lettering = recommendStudioHelpArticles({
      toolCommandId: "tool.bubble",
      limit: 3,
    });
    expect(pen.map((article) => article.id)).toContain("clean-lines");
    expect(lettering[0]?.id).toBe("lettering-bubbles");
  });

  it("prioritises recovery guidance when the browser is offline", () => {
    const offline = recommendStudioHelpArticles({ online: false, limit: 2 });
    expect(offline.map((article) => article.id).sort()).toEqual([
      "offline-work",
      "recover-work",
    ]);
  });
});
