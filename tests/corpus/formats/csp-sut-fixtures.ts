import { DatabaseSync } from "node:sqlite";

import { buildInkBasicKpp } from "../brushes/kpp/synthetic-kpp";

import type {
  CspSqliteSnapshot,
  CspSqliteTableSnapshot,
  CspSutSqliteReader,
} from "../../../packages/studio-format-gateway/src/csp-sut";


type SerializableDatabaseSync = DatabaseSync & {
  deserialize(data: Uint8Array): void;
  serialize(): Uint8Array;
};

export function buildPressureGraph(curve: readonly number[], version = 1): Uint8Array {
  const bytes = new Uint8Array(28 + curve.length * 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, version, false);
  view.setUint32(4, curve.length, false);
  view.setUint32(8, 8, false);
  for (let index = 0; index < curve.length; index += 1) {
    view.setFloat64(28 + index * 8, curve[index] ?? 0, false);
  }
  return bytes;
}

export interface SutFixtureOptions {
  group?: boolean;
  pressureVersion?: number;
  includeMaterial?: boolean;
}

export function buildAuthoredSutFixture(options: SutFixtureOptions = {}): Uint8Array {
  const database = new DatabaseSync(":memory:") as SerializableDatabaseSync;
  try {
    database.exec(`
      PRAGMA page_size = 4096;
      PRAGMA journal_mode = DELETE;
      PRAGMA auto_vacuum = NONE;
      PRAGMA user_version = 12;
      PRAGMA application_id = 0x54535453;
      CREATE TABLE ToolProperty (
        Id INTEGER PRIMARY KEY,
        Name TEXT NOT NULL,
        OutputProcess TEXT NOT NULL,
        BrushSize REAL NOT NULL,
        Hardness REAL NOT NULL,
        Spacing REAL NOT NULL,
        Opacity REAL NOT NULL,
        Stabilization REAL NOT NULL,
        PressureGraph BLOB NOT NULL,
        OpacityPressureGraph BLOB,
        Author TEXT,
        License TEXT,
        Website TEXT,
        Email TEXT,
        FutureCspField BLOB
      );
      CREATE TABLE MaterialFile (
        _PW_ID INTEGER PRIMARY KEY,
        FileData BLOB NOT NULL
      );
    `);
    const insert = database.prepare(`
      INSERT INTO ToolProperty (
        Id, Name, OutputProcess, BrushSize, Hardness, Spacing, Opacity,
        Stabilization, PressureGraph, OpacityPressureGraph, Author, License,
        Website, Email, FutureCspField
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      1,
      "Authored CSP Ink",
      "direct-draw",
      36,
      0.82,
      12,
      0.9,
      0.42,
      buildPressureGraph([0.05, 0.18, 0.42, 0.72, 1], options.pressureVersion),
      buildPressureGraph([0.1, 0.3, 0.6, 0.82, 1]),
      "ToonSpectrum QA",
      "CC0-1.0",
      "https://example.invalid/toonspectrum",
      "qa@example.invalid",
      Uint8Array.from([0xfa, 0xce]),
    );
    if (options.group) {
      insert.run(
        2,
        "Authored CSP Wash",
        "direct-draw",
        180,
        0.25,
        18,
        0.72,
        0.25,
        buildPressureGraph([0, 0.08, 0.3, 0.65, 1]),
        buildPressureGraph([0, 0.2, 0.55, 0.85, 1]),
        "ToonSpectrum QA",
        "CC0-1.0",
        "https://example.invalid/toonspectrum",
        "qa@example.invalid",
        Uint8Array.from([0xbe, 0xef]),
      );
    }
    if (options.includeMaterial !== false) {
      database.prepare("INSERT INTO MaterialFile (_PW_ID, FileData) VALUES (?, ?)").run(
        1,
        buildInkBasicKpp(),
      );
    }
    database.exec("VACUUM");
    return new Uint8Array(database.serialize());
  } finally {
    database.close();
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeSqliteValue(value: unknown): string | number | bigint | Uint8Array | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Uint8Array) return new Uint8Array(value);
  throw new TypeError(`unexpected node:sqlite value ${typeof value}`);
}

export const readAuthoredSutWithNodeSqlite: CspSutSqliteReader = async (
  bytes,
  context,
): Promise<CspSqliteSnapshot> => {
  if (context.signal?.aborted) throw new DOMException("aborted", "AbortError");
  const database = new DatabaseSync(":memory:") as SerializableDatabaseSync;
  try {
    database.deserialize(bytes);
    database.enableDefensive(true);
    database.enableLoadExtension(false);
    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => String((row as { name: unknown }).name));
    if (tableNames.length > context.maxTables) throw new Error("table limit exceeded");
    const tables: CspSqliteTableSnapshot[] = [];
    let totalRows = 0;
    for (const name of tableNames) {
      const quoted = quoteIdentifier(name);
      const columns = database
        .prepare(`PRAGMA table_info(${quoted})`)
        .all()
        .map((row) => String((row as { name: unknown }).name));
      if (columns.length > context.maxColumnsPerTable) throw new Error("column limit exceeded");
      const rows = database.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all().map((raw) => {
        const result: Record<string, string | number | bigint | Uint8Array | null> = {};
        for (const [column, value] of Object.entries(raw)) {
          result[column] = normalizeSqliteValue(value);
        }
        return result;
      });
      totalRows += rows.length;
      if (totalRows > context.maxRows) throw new Error("row limit exceeded");
      tables.push({ name, columns, rows });
    }
    return {
      sqliteVersion: String(database.prepare("SELECT sqlite_version() AS version").get()?.version),
      tables,
    };
  } finally {
    database.close();
  }
};
