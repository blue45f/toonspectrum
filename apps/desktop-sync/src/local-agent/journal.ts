import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

import type { DesktopSyncJournalEntry } from "./types.js";

const MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
const MAX_LINE_BYTES = 64 * 1024;

export class DesktopSyncJournal {
  readonly filePath: string;

  constructor(rootPath: string) {
    this.filePath = path.join(rootPath, ".toonstudio-sync", "journal.v1.jsonl");
  }

  async append(entries: readonly DesktopSyncJournalEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const payload = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
    if (Buffer.byteLength(payload) > MAX_JOURNAL_BYTES) {
      throw new Error("desktop sync journal batch is too large");
    }
    const handle = await open(this.filePath, "a", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async read(): Promise<readonly DesktopSyncJournalEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    if (Buffer.byteLength(raw) > MAX_JOURNAL_BYTES) {
      throw new Error("desktop sync journal exceeds safety limit");
    }
    const entries: DesktopSyncJournalEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line) continue;
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
        throw new Error("desktop sync journal record exceeds safety limit");
      }
      const entry = JSON.parse(line) as DesktopSyncJournalEntry;
      if (
        entry.version !== 1
        || !Number.isSafeInteger(entry.sequence)
        || entry.sequence !== entries.length + 1
        || (entry.operation !== "upsert" && entry.operation !== "delete")
        || typeof entry.relativePath !== "string"
      ) {
        throw new Error("desktop sync journal is corrupt");
      }
      entries.push(Object.freeze(entry));
    }
    return Object.freeze(entries);
  }
}
