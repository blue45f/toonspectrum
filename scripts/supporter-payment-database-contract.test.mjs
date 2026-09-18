import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  buildFeedbackCapabilitySql,
  buildFeedbackRuntimeAclSql,
} from "./feedback-database-contract.mjs";

const migration = readFileSync(
  new URL("../apps/api/src/db/migrations/0071_supporter_payments.sql", import.meta.url),
  "utf8",
);
const manifest = readFileSync(
  new URL("./production-database-migrations.manifest", import.meta.url),
  "utf8",
).trim().split(/\r?\n/u);

test("supporter payment migration is private, bounded, and forward-only", () => {
  for (const fragment of [
    "CREATE TABLE IF NOT EXISTS public.supporter_payment",
    "CREATE TABLE IF NOT EXISTS public.supporter_funding_setting",
    "supporter_payment_balance_check",
    "supporter_payment_public_fields_check",
    "idx_supporter_payment_public_wall",
    "REVOKE ALL ON TABLE public.supporter_payment FROM PUBLIC",
    "REVOKE ALL ON TABLE public.supporter_funding_setting FROM PUBLIC",
  ]) {
    expect(migration).toContain(fragment);
  }
  expect(migration).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/u);
  expect(migration).not.toMatch(/\b(?:cardNumber|accountPassword|refundAccount|bankAuthentication)\b/iu);
  expect(migration).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});

test("supporter migration remains managed exactly once", () => {
  expect(
    manifest.filter((entry) => entry.endsWith("0071_supporter_payments.sql")),
  ).toHaveLength(1);
  expect(manifest.indexOf("apps/api/src/db/migrations/0071_supporter_payments.sql"))
    .toBeLessThan(manifest.indexOf("apps/api/src/db/migrations/0070_commerce_payments.sql"));
});

test("runtime role cannot delete or administer supporter payment tables", () => {
  const grant = buildFeedbackRuntimeAclSql("toonspectrum_runtime");
  const capability = buildFeedbackCapabilitySql("toonspectrum_runtime");

  expect(grant).toContain(
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.supporter_payment TO "toonspectrum_runtime"',
  );
  expect(grant).toContain(
    'GRANT SELECT, UPDATE ON TABLE public.supporter_funding_setting TO "toonspectrum_runtime"',
  );
  expect(grant).not.toMatch(/GRANT[^;]*DELETE[^;]*supporter_(?:payment|funding_setting)/u);
  expect(grant).not.toMatch(
    /GRANT[^;]*(?:TRUNCATE|REFERENCES|TRIGGER)[^;]*supporter_(?:payment|funding_setting)/u,
  );
  expect(capability).toContain("public.supporter_payment");
  expect(capability).toContain("public.supporter_funding_setting");
  expect(capability).toContain("balanceAmount");
  expect(capability).toContain("showAmount");
  expect(capability).toContain("showMessage");
  expect(capability).toContain("publicHidden");
});
