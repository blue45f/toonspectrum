import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HOKUSAI_INTEGRITY_MANIFEST_PATH,
  HOKUSAI_PACKAGE_DIRECTORY,
  HOKUSAI_PKG_DIRECTORY,
} from "../studio-hokusai-wasm-release-contract.mjs";
import {
  assertSafeHokusaiWasmBinary,
  createHokusaiReleaseBuildEnvironment,
  renderIntegrityManifest,
  verifyCheckedInHokusaiArtifacts,
} from "../verify-studio-hokusai-wasm.mjs";

const temporaryDirectories = [];
const PACKAGE_FILES = [
  "INTEGRITY.sha256",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "LICENSE-UNICODE",
  "README.md",
  "package.json",
  "studio_hokusai_wasm.d.ts",
  "studio_hokusai_wasm.js",
  "studio_hokusai_wasm_bg.wasm",
  "studio_hokusai_wasm_bg.wasm.d.ts",
];

function copyCheckedPackage(pkgDirectory) {
  mkdirSync(pkgDirectory);
  for (const name of PACKAGE_FILES) {
    copyFileSync(join(HOKUSAI_PKG_DIRECTORY, name), join(pkgDirectory, name));
  }
}

function encodeSingleByteCustomSection(text) {
  const encoded = Buffer.from(text);
  const payloadLength = encoded.length + 2;
  if (payloadLength >= 128) {
    throw new Error("Test custom section must fit in one-byte LEB128.");
  }
  return Buffer.concat([
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    Buffer.from([0x00, payloadLength, 0x01, 0x78]),
    encoded,
  ]);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Studio Hokusai WASM checked-in artifact gate", () => {
  it("binds source inputs and generated outputs to a pinned toolchain manifest", () => {
    const result = verifyCheckedInHokusaiArtifacts();
    const manifest = renderIntegrityManifest();

    expect(result.wasmBytes).toBeGreaterThan(1_000);
    expect(manifest).toContain("# rustc 1.97.1");
    expect(manifest).toContain("# cargo 1.97.1");
    expect(manifest).toContain("# wasm-pack 0.15.0");
    expect(manifest).toContain("# wasm-bindgen 0.2.123");
    expect(manifest).toContain("source/Cargo.lock");
    expect(manifest).toContain("source/LICENSE-UNICODE");
    expect(manifest).toContain("pkg/LICENSE-UNICODE");
    expect(manifest).toContain("pkg/studio_hokusai_wasm_bg.wasm");
    expect(manifest).toContain("policy/package.json");
    expect(manifest).toContain(
      "policy/scripts/verify-studio-hokusai-wasm.mjs",
    );
  });

  it("rejects a modified checked-in package artifact", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "toonspectrum-hokusai-integrity-test-"),
    );
    temporaryDirectories.push(directory);
    const pkgDirectory = join(directory, "pkg");
    copyCheckedPackage(pkgDirectory);
    appendFileSync(
      join(pkgDirectory, "studio_hokusai_wasm.js"),
      "\n// unexpected mutation\n",
      "utf8",
    );

    expect(() =>
      verifyCheckedInHokusaiArtifacts({
        packageDirectory: HOKUSAI_PACKAGE_DIRECTORY,
        pkgDirectory,
        integrityManifestPath: join(
          pkgDirectory,
          basename(HOKUSAI_INTEGRITY_MANIFEST_PATH),
        ),
      }),
    ).toThrow("do not match INTEGRITY.sha256");
  });

  it("rejects unreviewed nested package entries before sealing", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "toonspectrum-hokusai-file-set-test-"),
    );
    temporaryDirectories.push(directory);
    const pkgDirectory = join(directory, "pkg");
    copyCheckedPackage(pkgDirectory);
    mkdirSync(join(pkgDirectory, "snippets"));

    expect(() =>
      verifyCheckedInHokusaiArtifacts({
        packageDirectory: HOKUSAI_PACKAGE_DIRECTORY,
        pkgDirectory,
        integrityManifestPath: join(
          pkgDirectory,
          basename(HOKUSAI_INTEGRITY_MANIFEST_PATH),
        ),
      }),
    ).toThrow("only reviewed top-level regular files");
  });

  it("rejects a valid WASM module that exposes a local build path", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "toonspectrum-hokusai-path-test-"),
    );
    temporaryDirectories.push(directory);
    const wasmPath = join(directory, "path-leak.wasm");
    writeFileSync(
      wasmPath,
      encodeSingleByteCustomSection("/Users/example/private/source.rs"),
    );

    expect(() => assertSafeHokusaiWasmBinary(wasmPath)).toThrow(
      "contains a forbidden local build path marker",
    );
  });

  it("builds from an allowlisted, offline and path-remapped environment", () => {
    const buildDirectory = mkdtempSync(
      join(tmpdir(), "toonspectrum-hokusai-env-test-"),
    );
    temporaryDirectories.push(buildDirectory);
    const environment = createHokusaiReleaseBuildEnvironment({
      buildDirectory,
      cargo: "/toolchain/bin/cargo",
      rustc: "/toolchain/bin/rustc",
      wasmPack: "/tools/bin/wasm-pack",
      sourceEnvironment: {
        HOME: "/home/release-user",
        CARGO_HOME: "/home/release-user/.cargo",
        RUSTUP_HOME: "/home/release-user/.rustup",
        SECRET_THAT_MUST_NOT_LEAK: "sensitive",
      },
    });

    expect(environment.SECRET_THAT_MUST_NOT_LEAK).toBeUndefined();
    expect(environment.CARGO_NET_OFFLINE).toBe("true");
    expect(environment.CARGO_INCREMENTAL).toBe("0");
    expect(environment.RUSTC).toBe("/toolchain/bin/rustc");
    expect(environment.CARGO_TARGET_DIR).toBe(join(buildDirectory, "target"));
    expect(environment.TMPDIR).toBe(join(buildDirectory, "tmp"));
    expect(environment.CARGO_ENCODED_RUSTFLAGS).toContain(
      `${buildDirectory}=/toonspectrum-build/session`,
    );
    expect(environment.CARGO_ENCODED_RUSTFLAGS).toContain(
      "/home/release-user/.cargo=/toonspectrum-build/cargo-home",
    );
    expect(environment.CARGO_ENCODED_RUSTFLAGS).not.toContain(
      "/toonspectrum-build/source-",
    );
  });
});
