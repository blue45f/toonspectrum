/**
 * Full §6 SSOT coverage matrix (all catalog IDs) for verification evidence.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { exerciseStudioDccCatalogFeature } from "./studio-dcc-catalog-feature-dispatch";
import { STUDIO_DCC_SECTION6_CATALOG } from "./studio-dcc-section6-full-catalog";

const SCRATCH =
  process.env.GROK_SCRATCH
  ?? "/var/folders/xp/79glmmbj6970d74hvkgd4pg00000gp/T/grok-goal-0681ff1b1864/implementer";

describe("section6 full coverage matrix", () => {
  it("writes full SSOT matrix with exercise evidence keys for all IDs", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const lines = ["id\tstatus\tmodule\tapis\tpriority\tevidenceKeys\tnumericCount\tok"];
    let fails = 0;
    for (const entry of STUDIO_DCC_SECTION6_CATALOG) {
      const r = await exerciseStudioDccCatalogFeature(entry.id);
      const numeric = Object.entries(r.evidence).filter(
        ([, v]) => typeof v === "number" && Number.isFinite(v as number),
      );
      const keys = Object.keys(r.evidence).join(",");
      const ok = r.ok && numeric.length > 0;
      if (!ok) fails += 1;
      lines.push(
        [
          entry.id,
          entry.status,
          entry.module,
          entry.apis.join("|"),
          entry.priority,
          keys,
          String(numeric.length),
          ok ? "pass" : "fail",
        ].join("\t"),
      );
    }
    // Merge domain-ops detail columns if present
    const path = resolve(SCRATCH, "section6-coverage-matrix.tsv");
    writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
    expect(lines.length - 1).toBe(STUDIO_DCC_SECTION6_CATALOG.length);
    expect(fails).toBe(0);
    // Keep domain-ops log intact
    const upgrade = resolve(SCRATCH, "lite-ops-upgrade.log");
    expect(readFileSync(upgrade, "utf8")).toMatch(/count=44/u);
  }, 180_000);
});
