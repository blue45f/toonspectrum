import { executeDesktopSyncPlan } from "./agent.js";
import { loadSyncJournal, saveSyncJournal } from "./journal.js";
import { buildDesktopSyncPlan, countSyncPlanActions } from "./planner.js";
import { scanSyncFolder } from "./scanner.js";

import type {
  DesktopSyncExecutionResult,
  DesktopSyncTransport,
} from "./agent.js";
import type { RemoteFileSnapshot } from "./model.js";
import type { SyncPlanAction, SyncPlanItem } from "./planner.js";
import type { ScanSyncFolderOptions } from "./scanner.js";

export interface DesktopSyncRemote extends DesktopSyncTransport {
  listRemoteFiles(signal?: AbortSignal): Promise<readonly RemoteFileSnapshot[]>;
  assertDistinctFrom?(localRoot: string): Promise<void>;
  commitMetadata?(signal?: AbortSignal): Promise<void>;
}

export interface DesktopSyncCycleOptions extends ScanSyncFolderOptions {
  readonly signal?: AbortSignal;
  readonly now?: string;
}

export interface DesktopSyncCycleResult {
  readonly plan: readonly SyncPlanItem[];
  readonly counts: Readonly<Record<SyncPlanAction, number>>;
  readonly execution: DesktopSyncExecutionResult | null;
}

export async function runDesktopSyncCycle(
  root: string,
  remote: DesktopSyncRemote,
  options: DesktopSyncCycleOptions = {},
): Promise<DesktopSyncCycleResult> {
  if (options.signal?.aborted) throw options.signal.reason;
  await remote.assertDistinctFrom?.(root);
  if (options.signal?.aborted) throw options.signal.reason;
  const [journal, localFiles, remoteFiles] = await Promise.all([
    loadSyncJournal(root),
    scanSyncFolder(root, options),
    remote.listRemoteFiles(options.signal),
  ]);
  if (options.signal?.aborted) throw options.signal.reason;
  const plan = buildDesktopSyncPlan(localFiles, remoteFiles, journal);
  const counts = countSyncPlanActions(plan);
  if (counts.conflict > 0) return { plan, counts, execution: null };
  const execution = await executeDesktopSyncPlan(
    root,
    plan,
    journal,
    remote,
    options.now ?? new Date().toISOString(),
  );
  await remote.commitMetadata?.(options.signal);
  await saveSyncJournal(root, execution.journal);
  return { plan, counts, execution };
}

export interface DesktopSyncAgent {
  trigger(): Promise<DesktopSyncCycleResult>;
  stop(): void;
}

export interface StartDesktopSyncAgentOptions extends ScanSyncFolderOptions {
  readonly intervalMs?: number;
  readonly onResult?: (result: DesktopSyncCycleResult) => void;
  readonly onError?: (error: unknown) => void;
}

export function startDesktopSyncAgent(
  root: string,
  remote: DesktopSyncRemote,
  options: StartDesktopSyncAgentOptions = {},
): DesktopSyncAgent {
  const intervalMs = options.intervalMs ?? 5_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new TypeError("intervalMs must be an integer of at least 1000ms");
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: Promise<DesktopSyncCycleResult> | null = null;

  const schedule = (): void => {
    if (stopped || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void trigger().catch(() => undefined);
    }, intervalMs);
    timer.unref?.();
  };
  const trigger = (): Promise<DesktopSyncCycleResult> => {
    if (stopped) return Promise.reject(new Error("desktop sync agent is stopped"));
    if (current !== null) return current;
    current = runDesktopSyncCycle(root, remote, options)
      .then((result) => {
        options.onResult?.(result);
        return result;
      })
      .catch((error: unknown) => {
        options.onError?.(error);
        throw error;
      })
      .finally(() => {
        current = null;
        schedule();
      });
    return current;
  };

  void trigger().catch(() => undefined);
  return {
    trigger,
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
