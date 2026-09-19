import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

describe("pigment dependency install policy", () => {
  it("explicitly denies the unnecessary core-js postinstall without enabling unreviewed scripts", () => {
    const workspace = parse(read("pnpm-workspace.yaml"));
    expect(workspace.allowBuilds["core-js"]).toBe(false);
    expect(workspace.onlyBuiltDependencies).not.toContain("core-js");
    expect(workspace.allowBuilds["@firebase/util"]).toBe(false);
    expect(workspace.allowBuilds.protobufjs).toBe(false);
    expect(workspace.allowBuilds.esbuild).toBe(true);
    expect(workspace.allowBuilds.workerd).toBe(true);
  });

  it("keeps the reviewed pigment dependencies exactly pinned", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.dependencies["spectral.js"]).toBe("3.0.0");
    expect(manifest.dependencies.colormix).toBe("3.2.0");
  });
});
