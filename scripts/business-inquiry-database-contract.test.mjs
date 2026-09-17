import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  buildFeedbackCapabilitySql,
  buildFeedbackRuntimeAclSql,
} from "./feedback-database-contract.mjs";

const migration = readFileSync(
  new URL("../apps/api/src/db/migrations/0068_business_inquiries.sql", import.meta.url),
  "utf8",
);
const manifest = readFileSync(
  new URL("./production-database-migrations.manifest", import.meta.url),
  "utf8",
).trim().split(/\r?\n/u);

test("business inquiry migration is forward-only, private, and bounded", () => {
  for (const fragment of [
    "CREATE TABLE IF NOT EXISTS public.business_inquiry",
    "business_inquiry_type_check",
    "business_inquiry_status_check",
    "idx_business_inquiry_status_created",
    "idx_business_inquiry_fingerprint_created",
    "REVOKE ALL ON TABLE public.business_inquiry FROM PUBLIC",
  ]) {
    expect(migration).toContain(fragment);
  }
  expect(migration).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/u);
  expect(migration).not.toMatch(/\b(?:ip_address|ipAddress|userAgent)\b/u);
  expect(migration).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});

test("business inquiry migration is the next managed migration only once", () => {
  expect(manifest.at(-1)).toBe("apps/api/src/db/migrations/0068_business_inquiries.sql");
  expect(manifest.filter((entry) => entry.endsWith("0068_business_inquiries.sql"))).toHaveLength(1);
});

test("runtime role can only read, create and update private business inquiries", () => {
  const grant = buildFeedbackRuntimeAclSql("toonspectrum_runtime");
  const capability = buildFeedbackCapabilitySql("toonspectrum_runtime");

  expect(grant).toContain("REVOKE ALL ON TABLE public.business_inquiry FROM PUBLIC");
  expect(grant).toContain(
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.business_inquiry TO "toonspectrum_runtime"',
  );
  expect(grant).not.toMatch(/GRANT[^;]*DELETE[^;]*business_inquiry/u);
  expect(grant).not.toMatch(/GRANT[^;]*(?:TRUNCATE|REFERENCES|TRIGGER)[^;]*business_inquiry/u);
  expect(capability).toContain("public.business_inquiry");
  expect(capability).toContain("consentVersion");
  expect(capability).toContain("fingerprint");
});
