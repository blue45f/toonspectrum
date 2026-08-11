import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type CheckStatus = "PASS" | "WARN" | "FAIL";

type CheckResult = {
  name: string;
  status: CheckStatus;
  message: string;
  hint?: string;
};

type SetupPlan = {
  mode: "check" | "install";
  installBlender: boolean;
  installVrmAddon: boolean;
  installMcpBridge: boolean;
  vrmAddonSource?: string;
  mcpPackage?: string;
  mcpCommand?: string;
  writeEnv?: string;
};

const ANSI = {
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  gray: "\u001b[90m",
  reset: "\u001b[0m",
};

const ROOT = path.resolve(process.cwd());

const REQUIRED_FLAGS = new Set([
  "--help",
  "--check",
  "--install",
  "--install-blender",
  "--install-vrm-addon",
  "--vrm-addon-source",
  "--install-mcp-bridge",
  "--mcp-package",
  "--mcp-command",
  "--write-env",
]);

function hasFlag(args: string[], key: string): boolean {
  return args.includes(key.startsWith("--") ? key : `--${key}`);
}

function getOption(args: string[], key: string): string | undefined {
  const index = args.indexOf(key.startsWith("--") ? key : `--${key}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new Error(`${key} requires a value`);
  }
  return value;
}

type CommandResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[], options: { timeoutMs?: number } = {}): CommandResult {
  const proc = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: options.timeoutMs,
  });
  if (proc.error) {
    return {
      ok: false,
      status: 1,
      stdout: "",
      stderr: proc.error.message,
    };
  }
  return {
    ok: proc.status === 0,
    status: proc.status ?? 1,
    stdout: String(proc.stdout ?? "").trim(),
    stderr: String(proc.stderr ?? "").trim(),
  };
}

function pickFirstCommand(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const target = candidate.trim();
    if (!target) continue;
    const available = spawnSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [target] : ["-v", target], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    if (available.status === 0) {
      const line = (String(available.stdout ?? "").split("\n")[0] ?? "").trim();
      if (process.platform === "win32") {
        return line.split("\r")[0] || target;
      }
      return target;
    }
  }
  return undefined;
}

function commandVersion(cmd: string, args: string[] = ["--version"], timeoutMs = 8_000): string | undefined {
  const r = runCommand(cmd, args, { timeoutMs });
  if (!r.ok || !r.stdout) return undefined;
  return r.stdout.split("\n")[0]?.trim();
}

function formatLine(item: CheckResult): string {
  const color = item.status === "PASS" ? ANSI.green : item.status === "WARN" ? ANSI.yellow : ANSI.red;
  const symbol = item.status === "PASS" ? "PASS" : item.status === "WARN" ? "WARN" : "FAIL";
  const line = `${color}${symbol}${ANSI.reset} ${item.name}: ${item.message}`;
  return item.hint ? `${line}\n  힌트: ${ANSI.gray}${item.hint}${ANSI.reset}` : line;
}

function checkNode(): CheckResult {
  const versionLine = process.version;
  const versionMatch = /(\d+)\./.exec(versionLine);
  const major = versionMatch ? Number.parseInt(versionMatch[1], 10) : NaN;
  if (Number.isFinite(major) && major >= 24) {
    return {
      name: "Node",
      status: "PASS",
      message: `${versionLine} (>=24 required)`,
    };
  }
  return {
    name: "Node",
    status: "FAIL",
    message: `${versionLine} (>=24 required)`,
    hint: "Node.js 24+ 업그레이드 후 실행하세요. (예: nvm/mise/volta)",
  };
};

function checkPnpm(): CheckResult {
  const cmd = pickFirstCommand(["pnpm"]);
  if (!cmd) {
    return {
      name: "pnpm",
      status: "FAIL",
      message: "미설치",
      hint: "npm install -g pnpm@latest 또는 corepack 활성화 후 pnpm 사용",
    };
  }
  const version = commandVersion(cmd, ["-v"]);
  return {
    name: "pnpm",
    status: version ? "PASS" : "WARN",
    message: version ?? "버전 확인 불가",
  };
}

function resolveBlenderCommand(): string | undefined {
  const explicit = process.env.BLENDER_PATH || process.env.BLENDER_BIN;
  return pickFirstCommand(explicit ? [explicit, "blender", "blender.exe"] : ["blender", "blender.exe"]);
}

function checkBlender(): CheckResult {
  const command = resolveBlenderCommand();
  if (!command) {
    return {
      name: "Blender",
      status: "WARN",
      message: "미설치/미탐지",
      hint:
        "운영에서 자동 설치를 허용하지 않는 경우 사전에 설치하세요.\n" +
        "- macOS: brew install --cask blender\n" +
        "- Windows: winget install -e --id BlenderFoundation.Blender\n" +
        "- Ubuntu: sudo snap install blender --classic",
    };
  }
  const version = commandVersion(command, ["--version"]);
  return {
    name: "Blender",
    status: version ? "PASS" : "WARN",
    message: version ?? `명령 탐지됨: ${command}`,
  };
}

function checkMcpBridge(): CheckResult {
  const explicit = process.env.STUDIO_MCP_BRIDGE_PATH;
  if (explicit) {
    return {
      name: "Blender MCP",
      status: "PASS",
      message: explicit,
    };
  }
  const command = process.env.STUDIO_MCP_BRIDGE_COMMAND || process.env.STUDIO_MCP_BRIDGE_PATH;
  if (!command) {
    return {
      name: "Blender MCP",
      status: "WARN",
      message: "미등록",
      hint: "STUDIO_MCP_BRIDGE_PATH 또는 STUDIO_MCP_BRIDGE_COMMAND로 브릿지 경로/명령을 등록하세요.",
    };
  }
  const detected = pickFirstCommand([command]);
  const version = detected ? commandVersion(detected, ["--version"]) : undefined;
  return {
    name: "Blender MCP",
    status: detected ? (version ? "PASS" : "WARN") : "WARN",
    message: detected ? `${detected}${version ? ` (${version})` : ""}` : "미설치/미탐지",
    hint: detected ? undefined : "MCP 브릿지 바이너리 경로를 확인하세요.",
  };
}

function checkVrmAddonHint(): CheckResult {
  const hint = process.env.STUDIO_VRM_ADDON_HINT || process.env.VRM_ADDON_PATH || process.env.STUDIO_VRM_ADDON_SOURCE;
  if (!hint) {
    return {
      name: "VRM Add-on(권장)",
      status: "WARN",
      message: "미확인",
      hint: "설치된 VRM 플러그인 경로를 STUDIO_VRM_ADDON_HINT(또는 VRM_ADDON_PATH)로 설정하면 탐지 정확도가 올라갑니다.",
    };
  }
  return {
    name: "VRM Add-on(권장)",
    status: "PASS",
    message: hint,
  };
}

function checkWorkingFolders(): CheckResult {
  const p = path.join(ROOT, "batch_source");
  if (existsSync(p)) {
    return { name: "batch_source", status: "PASS", message: p };
  }
  return {
    name: "batch_source",
    status: "WARN",
    message: "없음(최초 실행 시 생성 필요)",
  };
}

function collectChecks(): CheckResult[] {
  return [
    checkNode(),
    checkPnpm(),
    checkBlender(),
    checkMcpBridge(),
    checkVrmAddonHint(),
    checkWorkingFolders(),
  ];
}

function runChecks(label = "toolchain check"): boolean {
  console.log(`\n[${label}]`);
  const items = collectChecks();
  for (const item of items) {
    console.log(formatLine(item));
  }
  const failed = items.some((item) => item.status === "FAIL");
  if (failed) {
    console.log("\n필수 항목이 누락되어 실행을 차단합니다.");
  } else if (items.some((item) => item.status === "WARN")) {
    console.log("\nWARN 항목은 권장 점검사항입니다.");
  }
  return failed;
}

function installViaCommands(commands: string[][]): boolean {
  for (const cmdArgs of commands) {
    if (cmdArgs.length === 0) continue;
    const [cmd, ...rest] = cmdArgs;
    const hasCmd = pickFirstCommand([cmd]) != null;
    if (!hasCmd) {
      continue;
    }
    const result = runCommand(cmd, rest);
    if (result.ok) return true;
  }
  return false;
}

function installBlender(): boolean {
  const platform = process.platform;
  if (platform === "darwin") {
    return installViaCommands([
      ["brew", "install", "--cask", "blender"],
    ]);
  }
  if (platform === "win32") {
    if (pickFirstCommand(["winget"])) {
      return installViaCommands([
        ["winget", "install", "-e", "--id", "BlenderFoundation.Blender", "--accept-package-agreements", "--accept-source-agreements"],
      ]);
    }
    if (pickFirstCommand(["choco"])) {
      return installViaCommands([
        ["choco", "install", "blender", "-y"],
      ]);
    }
    return false;
  }
  return installViaCommands([
    ["sudo", "snap", "install", "blender", "--classic"],
    ["sudo", "apt-get", "update"],
    ["sudo", "apt-get", "install", "-y", "blender"],
  ]);
}

function defaultBlenderAddonDir(): string {
  const home = os.homedir();
  const version = process.env.BLENDER_VERSION || "4.0";
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Blender", version, "scripts", "addons");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || home;
    return path.join(appData, "Blender Foundation", "Blender", version, "scripts", "addons");
  }
  return path.join(home, ".config", "blender", version, "scripts", "addons");
}

function downloadFileFromUrl(url: string, destination: string): boolean {
  if (pickFirstCommand(["curl"])) {
    const result = runCommand("curl", ["-fsSL", "-o", destination, url], { timeoutMs: 60_000 });
    return result.ok;
  }
  if (process.platform === "win32" && pickFirstCommand(["powershell"])) {
    const script = `Invoke-WebRequest -Uri '${url}' -OutFile '${destination.replace(/'/g, "''")}'`;
    const result = runCommand("powershell", ["-NoProfile", "-Command", script], { timeoutMs: 60_000 });
    return result.ok;
  }
  if (pickFirstCommand(["wget"])) {
    const result = runCommand("wget", ["-qO", destination, url], { timeoutMs: 60_000 });
    return result.ok;
  }
  return false;
}

function extractZip(filePath: string, targetDir: string): boolean {
  const zipDir = path.join(targetDir, path.basename(filePath, path.extname(filePath)));
  mkdirSync(targetDir, { recursive: true });
  if (pickFirstCommand(["unzip"])) {
    return runCommand("unzip", ["-q", filePath, "-d", zipDir]).ok;
  }
  if (process.platform === "win32" && pickFirstCommand(["powershell"])) {
    const script = `Expand-Archive -Path '${filePath.replace(/'/g, "''")}' -DestinationPath '${zipDir.replace(/'/g, "''")}' -Force`;
    return runCommand("powershell", ["-NoProfile", "-Command", script]).ok;
  }
  return false;
}

function copyDir(srcDir: string, targetDir: string): void {
  mkdirSync(path.dirname(targetDir), { recursive: true });
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  cpSync(srcDir, targetDir, { recursive: true });
}

function installVrmAddon(rawSource?: string): boolean {
  const source = rawSource || process.env.STUDIO_VRM_ADDON_SOURCE || process.env.STUDIO_VRM_ADDON_HINT || process.env.VRM_ADDON_PATH;
  if (!source) return false;

  const addonDir = defaultBlenderAddonDir();
  const sourceLower = source.toLowerCase();
  const temp = mkdtempSync(path.join(os.tmpdir(), "studio-vrm-addon-"));
  let workingSource = source;

  try {
    if (sourceLower.startsWith("http://") || sourceLower.startsWith("https://")) {
      const out = path.join(temp, path.basename(source).split("?")[0] || "vrm-addon");
      if (!downloadFileFromUrl(source, out)) return false;
      workingSource = out;
    }

    if (!existsSync(workingSource)) return false;

    const sourceStat = statSync(workingSource);
    const normalizedDest = sourceLower.endsWith(".zip")
      ? addonDir
      : path.join(addonDir, sourceLower.endsWith(".py") ? path.basename(workingSource) : path.basename(workingSource));
    mkdirSync(addonDir, { recursive: true });

    if (sourceStat.isDirectory()) {
      const targetDir = sourceLower.endsWith(".zip")
        ? path.join(addonDir, path.basename(workingSource))
        : normalizedDest;
      copyDir(workingSource, targetDir);
      return true;
    }

    if (sourceLower.endsWith(".zip")) {
      if (!extractZip(workingSource, addonDir)) return false;
      return true;
    }

    if (sourceLower.endsWith(".py")) {
      const target = path.join(addonDir, path.basename(workingSource));
      cpSync(workingSource, target, { force: true });
      return true;
    }

    const target = path.join(addonDir, path.basename(workingSource));
    cpSync(workingSource, target, { force: true });
    return true;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function installMcpBridge(plan: SetupPlan): boolean {
  if (!plan.installMcpBridge) return true;

  const command = plan.mcpCommand || process.env.STUDIO_MCP_BRIDGE_COMMAND || "blender-mcp";
  if (pickFirstCommand([command])) {
    return true;
  }

  const pkg = plan.mcpPackage;
  if (!pkg) {
    return false;
  }

  if (pickFirstCommand(["pnpm"])) {
    const pnpmResult = runCommand("pnpm", ["add", "-g", pkg]);
    if (pnpmResult.ok) return true;
  }
  if (pickFirstCommand(["npm"])) {
    const npmResult = runCommand("npm", ["install", "-g", pkg]);
    if (npmResult.ok) return true;
  }
  return false;
}

function runInstall(plan: SetupPlan): SetupPlan {
  if (plan.installBlender) {
    const currentBlender = resolveBlenderCommand();
    if (currentBlender) {
      console.log("\n[install] Blender는 이미 탐지되어 생략합니다.");
    } else if (!installBlender()) {
      console.log("\n[install] Blender 설치를 완료하지 못했습니다.");
    }
  }

  if (plan.installVrmAddon) {
    if (!installVrmAddon(plan.vrmAddonSource)) {
      console.log("\n[install] VRM Add-on 설치가 완료되지 않았습니다. 소스 경로/URL, 권한, 압축 도구를 확인하세요.");
    }
  }

  if (plan.installMcpBridge) {
    if (!installMcpBridge(plan)) {
      console.log("\n[install] MCP 브릿지 설치가 완료되지 않았습니다. 패키지/명령/권한을 확인하세요.");
    }
  }

  return plan;
}

function readEnvPath(pathValue?: string): string {
  if (!pathValue) return "";
  if (path.isAbsolute(pathValue)) return pathValue;
  return path.join(ROOT, pathValue);
}

function writeEnvIfNeeded(plan: SetupPlan): void {
  if (!plan.writeEnv) return;

  const targetPath = readEnvPath(plan.writeEnv);
  const blenderPath = process.env.BLENDER_PATH || process.env.BLENDER_BIN || resolveBlenderCommand() || "";
  const mcpBridge = process.env.STUDIO_MCP_BRIDGE_PATH || process.env.STUDIO_MCP_BRIDGE_COMMAND || plan.mcpCommand || "";
  const vrmAddon = process.env.STUDIO_VRM_ADDON_HINT || process.env.VRM_ADDON_PATH || plan.vrmAddonSource || "";

  const next = `# Generated by studio:toolchain:setup\n`
    + `BLENDER_PATH=${blenderPath}\n`
    + `STUDIO_MCP_BRIDGE_COMMAND=${mcpBridge}\n`
    + `STUDIO_VRM_ADDON_HINT=${vrmAddon}\n`;
  writeFileSync(targetPath, next, "utf8");
}

function parseArgs(argv: string[]): SetupPlan {
  let args = argv.slice(2);
  if (args[0] === "--") args = args.slice(1);

  if (hasFlag(args, "--help")) {
    console.log([
      "Usage:",
      "  pnpm run studio:toolchain:setup -- [--check] [--install ...]",
      "",
      "Options:",
      "  --check                          설치/환경 점검만 수행(기본값)",
      "  --install                        설치 모드(지정 옵션에 따라 Blender/VRM Add-on/MCP 시도)",
      "  --install-blender                Blender 설치 시도",
      "  --install-vrm-addon              VRM Add-on 설치 시도",
      "  --vrm-addon-source <path|url>    VRM Add-on 소스",
      "  --install-mcp-bridge             MCP 브릿지 설치 시도",
      "  --mcp-package <name>             MCP 패키지명(예: blender-mcp)",
      "  --mcp-command <command>          MCP 명령(예: blender-mcp)",
      "  --write-env <path>               BLENDER_PATH/STUDIO_MCP_BRIDGE_COMMAND/STUDIO_VRM_ADDON_HINT를 파일에 저장",
      "",
      "예시:",
      "  pnpm run studio:toolchain:setup -- --check",
      "  pnpm run studio:toolchain:setup -- --install --install-blender",
      "  pnpm run studio:toolchain:setup -- --install --install-vrm-addon --vrm-addon-source ./addons/vrm-exporter.zip",
      "  pnpm run studio:toolchain:setup -- --install --install-mcp-bridge --mcp-package blender-mcp --write-env .env.local",
    ].join("\n"));
    process.exit(0);
  }

  const unknown = args.filter((entry) => entry.startsWith("--") && !REQUIRED_FLAGS.has(entry));
  if (unknown.length) {
    throw new Error(`알 수 없는 옵션: ${unknown.join(", ")}`);
  }

  const installBlender = hasFlag(args, "--install-blender");
  const installVrmAddon = hasFlag(args, "--install-vrm-addon");
  const installMcpBridge = hasFlag(args, "--install-mcp-bridge");
  const explicitInstall = hasFlag(args, "--install");
  const explicitCheck = hasFlag(args, "--check");

  let mode: SetupPlan["mode"] = explicitCheck ? "check" : "install";
  if (!explicitInstall && !explicitCheck) {
    mode = (installBlender || installVrmAddon || installMcpBridge) ? "install" : "check";
  }

  const normalized: SetupPlan = {
    mode,
    installBlender,
    installVrmAddon,
    installMcpBridge,
    vrmAddonSource: getOption(args, "--vrm-addon-source"),
    mcpPackage: getOption(args, "--mcp-package"),
    mcpCommand: getOption(args, "--mcp-command"),
    writeEnv: getOption(args, "--write-env"),
  };

  if (normalized.mode === "install" && !normalized.installBlender && !normalized.installVrmAddon && !normalized.installMcpBridge) {
    normalized.installBlender = true;
    normalized.installVrmAddon = true;
    normalized.installMcpBridge = true;
  }

  if (normalized.installMcpBridge && !normalized.mcpPackage && !normalized.mcpCommand && !process.env.STUDIO_MCP_BRIDGE_COMMAND) {
    throw new Error("install-mcp-bridge를 사용하려면 --mcp-package, --mcp-command 중 하나 또는 STUDIO_MCP_BRIDGE_COMMAND가 필요합니다.");
  }

  return normalized;
}

function main(): void {
  const plan = parseArgs(process.argv);

  if (plan.mode === "check") {
    const failed = runChecks("toolchain check");
    if (failed) {
      process.exitCode = 1;
    }
    writeEnvIfNeeded(plan);
    return;
  }

  console.log("실행 모드: install");
  runChecks("toolchain check (before install)");
  runInstall(plan);
  const failedAfterInstall = runChecks("toolchain check (after install)");
  writeEnvIfNeeded(plan);
  if (failedAfterInstall) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`실행 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
