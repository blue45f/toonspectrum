#!/usr/bin/env node
/**
 * ToonSpectrum Studio — GPT Image 2.5 background atlas generator.
 *
 * Secrets stay local. This script never writes the API key to logs, manifests, source files,
 * or the application server. It is intentionally BYOK-only and defaults to a dry run.
 *
 * Examples:
 *   node scripts/generate-studio-2d-background-atlas.mjs
 *   TOONSTUDIO_IMAGE_API_KEY=... node scripts/generate-studio-2d-background-atlas.mjs --execute --limit 8
 *   TOONSTUDIO_IMAGE_API_KEY=... node scripts/generate-studio-2d-background-atlas.mjs --execute --all --genre fantasy
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_CATALOG = "scripts/data/studio-2d-background-atlas-v1.json";
const DEFAULT_MANIFEST =
  "apps/web/src/domains/creator/studio-2d-generated-scene-manifest.json";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PATH = "/images/generations";
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const MAX_CONCURRENCY = 4;
const DEFAULT_SAFE_LIMIT = 8;

function parseArgs(argv) {
  const out = {
    execute: false,
    all: false,
    limit: DEFAULT_SAFE_LIMIT,
    concurrency: 1,
    resume: true,
    catalog: DEFAULT_CATALOG,
    manifest: DEFAULT_MANIFEST,
    genre: null,
    orientation: null,
    ids: null,
    baseUrl: process.env.TOONSTUDIO_IMAGE_API_BASE_URL || DEFAULT_BASE_URL,
    endpoint: process.env.TOONSTUDIO_IMAGE_GENERATION_PATH || DEFAULT_PATH,
    model: process.env.TOONSTUDIO_IMAGE_MODEL || DEFAULT_MODEL,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === "--execute") out.execute = true;
    else if (arg === "--all") out.all = true;
    else if (arg === "--no-resume") out.resume = false;
    else if (arg === "--limit") out.limit = Number(next());
    else if (arg === "--concurrency") out.concurrency = Number(next());
    else if (arg === "--catalog") out.catalog = next();
    else if (arg === "--manifest") out.manifest = next();
    else if (arg === "--genre") out.genre = next();
    else if (arg === "--orientation") out.orientation = next();
    else if (arg === "--ids") out.ids = new Set(next().split(",").map((v) => v.trim()).filter(Boolean));
    else if (arg === "--base-url") out.baseUrl = next();
    else if (arg === "--endpoint") out.endpoint = next();
    else if (arg === "--model") out.model = next();
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(out.limit) || out.limit < 1) throw new Error("--limit must be a positive integer");
  if (!Number.isInteger(out.concurrency) || out.concurrency < 1 || out.concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency must be 1..${MAX_CONCURRENCY}`);
  }
  return out;
}

function help() {
  console.log(`
ToonSpectrum Studio GPT Image 2.5 background atlas generator

Default mode is DRY RUN and prints the selected recipes without spending credits.

Options:
  --execute                 Perform provider requests (requires TOONSTUDIO_IMAGE_API_KEY)
  --all                     Generate every selected recipe; otherwise --limit defaults to ${DEFAULT_SAFE_LIMIT}
  --limit N                 Maximum recipes in this run
  --concurrency N           Parallel requests, 1..${MAX_CONCURRENCY}; default 1
  --genre NAME              daily|romance|fantasy|wuxia|sf|drama|action|horror
  --orientation NAME        landscape|portrait|square
  --ids ID1,ID2             Exact recipe IDs
  --no-resume               Regenerate files that already exist
  --catalog PATH            Recipe catalog path
  --manifest PATH           Installed manifest path
  --base-url URL            OpenAI-compatible API base URL
  --endpoint PATH           Image generations path
  --model MODEL             Default: ${DEFAULT_MODEL}
`);
}

function joinUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/u, "")}/${endpoint.replace(/^\/+/u, "")}`;
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function exists(file) {
  try { await access(file, fsConstants.F_OK); return true; } catch { return false; }
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parsePngDimensions(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Provider response is not a PNG");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function normalizeResponseImage(payload) {
  const item = payload?.data?.[0];
  if (typeof item?.b64_json === "string" && item.b64_json.length > 0) {
    return { kind: "base64", value: item.b64_json };
  }
  if (typeof item?.url === "string" && item.url.startsWith("https://")) {
    return { kind: "url", value: item.url };
  }
  throw new Error("Provider response has neither data[0].b64_json nor data[0].url");
}

async function requestImage({ apiKey, url, model, recipe, attempt = 0 }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: recipe.prompt,
      size: recipe.size,
      quality: recipe.quality || "max",
      n: 1,
    }),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 800);
    let providerErrorType = "";
    let providerErrorCode = "";
    try {
      const providerError = JSON.parse(body)?.error;
      providerErrorType = typeof providerError?.type === "string" ? providerError.type : "";
      providerErrorCode = typeof providerError?.code === "string" ? providerError.code : "";
    } catch {
      // Keep malformed provider errors non-special; status handling below still applies.
    }
    const quotaExhausted = providerErrorType === "insufficient_quota"
      || providerErrorCode === "credit_balance_exhausted";
    const retryable = !quotaExhausted && (response.status === 429 || response.status >= 500);
    if (retryable && attempt < 5) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : Math.min(30_000, 1_000 * 2 ** attempt + Math.floor(Math.random() * 500));
      await sleep(backoff);
      return requestImage({ apiKey, url, model, recipe, attempt: attempt + 1 });
    }
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
  const payload = await response.json();
  const image = normalizeResponseImage(payload);
  if (image.kind === "base64") return Buffer.from(image.value, "base64");
  const imageResponse = await fetch(image.value);
  if (!imageResponse.ok) throw new Error(`Image URL returned HTTP ${imageResponse.status}`);
  return Buffer.from(await imageResponse.arrayBuffer());
}

function manifestAsset(recipe, bytes, dimensions, model) {
  const src = `/${recipe.outputPath.replace(/^apps\/web\/public\//u, "")}`;
  return {
    id: recipe.id,
    label: recipe.label,
    title: recipe.title,
    genre: recipe.genre,
    src,
    width: dimensions.width,
    height: dimensions.height,
    bytes: bytes.length,
    sha256: sha256(bytes),
    tags: recipe.tags,
    environment: recipe.environment,
    timeOfDay: recipe.timeOfDay === "새벽" ? "낮" : recipe.timeOfDay,
    containsPeople: false,
    containsText: false,
    recommended: false,
    review: {
      method: "contact-sheet",
      status: "small-panel-only",
      reviewedAt: new Date().toISOString().slice(0, 10),
      notes: [
        "자동 생성 직후 상태입니다. 전체 프레임 확대 검수 후 recommended와 review 상태를 승격하세요.",
      ],
    },
    provenance: {
      kind: "gpt-image-2.5",
      licenseStatus: "first-party-generated",
      provider: "OpenAI-compatible BYOK",
      model,
      promptHash: recipe.promptSha256,
      recipeId: recipe.id,
      generatedAt: new Date().toISOString(),
    },
    mediaType: "image/png",
    style: "webtoon-illustration",
    legacySrc: null,
    sourceManifest: `/${recipe.sourcePath.replace(/^apps\/web\/public\//u, "")}`,
  };
}

async function writeSource(recipe, imageAsset, model) {
  const sourcePath = path.resolve(ROOT, recipe.sourcePath);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  const source = {
    version: 1,
    id: recipe.id,
    model,
    quality: recipe.quality,
    size: recipe.size,
    promptSha256: recipe.promptSha256,
    prompt: recipe.prompt,
    negativePrompt: recipe.negativePrompt,
    generatedAt: imageAsset.provenance.generatedAt,
    outputSha256: imageAsset.sha256,
    outputBytes: imageAsset.bytes,
    reviewRequired: true,
    operatorFunded: false,
  };
  await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, "utf8");
}

async function readManifest(file) {
  if (!(await exists(file))) {
    return {
      version: 1,
      description: "GPT Image 2.5 generated Studio backgrounds.",
      model: DEFAULT_MODEL,
      assets: [],
    };
  }
  return JSON.parse(await readFile(file, "utf8"));
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();

  const catalogPath = path.resolve(ROOT, args.catalog);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  let selected = catalog.recipes.filter((recipe) =>
    (!args.genre || recipe.genre === args.genre)
    && (!args.orientation || recipe.orientation === args.orientation)
    && (!args.ids || args.ids.has(recipe.id))
  );
  if (!args.all) selected = selected.slice(0, args.limit);

  console.log(JSON.stringify({
    mode: args.execute ? "execute" : "dry-run",
    model: args.model,
    selected: selected.length,
    totalCatalog: catalog.recipes.length,
    genres: [...new Set(selected.map((recipe) => recipe.genre))],
    sizes: [...new Set(selected.map((recipe) => recipe.size))],
    concurrency: args.concurrency,
  }, null, 2));

  if (!args.execute) {
    for (const recipe of selected) {
      console.log(`${recipe.id}\t${recipe.size}\t${recipe.label}`);
    }
    console.log("\nDry run only. Add --execute and set TOONSTUDIO_IMAGE_API_KEY to generate.");
    return;
  }

  const apiKey = process.env.TOONSTUDIO_IMAGE_API_KEY?.trim();
  if (!apiKey) throw new Error("TOONSTUDIO_IMAGE_API_KEY is required with --execute");
  const requestUrl = joinUrl(args.baseUrl, args.endpoint);
  const manifestPath = path.resolve(ROOT, args.manifest);
  const manifest = await readManifest(manifestPath);
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const failures = [];
  let generatedThisRun = 0;

  await runPool(selected, args.concurrency, async (recipe, index) => {
    const outputPath = path.resolve(ROOT, recipe.outputPath);
    if (args.resume && await exists(outputPath) && byId.has(recipe.id)) {
      console.log(`[${index + 1}/${selected.length}] skip ${recipe.id}`);
      return;
    }
    try {
      console.log(`[${index + 1}/${selected.length}] generate ${recipe.id}`);
      const bytes = await requestImage({
        apiKey,
        url: requestUrl,
        model: args.model,
        recipe,
      });
      const dimensions = parsePngDimensions(bytes);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      const asset = manifestAsset(recipe, bytes, dimensions, args.model);
      await writeSource(recipe, asset, args.model);
      byId.set(recipe.id, asset);
      generatedThisRun += 1;
      console.log(`[${index + 1}/${selected.length}] done ${recipe.id} ${dimensions.width}x${dimensions.height}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: recipe.id, error: message });
      console.error(`[${index + 1}/${selected.length}] failed ${recipe.id}: ${message}`);
    }
  });

  const assets = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const nextManifest = {
    version: 1,
    description: "GPT Image 2.5 BYOK generated Studio backgrounds. Items remain unfeatured until full-frame review.",
    model: args.model,
    updatedAt: new Date().toISOString(),
    assets,
  };
  if (generatedThisRun > 0) {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify({
    generatedThisRun,
    installedTotal: assets.length,
    failed: failures.length,
    manifest: path.relative(ROOT, manifestPath),
    failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
