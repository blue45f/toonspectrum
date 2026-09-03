import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BLENDER_VERSION = "5.2.1";
const VRM_ADDON_VERSION = "4.5.0";
const VRM_ADDON_URL = `https://github.com/saturday06/VRM-Addon-for-Blender/releases/download/v${VRM_ADDON_VERSION}/VRM_Addon_for_Blender-Extension-${VRM_ADDON_VERSION.replaceAll(".", "_")}.zip`;
const VRM_ADDON_SHA256 = "e5e0f923a0bb11eb1320870b2db8091948dd5b63014510d839016a112e40a35a";

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function candidates(): string[] {
  const values = [process.env.BLENDER_PATH, process.env.BLENDER_BIN];
  if (process.platform === "darwin") {
    values.push("/Applications/Blender.app/Contents/MacOS/Blender");
  } else if (process.platform === "win32") {
    values.push(
      `C:\\Program Files\\Blender Foundation\\Blender ${BLENDER_VERSION.slice(0, 3)}\\blender.exe`,
      "blender.exe",
    );
  } else {
    values.push("blender", "/usr/bin/blender", "/snap/bin/blender");
  }
  return values.filter((value): value is string => Boolean(value));
}

function run(command: string, args: readonly string[], cwd = ROOT, allowFailure = false): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }
  return output;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveBlender(explicit?: string): Promise<string> {
  for (const candidate of explicit ? [explicit] : candidates()) {
    if (candidate.includes(path.sep) && !(await exists(candidate))) continue;
    const output = run(candidate, ["--version"], ROOT, true);
    if (output.includes("Blender")) return candidate;
  }
  throw new Error("Blender 5.2.1 was not found. Set BLENDER_PATH or install the Blender 5.2 LTS application.");
}

async function sha256(target: string): Promise<string> {
  return createHash("sha256").update(await readFile(target)).digest("hex");
}

async function download(url: string, destination: string, expectedSha: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  if (!(await exists(destination)) || (await sha256(destination)) !== expectedSha) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`);
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
  const actual = await sha256(destination);
  if (actual !== expectedSha) throw new Error(`SHA-256 mismatch for ${destination}: ${actual}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((entry, index) => !(index === 0 && entry === "--"));
  if (args.includes("--help")) {
    console.log([
      "pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts [options]",
      "",
      "--check                 Verify Blender, the ToonStudio extension, and VRM operators",
      "--install-addons        Build/install the ToonStudio extension and verified VRM Add-on",
      "--blender <path>        Explicit Blender executable",
      "--cache-dir <path>      Download/build cache (default ~/.cache/toonstudio-blender)",
    ].join("\n"));
    return;
  }
  const blender = await resolveBlender(option(args, "--blender"));
  const version = run(blender, ["--version"]);
  if (!version.includes("Blender 5.2")) {
    throw new Error(`Blender 5.2 LTS is required for a reproducible pipeline; found:\n${version}`);
  }
  const cache = path.resolve(option(args, "--cache-dir") ?? path.join(os.homedir(), ".cache/toonstudio-blender"));
  if (args.includes("--install-addons")) {
    await mkdir(cache, { recursive: true });
    const extensionZip = path.join(cache, "toonstudio-character-pipeline-1.0.0.zip");
    run(blender, [
      "--command", "extension", "validate",
      path.join(ROOT, "tools/blender/toonstudio_blender_kit"),
    ]);
    run(blender, [
      "--command", "extension", "build",
      "--source-dir", path.join(ROOT, "tools/blender/toonstudio_blender_kit"),
      "--output-filepath", extensionZip,
    ]);
    run(blender, ["--command", "extension", "install-file", "-r", "user_default", "-e", extensionZip]);
    const vrmZip = path.join(cache, path.basename(new URL(VRM_ADDON_URL).pathname));
    await download(VRM_ADDON_URL, vrmZip, VRM_ADDON_SHA256);
    run(blender, ["--command", "extension", "install-file", "-r", "user_default", "-e", vrmZip]);
  }
  const probe = [
    "import bpy, json",
    "result = {",
    "  'version': list(bpy.app.version[:3]),",
    "  'toonstudio': hasattr(bpy.ops, 'toonstudio') and hasattr(bpy.ops.toonstudio, 'run_character_pipeline'),",
    "  'vrmImport': hasattr(bpy.ops.import_scene, 'vrm'),",
    "  'vrmExport': hasattr(bpy.ops.export_scene, 'vrm'),",
    "}",
    "print('TOONSTUDIO_BLENDER_PROBE ' + json.dumps(result, sort_keys=True))",
  ].join("; ");
  const output = run(blender, ["--background", "--python-expr", probe]);
  const marker = output.split("\n").find((line) => line.startsWith("TOONSTUDIO_BLENDER_PROBE "));
  if (!marker) throw new Error(`Blender probe did not return a receipt\n${output}`);
  const receipt = JSON.parse(marker.slice("TOONSTUDIO_BLENDER_PROBE ".length)) as {
    version: number[];
    toonstudio: boolean;
    vrmImport: boolean;
    vrmExport: boolean;
  };
  const requireAddons = args.includes("--install-addons") || args.includes("--check");
  if (requireAddons && (!receipt.toonstudio || !receipt.vrmImport || !receipt.vrmExport)) {
    throw new Error(`Blender add-on probe failed: ${JSON.stringify(receipt)}`);
  }
  console.log(JSON.stringify({ blender, expectedBlender: BLENDER_VERSION, expectedVrmAddon: VRM_ADDON_VERSION, ...receipt }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
