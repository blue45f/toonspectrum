import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const gateScript = path.join(repoRoot, "scripts", "check-studio-bundle.mjs");
const baselineFile = path.join(repoRoot, "scripts", "bundle-baseline.json");
const gateSource = readFileSync(gateScript, "utf8");
const distManifest = path.join(repoRoot, "dist", ".vite", "manifest.json");

/**
 * The gate needs a production build. `pnpm run ci` runs Vitest before `build`,
 * so the integration half of this suite has to stand down when dist/ is absent
 * rather than fail a green tree.
 */
const hasProductionBuild = existsSync(distManifest);

function runGate(baselinePath, extraArgs = []) {
  try {
    const stdout = execFileSync(process.execPath, [gateScript, ...extraArgs], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, STUDIO_BUNDLE_BASELINE: baselinePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }
}

describe("studio bundle ratchet gate", () => {
  it("fails the build on regression instead of only observing it", () => {
    // The pre-2026-08-08 gate printed 12 overruns and still exited 0. Whatever
    // else changes, a measurement that grows past its recorded baseline has to
    // reach fail().
    expect(gateSource).toContain("function evaluateRatchet(");
    expect(gateSource).toMatch(/REGRESSED/u);
    const enforcement = gateSource.slice(gateSource.indexOf("for (const row of regressions)"));
    expect(enforcement).toContain("fail(");
    expect(enforcement).toContain("regressed to");
  });

  it("keeps reference budgets advisory and the baseline authoritative", () => {
    // Both statements must stay true at once: the 2026-07-27 quality-first
    // policy (bytes are telemetry) and the ratchet (worsening is a veto).
    expect(gateSource).toContain("telemetry, not release vetoes");
    expect(gateSource).toContain("references are telemetry, not release vetoes");
    expect(gateSource).toContain("UPDATE_BUNDLE_BASELINE");
    expect(gateSource).toContain("TIGHTEN_BUNDLE_BASELINE");
  });

  it("measures eager-dynamic chunks in a browser rather than trusting the manifest", () => {
    // checkDynamicBoundary only proves "absent from the static graph", which a
    // mount-time await satisfies. Only a real load can tell the difference.
    expect(gateSource).toContain("async function probeRuntimeStartup(");
    expect(gateSource).toContain("eager-dynamic requests");
    expect(gateSource).toContain("eager-dynamic decoded bytes");
    expect(gateSource).toMatch(/--runtime/u);
  });

  it("ships a committed baseline with plausible measurements", () => {
    expect(existsSync(baselineFile)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
    expect(baseline.schema).toBe("toonspectrum.bundle-baseline/1");
    expect(Object.keys(baseline.static).length).toBeGreaterThan(10);
    for (const [key, value] of Object.entries(baseline.static)) {
      expect(typeof value, `${key} must be numeric`).toBe("number");
      expect(value, `${key} must be positive`).toBeGreaterThan(0);
    }
    expect(baseline.static["Studio route raw"]).toBeGreaterThan(
      baseline.static["StudioPage entry raw"],
    );
    expect(baseline.runtime.metrics["eager-dynamic requests"]).toBeGreaterThan(0);
    expect(baseline.runtime.eagerDynamicChunks.length).toBe(
      baseline.runtime.metrics["eager-dynamic requests"],
    );
  });

  describe.skipIf(!hasProductionBuild)("against the current production build", () => {
    it("passes its own recorded baseline", () => {
      const result = runGate(baselineFile);
      expect(result.stdout).toContain("within baseline");
      expect(result.stdout).not.toContain("REGRESSED");
      expect(result.stderr).not.toContain("regressed to");
    }, 120_000);

    it("exits non-zero when a measurement grows past the baseline", () => {
      const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
      baseline.static["Studio route raw"] = Math.round(
        baseline.static["Studio route raw"] * 0.5,
      );
      const directory = mkdtempSync(path.join(tmpdir(), "studio-bundle-ratchet-"));
      const tightened = path.join(directory, "bundle-baseline.json");
      writeFileSync(tightened, JSON.stringify(baseline, null, 2));

      const result = runGate(tightened);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Studio route raw regressed to");
      expect(result.stderr).toContain("UPDATE_BUNDLE_BASELINE=1");
    }, 120_000);

    it("refuses to run without a baseline instead of silently passing", () => {
      const directory = mkdtempSync(path.join(tmpdir(), "studio-bundle-ratchet-"));
      const result = runGate(path.join(directory, "absent-baseline.json"));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("UPDATE_BUNDLE_BASELINE=1");
    }, 120_000);
  });
});
