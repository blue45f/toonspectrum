#!/usr/bin/env node

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FileSystemDesktopSyncRemote } from "./filesystem-remote.js";
import { loadSyncJournal } from "./journal.js";
import { buildDesktopSyncPlan, countSyncPlanActions } from "./planner.js";
import {
  runDesktopSyncCycle,
  startDesktopSyncAgent,
} from "./runtime.js";
import { scanSyncFolder } from "./scanner.js";

import type { DesktopSyncCycleResult } from "./runtime.js";
import type { ScanSyncFolderOptions } from "./scanner.js";

export type DesktopSyncCliMode = "once" | "watch" | "dry-run";

export interface DesktopSyncCliOptions extends ScanSyncFolderOptions {
  readonly localRoot: string;
  readonly remoteRoot: string;
  readonly mode: DesktopSyncCliMode;
  readonly intervalMs: number;
  readonly json: boolean;
  readonly help: boolean;
}

export interface DesktopSyncCliIo {
  readonly stdout: { write(value: string): unknown };
  readonly stderr: { write(value: string): unknown };
}

export interface DesktopSyncCliSummary {
  readonly mode: DesktopSyncCliMode;
  readonly status: "ready" | "conflict" | "watching";
  readonly localRoot: string;
  readonly remoteRoot: string;
  readonly counts: DesktopSyncCycleResult["counts"] | null;
  readonly execution: DesktopSyncCycleResult["execution"];
  readonly plan: readonly {
    readonly relativePath: string;
    readonly action: string;
    readonly reason: string;
  }[];
}

export interface DesktopSyncCliRunResult {
  readonly exitCode: 0 | 2;
  readonly summary: DesktopSyncCliSummary;
}

const DEFAULT_INTERVAL_MS = 5_000;
const MAXIMUM_FILE_MEGABYTES = 1_048_576;

export const DESKTOP_SYNC_CLI_HELP = `ToonStudio folder sync

Usage:
  toonstudio-sync --local <folder> --remote-folder <folder> [options]

Modes:
  --once                 Run one conflict-safe sync cycle (default)
  --dry-run              Print the plan without changing either folder
  --watch                 Keep polling and sync after each completed cycle

Options:
  --interval <ms>        Watch interval, minimum 1000 (default 5000)
  --include-unknown      Include file extensions outside the ToonStudio allowlist
  --max-file-mb <mb>     Skip files larger than this positive limit
  --json                 Emit machine-readable summaries
  --help                 Show this help

Exit codes:
  0  completed or watching
  2  conflicts require manual review
`;

function requiredValue(arguments_: readonly string[], index: number, option: string): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) {
    throw new TypeError(`${option} requires a value`);
  }
  return value;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${option} must be a positive integer`);
  }
  return parsed;
}

function selectMode(
  current: DesktopSyncCliMode | null,
  next: DesktopSyncCliMode,
): DesktopSyncCliMode {
  if (current !== null && current !== next) {
    throw new TypeError("--once, --dry-run and --watch are mutually exclusive");
  }
  return next;
}

export function parseDesktopSyncCliArguments(
  arguments_: readonly string[],
): DesktopSyncCliOptions {
  let localRoot = "";
  let remoteRoot = "";
  let selectedMode: DesktopSyncCliMode | null = null;
  let intervalMs = DEFAULT_INTERVAL_MS;
  let includeUnknownFiles = false;
  let maximumFileBytes: number | undefined;
  let json = false;
  let help = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    switch (argument) {
      case "--local":
        localRoot = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--remote-folder":
        remoteRoot = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--once":
        selectedMode = selectMode(selectedMode, "once");
        break;
      case "--dry-run":
        selectedMode = selectMode(selectedMode, "dry-run");
        break;
      case "--watch":
        selectedMode = selectMode(selectedMode, "watch");
        break;
      case "--interval":
        intervalMs = positiveInteger(
          requiredValue(arguments_, index, argument),
          argument,
        );
        index += 1;
        break;
      case "--max-file-mb": {
        const megabytes = positiveInteger(
          requiredValue(arguments_, index, argument),
          argument,
        );
        if (megabytes > MAXIMUM_FILE_MEGABYTES) {
          throw new TypeError(`--max-file-mb must not exceed ${MAXIMUM_FILE_MEGABYTES}`);
        }
        maximumFileBytes = megabytes * 1024 * 1024;
        index += 1;
        break;
      }
      case "--include-unknown":
        includeUnknownFiles = true;
        break;
      case "--json":
        json = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        throw new TypeError(`unknown option: ${argument}`);
    }
  }

  if (!help && (!localRoot || !remoteRoot)) {
    throw new TypeError("--local and --remote-folder are required");
  }
  const mode: DesktopSyncCliMode = selectedMode ?? "once";
  if (mode === "watch" && intervalMs < 1_000) {
    throw new TypeError("--interval must be at least 1000ms in watch mode");
  }

  return {
    localRoot: localRoot ? resolve(localRoot) : "",
    remoteRoot: remoteRoot ? resolve(remoteRoot) : "",
    mode,
    intervalMs,
    includeUnknownFiles,
    maximumFileBytes,
    json,
    help,
  };
}

async function assertLocalRoot(localRoot: string): Promise<void> {
  const metadata = await stat(localRoot);
  if (!metadata.isDirectory()) {
    throw new TypeError("--local must point to a directory");
  }
}

function summarize(
  options: DesktopSyncCliOptions,
  result: DesktopSyncCycleResult,
): DesktopSyncCliRunResult {
  const conflict = result.counts.conflict > 0;
  return {
    exitCode: conflict ? 2 : 0,
    summary: {
      mode: options.mode,
      status: conflict ? "conflict" : "ready",
      localRoot: options.localRoot,
      remoteRoot: options.remoteRoot,
      counts: result.counts,
      execution: result.execution,
      plan: result.plan.map((item) => ({
        relativePath: item.relativePath,
        action: item.action,
        reason: item.reason,
      })),
    },
  };
}

function formatHumanSummary(summary: DesktopSyncCliSummary): string {
  if (summary.status === "watching") {
    return `Watching ${summary.localRoot} ↔ ${summary.remoteRoot}`;
  }
  const counts = summary.counts;
  if (!counts) return `No sync result for ${summary.localRoot}`;
  const headline = summary.status === "conflict"
    ? `${counts.conflict} conflict(s) require review; no changes were applied.`
    : `Sync ready: ${counts.upload} upload, ${counts.download} download, ${counts["delete-local"]} local delete, ${counts["delete-remote"]} remote delete, ${counts.record} unchanged.`;
  const details = summary.plan
    .filter((item) => item.action !== "record")
    .map((item) => `  ${item.action.padEnd(13)} ${item.relativePath} (${item.reason})`)
    .join("\n");
  return details ? `${headline}\n${details}` : headline;
}

function writeSummary(
  io: DesktopSyncCliIo,
  summary: DesktopSyncCliSummary,
  json: boolean,
): void {
  io.stdout.write(
    json
      ? `${JSON.stringify(summary)}\n`
      : `${formatHumanSummary(summary)}\n`,
  );
}

async function planDryRun(
  options: DesktopSyncCliOptions,
  remote: FileSystemDesktopSyncRemote,
): Promise<DesktopSyncCycleResult> {
  const [journal, localFiles, remoteFiles] = await Promise.all([
    loadSyncJournal(options.localRoot),
    scanSyncFolder(options.localRoot, options),
    remote.listRemoteFiles(),
  ]);
  const plan = buildDesktopSyncPlan(localFiles, remoteFiles, journal);
  return {
    plan,
    counts: countSyncPlanActions(plan),
    execution: null,
  };
}

export async function executeDesktopSyncCli(
  options: DesktopSyncCliOptions,
): Promise<DesktopSyncCliRunResult> {
  await assertLocalRoot(options.localRoot);
  const remote = await FileSystemDesktopSyncRemote.create(options.remoteRoot, options);
  await remote.assertDistinctFrom(options.localRoot);
  const result = options.mode === "dry-run"
    ? await planDryRun(options, remote)
    : await runDesktopSyncCycle(options.localRoot, remote, options);
  return summarize(options, result);
}

function waitForShutdown(): Promise<NodeJS.Signals> {
  return new Promise((resolveShutdown) => {
    const finish = (signal: NodeJS.Signals): void => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
      resolveShutdown(signal);
    };
    const onInterrupt = (): void => finish("SIGINT");
    const onTerminate = (): void => finish("SIGTERM");
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
  });
}

export async function runDesktopSyncCli(
  arguments_: readonly string[],
  io: DesktopSyncCliIo = process,
): Promise<number> {
  const options = parseDesktopSyncCliArguments(arguments_);
  if (options.help) {
    io.stdout.write(DESKTOP_SYNC_CLI_HELP);
    return 0;
  }
  if (options.mode !== "watch") {
    const result = await executeDesktopSyncCli(options);
    writeSummary(io, result.summary, options.json);
    return result.exitCode;
  }

  await assertLocalRoot(options.localRoot);
  const remote = await FileSystemDesktopSyncRemote.create(options.remoteRoot, options);
  await remote.assertDistinctFrom(options.localRoot);
  let conflictSeen = false;
  const agent = startDesktopSyncAgent(options.localRoot, remote, {
    intervalMs: options.intervalMs,
    includeUnknownFiles: options.includeUnknownFiles,
    maximumFileBytes: options.maximumFileBytes,
    onResult(result) {
      const completed = summarize(options, result);
      conflictSeen ||= completed.exitCode === 2;
      writeSummary(io, completed.summary, options.json);
    },
    onError(error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`Desktop sync cycle failed: ${message}\n`);
    },
  });
  writeSummary(io, {
    mode: "watch",
    status: "watching",
    localRoot: options.localRoot,
    remoteRoot: options.remoteRoot,
    counts: null,
    execution: null,
    plan: [],
  }, options.json);
  await waitForShutdown();
  agent.stop();
  return conflictSeen ? 2 : 0;
}

if (
  process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.exitCode = await runDesktopSyncCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ToonStudio sync failed: ${message}\n`);
    process.exitCode = 1;
  }
}
