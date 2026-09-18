import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildYouTubeLearningSearchUrl,
  CURATED_LEARNING_RESOURCES,
  filterLearningResources,
  rankLearningResources,
} from "./learning-resources";

describe("learning resource catalogue", () => {
  it("filters across role, source, format, level and production step", () => {
    const results = filterLearningResources(CURATED_LEARNING_RESOURCES, {
      role: "artist",
      source: "clip-studio",
      format: "guide",
      level: "growing",
      step: "background",
    });
    assert.deepEqual(results.map((resource) => resource.id), ["clip-perspective-ruler"]);
  });

  it("searches Korean labels and provider metadata", () => {
    assert.ok(filterLearningResources(CURATED_LEARNING_RESOURCES, { query: "캐릭터" }).some((item) => item.id === "kocca-character-2026"));
    assert.ok(filterLearningResources(CURATED_LEARNING_RESOURCES, { query: "에듀코카" }).length >= 2);
  });

  it("ranks verified internal practice resources ahead for the selected role", () => {
    const ranked = rankLearningResources(CURATED_LEARNING_RESOURCES, "artist");
    assert.equal(ranked[0].source, "toonstudio");
    assert.equal(ranked[0].roles.includes("artist"), true);
  });

  it("builds a bounded YouTube discovery URL instead of scraping video pages", () => {
    const url = buildYouTubeLearningSearchUrl("  콘티   연출  ");
    assert.match(url, /^https:\/\/www\.youtube\.com\/results\?search_query=/u);
    assert.equal(decodeURIComponent(url).includes("웹툰 콘티 연출"), true);
  });
});
