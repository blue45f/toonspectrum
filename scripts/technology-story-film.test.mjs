import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const index = readFileSync("media/brand-film/src/index.tsx", "utf8");
const renderer = readFileSync("media/brand-film/render-technology.mjs", "utf8");
const film = readFileSync("media/brand-film/src/TechnologyStoryFilm.tsx", "utf8");
const workflow = readFileSync(".github/workflows/technology-story-film.yml", "utf8");

test("technology film compositions and renderer share the published identifiers", () => {
  for (const composition of [
    "TechnologyStoryLandscape",
    "TechnologyStoryInvestor",
    "TechnologyStoryPortrait",
  ]) {
    assert(index.includes(`id=\"${composition}\"`));
    assert(renderer.includes(`id: \"${composition}\"`));
  }
});

test("technology film workflow is manual, read-only and cannot publish", () => {
  assert(workflow.includes("workflow_dispatch:"));
  assert(workflow.includes("contents: read"));
  assert(workflow.includes('render:technology -- "$FILM_FORMAT"'));
  assert(!/contents:\s*write|git push|secrets\.|deploy|release/i.test(workflow));
});

test("renderer emits review metadata, captions and transcripts", () => {
  assert(renderer.includes("reviewed: false"));
  assert(renderer.includes('publishing: "manual-after-human-review"'));
  assert(renderer.includes("technology-overview.ko.vtt"));
  assert(renderer.includes("technology-overview.en.vtt"));
  assert(renderer.includes("technology-transcript.ko.md"));
  assert(renderer.includes("technology-film-manifest.json"));
});


test("technology film covers Worker, PWA, 3D, free AI, Open API and troubleshooting", () => {
  for (const marker of [
    "WORKER · PWA · LOCAL-FIRST",
    "WEB 3D · BLENDER · MCP",
    "FREE-FIRST AI · COST",
    "OPEN API · PROVENANCE",
    "TROUBLESHOOTING · EVIDENCE",
  ]) {
    assert(film.includes(marker), `missing film marker: ${marker}`);
  }
  assert(renderer.includes("Worker, PWA, OPFS"));
  assert(renderer.includes("Blender QA"));
  assert(renderer.includes("중복 추론"));
});

test("overview film keeps browser execution in sync with the field notes", () => {
  assert(film.includes('kicker: "06 · WORKER · PWA · LOCAL-FIRST · BROWSER EXECUTION"'));
  assert(film.includes('points: ["Workers", "PWA", "ONNX", "MediaPipe"]'));
  assert(film.includes('kicker: "14 · REUSABLE ENGINEERING"'));
});
