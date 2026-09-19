#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("validates the complete studio 2d legacy gpt25 replacements contract", async () => {

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
  assert.ok(rows.every((row) => row.status === "generated-reviewed-integrated"));
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
    const output = await readFile(new URL(`../${row.targetOutputPath}`, import.meta.url));
    assert.equal(output.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(output.readUInt32BE(16), 1152);
    assert.equal(output.readUInt32BE(20), 2048);
    assert.equal(row.outputBytes, output.byteLength);
    assert.equal(row.outputSha256, createHash("sha256").update(output).digest("hex"));
    for (const extension of ["jpg", "png"]) {
      const legacyPath = row.legacySrc.replace(/\.jpg$/u, `.${extension}`);
      await assert.rejects(
        readFile(new URL(`../apps/web/public${legacyPath}`, import.meta.url)),
        (error) => Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT"),
        `${row.legacyId}: superseded ${extension} binary must stay deleted`,
      );
    }
  }

  assert.doesNotMatch(generatorSource, /response_format/u);
  assert.match(generatorSource, /providerErrorType === "insufficient_quota"/u);
  assert.match(generatorSource, /providerErrorCode === "credit_balance_exhausted"/u);

  console.log(`OK: ${rows.length} legacy backgrounds have GPT Image 2.5 replacement recipes`);
});
