import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const eslintConfigPath = join(
  process.cwd(),
  "node_modules",
  "@heejun",
  "eslint-config",
  "package.json",
);
const eslintConfigRequire = createRequire(eslintConfigPath);
const jsxA11yPath = eslintConfigRequire.resolve("eslint-plugin-jsx-a11y");
const jsxA11yRequire = createRequire(jsxA11yPath);
const minimatchPath = jsxA11yRequire.resolve("minimatch");
const minimatchRequire = createRequire(minimatchPath);
const minimatch = minimatchRequire(minimatchPath);
const braceExpansionPackage = minimatchRequire(
  minimatchRequire.resolve("brace-expansion/package.json"),
);

describe("patched minimatch 3 security compatibility", () => {
  it("keeps the callable CommonJS API consumed by eslint-plugin-jsx-a11y", () => {
    expect(typeof minimatch).toBe("function");
    expect(minimatch("Button", "Button")).toBe(true);
    expect(minimatch("Dialog.Close", "{Button,Dialog.*}")).toBe(true);
    expect(minimatch("Image", "{Button,Dialog.*}")).toBe(false);
  });

  it("uses the bounded brace-expansion 5 security release", () => {
    expect(braceExpansionPackage.version).toBe("5.0.9");
    expect(minimatch.braceExpand("panel-{1..3}")).toEqual([
      "panel-1",
      "panel-2",
      "panel-3",
    ]);
  });
});
