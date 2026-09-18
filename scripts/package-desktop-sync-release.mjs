#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createGzip } from "node:zlib";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_ROOT = join(ROOT, "apps", "desktop-sync");
const DEFAULT_OUTPUT = join(ROOT, "qa-results", "desktop-sync-release");
const STAGE_METADATA_FILE = ".release-stage.json";
const SIGNING_EVIDENCE_FILE = "release-signing.json";

function parseArguments(argv) {
  const options = {
    mode: "all",
    stageDir: "",
    outputDir: DEFAULT_OUTPUT,
    version: "",
    signingEvidence: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new TypeError(`${argument} requires a value`);
      index += 1;
      return next;
    };
    if (argument === "--mode") options.mode = value();
    else if (argument === "--stage-dir") options.stageDir = resolve(value());
    else if (argument === "--output-dir") options.outputDir = resolve(value());
    else if (argument === "--version") options.version = value();
    else if (argument === "--signing-evidence") options.signingEvidence = resolve(value());
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  if (!["all", "stage", "finalize"].includes(options.mode)) {
    throw new TypeError("--mode must be all, stage, or finalize");
  }
  if (!options.stageDir) {
    options.stageDir = join(options.outputDir, "stage");
  }
  return options;
}

function safeVersion(value) {
  const clean = value.trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,79}$/u.test(clean)) {
    throw new TypeError("release version contains unsupported characters");
  }
  return clean;
}

function platformLabel() {
  return process.platform === "win32" ? "windows" : process.platform;
}

function executableName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function launcherName() {
  return process.platform === "win32" ? "toonstudio-sync.cmd" : "toonstudio-sync";
}

function normalizePath(value) {
  return value.split(sep).join("/");
}

function safeBundlePath(bundleRoot, value, label) {
  if (
    typeof value !== "string"
    || !value
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
    || value.includes("\\")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) throw new TypeError(`${label} contains an unsafe bundle path`);
  const absolutePath = resolve(bundleRoot, value.split("/").join(sep));
  const relativePath = relative(bundleRoot, absolutePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    throw new TypeError(`${label} escapes the staged bundle`);
  }
  return absolutePath;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function resolveReleaseCommand(
  command,
  args,
  platform = process.platform,
  environment = process.env,
) {
  if (platform !== "win32" || !command.toLowerCase().endsWith(".cmd")) {
    return { command, args };
  }
  const commandProcessor = environment.ComSpec?.trim()
    || environment.COMSPEC?.trim()
    || "cmd.exe";
  return {
    command: commandProcessor,
    args: ["/d", "/s", "/c", command, ...args],
  };
}

function run(command, args, options = {}) {
  const resolved = resolveReleaseCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    const reason = result.error?.message ?? `exit code ${result.status ?? "unknown"}`;
    throw new Error(`${command} failed with ${reason}`);
  }
  return result.stdout?.trim() ?? "";
}

async function copyJavaScriptTree(source, destination) {
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyJavaScriptTree(sourcePath, destinationPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
      await chmod(destinationPath, 0o644);
    }
  }
}

async function findNodeLicense() {
  const runtimeDirectory = dirname(process.execPath);
  const runtimeRoot = resolve(runtimeDirectory, "..");
  const candidates = [
    join(runtimeDirectory, "LICENSE"),
    join(runtimeDirectory, "LICENSE.md"),
    join(runtimeRoot, "LICENSE"),
    join(runtimeRoot, "LICENSE.md"),
    join(runtimeRoot, "share", "doc", "node", "copyright"),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue through known Node distribution layouts.
    }
  }
  throw new Error(`Node license was not found beside ${process.execPath}`);
}

async function stageRelease(options) {
  const sourcePackage = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8"));
  const commit = run("git", ["rev-parse", "HEAD"], { capture: true });
  const commitEpoch = Number(run("git", ["show", "-s", "--format=%ct", "HEAD"], { capture: true }));
  const version = safeVersion(options.version || `0.0.0-dev.${commit.slice(0, 12)}`);
  const bundleName = `toonstudio-sync-${version}-${platformLabel()}-${process.arch}`;
  const bundleRoot = join(options.stageDir, bundleName);
  await rm(options.stageDir, { recursive: true, force: true });
  await mkdir(join(bundleRoot, "app", "dist"), { recursive: true });
  await mkdir(join(bundleRoot, "runtime"), { recursive: true });
  await mkdir(join(bundleRoot, "licenses"), { recursive: true });

  await copyJavaScriptTree(join(PACKAGE_ROOT, "dist"), join(bundleRoot, "app", "dist"));
  const releasePackage = {
    name: sourcePackage.name,
    version,
    private: true,
    type: "module",
    description: sourcePackage.description,
    main: "./dist/cli.js",
    bin: { "toonstudio-sync": "./dist/cli.js" },
    dependencies: sourcePackage.dependencies,
  };
  await writeJson(join(bundleRoot, "app", "package.json"), releasePackage);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npmCommand, [
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
  ], { cwd: join(bundleRoot, "app") });
  await rm(join(bundleRoot, "app", "node_modules", ".package-lock.json"), { force: true });

  const runtimePath = join(bundleRoot, "runtime", executableName());
  await copyFile(process.execPath, runtimePath);
  await chmod(runtimePath, 0o755);
  await copyFile(await findNodeLicense(), join(bundleRoot, "licenses", "NODE-LICENSE.txt"));
  const keyringLicense = join(
    bundleRoot,
    "app",
    "node_modules",
    "@napi-rs",
    "keyring",
    "LICENSE",
  );
  await copyFile(keyringLicense, join(bundleRoot, "licenses", "NAPI-RS-KEYRING-LICENSE.txt"));

  const launcherPath = join(bundleRoot, launcherName());
  const launcher = process.platform === "win32"
    ? `@echo off\r\nsetlocal\r\n"%~dp0runtime\\node.exe" "%~dp0app\\dist\\cli.js" %*\r\n`
    : `#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/runtime/node" "$HERE/app/dist/cli.js" "$@"\n`;
  await writeFile(launcherPath, launcher, "utf8");
  if (process.platform !== "win32") await chmod(launcherPath, 0o755);

  const metadata = {
    schemaVersion: 1,
    bundleName,
    version,
    platform: platformLabel(),
    nodePlatform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    sourceCommit: commit,
    sourceDateEpoch: Number.isSafeInteger(commitEpoch) ? commitEpoch : 0,
    launcher: launcherName(),
    runtime: `runtime/${executableName()}`,
  };
  await writeJson(join(bundleRoot, STAGE_METADATA_FILE), metadata);
  console.log(`Desktop sync release staged: ${bundleRoot}`);
  return { bundleRoot, metadata };
}

async function listFiles(root) {
  const files = [];
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  };
  await visit(root);
  return files;
}

async function installedComponents(bundleRoot) {
  const modulesRoot = join(bundleRoot, "app", "node_modules");
  const components = [];
  const candidates = [
    join(modulesRoot, "@napi-rs", "keyring"),
    ...((await readdir(join(modulesRoot, "@napi-rs"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("keyring-"))
      .map((entry) => join(modulesRoot, "@napi-rs", entry.name))),
  ];
  for (const directory of candidates) {
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    components.push({
      type: "library",
      "bom-ref": `pkg:npm/${encodeURIComponent(manifest.name)}@${manifest.version}`,
      name: manifest.name,
      version: manifest.version,
      purl: `pkg:npm/${encodeURIComponent(manifest.name)}@${manifest.version}`,
      licenses: manifest.license ? [{ license: { id: manifest.license } }] : undefined,
    });
  }
  return components.sort((left, right) => left.name.localeCompare(right.name));
}

function deterministicUuid(seed) {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function buildSbom(bundleRoot, metadata) {
  const components = await installedComponents(bundleRoot);
  const applicationRef = `pkg:npm/%40toonspectrum/desktop-sync-agent@${metadata.version}`;
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${deterministicUuid(`${metadata.sourceCommit}:${metadata.platform}:${metadata.arch}`)}`,
    version: 1,
    metadata: {
      timestamp: new Date(metadata.sourceDateEpoch * 1000).toISOString(),
      component: {
        type: "application",
        "bom-ref": applicationRef,
        name: "@toonspectrum/desktop-sync-agent",
        version: metadata.version,
        purl: applicationRef,
      },
    },
    components,
    dependencies: [
      { ref: applicationRef, dependsOn: components.map((component) => component["bom-ref"]) },
      ...components.map((component) => ({ ref: component["bom-ref"], dependsOn: [] })),
    ],
  };
}

function expectedSigningKind(platform) {
  if (platform === "darwin") return "apple-codesign";
  if (platform === "windows") return "authenticode";
  if (platform === "linux") return "gpg";
  throw new TypeError(`unsupported signing platform: ${platform}`);
}

async function parseSigningEvidence(value, metadata, bundleRoot) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("signing evidence must be an object");
  }
  if (
    value.schemaVersion !== 1
    || value.platform !== metadata.platform
    || value.arch !== metadata.arch
    || !["signed", "unsigned"].includes(value.status)
    || !Array.isArray(value.artifacts)
  ) {
    throw new TypeError("signing evidence does not match the staged platform");
  }
  if (value.status === "unsigned") {
    if (value.artifacts.length !== 0) {
      throw new TypeError("unsigned signing evidence must not contain artifacts");
    }
    return value;
  }
  const requiredKind = expectedSigningKind(metadata.platform);
  if (value.artifacts.length < 1) {
    throw new TypeError("signed evidence must contain a verified artifact");
  }
  let requiredKindSeen = false;
  for (const [index, artifact] of value.artifacts.entries()) {
    if (
      !artifact
      || typeof artifact !== "object"
      || typeof artifact.path !== "string"
      || typeof artifact.kind !== "string"
      || artifact.verified !== true
      || typeof artifact.sha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(artifact.sha256)
      || typeof artifact.targetPath !== "string"
      || typeof artifact.targetSha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(artifact.targetSha256)
      || typeof artifact.identity !== "string"
      || !artifact.identity.trim()
    ) throw new TypeError(`signing evidence artifact ${index} is invalid`);
    const artifactPath = safeBundlePath(bundleRoot, artifact.path, `artifact ${index}`);
    const targetPath = safeBundlePath(bundleRoot, artifact.targetPath, `artifact ${index} target`);
    if (await sha256File(artifactPath) !== artifact.sha256) {
      throw new Error(`signed artifact checksum mismatch: ${artifact.path}`);
    }
    if (await sha256File(targetPath) !== artifact.targetSha256) {
      throw new Error(`signed target checksum mismatch: ${artifact.targetPath}`);
    }
    requiredKindSeen ||= artifact.kind === requiredKind;
  }
  if (!requiredKindSeen) {
    throw new TypeError(`signed evidence is missing ${requiredKind}`);
  }
  return value;
}

async function manifestEntries(bundleRoot) {
  const files = await listFiles(bundleRoot);
  const ignored = new Set(["manifest.json", "checksums.txt"]);
  const entries = [];
  for (const absolutePath of files) {
    const path = normalizePath(relative(bundleRoot, absolutePath));
    if (ignored.has(path)) continue;
    const metadata = await stat(absolutePath);
    entries.push({
      path,
      size: metadata.size,
      mode: metadata.mode & 0o777,
      sha256: await sha256File(absolutePath),
    });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function tarOctal(value, length) {
  const text = value.toString(8).padStart(length - 1, "0");
  return `${text.slice(-(length - 1))}\0`;
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  const index = path.lastIndexOf("/");
  const prefix = path.slice(0, index);
  const name = path.slice(index + 1);
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`release path exceeds ustar limits: ${path}`);
  }
  return { name, prefix };
}

function tarHeader(path, size, mode, mtime, directory = false) {
  const header = Buffer.alloc(512, 0);
  const { name, prefix } = splitTarPath(path);
  header.write(name, 0, 100, "utf8");
  header.write(tarOctal(mode, 8), 100, 8, "ascii");
  header.write(tarOctal(0, 8), 108, 8, "ascii");
  header.write(tarOctal(0, 8), 116, 8, "ascii");
  header.write(tarOctal(directory ? 0 : size, 12), 124, 12, "ascii");
  header.write(tarOctal(mtime, 12), 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write(directory ? "5" : "0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 32, "ascii");
  header.write("root", 297, 32, "ascii");
  header.write(prefix, 345, 155, "utf8");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return;
  await new Promise((resolveDrain, rejectDrain) => {
    const cleanup = () => {
      stream.off("drain", onDrain);
      stream.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolveDrain();
    };
    const onError = (error) => {
      cleanup();
      rejectDrain(error);
    };
    stream.once("drain", onDrain);
    stream.once("error", onError);
  });
}

async function deterministicTarGz(bundleRoot, archivePath, metadata) {
  const gzip = createGzip({ level: 9 });
  const output = createWriteStream(archivePath, { mode: 0o644 });
  const gzipFinished = finished(gzip);
  const outputFinished = finished(output);
  output.once("error", (error) => gzip.destroy(error));
  gzip.pipe(output);
  try {
    const rootName = metadata.bundleName;
    await writeChunk(gzip, tarHeader(`${rootName}/`, 0, 0o755, metadata.sourceDateEpoch, true));
    const files = await listFiles(bundleRoot);
    for (const absolutePath of files) {
      const relativePath = normalizePath(relative(bundleRoot, absolutePath));
      const archiveName = `${rootName}/${relativePath}`;
      const file = await stat(absolutePath);
      await writeChunk(gzip, tarHeader(
        archiveName,
        file.size,
        file.mode & 0o777,
        metadata.sourceDateEpoch,
      ));
      for await (const chunk of createReadStream(absolutePath)) {
        await writeChunk(gzip, chunk);
      }
      const padding = (512 - (file.size % 512)) % 512;
      if (padding > 0) await writeChunk(gzip, Buffer.alloc(padding));
    }
    await writeChunk(gzip, Buffer.alloc(1024));
    gzip.end();
    await Promise.all([gzipFinished, outputFinished]);
  } catch (error) {
    gzip.destroy(error instanceof Error ? error : new Error(String(error)));
    output.destroy();
    await Promise.allSettled([gzipFinished, outputFinished]);
    await rm(archivePath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function finalizeRelease(options) {
  const stageEntries = await readdir(options.stageDir, { withFileTypes: true });
  const bundles = stageEntries.filter((entry) => entry.isDirectory());
  if (bundles.length !== 1) throw new Error("stage directory must contain exactly one release bundle");
  const bundleRoot = join(options.stageDir, bundles[0].name);
  const metadata = JSON.parse(await readFile(join(bundleRoot, STAGE_METADATA_FILE), "utf8"));
  let signingEvidence = {
    schemaVersion: 1,
    platform: metadata.platform,
    arch: metadata.arch,
    status: "unsigned",
    artifacts: [],
  };
  if (options.signingEvidence) {
    signingEvidence = await parseSigningEvidence(
      JSON.parse(await readFile(options.signingEvidence, "utf8")),
      metadata,
      bundleRoot,
    );
  }
  await writeJson(join(bundleRoot, SIGNING_EVIDENCE_FILE), signingEvidence);
  await writeJson(join(bundleRoot, "sbom.cdx.json"), await buildSbom(bundleRoot, metadata));
  const manifestBody = {
    schemaVersion: 1,
    product: "ToonStudio Desktop Sync",
    ...metadata,
    signingStatus: signingEvidence.status,
    files: await manifestEntries(bundleRoot),
  };
  const manifest = {
    ...manifestBody,
    manifestSha256: sha256Bytes(Buffer.from(JSON.stringify(manifestBody))),
  };
  await writeJson(join(bundleRoot, "manifest.json"), manifest);
  const finalEntries = await manifestEntries(bundleRoot);
  await writeFile(
    join(bundleRoot, "checksums.txt"),
    `${finalEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`,
    "utf8",
  );

  await mkdir(options.outputDir, { recursive: true });
  const archivePath = join(options.outputDir, `${metadata.bundleName}.tar.gz`);
  await rm(archivePath, { force: true });
  await deterministicTarGz(bundleRoot, archivePath, metadata);
  const archiveHash = await sha256File(archivePath);
  const releaseReceipt = {
    schemaVersion: 1,
    bundleName: metadata.bundleName,
    archive: relative(options.outputDir, archivePath),
    archiveSha256: archiveHash,
    manifestSha256: manifest.manifestSha256,
    signingStatus: signingEvidence.status,
    sourceCommit: metadata.sourceCommit,
  };
  await writeJson(join(options.outputDir, `${metadata.bundleName}.receipt.json`), releaseReceipt);
  await writeFile(
    join(options.outputDir, `${metadata.bundleName}.sha256`),
    `${archiveHash}  ${metadata.bundleName}.tar.gz\n`,
    "utf8",
  );
  console.log(`Desktop sync release finalized: ${archivePath}`);
  return { archivePath, bundleRoot, releaseReceipt };
}

export async function packageDesktopSyncRelease(options = parseArguments(process.argv.slice(2))) {
  let staged = null;
  if (options.mode === "stage" || options.mode === "all") staged = await stageRelease(options);
  if (options.mode === "finalize" || options.mode === "all") {
    const finalized = await finalizeRelease(options);
    return { staged, finalized };
  }
  return { staged, finalized: null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await packageDesktopSyncRelease();
}
