import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

// By default, exercise the real API build output, not TypeScript source resolution.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, process.env.LEGAL_POLICY_TEST_BUILD_ROOT ?? "apps/api/dist");
const core = await import(pathToFileURL(resolve(output, "packages/core/src/legal-policies.js")));
const { createLegalPolicyResolver } = await import(
  pathToFileURL(resolve(output, "apps/api/src/modules/legal/legal-policy-resolver.js"))
);
const { getStaticPolicyDocument, isPolicySlug, normalizePolicyDocument } = core;
const slug = "terms-of-service";
const published = {
  policySlug: slug,
  name: "이용약관",
  versionLabel: "v1",
  contentHash: "published-content-hash",
  body: "제1조 (목적)\n게시 문서 테스트 본문입니다.",
  effectiveAt: "2026-06-08T00:00:00.000Z",
};
const jsonResponse = (value) => new Response(JSON.stringify(value), {
  headers: { "Content-Type": "application/json" },
});

for (const name of ["terms-of-service", "privacy-policy"]) {
  test(`bundled ${name} preserves provenance and returns independent copies`, () => {
    const one = getStaticPolicyDocument(name);
    assert.equal(one.source, "static");
    assert.equal(one.policySlug, name);
    assert.ok(one.body.length > 100);
    assert.ok(one.versionLabel.startsWith("내장본"));
    one.body = "mutated";
    assert.notEqual(getStaticPolicyDocument(name).body, "mutated");
  });
}

test("browser normalization never relabels a bundled document as a published original", () => {
  const doc = getStaticPolicyDocument(slug);
  assert.deepEqual(normalizePolicyDocument(doc, slug), doc);
  assert.equal(normalizePolicyDocument(published, slug).source, "termsdesk");
});

test("invalid policy slugs never reach the network", async () => {
  let calls = 0;
  const resolvePolicy = createLegalPolicyResolver({ fetcher: async () => {
    calls += 1;
    return jsonResponse(published);
  } });
  for (const value of ["unknown", "__proto__", "constructor", "../privacy-policy", ""]) {
    assert.equal(isPolicySlug(value), false);
    await assert.rejects(resolvePolicy(value), /policy_not_found/);
  }
  assert.equal(calls, 0);
});

test("successful published document preserves body/version and carries a bounded timeout", async () => {
  let fallbackCalls = 0;
  const resolvePolicy = createLegalPolicyResolver({
    fetcher: async (url, init) => {
      assert.equal(url, "https://termsdesk.vercel.app/api/public/toonspectrum/policies/terms-of-service");
      assert.equal(init.headers.Accept, "application/json");
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal instanceof AbortSignal);
      return jsonResponse(published);
    },
    onFallback: () => { fallbackCalls += 1; },
  });
  const result = await resolvePolicy(slug);
  assert.equal(result.availability, "published");
  assert.equal(result.source, "termsdesk");
  assert.equal(result.body, published.body);
  assert.equal(result.versionLabel, published.versionLabel);
  assert.equal(result.upstreamFailure, undefined);
  assert.equal(fallbackCalls, 0);
});

for (const status of [401, 403, 404, 429, 500, 502, 503]) {
  test(`upstream HTTP ${status} serves an explicitly degraded bundled document`, async () => {
    const logs = [];
    const resolvePolicy = createLegalPolicyResolver({
      fetcher: async () => new Response("not a public error body", { status }),
      onFallback: (name, failure) => logs.push({ name, ...failure }),
    });
    const result = await resolvePolicy(slug);
    assert.equal(result.source, "static");
    assert.equal(result.availability, "bundled-fallback");
    assert.equal(result.body, getStaticPolicyDocument(slug).body);
    assert.deepEqual(result.upstreamFailure, { reason: "upstream_http_error", status });
    assert.deepEqual(logs, [{ name: slug, reason: "upstream_http_error", status }]);
  });
}

for (const fault of [new Error("private network error: secret"), new DOMException("timeout", "TimeoutError")]) {
  test(`network ${fault.name} falls back without leaking exception text`, async () => {
    const logs = [];
    const resolvePolicy = createLegalPolicyResolver({
      fetcher: async () => { throw fault; },
      onFallback: (name, failure) => logs.push({ name, ...failure }),
    });
    const result = await resolvePolicy(slug);
    assert.equal(result.source, "static");
    assert.equal(result.upstreamFailure.reason, "upstream_network_error");
    assert.equal(JSON.stringify({ result, logs }).includes("secret"), false);
  });
}

for (const [label, value] of [
  ["missing fields", {}],
  ["null", null],
  ["empty body", { ...published, body: " " }],
  ["wrong slug", { ...published, policySlug: "privacy-policy" }],
  ["unknown source", { ...published, source: "untrusted" }],
  ["upstream fallback", { ...published, source: "static" }],
]) {
  test(`${label} cannot masquerade as a successfully fetched published document`, async () => {
    const resolvePolicy = createLegalPolicyResolver({ fetcher: async () => jsonResponse(value) });
    const result = await resolvePolicy(slug);
    assert.equal(result.source, "static");
    assert.equal(result.upstreamFailure.reason, "upstream_invalid_payload");
  });
}

test("asynchronous JSON parse rejection is caught", async () => {
  const resolvePolicy = createLegalPolicyResolver({ fetcher: async () => new Response("<html>bad gateway</html>") });
  const result = await resolvePolicy(slug);
  assert.equal(result.availability, "bundled-fallback");
  assert.equal(result.upstreamFailure.reason, "upstream_invalid_payload");
});

test("failed requests have a 60-second cooldown and a successful retry clears failure state", async () => {
  let time = 0;
  let calls = 0;
  let reports = 0;
  const resolvePolicy = createLegalPolicyResolver({
    now: () => time,
    fetcher: async () => ++calls === 1 ? new Response("down", { status: 503 }) : jsonResponse(published),
    onFallback: () => { reports += 1; },
  });
  assert.equal((await resolvePolicy(slug)).source, "static");
  time = 59_999;
  assert.equal((await resolvePolicy(slug)).source, "static");
  assert.equal(calls, 1);
  assert.equal(reports, 1);
  time = 60_000;
  assert.equal((await resolvePolicy(slug)).source, "termsdesk");
  assert.equal((await resolvePolicy(slug)).availability, "published");
  assert.equal(calls, 3);
});

test("concurrent requests are coalesced, without sharing cooldown across policy slugs", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolvePending) => { release = resolvePending; });
  const resolvePolicy = createLegalPolicyResolver({ fetcher: async () => {
    calls += 1;
    await pending;
    return new Response("down", { status: 503 });
  } });
  const requests = Array.from({ length: 20 }, () => resolvePolicy(slug));
  assert.equal(calls, 1);
  release();
  const results = await Promise.all(requests);
  assert.ok(results.every((doc) => doc.availability === "bundled-fallback"));
  await resolvePolicy("privacy-policy");
  assert.equal(calls, 2);
});

test("a logging failure does not break document delivery", async () => {
  const resolvePolicy = createLegalPolicyResolver({
    fetcher: async () => new Response("down", { status: 502 }),
    onFallback: () => { throw new Error("logger unavailable"); },
  });
  assert.equal((await resolvePolicy(slug)).availability, "bundled-fallback");
});
