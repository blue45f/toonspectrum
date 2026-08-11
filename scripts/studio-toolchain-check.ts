import { spawnSync } from "node:child_process";
import path from "node:path";

const HELP = [
  "Usage:",
  "  pnpm run studio:toolchain:check -- [options]",
  "",
  "Options:",
  "  --help   이 도움말 출력",
  "",
  "설명:",
  "  studio:toolchain:check는 studio:toolchain:setup의 --check 모드로 실행되며,",
  "  설치가 필요한 상태에서 자동 실행을 막고 미리 상태를 점검합니다.",
  "",
  "동일 동작:",
  "  pnpm run studio:toolchain:setup -- --check",
].join("\n");

const args = process.argv.slice(2);
const setupScript = path.resolve(process.cwd(), "scripts", "studio-toolchain-setup.ts");

if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const forwarded = args.filter((entry, index) => !(index === 0 && entry === "--"));

const exec = (bin: string) =>
  spawnSync(bin, [setupScript, "--", "--check", ...forwarded], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

const command = process.platform === "win32" ? "tsx.cmd" : "tsx";
const result = exec(command);

if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
  const fallback = path.resolve(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const fallbackResult = spawnSync(fallback, ["scripts/studio-toolchain-setup.ts", "--", "--check", ...forwarded], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (fallbackResult.error) {
    throw fallbackResult.error;
  }
  if (fallbackResult.status !== 0) {
    process.exit(fallbackResult.status ?? 1);
  }
  process.exit(0);
}

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
