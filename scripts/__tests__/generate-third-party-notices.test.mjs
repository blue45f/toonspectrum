import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  isRecoverablePnpmLicenseInventoryError,
  parsePnpmLicenseInventory,
  readFilesystemLicenseInventory,
  readResolvedLicenseInventory,
} from "../generate-third-party-notices.mjs";

const REPOSITORY_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "generate-third-party-notices.mjs",
);

describe("generated third-party notice inventory", () => {
  it("only treats pnpm's missing cached package index as recoverable", () => {
    expect(
      isRecoverablePnpmLicenseInventoryError({
        stdout: JSON.stringify({
          error: {
            code: "ERR_PNPM_MISSING_PACKAGE_INDEX_FILE",
            message: "Failed to find package index",
          },
        }),
      }),
    ).toBe(true);
    expect(
      isRecoverablePnpmLicenseInventoryError({
        stderr: "ERR_PNPM_OUTDATED_LOCKFILE",
      }),
    ).toBe(false);
  });

  it("falls back only for the exact recoverable pnpm cache error", () => {
    const fallback = readResolvedLicenseInventory({
      runPnpmLicenseList: () => {
        throw Object.assign(new Error("pnpm failed"), {
          stdout: Buffer.from(
            JSON.stringify({
              error: {
                code: "ERR_PNPM_MISSING_PACKAGE_INDEX_FILE",
                message: "missing package index",
              },
            }),
          ),
        });
      },
    });

    expect(fallback.length).toBeGreaterThan(500);
    expect(() =>
      readResolvedLicenseInventory({
        runPnpmLicenseList: () => {
          throw Object.assign(new Error("pnpm failed"), {
            stderr: Buffer.from("ERR_PNPM_OUTDATED_LOCKFILE"),
          });
        },
      }),
    ).toThrow("pnpm failed");
  });

  it("rejects unreviewed license expressions from pnpm", () => {
    expect(() =>
      parsePnpmLicenseInventory(
        JSON.stringify({
          Proprietary: [
            {
              name: "unexpected-package",
              versions: ["1.0.0"],
              paths: ["/tmp/unexpected-package"],
            },
          ],
        }),
      ),
    ).toThrow("Unreviewed production license expression");
  });

  it("keeps the reviewed p5.brush standalone dependency licenses auditable", () => {
    const inventory = parsePnpmLicenseInventory(
      JSON.stringify({
        MIT: [
          {
            name: "p5.brush",
            versions: ["2.2.1"],
            paths: ["/tmp/p5-brush"],
          },
        ],
        "LGPL-2.1": [
          {
            name: "p5",
            versions: ["2.3.1"],
            paths: ["/tmp/p5"],
          },
        ],
        "SGI-B-2.0": [
          {
            name: "libtess",
            versions: ["1.2.2"],
            paths: ["/tmp/libtess"],
          },
        ],
      }),
    );

    expect(inventory.map(({ name, license }) => [name, license])).toEqual([
      ["libtess", "SGI-B-2.0"],
      ["p5", "LGPL-2.1"],
      ["p5.brush", "MIT"],
    ]);
  });

  it("accepts the reviewed dual-license expression used by Hokusai WASM", () => {
    const inventory = parsePnpmLicenseInventory(
      JSON.stringify({
        "MIT OR Apache-2.0": [
          {
            name: "dual-licensed-wasm-provider",
            versions: ["0.3.0"],
            paths: ["/tmp/dual-licensed-wasm-provider"],
          },
        ],
      }),
    );

    expect(inventory[0]).toMatchObject({
      name: "dual-licensed-wasm-provider",
      license: "MIT OR Apache-2.0",
    });
  });

  it("reconstructs a complete reviewed production graph from installed packages", () => {
    const inventory = readFilesystemLicenseInventory();

    expect(inventory.length).toBeGreaterThan(500);
    expect(
      inventory.every(
        (entry) =>
          entry.versions.length > 0
          && entry.paths.length > 0
          && entry.paths.every((path) => existsSync(join(path, "package.json"))),
      ),
    ).toBe(true);
    expect(
      inventory.some(
        (entry) =>
          entry.name === "@dimforge/rapier3d-deterministic-compat"
          && entry.versions.includes("0.19.3")
          && entry.license === "Apache-2.0",
      ),
    ).toBe(true);
  });

  it("passes the full legal audit without pnpm's package index", () => {
    const output = execFileSync(
      process.execPath,
      [
        SCRIPT_PATH,
        "--check",
        "--inventory-source",
        "filesystem",
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
      },
    );

    expect(output).toMatch(
      /^License audit passed \(\d+ entries, \d+ license texts, \d+ packages without a root license file\)\.\n$/u,
    );
  });

  it("writes the complete pinned Hokusai Rust/WASM inventory and notices", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "toonspectrum-third-party-notice-test-"),
    );
    const outputPath = join(directory, "THIRD_PARTY_NOTICES.generated.md");
    try {
      execFileSync(
        process.execPath,
        [
          SCRIPT_PATH,
          "--output",
          outputPath,
          "--inventory-source",
          "filesystem",
        ],
        {
          cwd: REPOSITORY_ROOT,
          encoding: "utf8",
        },
      );
      const notice = readFileSync(outputPath, "utf8");
      expect(notice).toContain("## Pinned Hokusai Rust/WASM inventory");
      expect(notice).toContain(
        "| `hokusai-core` | 0.3.0 | MIT OR Apache-2.0 |",
      );
      expect(notice).toContain(
        "| `wasm-bindgen` | 0.2.123 | MIT OR Apache-2.0 |",
      );
      expect(notice).toContain(
        "Copyright (c) 2026 Re:Earth and contributors",
      );
      expect(notice).toContain("Copyright (c) 2014 Alex Crichton");
      expect(notice).toContain("UNICODE LICENSE V3");
      expect(notice).toContain("Copyright © 1991-2023 Unicode, Inc.");
      expect(notice).toContain(
        "33d9a6fa21ca4fa711da7066655aa2ba854545ee",
      );
      expect(notice).toContain(
        "sha512-lw6/vOl86+CkJ8d3V01mlbGAC0A49gc1HbwGcqGeKjk5SGRLiF15jyUuA8aYEvizcPNTu4Ta4A+Ut2DJgsa7AQ==",
      );
      expect(notice).toContain(
        "6cc2f3fa1611d32ad7563f7092aa1bf58741124302630cef7d21561ecd7b7284",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
