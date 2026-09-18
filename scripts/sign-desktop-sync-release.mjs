#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STAGE_DIR = join(ROOT, "qa-results", "desktop-sync-release", "stage");
const DEFAULT_EVIDENCE_FILE = join(ROOT, "qa-results", "desktop-sync-release", "release-signing.evidence.json");

function parseArguments(argv) {
  const options = {
    stageDir: DEFAULT_STAGE_DIR,
    bundleRoot: "",
    output: DEFAULT_EVIDENCE_FILE,
    identity: "",
    tool: "",
    timestampUrl: "http://timestamp.digicert.com",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new TypeError(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--stage-dir") options.stageDir = resolve(next());
    else if (argument === "--bundle-root") options.bundleRoot = resolve(next());
    else if (argument === "--output") options.output = resolve(next());
    else if (argument === "--identity") options.identity = next();
    else if (argument === "--tool") options.tool = resolve(next());
    else if (argument === "--timestamp-url") options.timestampUrl = next();
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  return options;
}

function platformLabel() {
  return process.platform === "win32" ? "windows" : process.platform;
}

function assertIdentity(value) {
  const clean = value.normalize("NFKC").trim();
  const hasControlCharacter = [...clean].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!clean || clean.length > 512 || hasControlCharacter) {
    throw new TypeError("signing identity must contain 1-512 printable characters");
  }
  return clean;
}

function normalizeRelativePath(value) {
  if (
    typeof value !== "string"
    || !value
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
    || value.includes("\\")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) throw new TypeError(`unsafe staged path: ${value}`);
  return value.split("/").join(sep);
}

async function discoverBundleRoot(stageDir) {
  const entries = (await readdir(stageDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (entries.length !== 1) {
    throw new Error("release stage must contain exactly one bundle directory");
  }
  return join(stageDir, entries[0].name);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function relativeBundlePath(bundleRoot, absolutePath) {
  const value = relative(bundleRoot, absolutePath).split(sep).join("/");
  normalizeRelativePath(value);
  return value;
}

async function writeEvidence(output, value) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function expectedPlatform(metadata) {
  if (metadata.platform !== platformLabel() || metadata.arch !== process.arch) {
    throw new Error(
      `staged bundle targets ${metadata.platform}/${metadata.arch}, but signer runs on ${platformLabel()}/${process.arch}`,
    );
  }
}

export async function signDesktopSyncReleaseStage(input = {}) {
  const stageDir = input.stageDir ?? DEFAULT_STAGE_DIR;
  const bundleRoot = input.bundleRoot ?? await discoverBundleRoot(stageDir);
  const output = input.output ?? DEFAULT_EVIDENCE_FILE;
  const metadata = JSON.parse(await readFile(join(bundleRoot, ".release-stage.json"), "utf8"));
  expectedPlatform(metadata);
  const identity = assertIdentity(
    input.identity
    || process.env.TOONSTUDIO_DESKTOP_SIGNING_IDENTITY
    || "",
  );
  const runtimePath = join(bundleRoot, normalizeRelativePath(metadata.runtime));
  const artifactBase = {
    verified: true,
    identity,
    targetPath: metadata.runtime,
  };
  let artifact;

  if (metadata.platform === "darwin") {
    const tool = input.tool || process.env.TOONSTUDIO_CODESIGN_PATH || "codesign";
    run(tool, [
      "--force",
      "--options", "runtime",
      "--timestamp",
      "--sign", identity,
      runtimePath,
    ], bundleRoot);
    run(tool, ["--verify", "--strict", "--verbose=2", runtimePath], bundleRoot);
    const digest = await sha256File(runtimePath);
    artifact = {
      ...artifactBase,
      kind: "apple-codesign",
      path: metadata.runtime,
      sha256: digest,
      targetSha256: digest,
    };
  } else if (metadata.platform === "windows") {
    const tool = input.tool || process.env.TOONSTUDIO_SIGNTOOL_PATH || "signtool.exe";
    const timestampUrl = input.timestampUrl || "http://timestamp.digicert.com";
    run(tool, [
      "sign",
      "/fd", "SHA256",
      "/td", "SHA256",
      "/tr", timestampUrl,
      "/sha1", identity,
      runtimePath,
    ], bundleRoot);
    run(tool, ["verify", "/pa", "/v", runtimePath], bundleRoot);
    const digest = await sha256File(runtimePath);
    artifact = {
      ...artifactBase,
      kind: "authenticode",
      path: metadata.runtime,
      sha256: digest,
      targetSha256: digest,
    };
  } else if (metadata.platform === "linux") {
    const tool = input.tool || process.env.TOONSTUDIO_GPG_PATH || "gpg";
    const signaturePath = `${runtimePath}.asc`;
    run(tool, [
      "--batch",
      "--yes",
      "--armor",
      "--detach-sign",
      "--local-user", identity,
      "--output", signaturePath,
      runtimePath,
    ], bundleRoot);
    run(tool, ["--batch", "--verify", signaturePath, runtimePath], bundleRoot);
    artifact = {
      ...artifactBase,
      kind: "gpg",
      path: relativeBundlePath(bundleRoot, signaturePath),
      sha256: await sha256File(signaturePath),
      targetSha256: await sha256File(runtimePath),
    };
  } else {
    throw new Error(`desktop sync signing is not supported on ${metadata.platform}`);
  }

  const evidence = {
    schemaVersion: 1,
    platform: metadata.platform,
    arch: metadata.arch,
    status: "signed",
    signedAt: new Date().toISOString(),
    artifacts: [artifact],
  };
  await writeEvidence(output, evidence);
  console.log(`Desktop sync signing evidence created: ${output}`);
  return Object.freeze({ bundleRoot, output, evidence });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await signDesktopSyncReleaseStage(parseArguments(process.argv.slice(2)));
}
