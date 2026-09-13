import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

// Exercise emitted JavaScript, not a TS-aware source alias, in required API/Vercel builds.
const require = createRequire(import.meta.url);
const {
  getStaticPolicyDocument, isPolicySlug, parsePolicyDocument, TERMSDESK_BASE,
} = require("../apps/api/dist/packages/core/src/legal-policy.js");
const { createPolicyResolver } = require("../apps/api/dist/apps/api/src/modules/legal/legal-policy-resolver.js");
const { LegalController } = require("../apps/api/dist/apps/api/src/modules/legal/legal.controller.js");
const slug = "privacy-policy";
const live = {
  policySlug: slug, name: "Privacy", body: "Published policy fixture, not legal text.",
  versionLabel: "test-v1", contentHash: "a".repeat(64), effectiveAt: null,
};
const response = (value = live) => Response.json(value);

for (const [policy, digest] of [
  ["terms-of-service", "725b4f7dff126f76bb68ed7c1c8cac1df0f69e62f536725168b28b2ef269fb73"],
  ["privacy-policy", "f246536dcdf17750769a6a03f5cddd2bb8cf7a4a2a8e4e9cb0b014bd7883fdc2"],
]) {
  test(`${policy}: existing legal body is unchanged and its frozen identity is stable`, () => {
    const document = getStaticPolicyDocument(policy);
    assert.equal(createHash("sha256").update(document.body).digest("hex"), digest);
    assert.equal(document.source, "static");
    assert.equal(document, getStaticPolicyDocument(policy));
    assert.equal(Object.isFrozen(document), true);
    assert.throws(() => { document.body = "changed"; }, TypeError);
  });
}

test("invalid policy paths remain 404 and never contact upstream", async () => {
  const controller = new LegalController();
  for (const value of ["unknown", "__proto__", "../privacy-policy", "Privacy-Policy"]) {
    assert.equal(isPolicySlug(value), false);
    await assert.rejects(controller.getPolicy(value), (error) => error.getStatus() === 404);
  }
});

test("published policy loads from the integrated, fixed origin without forwarding cookies", async () => {
  let calls = 0;
  const read = createPolicyResolver(async (url, options) => {
    calls += 1;
    assert.equal(url, `${TERMSDESK_BASE}/api/public/toonspectrum/policies/${slug}`);
    assert.equal(TERMSDESK_BASE, "https://desk-platform.vercel.app/termsdesk");
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    assert.ok(options.signal instanceof AbortSignal);
    return response();
  });
  assert.deepEqual(await read(slug), { ...live, source: "termsdesk" });
  assert.equal(calls, 1);
});

for (const status of [401, 404, 429, 500, 502, 503]) {
  test(`upstream HTTP ${status} yields the existing, explicitly static policy`, async () => {
    const read = createPolicyResolver(async () => new Response("unavailable", { status }));
    assert.deepEqual(await read(slug), getStaticPolicyDocument(slug));
  });
}

for (const [name, fetcher] of [
  ["network rejection", async () => { throw new TypeError("network unavailable"); }],
  ["invalid JSON", async () => new Response("{", { headers: { "content-type": "application/json" } })],
  ["HTML success", async () => new Response("<h1>Sign in</h1>", { headers: { "content-type": "text/html" } })],
  ["missing body", async () => response({ versionLabel: "v1" })],
  ["wrong policy", async () => response({ ...live, policySlug: "terms-of-service" })],
  ["false static publication", async () => response(getStaticPolicyDocument(slug))],
  ["oversized header", async () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "524289" } })],
  ["oversized stream", async () => new Response("a".repeat(524289), { headers: { "content-type": "application/json" } })],
  ["broken body stream", async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("stream failed")); } }), { headers: { "content-type": "application/json" } })],
]) {
  test(`${name} cannot break policy display`, async () => {
    assert.deepEqual(await createPolicyResolver(fetcher)(slug), getStaticPolicyDocument(slug));
  });
}

test("concurrent failures are coalesced; the next request after cooldown can recover", async () => {
  let time = 0;
  let calls = 0;
  let available = false;
  const read = createPolicyResolver(async () => {
    calls += 1;
    return available ? response() : new Response("down", { status: 502 });
  }, () => time);
  const results = await Promise.all(Array.from({ length: 20 }, () => read(slug)));
  assert.ok(results.every((value) => value.source === "static"));
  assert.equal(calls, 1);
  available = true;
  time = 59_999;
  assert.equal((await read(slug)).source, "static");
  assert.equal(calls, 1);
  time = 60_000;
  assert.equal((await read(slug)).source, "termsdesk");
  assert.equal(calls, 2);
  (await read(slug)).body = "caller mutation";
  assert.equal((await read(slug)).body, live.body);
  time = -1;
  await read(slug);
  assert.equal(calls, 3, "clock rollback must not retain an unbounded cache");
});

test("the two policy caches cannot contaminate one another", async () => {
  const read = createPolicyResolver(async (url) => response({ ...live, policySlug: url.split("/").at(-1) }));
  const [privacy, terms] = await Promise.all([read(slug), read("terms-of-service")]);
  assert.equal(privacy.policySlug, slug);
  assert.equal(terms.policySlug, "terms-of-service");
});

test("a stalled upstream is aborted at the bounded deadline", async () => {
  const read = createPolicyResolver((_url, options) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(response()), 15_000);
    options.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(options.signal.reason);
    }, { once: true });
  }));
  const started = Date.now();
  assert.equal((await read(slug)).source, "static");
  assert.ok(Date.now() - started < 10_000);
});

test("same-origin decoding preserves static provenance; spoofed or mismatched content is rejected", () => {
  const fallback = getStaticPolicyDocument(slug);
  assert.equal(parsePolicyDocument(fallback, slug, true).source, "static");
  assert.throws(() => parsePolicyDocument(fallback, slug), /policy_payload_malformed/);
  for (const change of [
    { source: "termsdesk" }, { body: "changed" }, { contentHash: "changed" },
    { versionLabel: "changed" }, { policySlug: "terms-of-service" }, { effectiveAt: "changed" },
  ]) assert.throws(() => parsePolicyDocument({ ...fallback, ...change }, slug, true), /policy_payload_malformed/);
});

test("invalid upstream metadata is rejected before returning a published document", () => {
  for (const change of [{ body: " " }, { contentHash: "static-id" }, { source: "other" }, { effectiveAt: "invalid" }]) {
    assert.throws(() => parsePolicyDocument({ ...live, ...change }, slug), /policy_payload_malformed/);
  }
});
