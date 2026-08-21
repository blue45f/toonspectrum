/**
 * scripts/lib/studio-verify-preview-harness.mts
 *
 * Shared `vite preview` infrastructure for the `scripts/verify-studio-*`
 * browser verifiers:
 * port allocation, readiness polling, preview spawning, scratch-dir hygiene,
 * and child-process shutdown. Pure tooling — the helpers are parameterized
 * where the consumers historically differed (timeouts, error text, spawn
 * runner, artifact filters) so each verifier keeps its exact behavior; nothing
 * here changes what a verifier validates or reports.
 *
 * Import with an explicit `.mjs` specifier — `./lib/studio-verify-preview-harness.mjs`.
 * tsx needs an explicit extension to resolve an `.mts` module at runtime, and
 * tsc/Vite map the `.mjs` specifier back to this `.mts` source without
 * `allowImportingTsExtensions`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

export interface FindFreePortOptions {
  /**
   * Rejection text used when the OS hands back a non-TCP address — the
   * verifiers historically worded this differently ("preview port",
   * "dev-server port", "production-preview port", …).
   */
  readonly unavailableMessage?: string;
}

/** Allocate an OS-assigned free 127.0.0.1 port for a `vite preview` instance. */
export async function findFreePort({
  unavailableMessage = "could not allocate a preview port",
}: FindFreePortOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error(unavailableMessage));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

export interface WaitForServerOptions {
  readonly timeoutMs?: number;
  /** Timeout error text — the verifiers historically used different wording. */
  readonly notReadyMessage?: string;
  /**
   * Poll a fixed number of attempts instead of a wall-clock deadline — the
   * icons/brush verifiers historically counted attempts, not elapsed time.
   * When set, `timeoutMs` is unused.
   */
  readonly maxAttempts?: number;
  /** Delay between polls (250ms everywhere except the fast-poll verifiers). */
  readonly pollIntervalMs?: number;
  /**
   * Probe request shape. Defaults to a HEAD; the brush verifiers historically
   * probed with a redirect-manual GET.
   */
  readonly requestInit?: RequestInit;
}

/** Poll a preview URL until it answers with any non-5xx response. */
export async function waitForServer(
  url: string,
  {
    timeoutMs = 20_000,
    notReadyMessage = "Vite preview did not become ready",
    maxAttempts,
    pollIntervalMs = 250,
    requestInit = { method: "HEAD" },
  }: WaitForServerOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  let attempt = 0;
  while (
    maxAttempts === undefined
      ? Date.now() - startedAt < timeoutMs
      : attempt < maxAttempts
  ) {
    attempt += 1;
    try {
      const response = await fetch(url, requestInit);
      if (response.ok || response.status < 500) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(notReadyMessage);
}

export interface SpawnVitePreviewOptions {
  readonly port: number;
  /**
   * How the preview process is spawned:
   * - "pnpm-exec": `pnpm exec vite preview` with stdio fully ignored
   *   (launch verifier).
   * - "node-vite-bin": node running vite's bin entry with piped stdout/stderr
   *   (lifecycle/brush verifiers) so the preview log can be captured.
   */
  readonly runner: "pnpm-exec" | "node-vite-bin";
  /** With "node-vite-bin": append the preview's stdout/stderr to this log file. */
  readonly logPath?: string;
}

/** Spawn a strict-port `vite preview` bound to 127.0.0.1 on the given port. */
export function spawnVitePreview({
  port,
  runner,
  logPath,
}: SpawnVitePreviewOptions): ChildProcess {
  const previewArgs = [
    "preview",
    "--port",
    String(port),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ];
  if (runner === "pnpm-exec") {
    return spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "vite", ...previewArgs],
      { stdio: "ignore" },
    );
  }
  const child = spawn(
    process.execPath,
    [join(process.cwd(), "node_modules", "vite", "bin", "vite.js"), ...previewArgs],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  if (logPath) {
    child.stdout?.on("data", (chunk) => appendFileSync(logPath, String(chunk)));
    child.stderr?.on("data", (chunk) => appendFileSync(logPath, String(chunk)));
  }
  return child;
}

export interface CleanScratchDirOptions {
  readonly directory: string;
  /** Only artifacts with this filename prefix are deleted. */
  readonly filePrefix: string;
  /** Only artifacts ending in one of these extensions are deleted. */
  readonly extensions: readonly string[];
  /**
   * Swallow directory-listing failures instead of throwing — the launch
   * verifier historically treated the whole cleanup as best-effort.
   */
  readonly ignoreListingErrors?: boolean;
}

/** Ensure the scratch directory exists and delete stale artifacts from earlier runs. */
export function cleanScratchDir({
  directory,
  filePrefix,
  extensions,
  ignoreListingErrors = false,
}: CleanScratchDirOptions): void {
  mkdirSync(directory, { recursive: true });
  try {
    for (const file of readdirSync(directory)) {
      if (!file.startsWith(filePrefix)) continue;
      if (!extensions.some((extension) => file.endsWith(extension))) continue;
      try {
        unlinkSync(join(directory, file));
      } catch {
        // Stable artifact names are overwritten by the new run if another process holds the file.
      }
    }
  } catch (error) {
    if (!ignoreListingErrors) throw error;
  }
}

export interface StopChildProcessOptions {
  /**
   * Destroy the child's stdout/stderr pipes after it exits. The brush-latency
   * verifier historically left them attached, so it opts out.
   */
  readonly releaseStdio?: boolean;
}

/** SIGTERM the preview child, escalate to SIGKILL, then release its stdio pipes. */
export async function stopChildProcess(
  child: ChildProcess,
  { releaseStdio = true }: StopChildProcessOptions = {},
): Promise<void> {
  const waitForExit = (timeoutMs: number) => Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await waitForExit(1_500);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForExit(1_500);
  }
  if (!releaseStdio) return;
  child.stdout?.destroy();
  child.stderr?.destroy();
}
