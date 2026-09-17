#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RELEASE_DIR = join(ROOT, "qa-results", "desktop-sync-release");
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function parseArguments(argv) {
  const options = {
    releaseDir: DEFAULT_RELEASE_DIR,
    bundleRoot: "",
    receiptPath: "",
    requireSigned: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new TypeError(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--release-dir") options.releaseDir = resolve(next());
    else if (argument === "--bundle-root") options.bundleRoot = resolve(next());
    else if (argument === "--receipt") options.receiptPath = resolve(next());
    else if (argument === "--require-signed") options.requireSigned = true;
    else if (argument === "--allow-unsigned") options.requireSigned = false;
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  return options;
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertText(value, label) {
  if (typeof value !== "string" || !value) throw new TypeError(`${label} must be text`);
  return value;
}

function assertSha256(value, label) {
  const text = assertText(value, label);
  if (!SHA256_PATTERN.test(text)) throw new TypeError(`${label} must be SHA-256`);
  return text;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeRelativePath(value) {
  const normalized = value.split("/").join(sep);
  if (
    !value
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
    || value.includes("\\")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) throw new TypeError(`unsafe release path: ${value}`);
  return normalized;
}

async function discoverSingle(directory, suffix) {
  const matches = (await readdir(directory))
    .filter((name) => name.endsWith(suffix))
    .sort();
  if (matches.length !== 1) {
    throw new Error(`${directory} must contain exactly one ${suffix} file`);
  }
  return join(directory, matches[0]);
}

async function discoverBundleRoot(releaseDir) {
  const stage = join(releaseDir, "stage");
  const directories = (await readdir(stage, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (directories.length !== 1) {
    throw new Error("release stage must contain exactly one bundle directory");
  }
  return join(stage, directories[0].name);
}

function expectedNativePackages(platform, arch) {
  if (platform === "darwin") return [`@napi-rs/keyring-darwin-${arch}`];
  if (platform === "windows") return [`@napi-rs/keyring-win32-${arch}-msvc`];
  if (platform === "linux") {
    return [
      `@napi-rs/keyring-linux-${arch}-gnu`,
      `@napi-rs/keyring-linux-${arch}-musl`,
    ];
  }
  if (platform === "freebsd") return [`@napi-rs/keyring-freebsd-${arch}`];
  return [];
}

function platformLabel() {
  return process.platform === "win32" ? "windows" : process.platform;
}

function expectedSigningKind(platform) {
  if (platform === "darwin") return "apple-codesign";
  if (platform === "windows") return "authenticode";
  if (platform === "linux") return "gpg";
  throw new Error(`signed release verification is unsupported on ${platform}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function verifyManifest(bundleRoot, manifest) {
  assertRecord(manifest, "manifest");
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new TypeError("release manifest shape is invalid");
  }
  const { manifestSha256, ...manifestBody } = manifest;
  assertSha256(manifestSha256, "manifest.manifestSha256");
  if (sha256Json(manifestBody) !== manifestSha256) {
    throw new Error("release manifest checksum is invalid");
  }
  const seen = new Set();
  for (const [index, entryValue] of manifest.files.entries()) {
    const entry = assertRecord(entryValue, `manifest.files[${index}]`);
    const path = assertText(entry.path, `manifest.files[${index}].path`);
    if (seen.has(path)) throw new Error(`duplicate release manifest path: ${path}`);
    seen.add(path);
    if (
      path.startsWith("app/dist/")
      && (path.endsWith(".map") || path.endsWith(".d.ts"))
    ) {
      throw new Error(`development artifact leaked into release: ${path}`);
    }
    const absolutePath = join(bundleRoot, normalizeRelativePath(path));
    const metadata = await stat(absolutePath);
    if (!metadata.isFile() || metadata.size !== entry.size) {
      throw new Error(`release file metadata mismatch: ${path}`);
    }
    if (await sha256File(absolutePath) !== assertSha256(entry.sha256, `${path}.sha256`)) {
      throw new Error(`release file checksum mismatch: ${path}`);
    }
  }
  return seen;
}

async function verifyChecksums(bundleRoot, manifestFiles) {
  const lines = (await readFile(join(bundleRoot, "checksums.txt"), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean);
  const parsed = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    if (!match) throw new Error(`invalid checksums.txt row: ${line}`);
    if (parsed.has(match[2])) throw new Error(`duplicate checksum row: ${match[2]}`);
    parsed.set(match[2], match[1]);
  }
  if (parsed.size !== manifestFiles.size) {
    throw new Error("checksums.txt does not cover every manifest file");
  }
  for (const path of manifestFiles) {
    const absolutePath = join(bundleRoot, normalizeRelativePath(path));
    if (parsed.get(path) !== await sha256File(absolutePath)) {
      throw new Error(`checksums.txt mismatch: ${path}`);
    }
  }
}

async function verifySbom(bundleRoot, manifest) {
  const sbom = assertRecord(
    JSON.parse(await readFile(join(bundleRoot, "sbom.cdx.json"), "utf8")),
    "sbom",
  );
  if (
    sbom.bomFormat !== "CycloneDX"
    || sbom.specVersion !== "1.6"
    || !Array.isArray(sbom.components)
    || sbom.components.length < 2
  ) throw new Error("CycloneDX SBOM is incomplete");
  const names = new Set(sbom.components.map((component) => component?.name));
  if (!names.has("@napi-rs/keyring")) throw new Error("SBOM omits the credential vault library");
  const nativeNames = expectedNativePackages(manifest.platform, manifest.arch);
  if (nativeNames.length < 1 || !nativeNames.some((name) => names.has(name))) {
    throw new Error(`SBOM omits the native credential vault package (${nativeNames.join(" or ")})`);
  }
}

function verifyNativeSigning(bundleRoot, manifest, artifact) {
  if (platformLabel() !== manifest.platform || process.arch !== manifest.arch) {
    throw new Error(
      `strict signature verification requires ${manifest.platform}/${manifest.arch}, current host is ${platformLabel()}/${process.arch}`,
    );
  }
  const targetPath = join(
    bundleRoot,
    normalizeRelativePath(assertText(artifact.targetPath, "signing target path")),
  );
  if (manifest.platform === "darwin") {
    run(
      process.env.TOONSTUDIO_CODESIGN_PATH || "codesign",
      ["--verify", "--strict", "--verbose=2", targetPath],
      { cwd: bundleRoot },
    );
    return;
  }
  if (manifest.platform === "windows") {
    run(
      process.env.TOONSTUDIO_SIGNTOOL_PATH || "signtool.exe",
      ["verify", "/pa", "/v", targetPath],
      { cwd: bundleRoot },
    );
    return;
  }
  const signaturePath = join(
    bundleRoot,
    normalizeRelativePath(assertText(artifact.path, "GPG signature path")),
  );
  run(
    process.env.TOONSTUDIO_GPG_PATH || "gpg",
    ["--batch", "--verify", signaturePath, targetPath],
    { cwd: bundleRoot },
  );
}

async function verifySigning(bundleRoot, manifest, requireSigned) {
  const evidence = assertRecord(
    JSON.parse(await readFile(join(bundleRoot, "release-signing.json"), "utf8")),
    "signing evidence",
  );
  if (
    evidence.schemaVersion !== 1
    || evidence.platform !== manifest.platform
    || evidence.arch !== manifest.arch
    || !Array.isArray(evidence.artifacts)
  ) throw new Error("signing evidence does not match the release bundle");
  if (!["signed", "unsigned"].includes(evidence.status)) {
    throw new Error("signing evidence status is invalid");
  }
  if (evidence.status === "unsigned" && evidence.artifacts.length !== 0) {
    throw new Error("unsigned signing evidence must not contain artifacts");
  }
  if (requireSigned && evidence.status !== "signed") {
    throw new Error("signed release evidence is required");
  }
  const requiredKind = expectedSigningKind(manifest.platform);
  let requiredArtifact = null;
  for (const artifactValue of evidence.artifacts) {
    const artifact = assertRecord(artifactValue, "signing artifact");
    const path = assertText(artifact.path, "signing artifact path");
    const targetPath = assertText(artifact.targetPath, "signing target path");
    if (artifact.verified !== true) throw new Error(`unverified signing artifact: ${path}`);
    const absolutePath = join(bundleRoot, normalizeRelativePath(path));
    const absoluteTargetPath = join(bundleRoot, normalizeRelativePath(targetPath));
    await Promise.all([access(absolutePath), access(absoluteTargetPath)]);
    if (await sha256File(absolutePath) !== assertSha256(artifact.sha256, `${path}.sha256`)) {
      throw new Error(`signed artifact changed after verification: ${path}`);
    }
    if (
      await sha256File(absoluteTargetPath)
      !== assertSha256(artifact.targetSha256, `${targetPath}.targetSha256`)
    ) {
      throw new Error(`signed target changed after verification: ${targetPath}`);
    }
    if (artifact.kind === requiredKind) requiredArtifact = artifact;
  }
  if (evidence.status === "signed" && requiredArtifact === null) {
    throw new Error(`missing ${requiredKind} signing evidence`);
  }
  if (requireSigned) verifyNativeSigning(bundleRoot, manifest, requiredArtifact);
  return evidence;
}

export function resolveArchiveListingInvocation(
  archivePath,
  pathApi = { basename, dirname },
) {
  return {
    command: "tar",
    args: ["-tzf", pathApi.basename(archivePath)],
    cwd: pathApi.dirname(archivePath),
  };
}

function verifyArchiveListing(archivePath, bundleName) {
  const invocation = resolveArchiveListingInvocation(archivePath);
  const listing = run(invocation.command, invocation.args, { cwd: invocation.cwd })
    .split("\n")
    .filter(Boolean);
  if (listing.length === 0) throw new Error("release archive is empty");
  for (const path of listing) {
    if (
      path.startsWith("/")
      || path.split("/").includes("..")
      || !(path === `${bundleName}/` || path.startsWith(`${bundleName}/`))
    ) throw new Error(`unsafe archive entry: ${path}`);
  }
}

function executeBundleSmoke(bundleRoot, manifest) {
  const runtimePath = join(bundleRoot, normalizeRelativePath(manifest.runtime));
  const runtimeVersion = run(runtimePath, ["--version"]);
  if (runtimeVersion !== manifest.nodeVersion) {
    throw new Error(`bundled Node version mismatch: ${runtimeVersion}`);
  }
  const launcherPath = join(bundleRoot, normalizeRelativePath(manifest.launcher));
  const command = manifest.platform === "windows" ? "cmd.exe" : launcherPath;
  const args = manifest.platform === "windows"
    ? ["/d", "/s", "/c", launcherPath, "--help"]
    : ["--help"];
  const help = run(command, args, { cwd: bundleRoot });
  if (!help.includes("ToonStudio folder sync") || !help.includes("toonstudio-sync resolve")) {
    throw new Error("bundled desktop sync CLI smoke test failed");
  }
}

export async function verifyDesktopSyncRelease(input = {}) {
  const releaseDir = input.releaseDir ?? DEFAULT_RELEASE_DIR;
  const bundleRoot = input.bundleRoot ?? await discoverBundleRoot(releaseDir);
  const receiptPath = input.receiptPath ?? await discoverSingle(releaseDir, ".receipt.json");
  const receipt = assertRecord(JSON.parse(await readFile(receiptPath, "utf8")), "release receipt");
  const manifest = assertRecord(
    JSON.parse(await readFile(join(bundleRoot, "manifest.json"), "utf8")),
    "manifest",
  );
  if (receipt.bundleName !== manifest.bundleName) throw new Error("receipt bundle name mismatch");
  if (receipt.manifestSha256 !== manifest.manifestSha256) {
    throw new Error("receipt manifest checksum mismatch");
  }
  if (receipt.signingStatus !== manifest.signingStatus) {
    throw new Error("receipt signing status mismatch");
  }
  const archivePath = join(releaseDir, normalizeRelativePath(assertText(receipt.archive, "receipt.archive")));
  if (await sha256File(archivePath) !== assertSha256(receipt.archiveSha256, "receipt.archiveSha256")) {
    throw new Error("release archive checksum mismatch");
  }
  verifyArchiveListing(archivePath, manifest.bundleName);
  const manifestFiles = await verifyManifest(bundleRoot, manifest);
  await verifyChecksums(bundleRoot, manifestFiles);
  await verifySbom(bundleRoot, manifest);
  const signing = await verifySigning(
    bundleRoot,
    manifest,
    input.requireSigned === true,
  );
  if (input.executeBundle !== false) executeBundleSmoke(bundleRoot, manifest);
  const result = Object.freeze({
    bundleName: manifest.bundleName,
    archiveSha256: receipt.archiveSha256,
    manifestSha256: manifest.manifestSha256,
    signingStatus: signing.status,
    fileCount: manifest.files.length,
  });
  console.log(
    `Desktop sync release verified: ${result.bundleName} · ${result.fileCount} files · ${result.signingStatus}`,
  );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  await verifyDesktopSyncRelease({
    releaseDir: options.releaseDir,
    bundleRoot: options.bundleRoot || undefined,
    receiptPath: options.receiptPath || undefined,
    requireSigned: options.requireSigned,
  });
}
