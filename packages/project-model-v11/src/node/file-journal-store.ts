import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { journalEntryIRSchema, snapshotIRSchema } from "../ir/journal";

import type { JournalStore } from "../command/journal-store";
import type { JournalEntryIR, SnapshotIR } from "../ir/journal";

/**
 * File-backed JournalStore (Node): JSONL append journal + two snapshot files.
 *
 * Crash semantics under test: a torn final JSONL line (partial write) is
 * skipped at read time; snapshot writes go through tmp+rename so a slot is
 * either the old or the new content, never a mix.
 */
export class FileJournalStore implements JournalStore {
  private constructor(private readonly dir: string) {}

  static async open(dir: string): Promise<FileJournalStore> {
    await mkdir(dir, { recursive: true });
    return new FileJournalStore(dir);
  }

  private get journalPath(): string {
    return join(this.dir, "journal.jsonl");
  }

  private snapshotPath(slot: string): string {
    return join(this.dir, `snapshot-${slot.toLowerCase()}.json`);
  }

  async append(entry: JournalEntryIR): Promise<void> {
    await appendFile(this.journalPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async readEntries(): Promise<JournalEntryIR[]> {
    let content: string;
    try {
      content = await readFile(this.journalPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const entries: JournalEntryIR[] = [];
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      try {
        const parsed = journalEntryIRSchema.safeParse(JSON.parse(line));
        if (parsed.success) entries.push(parsed.data);
      } catch {
        // Torn tail line from a crash mid-append: recovery sees a shorter
        // journal, which is exactly the durable prefix.
      }
    }
    return entries;
  }

  async writeSnapshot(snapshot: SnapshotIR): Promise<void> {
    const target = this.snapshotPath(snapshot.slot);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, JSON.stringify(snapshot), "utf8");
    await rename(tmp, target);
  }

  async readSnapshots(): Promise<SnapshotIR[]> {
    const snapshots: SnapshotIR[] = [];
    for (const slot of ["A", "B"]) {
      try {
        const raw = await readFile(this.snapshotPath(slot), "utf8");
        const parsed = snapshotIRSchema.safeParse(JSON.parse(raw));
        if (parsed.success) snapshots.push(parsed.data);
      } catch {
        // Missing or unreadable slot: recovery falls back to the other slot.
      }
    }
    return snapshots;
  }
}
