import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

// Exercise emitted JavaScript, not a TS-aware source alias, in required API builds.
const require = createRequire(import.meta.url);
const {
  getStaticPolicyDocument,
  isPolicySlug,
  parsePolicyDocument,
} = require("../apps/api/dist/packages/core/src/legal-policy.js");
const {
  createPolicyResolver,
} = require("../apps/api/dist/apps/api/src/modules/legal/legal-policy-resolver.js");
const {
  LegalController,
} = require("../apps/api/dist/apps/api/src/modules/legal/legal.controller.js");

// Privacy revision 456b874bd (2026-09-18) added business-inquiry disclosures.
// Pin that reviewed version; a runtime/build repair must never rewrite the policy body.
for (const [policy, digest] of [
  ["terms-of-service", "725b4f7dff126f76bb68ed7c1c8cac1df0f69e62f536725168b28b2ef269fb73"],
  ["privacy-policy", "ad3bb0df4f268212e049aebb4ba14e4b484f23e76d2bb144d261fda87f14f5f8"],
]) {
  test(`${policy}: reviewed legal body is unchanged and its identity is stable`, () => {
    const document = getStaticPolicyDocument(policy);
    assert.equal(createHash("sha256").update(document.body).digest("hex"), digest);
    assert.equal(document.source, "static");
    if (policy === "privacy-policy") {
      assert.equal(document.versionLabel, "내장본 v2026.09.18");
      assert.equal(document.contentHash, "static-privacy-20260918-toonspectrum-business-inquiries");
    }
    assert.equal(document, getStaticPolicyDocument(policy));
    assert.equal(Object.isFrozen(document), true);
    assert.throws(() => { document.body = "changed"; }, TypeError);
  });
}

test("invalid policy paths remain 404", async () => {
  const controller = new LegalController();
  for (const value of ["unknown", "__proto__", "../privacy-policy", "Privacy-Policy"]) {
    assert.equal(isPolicySlug(value), false);
    await assert.rejects(controller.getPolicy(value), (error) => error.getStatus() === 404);
  }
});

test("the resolver returns only the bundled first-party authority and performs no external fetch", async () => {
  let externalCalls = 0;
  const read = createPolicyResolver(async () => {
    externalCalls += 1;
    throw new Error("external fetch must not run");
  });

  for (const slug of ["privacy-policy", "terms-of-service"]) {
    assert.deepEqual(await read(slug), getStaticPolicyDocument(slug));
  }
  assert.equal(externalCalls, 0);
});

test("callers receive isolated copies and cannot mutate the canonical policy", async () => {
  const read = createPolicyResolver();
  const first = await read("privacy-policy");
  first.body = "caller mutation";
  const second = await read("privacy-policy");
  assert.equal(second.body, getStaticPolicyDocument("privacy-policy").body);
  assert.notEqual(first, second);
});

test("same-origin decoding accepts only the exact bundled document", () => {
  const slug = "privacy-policy";
  const policy = getStaticPolicyDocument(slug);
  assert.equal(parsePolicyDocument(policy, slug, true), policy);
  assert.throws(() => parsePolicyDocument(policy, slug), /policy_payload_malformed/);
  for (const change of [
    { body: "changed" },
    { contentHash: "changed" },
    { versionLabel: "changed" },
    { policySlug: "terms-of-service" },
    { effectiveAt: "changed" },
    { source: "termsdesk" },
  ]) {
    assert.throws(
      () => parsePolicyDocument({ ...policy, ...change }, slug, true),
      /policy_payload_malformed/,
    );
  }
});

test("direct resolver callers cannot inject paths, URLs or prototype keys", async () => {
  const read = createPolicyResolver();
  for (const value of [
    "unknown",
    "__proto__",
    "constructor",
    "../privacy-policy",
    "Privacy-Policy",
    "https://example.invalid/",
    "//example.invalid/",
    "privacy-policy?next=elsewhere",
    "privacy-policy%2f..",
    "privacy-policy#fragment",
    "privacy-policy\u0000",
    null,
    undefined,
    0,
    {},
    new String("privacy-policy"),
  ]) {
    await assert.rejects(read(value), /policy_not_found/);
  }
});
