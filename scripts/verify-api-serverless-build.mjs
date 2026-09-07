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

/** Run after `pnpm --filter @webtoon-nest/api build`; never pulls Vercel environment secrets. */
export async function verifyApiServerlessBuild() {
  const require = createRequire(resolve(ROOT, "package.json"));
  const vercelRequire = createRequire(require.resolve("vercel/package.json"));
  const builder = vercelRequire("@vercel/node");
  const { FileFsRef, download } = vercelRequire("@vercel/build-utils");
  const config = JSON.parse(await readFile(resolve(ROOT, "vercel.json"), "utf8"));
  await readFile(resolve(ROOT, "apps/api/dist/apps/api/src/serverless.js"));
  const output = await mkdtemp(resolve(tmpdir(), "toonspectrum-api-lambda-"));
  const result = await builder.build({
    files: { "api/index.js": new FileFsRef({ fsPath: resolve(ROOT, "api/index.js") }) },
    entrypoint: "api/index.js",
    workPath: ROOT,
    repoRootPath: ROOT,
    considerBuildCommand: true,
    config: {
      ...config.functions["api/index.js"],
      nodeVersion: "24.x",
      zeroConfig: true,
      // The caller already built with tsc (including Nest decorator metadata). Only package it.
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
    },
  });
  await writeFile(resolve(output, "bootstrap.log"), child.stdout + child.stderr);
  assert.equal(child.status, 0, `Lambda bootstrap failed; see ${output}/bootstrap.log`);
  console.log(`Vercel Lambda packaging and five anonymous API reads passed: ${output}`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyApiServerlessBuild();
}
