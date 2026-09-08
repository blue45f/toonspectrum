import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifySecurityAdvisoryExceptions } from "./verify-security-advisory-exceptions.mjs";

const roots = [];

function fixture(auditConfig) {
  const root = mkdtempSync(join(tmpdir(), "toonspectrum-advisory-"));
  roots.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), JSON.stringify({ packages: ["."], auditConfig }));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("security advisory audit coverage", () => {
  it.each([undefined, {}, { ignoreGhsas: [] }, { ignoreCves: [] }])(
    "accepts audits without excluded findings: %j", (auditConfig) => {
      expect(verifySecurityAdvisoryExceptions({ root: fixture(auditConfig) })).toEqual({ ignoredGhsas: [] });
    },
  );

  it.each([
    { ignoreGhsas: ["GHSA-qwww-vcr4-c8h2"] },
    { ignoreCves: ["CVE-2026-0000"] },
    { ignoreGhsas: "GHSA-qwww-vcr4-c8h2" },
    { ignoreGhsas: null },
  ])("rejects hidden advisories or malformed exclusions: %j", (auditConfig) => {
    expect(() => verifySecurityAdvisoryExceptions({ root: fixture(auditConfig) }))
      .toThrow("Security advisory exceptions are not permitted");
  });
});
