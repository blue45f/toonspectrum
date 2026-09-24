import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const index = readFileSync("media/brand-film/src/index.tsx", "utf8");
const renderer = readFileSync("media/brand-film/render-technology.mjs", "utf8");
const film = readFileSync("media/brand-film/src/TechnologyStoryFilm.tsx", "utf8");
const workflow = readFileSync(
  ".github/workflows/technology-story-film.yml",
  "utf8",
);
const script = JSON.parse(
  readFileSync(
    "apps/web/src/domains/legal/technology/technology-film-script.json",
    "utf8",
  ),
);

test("technology film compositions share canonical durations and identifiers", () => {
  for (const composition of [
    "TechnologyStoryLandscape",
    "TechnologyStoryInvestor",
    "TechnologyStoryPortrait",
  ]) {
    assert(index.includes(`id=\"${composition}\"`));
    assert(renderer.includes(`id: \"${composition}\"`));
  }
  assert.equal(script.variants.overview.durationSeconds, 90);  assert.equal(script.variants.investor.durationSeconds, 45);
  assert.equal(script.variants.portrait.durationSeconds, 60);
  assert(film.includes("technology-film-script.json"));
  assert(index.includes("TECHNOLOGY_OVERVIEW_DURATION_SECONDS"));
});

test("technology film workflow is manual, read-only and cannot publish", () => {
  assert(workflow.includes("workflow_dispatch:"));
  assert(workflow.includes("contents: read"));
  assert(workflow.includes('render:technology -- "$FILM_FORMAT"'));
  assert(!/contents:\s*write|git push|secrets\.|deploy|release/iu.test(workflow));
});

test("renderer derives captions, transcripts and review metadata from the script", () => {
  assert(renderer.includes("technology-film-script.json"));
  assert(renderer.includes("overviewCues"));
  assert(renderer.includes("reviewed: false"));
  assert(renderer.includes('publishing: "manual-after-human-review"'));
  assert(renderer.includes("technology-overview.ko.vtt"));
  assert(renderer.includes("technology-overview.en.vtt"));
  assert(renderer.includes("technology-transcript.ko.md"));
  assert(renderer.includes("technology-film-manifest.json"));
});

test("overview story covers WebRTC, AI media, 3D, benchmarks and rights", () => {
  const overview = script.variants.overview.scenes;
  assert.equal(overview.length, 12);
  assert.equal(new Set(overview.map((scene) => scene.id)).size, overview.length);
  for (const id of [
    "realtime-media",    "ai-media-production",
    "specialist-3d",
    "benchmark-lessons",
    "rights-evidence",
  ]) {
    assert(overview.some((scene) => scene.id === id), `missing scene: ${id}`);
  }
  for (const scene of overview) {
    assert(scene.title.ko.trim());
    assert(scene.title.en.trim());
    assert(scene.narration.ko.trim());
    assert(scene.narration.en.trim());
    assert(scene.points.length >= 4);
  }
});

test("portrait scenes reference existing overview scenes", () => {
  const overviewIds = new Set(
    script.variants.overview.scenes.map((scene) => scene.id),
  );
  const portraitIds = script.variants.portrait.sceneIds;
  assert.equal(new Set(portraitIds).size, portraitIds.length);
  for (const id of portraitIds) assert(overviewIds.has(id), `unknown portrait scene: ${id}`);
});
