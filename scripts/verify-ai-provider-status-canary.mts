#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface CanaryEndpoint {
  readonly id: string;
  readonly path: string;
  readonly validate: (value: unknown) => Record<string, unknown>;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("response must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be boolean`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function origin(value: string): URL {
  const url = new URL(value);
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password) {
    throw new TypeError("--origin must be an HTTP(S) origin without credentials");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

const ENDPOINTS: readonly CanaryEndpoint[] = [
  {
    id: "managed-text",
    path: "/api/studio-ai/status",
    validate(value) {
      const body = record(value);
      return {
        configured: requiredBoolean(body.configured, "configured"),
        provider: requiredString(body.provider, "provider"),
        freePool: requiredBoolean(body.freePool, "freePool"),
      };
    },
  },
  {
    id: "creator-intelligence",
    path: "/api/creator-intelligence/status",
    validate(value) {
      const body = record(value);
      const paid = record(body.paidExecution);
      const artifacts = record(body.meshArtifacts);
      return {
        paidExecutionEnabled: requiredBoolean(paid.enabled, "paidExecution.enabled"),
        paidExecutionDistributed: requiredBoolean(
          paid.distributed,
          "paidExecution.distributed",
        ),
        paidExecutionReason: requiredString(paid.reason, "paidExecution.reason"),
        meshArtifactStorage: requiredBoolean(
          artifacts.configured,
          "meshArtifacts.configured",
        ),
      };
    },
  },
  {
    id: "music",
    path: "/api/studio-music/status",
    validate(value) {
      const body = record(value);
      return {
        enabled: requiredBoolean(body.enabled, "enabled"),
        reason: requiredString(body.reason, "reason"),
      };
    },
  },
  {
    id: "three-d-byok",
    path: "/api/studio-ai/3d/status",
    validate(value) {
      const body = record(value);
      if (body.inputTransport !== "inline-json") {
        throw new TypeError("inputTransport must be inline-json");
      }
      if (body.maxInlineInputBytes !== 10 * 1024 * 1024) {
        throw new TypeError("maxInlineInputBytes must be 10MB");
      }
      return {
        provider: requiredString(body.provider, "provider"),
        configured: requiredBoolean(body.configured, "configured"),
        operatorFunded: requiredBoolean(body.operatorFunded, "operatorFunded"),
        maxInlineInputBytes: body.maxInlineInputBytes,
      };
    },
  },
];

const originValue = argument("--origin")
  ?? process.env.TOONSPECTRUM_AI_CANARY_ORIGIN;
if (!originValue) {
  console.error(
    "Usage: pnpm exec tsx scripts/verify-ai-provider-status-canary.mts --origin <https://host> [--report report.json]",
  );
  process.exit(2);
}

const base = origin(originValue);
const reportPath = argument("--report");
const startedAt = new Date().toISOString();
const results: Array<Record<string, unknown>> = [];
let failed = false;

for (const endpoint of ENDPOINTS) {
  const url = new URL(endpoint.path, base);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const elapsedMs = Math.round(performance.now() - started);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const body = text ? JSON.parse(text) as unknown : null;
    results.push({
      id: endpoint.id,
      path: endpoint.path,
      status: "passed",
      elapsedMs,
      readiness: endpoint.validate(body),
    });
  } catch (error) {
    failed = true;
    results.push({
      id: endpoint.id,
      path: endpoint.path,
      status: "failed",
      elapsedMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const report = {
  status: failed ? "failed" : "passed",
  startedAt,
  completedAt: new Date().toISOString(),
  origin: base.origin,
  paidGenerationDispatched: false,
  results,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(resolve(reportPath), serialized, "utf8");
process.stdout.write(serialized);
if (failed) process.exitCode = 1;
