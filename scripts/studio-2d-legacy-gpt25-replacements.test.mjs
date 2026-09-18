#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const [base, extra, replacements, generatorSource] = await Promise.all([
  readJson("./data/studio-2d-background-atlas-v1.json"),
  readJson("./data/studio-2d-legacy-gpt25-extra-recipes-v1.json"),
  readJson("./data/studio-2d-legacy-gpt25-replacement-map-v1.json"),
  readFile(new URL("./generate-studio-2d-background-atlas.mjs", import.meta.url), "utf8"),
]);

const recipes = [...base.recipes, ...extra.recipes];
const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const rows = replacements.replacements;
assert.equal(rows.length, 20);
assert.equal(new Set(rows.map((row) => row.legacyId)).size, 20);
assert.ok(rows.every((row) => row.status === "ready-for-gpt25-generation"));
for (const row of rows) {
  const recipe = byId.get(row.targetRecipeId);
  assert.ok(recipe, row.targetRecipeId);
  assert.equal(recipe.model, "gpt-image-2.5-sunburst");
  assert.equal(recipe.quality, "max");
  assert.equal(recipe.orientation, "portrait");
  assert.equal(recipe.size, row.targetSize);
  assert.equal(recipe.outputPath, row.targetOutputPath);
  assert.ok(recipe.prompt.includes("No characters"));
  assert.ok(recipe.prompt.includes("no readable text"));
}

assert.doesNotMatch(generatorSource, /response_format/u);
assert.match(generatorSource, /providerErrorType === "insufficient_quota"/u);
assert.match(generatorSource, /providerErrorCode === "credit_balance_exhausted"/u);

console.log(`OK: ${rows.length} legacy backgrounds have GPT Image 2.5 replacement recipes`);
