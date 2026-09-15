#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAXIMUM_RESPONSE_BYTES = 16_384;

export function parseRenderCoreOrigin(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("RENDER_CORE_API_ORIGIN is required");
  }
  let origin;
  try {
    origin = new URL(raw.trim());
  } catch {
    throw new Error("RENDER_CORE_API_ORIGIN must be an absolute HTTPS origin");
  }
  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) {
    throw new Error(
      "RENDER_CORE_API_ORIGIN must be HTTPS without credentials, path, query, or fragment",
    );
  }
  return origin;
}

async function readBoundedJson(response, label) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAXIMUM_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeds ${MAXIMUM_RESPONSE_BYTES} bytes`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} response is not valid JSON`);
  }
}

async function probe(fetchImpl, origin, path, expectedStatus, expectedBody, timeoutMs) {
  const url = new URL(path, origin);
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      accept: "application/json",
      "user-agent": "toonspectrum-render-core-verifier/1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${path} must not redirect`);
  }
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  if (response.headers.has("x-vercel-id")) {
    throw new Error(`${path} is still served by Vercel`);
  }
  const body = await readBoundedJson(response, path);
  if (JSON.stringify(body) !== JSON.stringify(expectedBody)) {
    throw new Error(`${path} returned an unexpected response contract`);
  }
  return Object.freeze({
    path,
    status: response.status,
    server: response.headers.get("server"),
  });
}

export async function verifyRenderCoreOrigin({
  origin,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const parsed = origin instanceof URL ? origin : parseRenderCoreOrigin(origin);
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw new Error("timeoutMs must be an integer between 1000 and 300000");
  }

  const liveness = await probe(
    fetchImpl,
    parsed,
    "/api/health/live",
    200,
    { status: "ok" },
    timeoutMs,
  );
  const readiness = await probe(
    fetchImpl,
    parsed,
    "/api/health/ready",
    200,
    { status: "ready" },
    timeoutMs,
  );

  return Object.freeze({
    origin: parsed.origin,
    liveness,
    readiness,
  });
}

async function main() {
  const originArgument = process.argv.find((argument) => argument.startsWith("--origin="));
  const origin = originArgument?.slice("--origin=".length)
    ?? process.env.RENDER_CORE_API_ORIGIN;
  const result = await verifyRenderCoreOrigin({ origin });
  console.log(
    `Render Core API verified: ${result.origin} (live=${result.liveness.status}, ready=${result.readiness.status}, Vercel headers absent)`,
  );
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
