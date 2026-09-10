import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioHelpCenterDialog.tsx", import.meta.url),
  "utf8",
);

describe("Help Center browser storage ownership", () => {
  it("delegates quota estimation to the shared runtime boundary", () => {
    expect(source).toContain(
      'import { studioBrowserStorageEstimator } from "./studio-browser-storage-estimator";',
    );
    expect(source).toContain(
      "module.estimateStudioOpfsQuota(studioBrowserStorageEstimator())",
    );
    expect(source).not.toContain("navigator.storage");
  });
});
