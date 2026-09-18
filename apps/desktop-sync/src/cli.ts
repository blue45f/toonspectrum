#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  openDesktopConflictResolverBrowser,
  startDesktopSyncConflictServer,
} from "./conflict-server.js";
import {
  SystemDesktopCredentialVault,
} from "./credential-vault.js";
import { loadSyncJournal } from "./journal.js";
import {
  DEFAULT_DESKTOP_OAUTH_PROFILE,
  DESKTOP_OAUTH_CLIENT_ID_ENVIRONMENT,
  DesktopOAuthCredentialManager,
  desktopOAuthProviderConfig,
} from "./oauth.js";
import { buildDesktopSyncPlan, countSyncPlanActions } from "./planner.js";
import {
  DEFAULT_CLOUD_ACCESS_TOKEN_ENVIRONMENT,
  createDesktopSyncRemoteForTarget,
  desktopSyncRemoteLabel,
  parseDesktopCloudProviderId,
  type DesktopSyncRemoteDependencies,
  type DesktopSyncRemoteTarget,
} from "./remote-target.js";
import {
  runDesktopSyncCycle,
  startDesktopSyncAgent,
} from "./runtime.js";
import { scanSyncFolder } from "./scanner.js";

import type { DesktopSyncCycleResult, DesktopSyncRemote } from "./runtime.js";
import type { ScanSyncFolderOptions } from "./scanner.js";

export type DesktopSyncCliMode = "once" | "watch" | "dry-run";

export interface DesktopSyncCliOptions extends ScanSyncFolderOptions {
  readonly localRoot: string;
  readonly remoteRoot: string;
  readonly remoteTarget: DesktopSyncRemoteTarget;
  readonly mode: DesktopSyncCliMode;
  readonly intervalMs: number;
  readonly json: boolean;
  readonly help: boolean;
}

export interface DesktopSyncCliIo {
  readonly stdout: { write(value: string): unknown };
  readonly stderr: { write(value: string): unknown };
}

export interface DesktopSyncCliDependencies extends DesktopSyncRemoteDependencies {
  readonly openConflictResolverBrowser?: typeof openDesktopConflictResolverBrowser;
  readonly startConflictServer?: typeof startDesktopSyncConflictServer;
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
  toonstudio-sync --local <folder> --cloud-provider <provider> [options]
  toonstudio-sync login --cloud-provider <provider> [options]
  toonstudio-sync auth-status --cloud-provider <provider> [options]
  toonstudio-sync logout --cloud-provider <provider> [options]
  toonstudio-sync resolve --local <folder> <remote-target> [options]

Remote targets:
  --remote-folder <path>       Local disk, external disk, NAS or mounted folder
  --cloud-provider <provider>  google-drive, dropbox or onedrive
  --cloud-root <path>          Provider root path (default: Sync)
  --access-token-env <name>    Optional legacy access-token environment variable
  --credential-profile <name>  OS credential-vault profile (default: default)

OAuth account commands:
  --oauth-client-id-env <name> Environment variable containing the public OAuth client id
  --onedrive-tenant <tenant>   common, consumers, organizations or tenant UUID

Conflict resolver:
  --no-browser           Print the protected loopback URL without opening a browser
  --port <port>          Fixed loopback port; 0 chooses an available port (default 0)

Modes:
  --once                 Run one conflict-safe sync cycle (default)
  --dry-run              Print the plan without changing either side
  --watch                 Keep polling and sync after each completed cycle

Options:
  --interval <ms>        Watch interval, minimum 1000 (default 5000)
  --include-unknown      Include file extensions outside the ToonStudio allowlist
  --max-file-mb <mb>     Skip files larger than this positive limit
  --json                 Emit machine-readable summaries
  --help                 Show this help

Legacy access-token fallback variables:
  Google Drive  TOONSTUDIO_GOOGLE_DRIVE_ACCESS_TOKEN
  Dropbox       TOONSTUDIO_DROPBOX_ACCESS_TOKEN
  OneDrive      TOONSTUDIO_ONEDRIVE_ACCESS_TOKEN

Exit codes:
  0  completed or watching
  1  configuration, authentication, network or integrity error
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
  let remoteFolder = "";
  let cloudProviderValue = "";
  let cloudRoot = "Sync";
  let accessTokenEnvironmentVariable = "";
  let credentialProfile = DEFAULT_DESKTOP_OAUTH_PROFILE;
  let credentialProfileExplicit = false;
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
        remoteFolder = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--cloud-provider":
        cloudProviderValue = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--cloud-root":
        cloudRoot = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--credential-profile":
        credentialProfile = requiredValue(arguments_, index, argument);
        credentialProfileExplicit = true;
        index += 1;
        break;
      case "--access-token-env":
        accessTokenEnvironmentVariable = requiredValue(arguments_, index, argument);
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

  if (!help && !localRoot) {
    throw new TypeError("--local is required");
  }
  if (!help && Boolean(remoteFolder) === Boolean(cloudProviderValue)) {
    throw new TypeError(
      "choose exactly one of --remote-folder or --cloud-provider",
    );
  }
  if (remoteFolder && (
    accessTokenEnvironmentVariable
    || cloudRoot !== "Sync"
    || credentialProfileExplicit
  )) {
    throw new TypeError(
      "--cloud-root, --access-token-env and --credential-profile require --cloud-provider",
    );
  }
  const mode: DesktopSyncCliMode = selectedMode ?? "once";
  if (mode === "watch" && intervalMs < 1_000) {
    throw new TypeError("--interval must be at least 1000ms in watch mode");
  }

  let remoteTarget: DesktopSyncRemoteTarget;
  if (cloudProviderValue) {
    const provider = parseDesktopCloudProviderId(cloudProviderValue);
    remoteTarget = {
      kind: "cloud",
      provider,
      rootPath: cloudRoot,
      credentialProfile,
      accessTokenEnvironmentVariable:
        accessTokenEnvironmentVariable
        || DEFAULT_CLOUD_ACCESS_TOKEN_ENVIRONMENT[provider],
    };
  } else {
    remoteTarget = {
      kind: "filesystem",
      root: remoteFolder ? resolve(remoteFolder) : "",
    };
  }

  return {
    localRoot: localRoot ? resolve(localRoot) : "",
    remoteRoot: desktopSyncRemoteLabel(remoteTarget),
    remoteTarget,
    mode,
    intervalMs,
    includeUnknownFiles,
    maximumFileBytes,
    json,
    help,
  };
}

export interface DesktopSyncResolveCliOptions {
  readonly sync: DesktopSyncCliOptions;
  readonly noBrowser: boolean;
  readonly port: number;
}

export function parseDesktopSyncResolveArguments(
  arguments_: readonly string[],
): DesktopSyncResolveCliOptions {
  const forwarded: string[] = [];
  let noBrowser = false;
  let port = 0;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--no-browser") {
      noBrowser = true;
      continue;
    }
    if (argument === "--port") {
      const value = requiredValue(arguments_, index, argument);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 65_535) {
        throw new TypeError("--port must be an integer between 0 and 65535");
      }
      port = parsed;
      index += 1;
      continue;
    }
    forwarded.push(argument);
  }
  const sync = parseDesktopSyncCliArguments(forwarded);
  if (!sync.help && sync.mode !== "once") {
    throw new TypeError("resolve does not accept --dry-run or --watch");
  }
  return { sync, noBrowser, port };
}

export type DesktopSyncAuthCommand =
  | "login"
  | "logout"
  | "auth-status";

interface DesktopSyncAuthCliOptions {
  readonly command: DesktopSyncAuthCommand;
  readonly provider: ReturnType<typeof parseDesktopCloudProviderId>;
  readonly credentialProfile: string;
  readonly oauthClientIdEnvironmentVariable: string;
  readonly oneDriveTenant: string;
  readonly json: boolean;
  readonly help: boolean;
}

function parseDesktopSyncAuthArguments(
  command: DesktopSyncAuthCommand,
  arguments_: readonly string[],
): DesktopSyncAuthCliOptions {
  let providerValue = "";
  let credentialProfile = DEFAULT_DESKTOP_OAUTH_PROFILE;
  let oauthClientIdEnvironmentVariable = "";
  let oneDriveTenant = "";
  let json = false;
  let help = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    switch (argument) {
      case "--cloud-provider":
        providerValue = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--credential-profile":
        credentialProfile = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--oauth-client-id-env":
        oauthClientIdEnvironmentVariable = requiredValue(
          arguments_,
          index,
          argument,
        );
        index += 1;
        break;
      case "--onedrive-tenant":
        oneDriveTenant = requiredValue(arguments_, index, argument);
        index += 1;
        break;
      case "--json":
        json = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        throw new TypeError(`unknown ${command} option: ${argument}`);
    }
  }
  if (!help && !providerValue) {
    throw new TypeError(`${command} requires --cloud-provider`);
  }
  const provider = providerValue
    ? parseDesktopCloudProviderId(providerValue)
    : "google-drive";
  if (provider !== "onedrive" && oneDriveTenant) {
    throw new TypeError("--onedrive-tenant requires --cloud-provider onedrive");
  }
  return {
    command,
    provider,
    credentialProfile,
    oauthClientIdEnvironmentVariable:
      oauthClientIdEnvironmentVariable
      || DESKTOP_OAUTH_CLIENT_ID_ENVIRONMENT[provider],
    oneDriveTenant,
    json,
    help,
  };
}

function authHumanSummary(
  command: DesktopSyncAuthCommand,
  status: Awaited<ReturnType<DesktopOAuthCredentialManager["status"]>>,
): string {
  if (command === "logout") {
    return `${status.provider} profile ${status.profile} disconnected.`;
  }
  if (!status.connected) {
    return `${status.provider} profile ${status.profile} is not connected.`;
  }
  return `${status.provider} profile ${status.profile} connected as ${status.accountLabel ?? "unknown account"}; expires ${status.expiresAt ?? "unknown"}.`;
}

async function runDesktopSyncAuthCommand(
  options: DesktopSyncAuthCliOptions,
  io: DesktopSyncCliIo,
  dependencies: DesktopSyncRemoteDependencies,
): Promise<number> {
  if (options.help) {
    io.stdout.write(DESKTOP_SYNC_CLI_HELP);
    return 0;
  }
  const environment = dependencies.environment ?? process.env;
  const vault = dependencies.credentialVault
    ?? new SystemDesktopCredentialVault();
  const manager = dependencies.oauthManager
    ?? new DesktopOAuthCredentialManager(vault, {
      fetchImpl: dependencies.fetchImpl,
    });
  if (options.command === "login") {
    const clientId = environment[
      options.oauthClientIdEnvironmentVariable
    ]?.trim();
    if (!clientId) {
      throw new TypeError(
        `OAuth client id is missing from ${options.oauthClientIdEnvironmentVariable}`,
      );
    }
    const tenant = options.oneDriveTenant
      || environment.TOONSTUDIO_ONEDRIVE_OAUTH_TENANT;
    const config = desktopOAuthProviderConfig(
      options.provider,
      clientId,
      tenant,
    );
    const status = await manager.login(config, {
      profile: options.credentialProfile,
    });
    io.stdout.write(options.json
      ? `${JSON.stringify(status)}\n`
      : `${authHumanSummary(options.command, status)}\n`);
    return 0;
  }
  if (options.command === "logout") {
    await manager.logout(
      options.provider,
      options.credentialProfile,
    );
  }
  const status = await manager.status(
    options.provider,
    options.credentialProfile,
  );
  io.stdout.write(options.json
    ? `${JSON.stringify(status)}\n`
    : `${authHumanSummary(options.command, status)}\n`);
  return 0;
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
    : `Sync ready: ${counts.upload} upload, ${counts.download} download, ${counts["delete-local"]} local delete, ${counts["delete-remote"]} remote delete, ${counts.record} unchanged, ${counts.forget} removed tombstone.`;
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
  remote: DesktopSyncRemote,
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

async function createRemote(
  options: DesktopSyncCliOptions,
  dependencies: DesktopSyncRemoteDependencies = {},
): Promise<DesktopSyncRemote> {
  return createDesktopSyncRemoteForTarget(
    options.remoteTarget,
    options.localRoot,
    {
      includeUnknownFiles: options.includeUnknownFiles,
      maximumFileBytes: options.maximumFileBytes,
    },
    dependencies,
  );
}

export async function executeDesktopSyncCli(
  options: DesktopSyncCliOptions,
  dependencies: DesktopSyncRemoteDependencies = {},
): Promise<DesktopSyncCliRunResult> {
  await assertLocalRoot(options.localRoot);
  const remote = await createRemote(options, dependencies);
  const result = options.mode === "dry-run"
    ? await planDryRun(options, remote)
    : await runDesktopSyncCycle(options.localRoot, remote, options);
  return summarize(options, result);
}

async function runDesktopSyncConflictCommand(
  arguments_: readonly string[],
  io: DesktopSyncCliIo,
  dependencies: DesktopSyncCliDependencies,
): Promise<number> {
  const options = parseDesktopSyncResolveArguments(arguments_);
  if (options.sync.help) {
    io.stdout.write(DESKTOP_SYNC_CLI_HELP);
    return 0;
  }
  await assertLocalRoot(options.sync.localRoot);
  const remote = await createRemote(options.sync, dependencies);
  const startServer = dependencies.startConflictServer
    ?? startDesktopSyncConflictServer;
  const resolver = await startServer(
    options.sync.localRoot,
    remote,
    {
      includeUnknownFiles: options.sync.includeUnknownFiles,
      maximumFileBytes: options.sync.maximumFileBytes,
      port: options.port,
      remoteLabel: options.sync.remoteRoot,
    },
  );
  try {
    if (resolver.report.conflicts.length === 0) {
      io.stdout.write(options.sync.json
        ? `${JSON.stringify({
            event: "complete",
            status: "ready",
            conflictCount: 0,
          })}\n`
        : "No desktop sync conflicts require review.\n");
      return 0;
    }

    io.stdout.write(options.sync.json
      ? `${JSON.stringify({
          event: "review-required",
          status: "conflict",
          conflictCount: resolver.report.conflicts.length,
          reportId: resolver.report.reportId,
          url: resolver.url,
        })}\n`
      : `Review ${resolver.report.conflicts.length} conflict(s) at:\n${resolver.url}\n`);
    if (!options.noBrowser) {
      const openBrowser = dependencies.openConflictResolverBrowser
        ?? openDesktopConflictResolverBrowser;
      try {
        await openBrowser(resolver.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        io.stderr.write(
          `Could not open the conflict resolver browser: ${message}\nUse the printed loopback URL instead.\n`,
        );
      }
    }

    const result = await resolver.completion;
    if (result === null) {
      io.stderr.write("Conflict resolver closed before every decision was applied.\n");
      return 2;
    }
    io.stdout.write(options.sync.json
      ? `${JSON.stringify({
          event: "complete",
          status: "resolved",
          receiptSha256: result.receipt.receiptSha256,
          sessionId: result.receipt.sessionId,
          receiptPath: result.receiptPath,
          counts: result.finalCycle.counts,
        })}\n`
      : `Conflict resolution completed. Receipt ${result.receipt.receiptSha256}\n${result.receiptPath}\n`);
    return 0;
  } finally {
    await resolver.close();
  }
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
  dependencies: DesktopSyncCliDependencies = {},
): Promise<number> {
  const command = arguments_[0];
  if (command === "resolve") {
    return runDesktopSyncConflictCommand(
      arguments_.slice(1),
      io,
      dependencies,
    );
  }
  if (command === "login"
    || command === "logout"
    || command === "auth-status") {
    return runDesktopSyncAuthCommand(
      parseDesktopSyncAuthArguments(command, arguments_.slice(1)),
      io,
      dependencies,
    );
  }
  const options = parseDesktopSyncCliArguments(arguments_);
  if (options.help) {
    io.stdout.write(DESKTOP_SYNC_CLI_HELP);
    return 0;
  }
  if (options.mode !== "watch") {
    const result = await executeDesktopSyncCli(options, dependencies);
    writeSummary(io, result.summary, options.json);
    return result.exitCode;
  }

  await assertLocalRoot(options.localRoot);
  const remote = await createRemote(options, dependencies);
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

export function isDesktopSyncCliEntrypoint(
  argumentPath: string | undefined,
  moduleUrl: string = import.meta.url,
): boolean {
  if (!argumentPath) return false;
  try {
    return realpathSync(resolve(argumentPath))
      === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(resolve(argumentPath)).href === moduleUrl;
  }
}

if (isDesktopSyncCliEntrypoint(process.argv[1])) {
  try {
    process.exitCode = await runDesktopSyncCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ToonStudio sync failed: ${message}\n`);
    process.exitCode = 1;
  }
}
