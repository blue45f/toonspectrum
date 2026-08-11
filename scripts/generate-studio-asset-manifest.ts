import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type RawArgInput = Record<string, string | undefined>;

type GenerateOptions = {
  sourceDir: string;
  outputPath: string;
  defaultCategory: string;
  recursive: boolean;
  maxDepth: number;
  includeImages: boolean;
  includeVrms: boolean;
  includeBackground3d: boolean;
};

type ManifestEntry = {
  name: string;
  path: string;
  category: string;
  subtype?: string;
  seed: number;
};

type ScanItem = {
  relativePath: string;
  ext: string;
  statName: string;
};

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
const VRM_EXTS = new Set([".vrm"]);
const BACKGROUND3D_EXTS = new Set([".glb", ".gltf", ".obj", ".fbx", ".dae", ".stl", ".ply", ".3ds"]);

const CATEGORY_ALIASES = new Map<string, string>([
  ["character", "character"],
  ["characters", "character"],
  ["chara", "character"],
  ["background", "background"],
  ["backgrounds", "background"],
  ["bg", "background"],
  ["prop", "prop"],
  ["props", "prop"],
  ["environment", "background"],
  ["env", "background"],
  ["scene", "background3d"],
  ["assets", "asset"],
  ["asset", "asset"],
  ["assets_3d", "background3d"],
]);

function parseArgs(): RawArgInput {
  const args = process.argv.slice(2);
  const output: RawArgInput = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage(0);
    }
    const [key, value] = arg.split("=", 2);
    if (value !== undefined) {
      output[key.replace(/^--/, "")] = value;
      continue;
    }
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      output[key.replace(/^--/, "")] = "true";
      continue;
    }
    output[key.replace(/^--/, "")] = next;
    i += 1;
  }
  return output;
}

function usage(exitCode = 1): never {
  const text = [
    "사용법",
    "  pnpm run studio:manifest:generate -- [옵션]",
    "",
    "옵션",
    "  --source-dir ./assets       스캔할 에셋 폴더 (기본: ./batch_source)",
    "  --output ./batch_generated/manifest.json  생성할 manifest 경로",
    "  --default-category asset    경로에서 카테고리를 추론 못했을 때 쓰는 기본 값",
    "  --recursive                 하위 폴더까지 재귀 스캔 (기본 true)",
    "  --max-depth 3               재귀 제한(0이면 현재 폴더만, 미지정이면 무제한)",
    "  --include-images            이미지 파일도 포함 (기본 true)",
    "  --include-vrm               .vrm 파일을 캐릭터 계열로 우선 분류 (기본 true)",
    "  --include-background3d      glb/gltf/obj/fbx/dae/stl/ply/3ds 포함 (기본 true)",
    "  --help                      도움말",
    "",
    "예시",
    "  pnpm run studio:manifest:generate -- --source-dir ./toon-assets --output ./batch_generated/manifest.json",
    "  pnpm run studio:manifest:generate -- --source-dir ./toon-assets/character --default-category character --max-depth 2",
  ].join("\n");
  console.log(text);
  process.exit(exitCode);
}

function parseBoolean(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue == null) return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNonNegativeInteger(rawValue: string | undefined, fallback: number): number {
  if (rawValue == null) return fallback;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`max-depth는 0 이상의 정수여야 합니다: ${rawValue}`);
  }
  return parsed;
}

function buildOptions(args: RawArgInput): GenerateOptions {
  const sourceDir = args["source-dir"] ?? "./batch_source";
  const outputPath = args.output ?? args["manifest"] ?? "batch_generated/manifest.json";
  const defaultCategory = (args["default-category"] ?? "asset").trim() || "asset";
  const recursive = parseBoolean(args.recursive, true);
  const maxDepthRaw = args["max-depth"];
  const includeImages = parseBoolean(args["include-images"], true);
  const includeVrms = parseBoolean(args["include-vrm"], true);
  const includeBackground3d = parseBoolean(args["include-background3d"], true);

  const maxDepth = maxDepthRaw == null ? Number.POSITIVE_INFINITY : parseNonNegativeInteger(maxDepthRaw, 0);
  if (!existsSync(sourceDir)) {
    throw new Error(`source-dir가 존재하지 않습니다: ${sourceDir}`);
  }
  if (maxDepthRaw === "") {
    throw new Error("--max-depth requires a numeric value");
  }
  if (!sourceDir) {
    throw new Error("--source-dir is required");
  }
  return {
    sourceDir,
    outputPath,
    defaultCategory,
    recursive,
    maxDepth,
    includeImages,
    includeVrms,
    includeBackground3d,
  };
}

function inferCategory(filePath: string, defaultCategory: string): string {
  const pieces = filePath.split("/").filter(Boolean);
  if (pieces.length >= 2) {
    const parent = pieces.at(-2)?.toLowerCase() ?? "";
    const alias = CATEGORY_ALIASES.get(parent);
    if (alias != null) return alias;
  }
  const head = pieces.at(0)?.toLowerCase();
  if (head && CATEGORY_ALIASES.has(head)) {
    const alias = CATEGORY_ALIASES.get(head);
    if (alias != null) return alias;
  }
  return defaultCategory;
}

function determineSubtype(ext: string): "image" | "vrm" | "background3d" {
  const lower = ext.toLowerCase();
  if (IMAGE_EXTS.has(lower)) return "image";
  if (VRM_EXTS.has(lower)) return "vrm";
  if (BACKGROUND3D_EXTS.has(lower)) return "background3d";
  return "image";
}

function looksLikeSupportedAsset(filePath: string, options: GenerateOptions): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (options.includeImages && IMAGE_EXTS.has(ext)) return true;
  if (options.includeVrms && VRM_EXTS.has(ext)) return true;
  if (options.includeBackground3d && BACKGROUND3D_EXTS.has(ext)) return true;
  return false;
}

function stableSeed(filePath: string, index: number): number {
  const base = `${filePath}::${index}`;
  return Number.parseInt(createHash("sha256").update(base).digest("hex").slice(0, 8), 16);
}

async function collectEntries(
  currentDir: string,
  sourceRoot: string,
  options: GenerateOptions,
  depth = 0,
  out: ScanItem[] = [],
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<ScanItem[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(sourceRoot, absolutePath).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (!options.recursive) continue;
      if (Number.isFinite(maxDepth) && depth >= maxDepth) continue;
      await collectEntries(absolutePath, sourceRoot, options, depth + 1, out, maxDepth);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!looksLikeSupportedAsset(relativePath, options)) continue;
    out.push({ relativePath, ext: path.extname(entry.name), statName: entry.name });
  }
  return out;
}

function writeOutput(outputPath: string, manifest: ManifestEntry[]): Promise<void> {
  return mkdir(path.dirname(outputPath), { recursive: true })
    .then(() => writeFile(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"));
}

async function validateOutput(outputPath: string): Promise<void> {
  try {
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("manifest 형식이 배열이 아닙니다.");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`생성된 manifest가 올바르지 않습니다: ${message}`, { cause: error });
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args["help"] === "true") usage(0);

  const options = buildOptions(args);
  const sourceAbs = path.resolve(options.sourceDir);
  const outputAbs = path.resolve(options.outputPath);

  const scan = await collectEntries(
    sourceAbs,
    sourceAbs,
    options,
    0,
    [],
    options.maxDepth,
  );
  const manifest: ManifestEntry[] = scan
    .map((item, index) => ({
      name: path.parse(item.statName).name.replace(/[-_]+/g, " "),
      path: item.relativePath.split(path.sep).join("/"),
      category: inferCategory(item.relativePath, options.defaultCategory),
      subtype: determineSubtype(item.ext),
      seed: stableSeed(item.relativePath, index),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (manifest.length === 0) {
    throw new Error(`지원되는 에셋이 없습니다: ${sourceAbs}`);
  }

  await writeOutput(outputAbs, manifest);
  await validateOutput(outputAbs);
  const counts = manifest.reduce((acc, entry) => {
    acc[entry.subtype as "image" | "vrm" | "background3d"] = (acc[entry.subtype as "image" | "vrm" | "background3d"] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`manifest 생성 완료: ${outputAbs}`);
  console.log(`총 ${manifest.length}개 항목`);
  console.log(`카테고리: ${Object.keys(counts).sort().join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
