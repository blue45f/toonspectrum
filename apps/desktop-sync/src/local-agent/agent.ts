import { DesktopSyncJournal } from "./journal.js";
import { resolveBoundPath } from "./path-safety.js";
import { scanDesktopBinding } from "./scanner.js";

import type {
  DesktopFileSnapshot,
  DesktopSyncBinding,
  DesktopSyncCredentialBroker,
  DesktopSyncJournalEntry,
  DesktopSyncReconcileResult,
  DesktopSyncTransport,
} from "./types.js";

function validGrant(url: string, expiresAt: string): boolean {
  try {
    const parsed = new URL(url);
    const expiry = Date.parse(expiresAt);
    return parsed.protocol === "https:" && Number.isFinite(expiry) && expiry > Date.now();
  } catch {
    return false;
  }
}

function changed(
  previous: DesktopFileSnapshot | undefined,
  current: DesktopFileSnapshot,
): boolean {
  return !previous
    || previous.sha256 !== current.sha256
    || previous.size !== current.size;
}

export class DesktopSyncAgent {
  readonly binding: DesktopSyncBinding;
  readonly journal: DesktopSyncJournal;
  #snapshot: ReadonlyMap<string, DesktopFileSnapshot> = new Map();
  #hydrated = false;
  #running = false;

  constructor(binding: DesktopSyncBinding) {
    this.binding = Object.freeze({ ...binding });
    this.journal = new DesktopSyncJournal(binding.rootPath);
  }

  get snapshot(): ReadonlyMap<string, DesktopFileSnapshot> {
    return this.#snapshot;
  }

  async reconcile(observedAt = new Date().toISOString()): Promise<DesktopSyncReconcileResult> {
    const current = await scanDesktopBinding(this.binding);
    const persisted = await this.journal.read();
    if (!this.#hydrated) {
      const hydrated = new Map<string, DesktopFileSnapshot>();
      for (const entry of persisted) {
        if (entry.operation === "delete") {
          hydrated.delete(entry.relativePath);
        } else if (entry.sha256 && entry.size !== null && entry.modifiedAtMs !== null) {
          hydrated.set(entry.relativePath, Object.freeze({
            relativePath: entry.relativePath,
            sha256: entry.sha256,
            size: entry.size,
            modifiedAtMs: entry.modifiedAtMs,
          }));
        }
      }
      this.#snapshot = hydrated;
      this.#hydrated = true;
    }
    let sequence = persisted.length;
    const entries: DesktopSyncJournalEntry[] = [];
    const paths = new Set([...this.#snapshot.keys(), ...current.keys()]);

    for (const relativePath of [...paths].sort()) {
      const before = this.#snapshot.get(relativePath);
      const after = current.get(relativePath);
      if (after && changed(before, after)) {
        sequence += 1;
        entries.push(Object.freeze({
          version: 1,
          bindingId: this.binding.id,
          projectId: this.binding.projectId,
          sequence,
          operation: "upsert",
          relativePath,
          sha256: after.sha256,
          size: after.size,
          modifiedAtMs: after.modifiedAtMs,
          observedAt,
        }));
      } else if (before && !after) {
        sequence += 1;
        entries.push(Object.freeze({
          version: 1,
          bindingId: this.binding.id,
          projectId: this.binding.projectId,
          sequence,
          operation: "delete",
          relativePath,
          sha256: null,
          size: null,
          modifiedAtMs: null,
          observedAt,
        }));
      }
    }

    await this.journal.append(entries);
    this.#snapshot = current;
    return Object.freeze({ entries: Object.freeze(entries), snapshot: current });
  }

  async flush(
    entries: readonly DesktopSyncJournalEntry[],
    broker: DesktopSyncCredentialBroker,
    transport: DesktopSyncTransport,
  ): Promise<void> {
    for (const entry of entries) {
      const grant = await broker.grant(entry);
      if (!validGrant(grant.url, grant.expiresAt)) {
        throw new Error("desktop sync broker returned an unsafe or expired grant");
      }
      const absolutePath = entry.operation === "upsert"
        ? resolveBoundPath(this.binding.rootPath, entry.relativePath)
        : null;
      await transport.send(entry, grant, absolutePath);
    }
  }

  startPolling(input: {
    readonly intervalMs: number;
    readonly signal: AbortSignal;
    readonly onEntries?: (entries: readonly DesktopSyncJournalEntry[]) => void | Promise<void>;
    readonly onError?: (error: unknown) => void;
  }): void {
    if (this.#running) throw new Error("desktop sync polling is already active");
    if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
      throw new Error("desktop sync polling interval must be at least one second");
    }
    this.#running = true;
    const run = async () => {
      if (input.signal.aborted) {
        this.#running = false;
        return;
      }
      try {
        const result = await this.reconcile();
        if (result.entries.length > 0) await input.onEntries?.(result.entries);
      } catch (error) {
        input.onError?.(error);
      }
      if (input.signal.aborted) {
        this.#running = false;
        return;
      }
      setTimeout(() => { void run(); }, input.intervalMs).unref?.();
    };
    void run();
  }
}
