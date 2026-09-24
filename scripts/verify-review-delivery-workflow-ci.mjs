import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

import { stopDetachedProcessTree } from "./isolated-market-api.mjs";

const DEFAULT_ORIGIN = "http://127.0.0.1:5254";
const READY_PATH = "/tools/browser-harnesses/virtual-studio-review-export.html";
const run = promisify(execFile);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isNoListener(error) {
  return error && typeof error === "object" && error.code === 1
    && String(error.stdout ?? "").trim() === "";
}

async function listListenerPids(port) {
  try {
    const { stdout } = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return [...new Set(stdout.trim().split(/\s+/u).filter(Boolean))];
  } catch (error) {
    if (isNoListener(error)) return [];
    throw error;
  }
}
async function assertListenersBelongToWorktree(pids, worktree) {
  const ownership = await Promise.all(pids.map(async (pid) => {
    const { stdout } = await run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
    const directory = stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
    if (!directory) return false;
    try {
      return await fs.realpath(directory) === worktree;
    } catch {
      return false;
    }
  }));
  assert(
    ownership.every(Boolean),
    `Port is already owned outside this worktree (listener PIDs: ${pids.join(", ")}).`,
  );
}

async function waitForReady(origin, child) {
  const deadline = Date.now() + 60_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Owned delivery QA server exited before readiness (${child.exitCode ?? child.signalCode}).`);
    }
    try {
      const response = await fetch(`${origin.origin}${READY_PATH}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_500),
      });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
  }
  throw new Error(`Owned delivery QA server did not become ready: ${lastError}`);
}
const origin = new URL(process.env.STUDIO_QA_BASE_URL?.trim() || DEFAULT_ORIGIN);
assert.equal(origin.protocol, "http:", "Delivery QA must use local HTTP.");
assert(["127.0.0.1", "localhost"].includes(origin.hostname), "Delivery QA must use a loopback host.");
assert(origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password,
  "STUDIO_QA_BASE_URL must be a credential-free origin.");
const port = Number(origin.port);
assert(Number.isInteger(port) && port >= 1_024 && port <= 65_535,
  "STUDIO_QA_BASE_URL must include an unprivileged port.");

const worktree = await fs.realpath(process.cwd());
const listeners = await listListenerPids(port);
let webProcess;

try {
  if (listeners.length > 0) {
    await assertListenersBelongToWorktree(listeners, worktree);
    console.log(`[delivery-qa] Reusing owned server at ${origin.origin}.`);
  } else {
    console.log(`[delivery-qa] Starting owned Vite server at ${origin.origin}.`);
    webProcess = spawn(
      "pnpm",
      ["exec", "vite", "--host", origin.hostname, "--port", String(port), "--strictPort"],
      {
        cwd: worktree,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          NODE_ENV: "test",
          NEST_API_URL: "http://127.0.0.1:49999",
          STUDIO_QA_BASE_URL: origin.origin,
        },
        stdio: "inherit",
      },
    );
    await waitForReady(origin, webProcess);
  }
  process.env.STUDIO_QA_BASE_URL = origin.origin;
  await import("./verify-review-delivery-workflow.mjs");
  await import("./verify-production-manuscript-workspace.mjs");
} finally {
  if (webProcess) {
    await stopDetachedProcessTree(webProcess);
    console.log("[delivery-qa] Stopped owned Vite server.");
  }
}
