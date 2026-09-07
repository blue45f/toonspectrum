import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// Executed by plain Node in the downloaded Lambda, with no source tree, tsx or Vitest resolver.
// The database address is deliberately unavailable: these anonymous, file-backed reads must
// bootstrap without connecting to a database or submitting requests to an external service.
function probeArtifact() {
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const http = require("node:http");
  const root = fs.realpathSync(process.argv[1]);
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
    const origin = "http://127.0.0.1:" + server.address().port;
    const rows = [];
    for (const path of [
      "/api/auth/session", "/api/config", "/api/search?q=test",
      "/api/ranking", "/api/studio-music/status",
    ]) {
      const response = await fetch(origin + path);
      const body = await response.json();
      assert.equal(response.status, 200, path);
      if (path === "/api/auth/session") {
        assert.equal(body.authenticated, false);
        assert.equal(body.user, null);
      }
      if (path === "/api/studio-music/status") assert.equal(body.enabled, false);
      rows.push({ path, status: response.status, bodyKeys: Object.keys(body) });
    }
    const loadedModules = Object.keys(require.cache);
    assert(loadedModules.every((path) => path.startsWith(root + "/")),
      "A module escaped the isolated Lambda artifact");
    assert(!loadedModules.some((path) => /packages\/core\/src\/.*\.ts$/u.test(path)),
      "The Lambda loaded an uncompiled workspace TypeScript export");
    fs.writeFileSync(process.argv[2], JSON.stringify({ rows, loadedModules }, null, 2));
    await new Promise((resolvePromise) => server.close(resolvePromise));
    process.exit(0);
  }
  run().catch((error) => { console.error(error); process.exit(1); });
}

// The native entry must remain a Node HTTP server after packaging. With no opt-in or an
// unavailable cluster database it must fail closed, never substitute process-local authority.
function probeNativeArtifact() {
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const http = require("node:http");
  const root = fs.realpathSync(process.argv[1]);
  const server = require(root + "/api/studio-live.js");
  assert(server instanceof http.Server, "The native entry must export an HTTP server synchronously");
  async function run() {
    await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
    const origin = "http://127.0.0.1:" + server.address().port;
    const rows = [];
    for (const [path, expected] of [
      ["/api/creator/works", 404],
      ["/socket.io/?EIO=4&transport=polling", 503],
      ["/api/studio-live?EIO=4&transport=polling", 503],
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, expected, path);
      assert.equal(await response.text(), "", "Failed initialization must not expose internal details");
      assert.equal(response.headers.get("cache-control"), "no-store");
      rows.push({ path, status: response.status });
    }
    const loadedModules = Object.keys(require.cache);
    assert(loadedModules.every((path) => path.startsWith(root + "/")),
      "A native module escaped the isolated Lambda artifact");
    assert(!loadedModules.some((path) => /packages\/core\/src\/.*\.ts$/u.test(path)),
      "The native Lambda loaded an uncompiled workspace TypeScript export");
    if (process.env.STUDIO_LIVE_VERCEL_ENABLED === "true") {
      assert(loadedModules.some((path) => path.endsWith("/dist/packages/core/src/studio-music.js")),
        "The enabled native probe must load the real compiled application before cluster preflight fails");
      // A 503 alone could hide a Nest dependency-injection failure before PostgreSQL is reached.
      const { initializeStudioLiveVercelRuntime } = require(root + "/apps/api/dist/apps/api/src/studio-live-serverless.js");
      await assert.rejects(initializeStudioLiveVercelRuntime(), (error) =>
        error instanceof Error &&
        error.message.startsWith("Studio live PostgreSQL adapter initialization failed:") &&
        error.message.endsWith("[ECONNREFUSED]"),
      "The compiled application must reach the deliberately unavailable cluster database");
    }
    fs.writeFileSync(process.argv[2], JSON.stringify({ rows, loadedModules }, null, 2));
    await new Promise((resolvePromise) => server.close(resolvePromise));
    process.exit(0);
  }
  run().catch((error) => { console.error(error); process.exit(1); });
}

/** Run after `pnpm --filter @webtoon-nest/api build`; never pulls Vercel environment secrets. */
export async function verifyApiServerlessBuild() {
  const require = createRequire(resolve(ROOT, "package.json"));
  const vercelRequire = createRequire(require.resolve("vercel/package.json"));
  const builder = vercelRequire("@vercel/node");
  const { FileFsRef, download } = vercelRequire("@vercel/build-utils");
  const config = JSON.parse(await readFile(resolve(ROOT, "vercel.json"), "utf8"));
  await readFile(resolve(ROOT, "apps/api/dist/apps/api/src/serverless.js"));
  await readFile(resolve(ROOT, "apps/api/dist/apps/api/src/studio-live-serverless.js"));
  const output = await mkdtemp(resolve(tmpdir(), "toonspectrum-api-lambda-"));
  for (const entrypoint of ["api/index.js", "api/studio-live.js"]) {
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
        // The caller already built with tsc (including Nest decorator metadata). Only package it.
        projectSettings: { installCommand: "", buildCommand: "node -e \"process.exit(0)\"" },
      },
      meta: { skipDownload: true },
    });
    const files = Object.keys(result.output.files).sort();
    assert(files.includes("apps/api/dist/packages/core/src/studio-music.js"));
    const artifactName = entrypoint === "api/index.js" ? "http" : "studio-live";
    const manifest = {
      builder: "@vercel/node",
      version: vercelRequire("@vercel/node/package.json").version,
      runtime: result.output.runtime,
      handler: result.output.handler,
      files,
    };
    await writeFile(resolve(output, artifactName === "http" ? "manifest.json" : "native-manifest.json"), JSON.stringify(manifest, null, 2));
    const lambdaRoot = resolve(output, artifactName === "http" ? "lambda" : "native-lambda");
    await download(result.output.files, lambdaRoot);
    const probes = artifactName === "http"
      ? [{ name: "http", probe: probeArtifact, environment: {} }]
      : [
        { name: "native-disabled", probe: probeNativeArtifact, environment: {} },
        {
          name: "native-cluster-unavailable",
          probe: probeNativeArtifact,
          environment: {
            STUDIO_LIVE_VERCEL_ENABLED: "true",
            STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
            STUDIO_LIVE_POSTGRES_URL: "postgresql://test:test@127.0.0.1:9/toonspectrum_package_test?sslmode=verify-full",
          },
        },
      ];
    for (const { name, probe, environment } of probes) {
      const prefix = name === "http" ? "" : `${name}-`;
      const child = spawnSync(process.execPath, [
        "-e", `(${probe.toString()})()`, lambdaRoot, resolve(output, `${prefix}bootstrap-report.json`),
      ], {
        cwd: lambdaRoot,
        timeout: 45_000,
        encoding: "utf8",
        env: {
          NODE_ENV: "production",
          API_LOCAL_ENV_FILE_ENABLED: "false",
          API_RUNTIME_ROLE: "full",
          AUTH_RATE_LIMIT_MODE: "single-instance-local",
          AUTH_SESSION_SECRET: "toonspectrum-artifact-verification-session-only",
          DATABASE_URL: "postgresql://test:test@127.0.0.1:9/toonspectrum_package_test",
          CATALOG_INGEST_MODE: "off",
          KMAS_LIVE_SEARCH: "0",
          KMAS_MERGE_ON_ACCESS: "0",
          ...environment,
        },
      });
      await writeFile(resolve(output, `${prefix}bootstrap.log`), child.stdout + child.stderr);
      assert.equal(child.status, 0, `Lambda bootstrap failed; see ${output}/${prefix}bootstrap.log`);
    }
  }
  console.log(`Vercel HTTP/native Lambda packaging, five API reads and fail-closed gateway probes passed: ${output}`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyApiServerlessBuild();
}
