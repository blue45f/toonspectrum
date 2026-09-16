#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(
  new URL("./data/studio-2d-background-atlas-v1.json", import.meta.url),
  "utf8",
));
const recipes = catalog.recipes;
assert.equal(recipes.length, 512);
assert.equal(new Set(recipes.map((recipe) => recipe.id)).size, 512);
assert.equal(new Set(recipes.map((recipe) => recipe.promptSha256)).size, 512);
for (const genre of ["daily","romance","fantasy","wuxia","sf","drama","action","horror"]) {
  assert.equal(recipes.filter((recipe) => recipe.genre === genre).length, 64, genre);
}
for (const orientation of ["landscape","portrait","square"]) {
  assert.ok(recipes.some((recipe) => recipe.orientation === orientation), orientation);
}
for (const recipe of recipes) {
  assert.equal(recipe.model, "gpt-image-2.5-sunburst");
  assert.equal(recipe.quality, "max");
  assert.match(recipe.id, /^gpt25-bg-[a-z0-9-]+$/u);
  assert.ok(recipe.prompt.includes("No characters"));
  assert.ok(recipe.prompt.includes("no readable text"));
  assert.equal(recipe.promptSha256.length, 64);
}
console.log(`OK: ${recipes.length} unique GPT Image 2.5 background recipes`);
