import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { once } from "node:events";

const ORIGIN = "http://127.0.0.1:5173";
const TOKEN = "test_token_abcdefghijklmnopqrstuvwxyz0123456789";
const SERVER = resolve("tools/toonbridge/server.mjs");
const FAKE_TESSERACT = resolve("tools/toonbridge/test/fixtures/fake-tesseract.mjs");

async function freePort() {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

function authHeaders(extra = {}) {
  return {
    origin: ORIGIN,
    authorization: `Bearer ${TOKEN}`,
    "x-toonbridge-version": "2",
    ...extra,
  };
}

async function jsonRequest(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: authHeaders(init.headers),
  });
  const payload = await response.json();
  return { response, payload };
}

async function waitForReady(child) {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let output = "";
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`ToonBridge startup timed out: ${output}\n${errors}`)), 10_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("listening on")) {
        clearTimeout(timeout);
        resolveReady();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`ToonBridge exited during startup (${code}): ${errors}`));
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

test("ToonBridge enforces origin/auth and completes a hash-verified OCR job", { timeout: 30_000 }, async () => {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), "toonbridge-server-test-"));
  const child = spawn(process.execPath, [SERVER], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TOONBRIDGE_HOST: "127.0.0.1",
      TOONBRIDGE_PORT: String(port),
      TOONBRIDGE_TOKEN: TOKEN,
      TOONBRIDGE_ALLOWED_ORIGINS: ORIGIN,
      TOONBRIDGE_DATA_DIR: dataDir,
      TOONBRIDGE_TOOL_TESSERACT_BIN: FAKE_TESSERACT,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForReady(child);

    const evilPreflight = await fetch(`${baseUrl}/v2/status`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(evilPreflight.status, 403);
    assert.equal(evilPreflight.headers.get("access-control-allow-origin"), null);

    const unauthorized = await fetch(`${baseUrl}/v2/status`, {
      headers: {
        origin: ORIGIN,
        "x-toonbridge-version": "2",
      },
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("access-control-allow-origin"), ORIGIN);

    const status = await jsonRequest(baseUrl, "/v2/status");
    assert.equal(status.response.status, 200);
    assert.deepEqual(status.payload, {
      protocol: "toonstudio.production-toolchain",
      version: 2,
      serviceVersion: "0.1.0",
      activeJobs: 0,
      retainedJobs: 0,
    });

    const malformedNameJob = await jsonRequest(baseUrl, "/v2/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: "open",
        toolId: "tesseract",
        operationId: "ocr-text",
        inputs: [{
          id: "input_1",
          name: "%E0%A4%A",
          mime: "image/png",
          bytes: 0,
          sha256: null,
          uploaded: false,
        }],
        options: {},
      }),
    });
    assert.equal(malformedNameJob.response.status, 201);
    assert.equal(malformedNameJob.payload.inputs[0].name.includes("%"), false);

    const input = Buffer.from("웹툰 OCR fixture", "utf8");
    const created = await jsonRequest(baseUrl, "/v2/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: "open",
        projectId: "project-test",
        toolId: "tesseract",
        operationId: "ocr-text",
        inputs: [{
          id: "input_1",
          name: "page.png",
          mime: "image/png",
          bytes: input.length,
          sha256: null,
          uploaded: false,
        }],
        options: { language: "kor+eng" },
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.status, "preparing");
    const jobId = created.payload.id;

    const uploaded = await jsonRequest(baseUrl, `/v2/jobs/${jobId}/inputs/input_1`, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: input,
    });
    assert.equal(uploaded.response.status, 200);
    assert.equal(uploaded.payload.status, "queued");
    assert.equal(uploaded.payload.inputs[0].sha256, `sha256:${createHash("sha256").update(input).digest("hex")}`);

    const started = await jsonRequest(baseUrl, `/v2/jobs/${jobId}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(started.response.status, 200);
    assert.equal(started.payload.status, "running");

    let completed = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const current = await jsonRequest(baseUrl, `/v2/jobs/${jobId}`);
      if (["completed", "failed"].includes(current.payload.status)) {
        completed = current.payload;
        break;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    assert.ok(completed, "job did not reach a terminal state");
    assert.equal(completed.status, "completed", JSON.stringify(completed.failure));
    assert.equal(completed.outputs.length, 1);
    assert.match(completed.outputs[0].sha256, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(completed.receipt.license, "Apache-2.0");
    assert.match(completed.receipt.toolVersion, /99\.0\.0/u);
    assert.match(completed.receipt.commandDigest, /^sha256:[0-9a-f]{64}$/u);

    const isolatedEnvironment = JSON.parse(readFileSync(
      join(dataDir, jobId, "logs", "test-environment.json"),
      "utf8",
    ));
    const runtimeDirectory = join(dataDir, jobId, "runtime");
    for (const [key, value] of Object.entries(isolatedEnvironment)) {
      assert.equal(typeof value, "string", key);
      assert.equal(value.startsWith(runtimeDirectory), true, `${key} was not isolated`);
    }
    assert.notEqual(isolatedEnvironment.HOME, process.env.HOME);

    const outputResponse = await fetch(`${baseUrl}${completed.outputs[0].href}`, {
      headers: authHeaders(),
    });
    assert.equal(outputResponse.status, 200);
    assert.equal(await outputResponse.text(), `OCR:${input.toString("utf8")}`);
  } finally {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true });
  }
});
