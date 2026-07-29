import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOKUSAI_PACKAGE_DIRECTORY,
  HOKUSAI_RUST_LOCK_CHECKSUMS,
  HOKUSAI_RUST_DEPENDENCY_POLICY,
  parseCargoLockPackages,
  validateHokusaiReleaseContract,
} from "../studio-hokusai-wasm-release-contract.mjs";

describe("Studio Hokusai Rust/WASM release contract", () => {
  it("pins the complete reviewed Cargo graph and exact engine bridge versions", () => {
    const inventory = validateHokusaiReleaseContract();

    expect(inventory).toHaveLength(HOKUSAI_RUST_DEPENDENCY_POLICY.length);
    expect(Object.keys(HOKUSAI_RUST_LOCK_CHECKSUMS)).toHaveLength(
      HOKUSAI_RUST_DEPENDENCY_POLICY.length,
    );
    expect(
      inventory
        .filter(({ name }) => name.startsWith("hokusai-"))
        .map(({ name, version, license }) => [name, version, license]),
    ).toEqual([
      ["hokusai-brush", "0.3.0", "MIT OR Apache-2.0"],
      ["hokusai-core", "0.3.0", "MIT OR Apache-2.0"],
      ["hokusai-tile-mem", "0.3.0", "MIT OR Apache-2.0"],
    ]);
    expect(
      inventory
        .filter(({ name }) => name.startsWith("wasm-bindgen"))
        .every(
          ({ version, license, checksum }) =>
            version === "0.2.123"
            && license === "MIT OR Apache-2.0"
            && /^[0-9a-f]{64}$/u.test(checksum),
        ),
    ).toBe(true);
  });

  it("parses the Cargo v4 lock graph without dropping duplicate crate versions", () => {
    const packages = parseCargoLockPackages(
      readFileSync(join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.lock"), "utf8"),
    );

    expect(
      packages.filter(({ name }) => name === "syn").map(({ version }) => version),
    ).toEqual(["2.0.119", "3.0.3"]);
    expect(
      packages.find(({ name }) => name === "hokusai-brush"),
    ).toMatchObject({
      version: "0.3.0",
      source: "registry+https://github.com/rust-lang/crates.io-index",
      checksum:
        "553185ffcdcf55251cd02a2d0be297cd2ac0bf9f8fae50cffb70ddbadc70fee4",
    });
  });

  it("fails closed when a direct Cargo pin is relaxed", () => {
    const manifestText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.toml"),
      "utf8",
    );
    const lockText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.lock"),
      "utf8",
    );

    expect(() =>
      validateHokusaiReleaseContract({
        manifestText: manifestText.replace(
          'hokusai-core = "=0.3.0"',
          'hokusai-core = "^0.3.0"',
        ),
        lockText,
      }),
    ).toThrow("must pin hokusai-core to =0.3.0");
  });

  it("fails closed when the locked dependency graph changes", () => {
    const manifestText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.toml"),
      "utf8",
    );
    const lockText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.lock"),
      "utf8",
    );

    expect(() =>
      validateHokusaiReleaseContract({
        manifestText,
        lockText: lockText.replace('version = "3.20.3"', 'version = "3.20.4"'),
      }),
    ).toThrow("Cargo.lock Rust dependency graph changed");
  });

  it("fails closed when a crate source is redirected to another registry", () => {
    const manifestText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.toml"),
      "utf8",
    );
    const lockText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.lock"),
      "utf8",
    );

    expect(() =>
      validateHokusaiReleaseContract({
        manifestText,
        lockText: lockText.replace(
          "registry+https://github.com/rust-lang/crates.io-index",
          "registry+https://example.invalid/crates.io-index",
        ),
      }),
    ).toThrow("source differs from the reviewed crates.io registry");
  });

  it("fails closed when a syntactically valid crate checksum changes", () => {
    const manifestText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.toml"),
      "utf8",
    );
    const lockText = readFileSync(
      join(HOKUSAI_PACKAGE_DIRECTORY, "Cargo.lock"),
      "utf8",
    );

    expect(() =>
      validateHokusaiReleaseContract({
        manifestText,
        lockText: lockText.replace(
          HOKUSAI_RUST_LOCK_CHECKSUMS["bumpalo@3.20.3"],
          "0".repeat(64),
        ),
      }),
    ).toThrow("checksum differs from the reviewed value");
  });
});
