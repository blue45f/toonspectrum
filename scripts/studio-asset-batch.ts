import { spawnSync } from "node:child_process";

type RawArg = {
  value?: string;
  token: string;
};

type ScriptArgs = {
  generateOnly: boolean;
  uploadOnly: boolean;
  help: boolean;
  generateTokens: string[];
  uploadTokens: string[];
};

function splitArgs(args: string[]): ScriptArgs {
  const separatorIndex = args.indexOf("--");
  const generateOnly = args.includes("--generate-only");
  const uploadOnly = args.includes("--upload-only");
  const help = args.includes("--help");

  const generateTokens = (separatorIndex >= 0 ? args.slice(0, separatorIndex) : args)
    .filter((arg) => arg !== "--generate-only" && arg !== "--upload-only");

  const uploadTokens = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  return {
    generateOnly,
    uploadOnly,
    help,
    generateTokens,
    uploadTokens,
  };
}

function getOption(args: string[], keys: string[]): RawArg | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) continue;

    for (const key of keys) {
      if (token === key) {
        const next = args[index + 1];
        if (next == null || next.startsWith("--")) {
          throw new Error(`${key} requires a value`);
        }
        return { token: key, value: next };
      }
      if (token.startsWith(`${key}=`)) {
        const value = token.slice(key.length + 1);
        if (value.length === 0) {
          throw new Error(`${key} requires a value`);
        }
        return { token: key, value };
      }
    }
  }
  return undefined;
}

function hasOption(args: string[], key: string): boolean {
  return args.includes(key);
}

function run(command: string, args: string[], label: string): void {
  console.log(`\n실행: ${label}`);
  console.log(`  ${command} ${args.map((entry) => JSON.stringify(entry)).join(" ")}`);

  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with code ${result.status}`);
  }
}

function usage(): never {
  const lines = [
    "사용법",
    "  pnpm run studio:batch -- [generate-args] [-- upload-args]",
    "",
    "generate-args",
    "  --source-dir ./batch_source                 업로드용 자산 폴더",
    "  --output ./batch_generated/manifest.json     manifest 저장 경로",
    "  --default-category asset                    카테고리 미지정 시 기본값",
    "  --recursive                                 하위 폴더까지 재귀 스캔",
    "  --max-depth 3                               재귀 깊이 제한(0이면 현재만)",
    "  --include-images                            이미지 포함",
    "  --include-vrm                               vrm 포함",
    "  --include-background3d                      background3d 포함",
    "",
    "upload-args (선택: -- 뒤에 전달)",
    "  --session-token <jwt>                       인증 토큰",
    "  --session-cookie <cookie>                   인증 쿠키",
    "  --auto-demo-login                           데모 로그인 사용",
    "  --work-title \"toon batch\"                   새 작품 제목",
    "  --type auto|image|vrm|background3d",
    "  --max-items N",
    "  --filter-category character,background,prop",
    "  --dry-run",
    "  --skip-existing",
    "",
    "모드",
    "  --generate-only  manifest 생성만 수행",
    "  --upload-only    기존 manifest 업로드만 수행",
    "  --help           사용법 출력",
    "",
    "예시",
    "  pnpm run studio:batch -- --source-dir ./batch_source --output ./batch_generated/manifest.json -- --auto-demo-login --type auto --max-items 20 --work-title \"toon batch\"",
    "  pnpm run studio:batch -- --upload-only -- --manifest ./batch_generated/manifest.json --session-token xyz --type background3d",
  ];
  console.log(lines.join("\n"));
  process.exit(0);
}

function main(): void {
  const args = process.argv.slice(2);
  const { generateOnly, uploadOnly, help, generateTokens, uploadTokens } = splitArgs(args);
  if (help) {
    usage();
  }

  const defaultManifest = "batch_generated/manifest.json";
  const generateOutput = getOption(generateTokens, ["--output", "--manifest"])?.value ?? defaultManifest;
  const uploadManifest = getOption(uploadTokens, ["--manifest"])?.value;

  const manifestToUse = generateOutput;

  if (!uploadOnly) {
    run("pnpm", ["run", "studio:manifest:generate", "--", ...generateTokens, "--output", manifestToUse], "generate");
  }

  if (!generateOnly) {
    const finalUploadTokens = [...uploadTokens];
    if (!hasOption(finalUploadTokens, "--manifest")) {
      finalUploadTokens.push("--manifest", uploadManifest ?? manifestToUse);
    }
    run("pnpm", ["run", "studio:upload-assets", "--", ...finalUploadTokens], "upload");
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
