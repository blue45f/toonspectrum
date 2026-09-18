import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  buildFeedbackCapabilitySql,
  buildFeedbackRuntimeAclSql,
} from "./feedback-database-contract.mjs";

const migration = readFileSync(
  new URL("../apps/api/src/db/migrations/0072_creator_support_program.sql", import.meta.url),
  "utf8",
);

test("creator support migration is private, bounded, and guardian-aware", () => {
  for (const fragment of [
    "CREATE TABLE IF NOT EXISTS public.creator_support_application",
    "CREATE TABLE IF NOT EXISTS public.creator_support_offer",
    "creator_support_under14_guardian_check",
    "creator_support_guardian_check",
    "creator_support_payout_status_check",
    "REVOKE ALL ON TABLE public.creator_support_application FROM PUBLIC",
    "REVOKE ALL ON TABLE public.creator_support_offer FROM PUBLIC",
  ]) {
    expect(migration).toContain(fragment);
  }
  expect(migration).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/u);
  expect(migration).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});

test("runtime role can update support workflows without destructive table privileges", () => {
  const grant = buildFeedbackRuntimeAclSql("toonspectrum_runtime");
  const capability = buildFeedbackCapabilitySql("toonspectrum_runtime");

  expect(grant).toContain(
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.creator_support_application TO "toonspectrum_runtime"',
  );
  expect(grant).toContain(
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.creator_support_offer TO "toonspectrum_runtime"',
  );
  expect(grant).not.toMatch(/GRANT[^;]*DELETE[^;]*creator_support_/u);
  expect(grant).not.toMatch(
    /GRANT[^;]*(?:TRUNCATE|REFERENCES|TRIGGER)[^;]*creator_support_/u,
  );
  expect(capability).toContain("public.creator_support_application");
  expect(capability).toContain("public.creator_support_offer");
  expect(capability).toContain("guardianConfirmed");
  expect(capability).toContain("monetarySupportEnabled");
});
