import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ReleasePlan = {
  sourceDir: string;
  manifest: string;
  defaultCategory: string;
  recursive: boolean;
  maxDepth?: number;
  includeImages: boolean;
  includeVrms: boolean;
  includeBackground3d: boolean;
  runDryRun: boolean;
  dryRunItems: number;
  skipGenerateManifest: boolean;
  skipUpload: boolean;
  skipToolchainCheck: boolean;
  autoDeploy: boolean;
  deployWorkflow: string;
  deployRef: string;
};

const FALLBACK_SOURCE_DIR = "./batch_source";
const FALLBACK_MANIFEST_PATH = "./batch_generated/manifest.json";
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseBooleanValue(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue == null) return fallback;
  const normalized = rawValue.toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumberValue(rawValue: string | undefined, fallback: number | undefined): number | undefined {
  if (rawValue == null) return fallback;
  const v = Number(rawValue);
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(`숫자 값이 잘못되었습니다: ${rawValue}`);
  }
  return v;
}

function getOption(args: string[], key: string, takeValue = true): string | undefined {
  const normalizedKey = key.startsWith("--") ? key : `--${key}`;
  const index = args.findIndex((entry) => entry === normalizedKey);
  if (index < 0) return undefined;
  if (!takeValue) return "true";
  const rawValue = args[index + 1];
  if (!rawValue || rawValue.startsWith("--")) {
    throw new Error(`${normalizedKey} requires a value`);
  }
  return rawValue;
}

function hasFlag(args: string[], key: string): boolean {
  return args.includes(key.startsWith("--") ? key : `--${key}`);
}

function parseReleaseArgs(): {
  plan: ReleasePlan;
  uploadArgs: string[];
} {
  let args = process.argv.slice(2);
  if (args[0] === "--") {
    args = args.slice(1);
  }
  const separatorIndex = args.indexOf("--");
  const releaseArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const uploadArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  if (hasFlag(releaseArgs, "--help")) {
    console.log([
      "사용법",
      "  pnpm run studio:asset:release -- [릴리스 생성 옵션] -- [업로드 옵션]",
      "",
      "릴리스 생성 옵션",
      "  --source-dir <path>               기본: ./batch_source",
      "  --manifest <path>                 기본: ./batch_generated/manifest.json",
      "  --default-category asset          기본 카테고리",
      "  --recursive / --no-recursive",
      "  --max-depth 0|1|2..",
      "  --include-images true|false       기본 true",
      "  --include-vrm true|false          기본 true",
      "  --include-background3d true|false 기본 true",
      "  --skip-dry-run                    dry-run 단계 건너뛰기",
      "  --dry-run-items N                 dry-run 업로드 최대 항목 (기본 20)",
      "  --skip-generate                   manifest 생성 건너뛰기",
      "  --skip-upload                     dry-run만 수행",
      "  --skip-toolchain-check            배포 전 체크 건너뛰기",
      "  --auto-deploy                     배포 워크플로우까지 dispatch",
      "  --deploy-workflow <name>          기본 deploy-vercel.yml",
      "  --deploy-ref <ref>                기본 main",
      "",
      "예시",
      "  pnpm run studio:asset:release -- --source-dir ./batch_source -- --auto-demo-login --type auto --work-title toon-batch",
      "  pnpm run studio:asset:release -- --source-dir ./batch_source --skip-dry-run -- --session-token xxx --work-title toon-batch --max-items 80",
      "  pnpm run studio:asset:release -- --auto-deploy -- --auto-demo-login --type auto --work-title toon-batch",
      "",
      "주의",
      "  릴리스 실행 옵션은 -- 이전에 넣고, 업로드 옵션은 -- 이후에 넣습니다.",
    ].join("\n"));
    process.exit(0);
  }

  const recursiveValue = getOption(releaseArgs, "--recursive", false);
  const noRecursive = hasFlag(releaseArgs, "--no-recursive");

  const plan: ReleasePlan = {
    sourceDir: getOption(releaseArgs, "--source-dir") ?? FALLBACK_SOURCE_DIR,
    manifest: getOption(releaseArgs, "--manifest") ?? FALLBACK_MANIFEST_PATH,
    defaultCategory: getOption(releaseArgs, "--default-category") ?? "asset",
    recursive: noRecursive ? false : parseBooleanValue(recursiveValue, true),
    maxDepth: parseNumberValue(getOption(releaseArgs, "--max-depth"), undefined),
    includeImages: parseBooleanValue(getOption(releaseArgs, "--include-images"), true),
    includeVrms: parseBooleanValue(getOption(releaseArgs, "--include-vrm"), true),
    includeBackground3d: parseBooleanValue(getOption(releaseArgs, "--include-background3d"), true),
    runDryRun: !hasFlag(releaseArgs, "--skip-dry-run"),
    dryRunItems: parseNumberValue(getOption(releaseArgs, "--dry-run-items"), 20) ?? 20,
    skipGenerateManifest: hasFlag(releaseArgs, "--skip-generate"),
    skipUpload: hasFlag(releaseArgs, "--skip-upload"),
    skipToolchainCheck: hasFlag(releaseArgs, "--skip-toolchain-check"),
    autoDeploy: hasFlag(releaseArgs, "--auto-deploy"),
    deployWorkflow: getOption(releaseArgs, "--deploy-workflow") ?? "deploy-vercel.yml",
    deployRef: getOption(releaseArgs, "--deploy-ref") ?? "main",
  };

  const knownReleaseFlags = new Set([
    "--help",
    "--source-dir",
    "--manifest",
    "--default-category",
    "--recursive",
    "--no-recursive",
    "--max-depth",
    "--include-images",
    "--include-vrm",
    "--include-background3d",
    "--skip-dry-run",
    "--dry-run-items",
    "--skip-generate",
    "--skip-upload",
    "--skip-toolchain-check",
    "--auto-deploy",
    "--deploy-workflow",
    "--deploy-ref",
  ]);

  for (let i = 0; i < releaseArgs.length; i += 1) {
    const arg = releaseArgs[i];
    if (!arg.startsWith("--")) continue;
    if (arg === "--recursive" || arg === "--no-recursive" || arg === "--skip-generate" || arg === "--skip-upload" || arg === "--skip-toolchain-check" || arg === "--skip-dry-run" || arg === "--auto-deploy" || arg === "--help") {
      continue;
    }
    if (!knownReleaseFlags.has(arg)) {
      throw new Error(`알 수 없는 릴리스 옵션: ${arg}`);
    }
    if ((arg.startsWith("--source") || arg.startsWith("--manifest") || arg.startsWith("--default-category") || arg.startsWith("--include") || arg.startsWith("--max-depth") || arg.startsWith("--dry-run-items") || arg.startsWith("--deploy-workflow") || arg.startsWith("--deploy-ref") || arg === "--recursive") && i + 1 < releaseArgs.length && !releaseArgs[i + 1]?.startsWith("--")) {
      i += 1;
    }
  }

  return { plan, uploadArgs };
}

function runCommand(command: string, args: string[], label: string): void {
  console.log(`\n[${label}] ${command} ${args.map((entry) => JSON.stringify(entry)).join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with code ${result.status}`);
  }
}

function runGitHubDeploy(workflow: string, ref: string): void {
  const ghVersion = spawnSync("gh", ["--version"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (ghVersion.status !== 0) {
    console.log("\nGitHub CLI가 없어 배포 dispatch를 실행할 수 없습니다.");
    console.log("수동 실행:");
    console.log(`gh workflow run ${workflow} -r ${ref}`);
    return;
  }
  runCommand("gh", ["workflow", "run", workflow, "-r", ref], "gh workflow run");
}

function hasFlagWithValue(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function appendFlag(args: string[], flag: string, value?: string): void {
  if (!hasFlagWithValue(args, flag)) {
    args.push(flag);
    if (value != null) args.push(value);
  }
}

function runAssetRelease(plan: ReleasePlan, uploadArgs: string[]): void {
  if (!plan.skipToolchainCheck) {
    runCommand("pnpm", ["run", "studio:toolchain:setup", "--", "--check"], "toolchain check");
  }

  const manifestPath = path.resolve(ROOT, plan.manifest);
  const sourceDirPath = path.resolve(ROOT, plan.sourceDir);
  const generateArgs = [
    "--source-dir", plan.sourceDir,
    "--output", plan.manifest,
    "--default-category", plan.defaultCategory,
    "--recursive", String(plan.recursive),
    "--include-images", String(plan.includeImages),
    "--include-vrm", String(plan.includeVrms),
    "--include-background3d", String(plan.includeBackground3d),
  ];
  if (plan.maxDepth != null) generateArgs.push("--max-depth", String(plan.maxDepth));

  if (!plan.skipGenerateManifest) {
    if (!existsSync(sourceDirPath)) {
      throw new Error(`source-dir가 존재하지 않습니다: ${plan.sourceDir}`);
    }
    runCommand("pnpm", ["run", "studio:manifest:generate", "--", ...generateArgs], "generate manifest");
  } else if (!existsSync(manifestPath)) {
    throw new Error(`manifest 파일이 없습니다: ${plan.manifest}. 먼저 generate 단계를 수행하세요.`);
  }

  if (plan.skipUpload) {
    console.log("\n--skip-upload가 설정되어 업로드를 건너뜁니다.");
    return;
  }

  const dryRunUploadArgs = [...uploadArgs];
  appendFlag(dryRunUploadArgs, "--manifest", plan.manifest);
  appendFlag(dryRunUploadArgs, "--dry-run");
  if (plan.dryRunItems > 0) appendFlag(dryRunUploadArgs, "--max-items", String(plan.dryRunItems));

  if (plan.runDryRun) {
    runCommand("pnpm", ["run", "studio:upload-assets", "--", ...dryRunUploadArgs], "upload (dry-run)");
  }

  const finalUploadArgs = [...uploadArgs];
  appendFlag(finalUploadArgs, "--manifest", plan.manifest);
  const shouldUpload = !hasFlag(finalUploadArgs, "--dry-run");
  if (shouldUpload) {
    runCommand("pnpm", ["run", "studio:upload-assets", "--", ...finalUploadArgs], "upload");
  }

  if (plan.autoDeploy) {
    runGitHubDeploy(plan.deployWorkflow, plan.deployRef);
  }
}

function main(): void {
  const { plan, uploadArgs } = parseReleaseArgs();
  runAssetRelease(plan, uploadArgs);
}

try {
  main();
} catch (error) {
  console.error("실행 실패:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
