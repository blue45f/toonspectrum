import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";

import {
  bytesToBase64,
  fnv1a64Hex,
  stableTextId,
  type FormatIssue,
} from "./format-common";

import type { BrushProgramIR, DynamicMappingIR } from "@toonspectrum/studio-project-model";

const SQLITE_SIGNATURE = new TextEncoder().encode("SQLite format 3\0");
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const CSP_TOOL_FILE_LIMITS = Object.freeze({
  maxBytes: 128_000_000,
  maxTables: 128,
  maxColumnsPerTable: 256,
  maxRows: 4_096,
  maxBlobBytes: 32_000_000,
  maxTextCharacters: 1_000_000,
  maxEmbeddedPngPixels: 64_000_000,
});

export type CspToolFileKind = "sut" | "sutg";
export type CspSqliteValue = string | number | bigint | Uint8Array | null;

export interface CspToolFileLimits {
  maxBytes: number;
  maxTables: number;
  maxColumnsPerTable: number;
  maxRows: number;
  maxBlobBytes: number;
  maxTextCharacters: number;
  maxEmbeddedPngPixels: number;
}

export interface CspSqliteTableSnapshot {
  name: string;
  columns: string[];
  /** Reader must return deterministic primary-key/rowid order. */
  rows: Array<Readonly<Record<string, CspSqliteValue>>>;
}

export interface CspSqliteSnapshot {
  tables: CspSqliteTableSnapshot[];
  sqliteVersion?: string;
}

export interface CspSqliteReadContext {
  kind: CspToolFileKind;
  maxTables: number;
  maxColumnsPerTable: number;
  maxRows: number;
  maxBlobBytes: number;
  maxTextCharacters: number;
  signal?: AbortSignal;
}

export type CspSutSqliteReader = (
  bytes: Uint8Array,
  context: CspSqliteReadContext,
) => Promise<CspSqliteSnapshot>;

export interface CspToolFileImportOptions {
  kind: CspToolFileKind;
  sqliteReader?: CspSutSqliteReader;
  signal?: AbortSignal;
  limits?: Partial<CspToolFileLimits>;
}

export interface CspSqliteHeaderInspection {
  container: "sqlite3" | "opaque";
  pageSize: number | null;
  readVersion: number | null;
  writeVersion: number | null;
  schemaFormat: number | null;
  textEncoding: "utf-8" | "utf-16le" | "utf-16be" | "unknown" | null;
  pageCount: number | null;
  userVersion: number | null;
  applicationId: number | null;
}

export interface CspEmbeddedAsset {
  id: string;
  mimeType: "image/png";
  sourceTable: string;
  sourceColumn: string;
  sourceRow: number;
  width: number;
  height: number;
  base64: string;
}

export interface CspToolRights {
  authors: string[];
  licenses: string[];
  websites: string[];
  emails: string[];
}

export interface CspToolFileImportResult {
  format: "clip-studio-tool" | "clip-studio-tool-group";
  supportLevel: "structured-partial" | "preserve-only";
  inspection: CspSqliteHeaderInspection;
  sqliteVersion: string | null;
  tables: Array<{ name: string; columns: string[]; rowCount: number }>;
  programs: BrushProgramIR[];
  assets: CspEmbeddedAsset[];
  rights: CspToolRights;
  warnings: FormatIssue[];
  unsupported: FormatIssue[];
  sourcePayload: { format: "csp-sut" | "csp-sutg"; base64: string };
}

export class CspToolFileError extends Error {
  constructor(
    message: string,
    readonly code: "aborted" | "invalid-options" | "source-too-large",
  ) {
    super(message);
    this.name = "CspToolFileError";
  }
}

type ResolvedLimits = CspToolFileLimits;

function formatIssue(
  scope: FormatIssue["scope"],
  code: string,
  message: string,
  path?: string,
): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

function resolveLimits(requested: CspToolFileImportOptions["limits"]): ResolvedLimits {
  const resolved: ResolvedLimits = { ...CSP_TOOL_FILE_LIMITS };
  if (requested === undefined) return resolved;
  for (const key of Object.keys(CSP_TOOL_FILE_LIMITS) as Array<keyof ResolvedLimits>) {
    const value = requested[key];
    const maximum = CSP_TOOL_FILE_LIMITS[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new CspToolFileError(
        `${key} must be an integer between 0 and ${maximum}`,
        "invalid-options",
      );
    }
    resolved[key] = value;
  }
  return resolved;
}

function equalAt(bytes: Uint8Array, needle: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + needle.byteLength > bytes.byteLength) return false;
  for (let index = 0; index < needle.byteLength; index += 1) {
    if (bytes[offset + index] !== needle[index]) return false;
  }
  return true;
}

function readUint32Big(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

export function inspectCspToolFile(bytes: Uint8Array): CspSqliteHeaderInspection {
  if (bytes.byteLength < SQLITE_SIGNATURE.byteLength || !equalAt(bytes, SQLITE_SIGNATURE, 0)) {
    return {
      container: "opaque",
      pageSize: null,
      readVersion: null,
      writeVersion: null,
      schemaFormat: null,
      textEncoding: null,
      pageCount: null,
      userVersion: null,
      applicationId: null,
    };
  }
  if (bytes.byteLength < 100) {
    return {
      container: "sqlite3",
      pageSize: null,
      readVersion: null,
      writeVersion: null,
      schemaFormat: null,
      textEncoding: null,
      pageCount: null,
      userVersion: null,
      applicationId: null,
    };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const storedPageSize = view.getUint16(16, false);
  const encoding = readUint32Big(view, 56);
  return {
    container: "sqlite3",
    pageSize: storedPageSize === 1 ? 65_536 : storedPageSize,
    writeVersion: bytes[18] ?? null,
    readVersion: bytes[19] ?? null,
    pageCount: readUint32Big(view, 28),
    schemaFormat: readUint32Big(view, 44),
    textEncoding:
      encoding === 1
        ? "utf-8"
        : encoding === 2
          ? "utf-16le"
          : encoding === 3
            ? "utf-16be"
            : "unknown",
    userVersion: readUint32Big(view, 60),
    applicationId: readUint32Big(view, 68),
  };
}

function validateSqliteHeader(
  bytes: Uint8Array,
  inspection: CspSqliteHeaderInspection,
  warnings: FormatIssue[],
  unsupported: FormatIssue[],
): boolean {
  if (inspection.container !== "sqlite3") {
    unsupported.push(
      formatIssue(
        "container",
        "sut-container-unverified",
        "CELSYS does not publish the SUT/SUTG container contract and this file is not a recognized SQLite 3 container; original bytes are preserved",
      ),
    );
    return false;
  }
  if (bytes.byteLength < 100 || inspection.pageSize === null) {
    unsupported.push(
      formatIssue("container", "sqlite-header-truncated", "SQLite header is shorter than 100 bytes"),
    );
    return false;
  }
  const pageSize = inspection.pageSize;
  if (
    pageSize < 512 ||
    pageSize > 65_536 ||
    (pageSize & (pageSize - 1)) !== 0 ||
    bytes.byteLength % pageSize !== 0
  ) {
    unsupported.push(
      formatIssue(
        "container",
        "sqlite-page-layout-invalid",
        `page size ${pageSize} does not describe the ${bytes.byteLength}-byte file`,
      ),
    );
    return false;
  }
  if (![1, 2].includes(inspection.readVersion ?? 0) || ![1, 2].includes(inspection.writeVersion ?? 0)) {
    unsupported.push(
      formatIssue("container", "sqlite-version-invalid", "SQLite read/write version is not 1 or 2"),
    );
    return false;
  }
  if (inspection.schemaFormat === null || inspection.schemaFormat < 1 || inspection.schemaFormat > 4) {
    unsupported.push(
      formatIssue(
        "container",
        "sqlite-schema-format-unsupported",
        `SQLite schema format ${String(inspection.schemaFormat)} is outside 1..4`,
      ),
    );
    return false;
  }
  if (inspection.textEncoding === "unknown") {
    unsupported.push(
      formatIssue("container", "sqlite-text-encoding-unsupported", "SQLite text encoding is unknown"),
    );
    return false;
  }
  if (inspection.readVersion === 2 || inspection.writeVersion === 2) {
    warnings.push(
      formatIssue(
        "container",
        "sqlite-wal-header",
        "database header indicates WAL mode; only the self-contained main database bytes are inspected",
      ),
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[20] !== 0 || bytes[21] !== 64 || bytes[22] !== 32 || bytes[23] !== 32) {
    unsupported.push(
      formatIssue(
        "container",
        "sqlite-payload-fractions-invalid",
        "SQLite reserved-byte/payload-fraction header fields are non-standard",
      ),
    );
    return false;
  }
  const headerPageCount = readUint32Big(view, 28);
  if (headerPageCount > 0 && headerPageCount * pageSize > bytes.byteLength) {
    unsupported.push(
      formatIssue("container", "sqlite-page-count-invalid", "SQLite page count exceeds the file"),
    );
    return false;
  }
  return true;
}

function normalizedColumn(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[_\s.-]+/gu, "");
}

const FIELD_ALIASES = Object.freeze({
  name: new Set(["name", "toolname", "subtoolname", "pwname"]),
  outputProcess: new Set(["outputprocess", "processtype"]),
  brushSize: new Set(["brushsize", "brushdiameter", "diameter"]),
  hardness: new Set(["hardness", "brushhardness"]),
  spacing: new Set(["spacing", "brushspacing", "interval"]),
  opacity: new Set(["opacity", "brushopacity"]),
  stabilization: new Set(["stabilization", "stabilizer", "correction"]),
  pressureGraph: new Set(["pressuregraph", "sizepressuregraph"]),
  opacityPressureGraph: new Set(["opacitypressuregraph", "flowpressuregraph"]),
  author: new Set(["author", "creator"]),
  license: new Set(["license", "licence"]),
  website: new Set(["website", "url"]),
  email: new Set(["email"]),
  fileData: new Set(["filedata"]),
});

type SemanticField = keyof typeof FIELD_ALIASES;

function semanticField(column: string): SemanticField | null {
  const normalized = normalizedColumn(column);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [SemanticField, ReadonlySet<string>]
  >) {
    if (aliases.has(normalized)) return field;
  }
  return null;
}

function cellByField(
  row: Readonly<Record<string, CspSqliteValue>>,
  field: SemanticField,
): { column: string; value: CspSqliteValue } | null {
  for (const [column, value] of Object.entries(row)) {
    if (semanticField(column) === field) return { column, value };
  }
  return null;
}

function numericCell(
  row: Readonly<Record<string, CspSqliteValue>>,
  field: SemanticField,
): number | null {
  const value = cellByField(row, field)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringCell(
  row: Readonly<Record<string, CspSqliteValue>>,
  field: SemanticField,
): string | null {
  const value = cellByField(row, field)?.value;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export interface CspPressureGraph {
  version: number;
  count: number;
  stride: number;
  curve: number[];
}

export function parseCspPressureGraph(bytes: Uint8Array): CspPressureGraph {
  if (bytes.byteLength < 44) throw new Error("pressure graph is shorter than header + 2 taps");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, false);
  const count = view.getUint32(4, false);
  const stride = view.getUint32(8, false);
  const reserved = [
    view.getUint32(12, false),
    view.getUint32(16, false),
    view.getUint32(20, false),
    view.getUint32(24, false),
  ];
  if (version !== 1) throw new Error(`pressure graph version ${version} is unsupported (v1 only)`);
  if (count < 2 || count > 4_096 || stride !== 8) {
    throw new Error(`pressure graph count/stride ${count}/${stride} is unsupported`);
  }
  if (reserved.some((value) => value !== 0)) {
    throw new Error("pressure graph reserved header words are non-zero");
  }
  if (bytes.byteLength !== 28 + count * stride) {
    throw new Error(
      `pressure graph length ${bytes.byteLength} does not match 28 + ${count}×${stride}`,
    );
  }
  const curve: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = view.getFloat64(28 + index * stride, false);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`pressure graph tap ${index} is outside [0,1]`);
    }
    curve.push(value);
  }
  return { version, count, stride, curve };
}

function constantMapping(value: number): DynamicMappingIR {
  return { input: "constant", curve: [value, value], min: 0, max: 1 };
}

function pressureMapping(curve: number[]): DynamicMappingIR {
  return { input: "pressure", curve, min: 0, max: 1 };
}

function safeScalar(
  value: number | null,
  minimum: number,
  maximum: number,
): number | null {
  return value !== null && value >= minimum && value <= maximum ? value : null;
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function pngCrc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) {
    value = (PNG_CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

function extractValidatedPngs(
  bytes: Uint8Array,
  maxPixels: number,
): Array<{ bytes: Uint8Array; width: number; height: number }> {
  const found: Array<{ bytes: Uint8Array; width: number; height: number }> = [];
  for (let start = 0; start + PNG_SIGNATURE.byteLength <= bytes.byteLength; start += 1) {
    if (!equalAt(bytes, PNG_SIGNATURE, start)) continue;
    let offset = start + PNG_SIGNATURE.byteLength;
    let width = 0;
    let height = 0;
    let sawIhdr = false;
    let valid = false;
    while (offset + 12 <= bytes.byteLength) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
      const length = view.getUint32(0, false);
      const end = offset + 12 + length;
      if (length > bytes.byteLength || end > bytes.byteLength) break;
      const typeBytes = bytes.subarray(offset + 4, offset + 8);
      const type = String.fromCharCode(...typeBytes);
      const storedCrc = new DataView(
        bytes.buffer,
        bytes.byteOffset + offset + 8 + length,
        4,
      ).getUint32(0, false);
      if (storedCrc !== pngCrc32(bytes.subarray(offset + 4, offset + 8 + length))) break;
      if (type === "IHDR") {
        if (sawIhdr || length !== 13) break;
        sawIhdr = true;
        const ihdr = new DataView(bytes.buffer, bytes.byteOffset + offset + 8, 13);
        width = ihdr.getUint32(0, false);
        height = ihdr.getUint32(4, false);
        if (
          width < 1 ||
          height < 1 ||
          width > maxPixels ||
          height > maxPixels ||
          width * height > maxPixels
        ) {
          break;
        }
      }
      offset = end;
      if (type === "IEND" && length === 0 && sawIhdr) {
        valid = true;
        break;
      }
    }
    if (valid) {
      found.push({ bytes: bytes.slice(start, offset), width, height });
      start = offset - 1;
    }
  }
  return found;
}

function validateSnapshot(snapshot: CspSqliteSnapshot, limits: ResolvedLimits): void {
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length > limits.maxTables) {
    throw new Error("SQLite reader returned too many tables or a malformed table list");
  }
  let totalRows = 0;
  const tableNames = new Set<string>();
  for (const table of snapshot.tables) {
    if (
      typeof table.name !== "string" ||
      table.name.length === 0 ||
      tableNames.has(table.name) ||
      !Array.isArray(table.columns) ||
      table.columns.length > limits.maxColumnsPerTable ||
      !Array.isArray(table.rows)
    ) {
      throw new Error("SQLite reader returned a malformed table snapshot");
    }
    tableNames.add(table.name);
    const columns = new Set(table.columns);
    if (columns.size !== table.columns.length || table.columns.some((column) => typeof column !== "string")) {
      throw new Error(`SQLite table ${table.name} has invalid columns`);
    }
    totalRows += table.rows.length;
    if (totalRows > limits.maxRows) throw new Error("SQLite reader returned too many rows");
    for (const row of table.rows) {
      for (const [column, value] of Object.entries(row)) {
        if (!columns.has(column)) throw new Error(`SQLite row uses undeclared column ${column}`);
        if (typeof value === "string" && value.length > limits.maxTextCharacters) {
          throw new Error(`SQLite text cell ${table.name}.${column} exceeds its safety limit`);
        }
        if (value instanceof Uint8Array && value.byteLength > limits.maxBlobBytes) {
          throw new Error(`SQLite blob cell ${table.name}.${column} exceeds its safety limit`);
        }
        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "bigint" &&
          !(value instanceof Uint8Array)
        ) {
          throw new Error(`SQLite cell ${table.name}.${column} has an invalid value type`);
        }
      }
    }
  }
}

function addRight(target: string[], value: string | null): void {
  if (value !== null && !target.includes(value)) target.push(value);
}

function programForRow(
  bytes: Uint8Array,
  kind: CspToolFileKind,
  table: CspSqliteTableSnapshot,
  row: Readonly<Record<string, CspSqliteValue>>,
  rowIndex: number,
  unsupported: FormatIssue[],
  warnings: FormatIssue[],
): BrushProgramIR | null {
  const pressureCell = cellByField(row, "pressureGraph");
  const opacityPressureCell = cellByField(row, "opacityPressureGraph");
  const brushSize = numericCell(row, "brushSize");
  const hardness = numericCell(row, "hardness");
  const spacing = numericCell(row, "spacing");
  const opacity = numericCell(row, "opacity");
  const stabilization = numericCell(row, "stabilization");
  const hasBrushField =
    pressureCell !== null ||
    opacityPressureCell !== null ||
    brushSize !== null ||
    hardness !== null ||
    spacing !== null ||
    opacity !== null;
  if (!hasBrushField) return null;

  const path = `${table.name}[${rowIndex}]`;
  const outputProcess = stringCell(row, "outputProcess");
  if (
    outputProcess !== null &&
    !["direct-draw", "direct draw", "brush"].includes(outputProcess.toLowerCase())
  ) {
    unsupported.push(
      formatIssue(
        "semantic",
        "sut-output-process-unsupported",
        `output process ${outputProcess} is not a verified direct-draw brush`,
        path,
      ),
    );
    return null;
  }
  if (outputProcess === null) {
    warnings.push(
      formatIssue(
        "semantic",
        "sut-output-process-missing",
        "output process is absent; row is imported only because verified brush fields are present",
        path,
      ),
    );
  }

  const sizeDynamics: DynamicMappingIR[] = [];
  const flowDynamics: DynamicMappingIR[] = [];
  if (brushSize !== null) {
    if (brushSize > 0 && brushSize <= 10_000) {
      if (brushSize > 1_000) {
        warnings.push(
          formatIssue(
            "semantic",
            "sut-brush-size-clamped",
            `brush size ${brushSize}px exceeds the 1000px IR normalization reference`,
            path,
          ),
        );
      }
      sizeDynamics.push(constantMapping(Math.min(1, brushSize / 1_000)));
    } else {
      unsupported.push(
        formatIssue("semantic", "sut-brush-size-invalid", `brush size ${brushSize} is invalid`, path),
      );
    }
  }
  const parseGraphCell = (
    cell: { column: string; value: CspSqliteValue } | null,
    target: DynamicMappingIR[],
    code: string,
  ): void => {
    if (cell === null) return;
    if (!(cell.value instanceof Uint8Array)) {
      unsupported.push(
        formatIssue("semantic", code, `${cell.column} is not a BLOB`, path),
      );
      return;
    }
    try {
      target.push(pressureMapping(parseCspPressureGraph(cell.value).curve));
    } catch (cause) {
      unsupported.push(
        formatIssue(
          "semantic",
          code,
          cause instanceof Error ? cause.message : String(cause),
          path,
        ),
      );
    }
  };
  parseGraphCell(pressureCell, sizeDynamics, "sut-pressure-graph-unsupported");
  parseGraphCell(opacityPressureCell, flowDynamics, "sut-opacity-pressure-graph-unsupported");
  const validOpacity = safeScalar(opacity, 0, 1);
  if (validOpacity !== null) flowDynamics.push(constantMapping(validOpacity));
  else if (opacity !== null) {
    unsupported.push(
      formatIssue(
        "semantic",
        "sut-opacity-scale-unverified",
        `opacity ${opacity} is outside the verified normalized [0,1] scale`,
        path,
      ),
    );
  }

  const identityBytes = new TextEncoder().encode(`${fnv1a64Hex(bytes)}\0${table.name}\0${rowIndex}`);
  const id = stableTextId(`csp-${kind}`, identityBytes);
  const name = stringCell(row, "name") ?? `${kind.toUpperCase()} ${table.name} ${rowIndex + 1}`;
  if (stringCell(row, "name") === null) {
    warnings.push(
      formatIssue("semantic", "sut-name-missing", `fallback name ${name} assigned`, path),
    );
  }
  const validHardness = safeScalar(hardness, 0, 1);
  const validSpacing = safeScalar(spacing, 1, 1_000);
  if (hardness !== null && validHardness === null) {
    unsupported.push(
      formatIssue("semantic", "sut-hardness-scale-unverified", `hardness ${hardness} rejected`, path),
    );
  }
  if (spacing !== null && validSpacing === null) {
    unsupported.push(
      formatIssue("semantic", "sut-spacing-scale-unverified", `spacing ${spacing} rejected`, path),
    );
  }
  const validStabilization = safeScalar(stabilization, 0, 1);
  if (stabilization !== null && validStabilization === null) {
    unsupported.push(
      formatIssue(
        "semantic",
        "sut-stabilization-scale-unverified",
        `stabilization ${stabilization} rejected`,
        path,
      ),
    );
  }
  return brushProgramIRSchema.parse({
    id,
    name,
    stabilizer: {
      kind: "ema",
      strength: validStabilization ?? 0.35,
      predictionMs: 0,
    },
    sizeDynamics,
    flowDynamics,
    tip: {
      kind: "round",
      hardness: validHardness ?? 1,
      spacingPct: validSpacing ?? 10,
      angleJitterDeg: 0,
    },
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference: ["hokusai-natural-media"],
    sourcePayload: {
      format: kind === "sut" ? "csp-sut" : "csp-sutg",
      base64: bytesToBase64(bytes),
    },
  });
}

export async function importCspToolFile(
  source: Uint8Array | ArrayBuffer,
  options: CspToolFileImportOptions,
): Promise<CspToolFileImportResult> {
  const limits = resolveLimits(options.limits);
  if (options.signal?.aborted) throw new CspToolFileError("import aborted", "aborted");
  const bytes = source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
  if (bytes.byteLength > limits.maxBytes) {
    throw new CspToolFileError("SUT/SUTG exceeds the source safety limit", "source-too-large");
  }
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];
  const inspection = inspectCspToolFile(bytes);
  const validSqlite = validateSqliteHeader(bytes, inspection, warnings, unsupported);
  const resultBase = {
    format: options.kind === "sut" ? "clip-studio-tool" as const : "clip-studio-tool-group" as const,
    inspection,
    rights: { authors: [], licenses: [], websites: [], emails: [] } satisfies CspToolRights,
    warnings,
    unsupported,
    sourcePayload: {
      format: options.kind === "sut" ? "csp-sut" as const : "csp-sutg" as const,
      base64: bytesToBase64(bytes),
    },
  };
  if (!validSqlite || options.sqliteReader === undefined) {
    if (validSqlite) {
      unsupported.push(
        formatIssue(
          "semantic",
          "sut-sqlite-reader-unavailable",
          "SQLite container is verified, but no sandboxed SQLite reader was provided; original bytes are preserved without claiming semantic import",
        ),
      );
    }
    return {
      ...resultBase,
      supportLevel: "preserve-only",
      sqliteVersion: null,
      tables: [],
      programs: [],
      assets: [],
    };
  }

  let snapshot: CspSqliteSnapshot;
  try {
    snapshot = await options.sqliteReader(bytes, {
      kind: options.kind,
      maxTables: limits.maxTables,
      maxColumnsPerTable: limits.maxColumnsPerTable,
      maxRows: limits.maxRows,
      maxBlobBytes: limits.maxBlobBytes,
      maxTextCharacters: limits.maxTextCharacters,
      signal: options.signal,
    });
    validateSnapshot(snapshot, limits);
  } catch (cause) {
    if (options.signal?.aborted) throw new CspToolFileError("import aborted", "aborted");
    unsupported.push(
      formatIssue(
        "semantic",
        "sut-sqlite-read-failed",
        cause instanceof Error ? cause.message : String(cause),
      ),
    );
    return {
      ...resultBase,
      supportLevel: "preserve-only",
      sqliteVersion: null,
      tables: [],
      programs: [],
      assets: [],
    };
  }

  const programs: BrushProgramIR[] = [];
  const assets: CspEmbeddedAsset[] = [];
  for (const table of snapshot.tables) {
    for (const column of table.columns) {
      if (semanticField(column) === null) {
        unsupported.push(
          formatIssue(
            "semantic",
            "sut-column-unmapped",
            `SQLite column ${column} is preserved in the original SUT/SUTG payload`,
            table.name,
          ),
        );
      }
    }
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];
      if (row === undefined) continue;
      addRight(resultBase.rights.authors, stringCell(row, "author"));
      addRight(resultBase.rights.licenses, stringCell(row, "license"));
      addRight(resultBase.rights.websites, stringCell(row, "website"));
      addRight(resultBase.rights.emails, stringCell(row, "email"));
      const fileData = cellByField(row, "fileData");
      if (fileData?.value instanceof Uint8Array) {
        for (const png of extractValidatedPngs(fileData.value, limits.maxEmbeddedPngPixels)) {
          assets.push({
            id: stableTextId("csp-embedded-png", png.bytes),
            mimeType: "image/png",
            sourceTable: table.name,
            sourceColumn: fileData.column,
            sourceRow: rowIndex,
            width: png.width,
            height: png.height,
            base64: bytesToBase64(png.bytes),
          });
        }
      }
      const program = programForRow(
        bytes,
        options.kind,
        table,
        row,
        rowIndex,
        unsupported,
        warnings,
      );
      if (program !== null) programs.push(program);
    }
  }
  assets.sort((left, right) => left.id.localeCompare(right.id, "en"));
  resultBase.rights.authors.sort();
  resultBase.rights.licenses.sort();
  resultBase.rights.websites.sort();
  resultBase.rights.emails.sort();
  if (assets.length > 0) {
    unsupported.push(
      formatIssue(
        "semantic",
        "sut-material-link-unverified",
        `${assets.length} validated PNG material(s) were extracted but not attached to a brush because CELSYS does not publish the relation schema`,
      ),
    );
  }
  if (programs.length === 0) {
    unsupported.push(
      formatIssue(
        "semantic",
        "sut-brush-schema-unrecognized",
        "no row contained the verified clean-room brush field subset; original tables remain represented by their inventory and source payload",
      ),
    );
  }
  return {
    ...resultBase,
    supportLevel: programs.length > 0 ? "structured-partial" : "preserve-only",
    sqliteVersion: snapshot.sqliteVersion ?? null,
    tables: snapshot.tables.map((table) => ({
      name: table.name,
      columns: [...table.columns],
      rowCount: table.rows.length,
    })),
    programs,
    assets,
  };
}
