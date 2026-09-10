import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const workspace = parse(readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8"));
const lock = parse(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"));
const overrideKey = "smol-toml@>=1.0.0 <1.7.1";

function isVulnerableSmolTomlKey(key) {
  const match = /^smol-toml@(\d+)\.(\d+)\.(\d+)$/.exec(key);
  if (!match) return false;
  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  return major < 1 || (major === 1 && (minor < 7 || (minor === 7 && patch === 0)));
}

describe("smol-toml security floor", () => {
  it("pins the current patched floor in workspace and frozen lock metadata", () => {
    expect(workspace.overrides?.[overrideKey]).toBe("1.7.1");
    expect(lock.overrides?.[overrideKey]).toBe("1.7.1");
  });

  it("keeps vulnerable smol-toml releases out of the resolved package graph", () => {
    const packageKeys = Object.keys(lock.packages ?? {});
    const snapshotKeys = Object.keys(lock.snapshots ?? {});
    expect(packageKeys.filter(isVulnerableSmolTomlKey)).toEqual([]);
    expect(snapshotKeys.filter(isVulnerableSmolTomlKey)).toEqual([]);
  });
});
