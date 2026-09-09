import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One-shot pixel-pencil delivery automation must never ship on main. These files mutate and
 * force-push an already completed feature branch, and invalid definitions fail before GitHub can
 * create a job. Keep the production implementation and normal quality gates, not patch publishers.
 */
const OBSOLETE_RASTER_DELIVERY_FILES = Object.freeze([
  ".github/workflows/apply-studio-pixel-pencil-pro-core.yml",
  ".github/workflows/apply-studio-pixel-pencil-pro-core-v2.yml",
  ".github/workflows/apply-studio-pixel-pencil-pro-core-v3.yml",
  ".github/workflows/apply-studio-pixel-pencil-pro-combined.yml",
  ".github/workflows/verify-studio-pixel-pencil-pro.yml",
  ".github/workflows/finalize-studio-pixel-pencil-pro.yml",
  ".github/workflows/finalize-studio-pixel-pencil-pro-ready.yml",
  ".github/workflows/deliver-studio-pixel-pencil-pro.yml",
  ".github/workflows/studio-raster-precision-delivery.yml",
  ".github/workflows/raster-precision-patch-handoff.yml",
  ".github/workflows/raster-precision-compatibility-repair.yml",
  ".github/workflows/raster-precision-inspector-availability.yml",
  ".github/workflows/studio-precision-final-gate.yml",
  ".github/workflows/temp-ci-repair-publisher-20260909.yml",
  "scripts/apply-studio-pixel-pencil-pro-core.py",
  "scripts/prepare-studio-pixel-pencil-pro-core.py",
  "scripts/apply-studio-pixel-pencil-pro-ui.py",
  "scripts/prepare-studio-pixel-pencil-pro-ui.py",
] as const);

describe("Studio CI workflow hygiene", () => {
  it.each(OBSOLETE_RASTER_DELIVERY_FILES)("does not ship obsolete publisher: %s", (path) => {
    expect(existsSync(resolve(process.cwd(), path))).toBe(false);
  });
});
