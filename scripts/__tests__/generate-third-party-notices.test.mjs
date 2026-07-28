import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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
        stderr:
          "ERR_PNPM_MISSING_PACKAGE_INDEX_FILE Failed to find package index",
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
          stderr: Buffer.from(
            "ERR_PNPM_MISSING_PACKAGE_INDEX_FILE missing package index",
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
});
