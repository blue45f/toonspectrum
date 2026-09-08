import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// Plain Node runs inside the downloaded Lambda: no workspace, tsx, Vitest aliases,
// inherited credentials or local env file. The only DB address is a closed loopback port.
function probeArtifact() {
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const http = require("node:http");
  const root = fs.realpathSync(process.argv[1]);
  const originalFetch = globalThis.fetch;
  let origin;
  let blockedFetches = 0;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== origin) {
      blockedFetches++;
      throw new Error("Artifact verification forbids external fetches");
    }
    return originalFetch(input, options);
  };
  const handler = require(root + "/api/index.js");
  const server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      console.error(error);
      response.statusCode = 500;
      response.end("bootstrap-failed");
    });
  });
  async function run() {
    await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
    origin = "http://127.0.0.1:" + server.address().port;
    const rows = [];
    const paths = [
      ["/api/health/live", 200],
      ["/api/health/ready", 503],
      ["/api/auth/session", 200],
      ["/api/config", 200],
      ["/api/search?q=test", 200],
      ["/api/ranking", 200],
      ["/api/studio-music/status", 200],
      ["/api/search?q=" + "x".repeat(513), 400],
      ["/api/search?q=one&q=two", 400],
      ["/api/titles?q=" + "x".repeat(513), 400],
      ["/api/titles?q=one&q=two", 400],
      ["/api/cover?u=https%3A%2F%2F127.0.0.1%2Fprivate", 403],
    ];
    for (const [path, expected] of paths) {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(15_000) });
      const text = await response.text();
      assert.equal(response.status, expected, `${path}: ${text.slice(0, 200)}`);
      const body = response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : null;
      if (path === "/api/health/live") assert.equal(body.status, "ok");
      if (path === "/api/health/ready") {
        // AllExceptionsFilter deliberately replaces all 5xx controller envelopes.
        assert.equal(body.statusCode, 503);
        assert.equal(body.message, "Request could not be completed");
        assert.equal(body.path, path);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert(!text.includes("127.0.0.1"), "Readiness must not expose database details");
      }
      if (path === "/api/auth/session") {
        assert.equal(body.authenticated, false);
        assert.equal(body.user, null);
      }
      if (path === "/api/studio-music/status") assert.equal(body.enabled, false);
      rows.push({ path, status: response.status, bodyKeys: body ? Object.keys(body) : [] });
    }
    assert.equal(blockedFetches, 0, "A route attempted an external request");
    const loadedModules = Object.keys(require.cache);
    assert(loadedModules.every((path) => path.startsWith(root + "/")),
      "A module escaped the isolated Lambda artifact");
    assert(!loadedModules.some((path) => /packages\/core\/src\/.*\.ts$/u.test(path)),
      "The Lambda loaded an uncompiled workspace TypeScript export");
    assert(loadedModules.some((path) => path.endsWith("/dist/packages/core/src/studio-music.js")),
      "The real compiled Studio Music contract must be loaded");
    fs.writeFileSync(process.argv[2], JSON.stringify({ rows, blockedFetches, loadedModules }, null, 2));
    await new Promise((resolvePromise) => server.close(resolvePromise));
    process.exit(0);
  }
  run().catch((error) => { console.error(error); process.exit(1); });
}

/** Run after `pnpm --filter @webtoon-nest/api build`; never pulls Vercel env secrets. */
export async function verifyApiServerlessBuild() {
  const require = createRequire(resolve(ROOT, "package.json"));
  const vercelRequire = createRequire(require.resolve("vercel/package.json"));
  const builder = vercelRequire("@vercel/node");
  const { FileFsRef, download } = vercelRequire("@vercel/build-utils");
  const config = JSON.parse(await readFile(resolve(ROOT, "vercel.json"), "utf8"));
  await readFile(resolve(ROOT, "apps/api/dist/apps/api/src/serverless.js"));
  const output = await mkdtemp(resolve(tmpdir(), "toonspectrum-api-lambda-"));
  const entrypoint = "api/index.js";
  const result = await builder.build({
    files: { [entrypoint]: new FileFsRef({ fsPath: resolve(ROOT, entrypoint) }) },
    entrypoint,
    workPath: ROOT,
    repoRootPath: ROOT,
    considerBuildCommand: true,
    config: {
      ...config.functions[entrypoint],
      nodeVersion: "24.x",
      zeroConfig: true,
      // The API was built with tsc, preserving Nest decorator metadata. Package only.
      projectSettings: { installCommand: "", buildCommand: "node -e \"process.exit(0)\"" },
    },
    meta: { skipDownload: true },
  });
  const files = Object.keys(result.output.files).sort();
  assert(files.includes("apps/api/dist/packages/core/src/studio-music.js"));
  const manifest = {
    builder: "@vercel/node",
    version: vercelRequire("@vercel/node/package.json").version,
    runtime: result.output.runtime,
    handler: result.output.handler,
    files,
  };
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  const lambdaRoot = resolve(output, "lambda");
  await download(result.output.files, lambdaRoot);
  const child = spawnSync(process.execPath, [
    "-e", `(${probeArtifact.toString()})()`, lambdaRoot, resolve(output, "bootstrap-report.json"),
  ], {
    cwd: lambdaRoot,
    timeout: 60_000,
    encoding: "utf8",
    env: {
      NODE_ENV: "production",
      API_LOCAL_ENV_FILE_ENABLED: "false",
      API_RUNTIME_ROLE: "full",
      AUTH_RATE_LIMIT_MODE: "single-instance-local",
      AUTH_SESSION_SECRET: "toonspectrum-artifact-verification-session-only",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:9/toonspectrum_package_test",
      CATALOG_INGEST_MODE: "off",
      COVER_IMAGE_POLICY: "proxy",
      KMAS_LIVE_SEARCH: "0",
      KMAS_MERGE_ON_ACCESS: "0",
    },
  });
  await writeFile(resolve(output, "bootstrap.log"), child.stdout + child.stderr);
  assert.equal(child.status, 0, `Lambda bootstrap failed; see ${output}/bootstrap.log`);
  console.log(`Vercel Lambda packaging and 12 isolated API probes passed: ${output}`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyApiServerlessBuild();
}
