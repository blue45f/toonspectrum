import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  buildFeedbackCapabilitySql,
  buildFeedbackRuntimeAclSql,
} from "./feedback-database-contract.mjs";

const migration = readFileSync(
  new URL("../apps/api/src/db/migrations/0073_commerce_payments.sql", import.meta.url),
  "utf8",
);

test("commerce migration is private, bounded, and does not persist payment credentials", () => {
  for (const fragment of [
    "CREATE TABLE IF NOT EXISTS public.commerce_product_price",
    "CREATE TABLE IF NOT EXISTS public.commerce_order",
    "CREATE TABLE IF NOT EXISTS public.commerce_entitlement",
    "CREATE TABLE IF NOT EXISTS public.commerce_payment_event",
    "REVOKE ALL ON TABLE public.commerce_order FROM PUBLIC",
  ]) {
    expect(migration).toContain(fragment);
  }
  expect(migration).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/u);
  expect(migration).not.toMatch(
    /\b(?:cardNumber|accountPassword|bankAuthentication|cvv|cvc)\b/iu,
  );
  expect(migration).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});
test("commerce runtime ACL supports payment flow without destructive privileges", () => {
  const grant = buildFeedbackRuntimeAclSql("toonspectrum_runtime");
  const capability = buildFeedbackCapabilitySql("toonspectrum_runtime");

  expect(grant).toContain(
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.commerce_product_price, public.commerce_order, public.commerce_entitlement TO "toonspectrum_runtime"',
  );
  expect(grant).toContain(
    'GRANT SELECT, INSERT ON TABLE public.commerce_payment_event TO "toonspectrum_runtime"',
  );
  expect(grant).not.toMatch(/GRANT[^;]*DELETE[^;]*commerce_/u);
  expect(grant).not.toMatch(
    /GRANT[^;]*(?:TRUNCATE|REFERENCES|TRIGGER)[^;]*commerce_/u,
  );
  for (const fragment of [
    "public.commerce_product_price",
    "public.commerce_order",
    "public.commerce_entitlement",
    "public.commerce_payment_event",
    "createIdempotencyKey",
    "payloadHash",
  ]) {
    expect(capability).toContain(fragment);
  }
});

