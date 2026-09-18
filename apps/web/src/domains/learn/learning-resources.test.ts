import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  ACADEMY_DISCOVERY_CONTRACT,
  LEARNING_RESOURCES,
  filterLearningResources,
} from "./learning-resources";

describe("academy learning resources", () => {
  it("ships unique resources with explicit rights and practice metadata", () => {
    assert.ok(LEARNING_RESOURCES.length >= 8);
    assert.equal(new Set(LEARNING_RESOURCES.map((item) => item.id)).size, LEARNING_RESOURCES.length);
    for (const resource of LEARNING_RESOURCES) {
      assert.ok(resource.title.length > 4);
      assert.ok(resource.description.length > 20);
      assert.ok(resource.skills.length > 0);
      assert.ok(resource.verifiedLabel.length > 2);
      if (resource.provider !== "toonstudio") assert.notEqual(resource.access, "internal");
      if (resource.provider === "youtube") assert.equal(resource.access, "metadata-only");
    }
  });

  it("filters by text, provider, category and level", () => {
    assert.ok(filterLearningResources(LEARNING_RESOURCES, { query: "콘티" }).length >= 2);
    assert.ok(filterLearningResources(LEARNING_RESOURCES, { provider: "youtube" }).every((item) => item.provider === "youtube"));
    assert.ok(filterLearningResources(LEARNING_RESOURCES, { category: "drawing" }).every((item) => item.category === "drawing"));
    assert.ok(filterLearningResources(LEARNING_RESOURCES, { level: "starter" }).every((item) => item.level === "starter"));
  });

  it("keeps external discovery behind server/API and MCP contracts", () => {
    assert.equal(ACADEMY_DISCOVERY_CONTRACT.youtube.mode, "server-side-data-api");
    assert.ok(ACADEMY_DISCOVERY_CONTRACT.youtube.operations.includes("playlist-sync"));
    assert.ok(ACADEMY_DISCOVERY_CONTRACT.mcp.tools.includes("search_learning_resources"));
  });
});
