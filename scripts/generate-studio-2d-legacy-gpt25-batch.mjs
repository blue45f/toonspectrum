#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const mapPath = path.join(ROOT, "scripts/data/studio-2d-legacy-gpt25-replacement-map-v1.json");
const atlasPath = path.join(ROOT, "scripts/data/studio-2d-background-atlas-v1.json");
const extraPath = path.join(ROOT, "scripts/data/studio-2d-legacy-gpt25-extra-recipes-v1.json");

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
const replacementMap = await json(mapPath);
const atlas = await json(atlasPath);
const extra = await json(extraPath);
const targetIds = replacementMap.replacements.map((item) => item.targetRecipeId);
if (targetIds.length !== 20 || new Set(targetIds).size !== 20) {
  throw new Error(`Expected 20 unique replacement targets, received ${targetIds.length}`);
}

const allRecipes = [...atlas.recipes, ...extra.recipes];
const recipesById = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
const recipes = targetIds.map((id) => {
  const recipe = recipesById.get(id);
  if (!recipe) throw new Error(`Missing GPT Image 2.5 recipe: ${id}`);
  return recipe;
});

const apiKey = process.env.TOONSTUDIO_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("TOONSTUDIO_IMAGE_API_KEY or OPENAI_API_KEY is required");
}
const tempDir = await mkdtemp(path.join(tmpdir(), "toonspectrum-gpt25-legacy-"));
const catalogPath = path.join(tempDir, "catalog.json");
await writeFile(catalogPath, `${JSON.stringify({ version: 1, model: "gpt-image-2.5-sunburst", quality: "max", recipes }, null, 2)}\n`);
try {
  await run(process.execPath, [
    "scripts/generate-studio-2d-background-atlas.mjs",
    "--execute",
    "--all",
    "--concurrency",
    process.env.TOONSTUDIO_IMAGE_CONCURRENCY || "2",
    "--catalog",
    catalogPath,
    "--ids",
    targetIds.join(","),
  ], { ...process.env, TOONSTUDIO_IMAGE_API_KEY: apiKey });

  for (const item of replacementMap.replacements) {
    const output = path.join(ROOT, item.targetOutputPath);
    await access(output);
    const bytes = await readFile(output);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error(`Generated file is not PNG: ${item.targetOutputPath}`);
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width !== 1152 || height !== 2048) {
      throw new Error(`Unexpected dimensions ${width}x${height}: ${item.targetOutputPath}`);
    }
  }
  console.log(`OK: generated and verified ${replacementMap.replacements.length} GPT Image 2.5 legacy replacements`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
