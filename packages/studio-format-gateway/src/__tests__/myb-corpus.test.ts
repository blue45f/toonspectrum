import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { importMybBrush } from "../myb";

/**
 * Corpus guard for the `.myb` disposition contract.
 *
 * The unit suite proves the rules on synthetic documents; this file proves
 * they hold for every REAL brush committed under tests/corpus/brushes/myb.
 * The regression it exists to catch: the importer used to read a key
 * (`dabs_per_radius`) that libmypaint never emits, so every corpus brush
 * silently fell back to the 10% default spacing.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");

function collectMybFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectMybFiles(full));
    else if (entry.name.endsWith(".myb")) found.push(full);
  }
  return found.sort();
}

const CORPUS_FILES = collectMybFiles(CORPUS_DIR);

function importCorpus(path: string): ReturnType<typeof importMybBrush> {
  const id = relative(CORPUS_DIR, path);
  return importMybBrush(new Uint8Array(readFileSync(path)), id, id);
}

describe("myb corpus disposition contract", () => {
  it("has a non-empty committed corpus to guard", () => {
    expect(CORPUS_FILES.length).toBeGreaterThan(0);
  });

  it.each(CORPUS_FILES.map((path) => [relative(CORPUS_DIR, path), path]))(
    "%s classifies every setting it declares",
    (_name, path) => {
      const result = importCorpus(path);
      const declared = Object.keys(result.document.settings).sort();

      // 1. one report per declared setting, sorted, no extras, no gaps.
      expect(result.settingReports.map((report) => report.setting)).toEqual(declared);

      // 2. nothing in a real brush is "recognised as not representable".
      expect(
        result.settingReports.filter((report) => report.disposition === "unsupported"),
      ).toEqual([]);

      // 3. no name is claimed by both buckets.
      const mapped = result.settingReports
        .filter((report) => report.disposition.startsWith("mapped-"))
        .map((report) => report.setting);
      expect(result.unmappedSettings.filter((name) => mapped.includes(name))).toEqual([]);
      expect(result.unmappedSettings).toEqual([...result.unmappedSettings].sort());
      expect([...mapped, ...result.unmappedSettings].sort()).toEqual(declared);

      // 4. deterministic: identical bytes → identical reports.
      expect(JSON.stringify(importCorpus(path).settingReports)).toBe(
        JSON.stringify(result.settingReports),
      );
    },
  );

  it("derives wash-soft spacing from dabs_per_actual_radius, not the 10% default", () => {
    const result = importCorpus(join(CORPUS_DIR, "wash-soft.myb"));
    expect(result.document.settings["dabs_per_actual_radius"]?.base_value).toBe(3.4);
    // 100 / (2 × 3.4) = 14.7 → 15.
    expect(result.preset.tip.spacingPct).toBe(15);
    expect(result.preset.tip.spacingPct).not.toBe(10);
  });

  it("derives ink-crisp spacing from its own dabs_per_actual_radius", () => {
    const result = importCorpus(join(CORPUS_DIR, "ink-crisp.myb"));
    const dabs = result.document.settings["dabs_per_actual_radius"]?.base_value ?? 0;
    expect(dabs).toBeGreaterThan(0);
    expect(result.preset.tip.spacingPct).toBe(Math.round(100 / (2 * dabs)));
    expect(result.preset.tip.spacingPct).not.toBe(10);
  });

  it("treats smudge as an applied summary everywhere it appears", () => {
    const withSmudge = CORPUS_FILES.map(importCorpus).filter(
      (result) => result.document.settings["smudge"] !== undefined,
    );
    expect(withSmudge.length).toBeGreaterThan(0);
    for (const result of withSmudge) {
      const report = result.settingReports.find((entry) => entry.setting === "smudge");
      expect(report?.disposition).toBe("mapped-summary");
      expect(result.unmappedSettings).not.toContain("smudge");
    }
  });
});
