import { mkdirSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { exerciseStudioDccCatalogFeature } from "./studio-dcc-catalog-feature-dispatch";

const SCRATCH =
  process.env.GROK_SCRATCH
  ?? process.env.SCRATCH
  ?? "/var/folders/xp/79glmmbj6970d74hvkgd4pg00000gp/T/grok-goal-0f3581dcd4da/implementer";

const HIGH = [
  "MOD-014",
  "CHR-012",
  "CAD-006",
  "CAD-008",
  "CAD-016",
  "CAD-018",
  "CAD-019",
  "SCP-006",
  "SCP-014",
  "DRW-007",
] as const;

describe("goal high-risk spotcheck", () => {
  it("MOD-014/CHR-012 and residual industrial IDs succeed with real metrics", async () => {
    const lines: string[] = ["# high-risk spotcheck"];
    mkdirSync(SCRATCH, { recursive: true });
    for (const id of HIGH) {
      const r = await exerciseStudioDccCatalogFeature(id);
      expect(r.ok).toBe(true);
      expect(r.evidence.ok).not.toBe(false);
      if (id === "MOD-014") {
        // Real unit-cube Manifold (or viable solid) difference — not 2-face pure-convex garbage.
        expect(r.evidence.solidViable).toBe(true);
        expect(Number(r.evidence.faces)).toBeGreaterThanOrEqual(8);
        expect(Number(r.evidence.tris)).toBeGreaterThanOrEqual(12);
        expect(Number(r.evidence.faces)).toBeGreaterThan(Number(r.evidence.facesBefore) / 2);
        expect(String(r.evidence.backend)).toMatch(/manifold|default/u);
      }
      if (id === "CHR-012") {
        expect(r.evidence.ok).toBe(true);
        expect(Number(r.evidence.missing)).toBe(0);
      }
      if (id === "SCP-006") {
        expect(Number(r.evidence.boundaryAfterRefine)).toBe(0);
      }
      lines.push(
        `${id} ok faces=${r.evidence.faces ?? r.evidence.facesAfter ?? r.evidence.bodyFaces ?? r.evidence.meshTriangleCount} tris=${r.evidence.tris ?? "-"} backend=${r.evidence.backend ?? "-"} missing=${r.evidence.missing ?? "-"}`,
      );
    }
    writeFileSync(`${SCRATCH}/high-risk-spotcheck.log`, lines.join("\n") + "\n");
  }, 180_000);
});
