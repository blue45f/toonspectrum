import {
  collectDialogueItems,
  isDialogueElement,
  type DialogueBatchItem,
  type DialoguePageLike,
} from "./studio-dialogue-batch";

/**
 * Text interchange for lettering, translation and timed-comic workflows.
 *
 * The codecs deliberately operate on a small, renderer-independent cue model. StudioPage can map
 * cues to bubbles in one history transaction, while translators can use spreadsheet/subtitle tools
 * without loading the canvas renderer. Every parser is bounded and rejects malformed UTF-8, NULs,
 * oversized records and non-finite timing values before any document mutation is attempted.
 */

export const STUDIO_DIALOGUE_INTERCHANGE_SCHEMA = "toonspectrum.dialogue-script" as const;
export const STUDIO_DIALOGUE_INTERCHANGE_VERSION = 1 as const;

export const STUDIO_DIALOGUE_INTERCHANGE_LIMITS = Object.freeze({
  maxFileBytes: 8 * 1024 * 1024,
  maxCues: 20_000,
  maxCueCodeUnits: 20_000,
  maxSpeakerCodeUnits: 200,
  maxNoteCodeUnits: 2_000,
  maxCsvColumns: 32,
  maxCsvCellCodeUnits: 32_000,
  maxTimestampMs: 7 * 24 * 60 * 60 * 1_000,
});

export type StudioDialogueInterchangeFormat =
  | "txt"
  | "markdown"
  | "csv"
  | "tsv"
  | "json"
  | "fountain"
  | "srt"
  | "vtt";

export interface StudioDialogueCue {
  readonly id?: string;
  /** One-based page number for human-facing interchange. */
  readonly page: number;
  /** One-based panel number when known. */
  readonly panel?: number;
  readonly speaker?: string;
  readonly text: string;
  readonly note?: string;
  readonly startMs?: number;
  readonly endMs?: number;
}

export interface StudioDialogueInterchangeDocument {
  readonly title?: string;
  readonly language?: string;
  readonly cues: readonly StudioDialogueCue[];
}

export interface StudioDialogueInterchangeResult {
  readonly document: StudioDialogueInterchangeDocument;
  readonly warnings: readonly string[];
  readonly lossy: boolean;
}

export interface StudioDialogueSerializedFile {
  readonly text: string;
  readonly extension: `.${StudioDialogueInterchangeFormat}` | ".md";
  readonly mimeType: string;
  readonly warnings: readonly string[];
  readonly lossy: boolean;
}

export type StudioDialogueImportMatchMode = "auto" | "id" | "page-order" | "document-order";

export interface StudioDialogueImportApplyResult {
  readonly pages: readonly DialoguePageLike[];
  readonly matched: number;
  readonly changed: number;
  readonly locked: number;
  readonly missing: number;
  readonly droppedMetadata: number;
}

export class StudioDialogueInterchangeError extends Error {
  constructor(
    readonly code:
      | "FILE_TOO_LARGE"
      | "INVALID_ENCODING"
      | "INVALID_FORMAT"
      | "INVALID_CUE"
      | "TOO_MANY_CUES"
      | "UNSUPPORTED_VERSION",
    message: string
  ) {
    super(message);
    this.name = "StudioDialogueInterchangeError";
  }
}

const UTF8 = new TextEncoder();
const FATAL_UTF8 = new TextDecoder("utf-8", { fatal: true });

function fail(code: StudioDialogueInterchangeError["code"], message: string): never {
  throw new StudioDialogueInterchangeError(code, message);
}

function assertFileBudget(text: string): void {
  if (UTF8.encode(text).byteLength > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxFileBytes) {
    fail("FILE_TOO_LARGE", "대사 파일은 8MB 이하여야 합니다.");
  }
  if (text.includes("\0")) fail("INVALID_FORMAT", "대사 파일에 NUL 문자가 포함되어 있습니다.");
}

export function decodeStudioDialogueInterchangeText(
  source: string | Uint8Array | ArrayBuffer
): string {
  if (typeof source === "string") {
    assertFileBudget(source);
    return source.replace(/^\uFEFF/u, "");
  }
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxFileBytes) {
    fail("FILE_TOO_LARGE", "대사 파일은 8MB 이하여야 합니다.");
  }
  try {
    const text = FATAL_UTF8.decode(bytes).replace(/^\uFEFF/u, "");
    assertFileBudget(text);
    return text;
  } catch (error) {
    if (error instanceof StudioDialogueInterchangeError) throw error;
    return fail("INVALID_ENCODING", "대사 파일이 올바른 UTF-8 텍스트가 아닙니다.");
  }
}

function finiteInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const integer = Math.trunc(value);
  return integer >= minimum && integer <= maximum ? integer : undefined;
}

function optionalBoundedText(value: unknown, maximum: number): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maximum || value.includes("\0")) {
    fail("INVALID_CUE", "대사 메타데이터의 문자열 길이 또는 형식이 올바르지 않습니다.");
  }
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  return normalized || undefined;
}

function normalizeCue(value: unknown, index: number): StudioDialogueCue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("INVALID_CUE", `${index + 1}번째 대사 항목이 객체가 아닙니다.`);
  }
  const candidate = value as Record<string, unknown>;
  const allowed = new Set(["id", "page", "panel", "speaker", "text", "note", "startMs", "endMs"]);
  if (Object.keys(candidate).some((key) => !allowed.has(key))) {
    return fail("INVALID_CUE", `${index + 1}번째 대사 항목에 알 수 없는 필드가 있습니다.`);
  }
  const page = finiteInteger(candidate.page, 1, 1_000_000);
  const panel = candidate.panel == null
    ? undefined
    : finiteInteger(candidate.panel, 1, 1_000_000);
  if (page == null || (candidate.panel != null && panel == null)) {
    return fail("INVALID_CUE", `${index + 1}번째 대사의 페이지/컷 번호가 올바르지 않습니다.`);
  }
  if (
    typeof candidate.text !== "string" ||
    candidate.text.length === 0 ||
    candidate.text.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCueCodeUnits ||
    candidate.text.includes("\0")
  ) {
    return fail("INVALID_CUE", `${index + 1}번째 대사 본문의 길이 또는 형식이 올바르지 않습니다.`);
  }
  const text = candidate.text.replace(/\r\n?/gu, "\n").trim();
  if (!text) return fail("INVALID_CUE", `${index + 1}번째 대사가 비어 있습니다.`);
  const startMs = candidate.startMs == null
    ? undefined
    : finiteInteger(candidate.startMs, 0, STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxTimestampMs);
  const endMs = candidate.endMs == null
    ? undefined
    : finiteInteger(candidate.endMs, 0, STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxTimestampMs);
  if (
    (candidate.startMs != null && startMs == null) ||
    (candidate.endMs != null && endMs == null) ||
    (startMs != null && endMs != null && endMs <= startMs)
  ) {
    return fail("INVALID_CUE", `${index + 1}번째 대사의 시간 범위가 올바르지 않습니다.`);
  }
  return {
    ...(optionalBoundedText(candidate.id, 200) ? { id: optionalBoundedText(candidate.id, 200) } : {}),
    page,
    ...(panel == null ? {} : { panel }),
    ...(optionalBoundedText(candidate.speaker, STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxSpeakerCodeUnits)
      ? { speaker: optionalBoundedText(candidate.speaker, STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxSpeakerCodeUnits) }
      : {}),
    text,
    ...(optionalBoundedText(candidate.note, STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxNoteCodeUnits)
      ? { note: optionalBoundedText(candidate.note, STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxNoteCodeUnits) }
      : {}),
    ...(startMs == null ? {} : { startMs }),
    ...(endMs == null ? {} : { endMs }),
  };
}

function normalizeDocument(value: StudioDialogueInterchangeDocument): StudioDialogueInterchangeDocument {
  if (!Array.isArray(value.cues)) fail("INVALID_FORMAT", "대사 목록이 없습니다.");
  if (value.cues.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCues) {
    fail("TOO_MANY_CUES", "한 파일에서 가져올 수 있는 대사는 최대 20,000개입니다.");
  }
  return {
    ...(optionalBoundedText(value.title, 500) ? { title: optionalBoundedText(value.title, 500) } : {}),
    ...(optionalBoundedText(value.language, 50) ? { language: optionalBoundedText(value.language, 50) } : {}),
    cues: value.cues.map(normalizeCue),
  };
}

function parseJson(text: string): StudioDialogueInterchangeResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail("INVALID_FORMAT", "JSON 대사 파일의 문법이 올바르지 않습니다.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("INVALID_FORMAT", "JSON 대사 파일의 최상위 값이 객체가 아닙니다.");
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== STUDIO_DIALOGUE_INTERCHANGE_SCHEMA) {
    return fail("INVALID_FORMAT", "ToonSpectrum 대사 JSON 스키마가 아닙니다.");
  }
  if (record.version !== STUDIO_DIALOGUE_INTERCHANGE_VERSION) {
    return fail("UNSUPPORTED_VERSION", "지원하지 않는 대사 JSON 버전입니다.");
  }
  return {
    document: normalizeDocument({
      title: record.title as string | undefined,
      language: record.language as string | undefined,
      cues: record.cues as StudioDialogueCue[],
    }),
    warnings: [],
    lossy: false,
  };
}

function parseDelimitedRows(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      if (cell.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCsvCellCodeUnits) {
        fail("INVALID_FORMAT", "CSV/TSV 셀 하나가 허용 길이를 초과했습니다.");
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = "";
      if (row.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCsvColumns) {
        fail("INVALID_FORMAT", "CSV/TSV 열 수가 허용 범위를 초과했습니다.");
      }
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) fail("INVALID_FORMAT", "CSV/TSV의 따옴표가 닫히지 않았습니다.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const COLUMN_ALIASES: Record<string, string> = {
  page: "page",
  페이지: "page",
  panel: "panel",
  cut: "panel",
  컷: "panel",
  speaker: "speaker",
  character: "speaker",
  화자: "speaker",
  text: "text",
  dialogue: "text",
  대사: "text",
  note: "note",
  memo: "note",
  메모: "note",
  start_ms: "startMs",
  start: "startMs",
  시작: "startMs",
  end_ms: "endMs",
  end: "endMs",
  종료: "endMs",
  id: "id",
};

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/u.test(trimmed)) fail("INVALID_CUE", `정수가 필요한 칸에 '${trimmed}' 값이 있습니다.`);
  return Number(trimmed);
}

function parseDelimited(text: string, delimiter: "," | "\t"): StudioDialogueInterchangeResult {
  const rows = parseDelimitedRows(text, delimiter).filter((row) => row.some((cell) => cell.trim()));
  const header = rows.shift();
  if (!header) fail("INVALID_FORMAT", "CSV/TSV 파일에 헤더가 없습니다.");
  const columns = header.map((value) => COLUMN_ALIASES[value.trim().toLocaleLowerCase("ko-KR")] ?? "");
  if (!columns.includes("page") || !columns.includes("text")) {
    fail("INVALID_FORMAT", "CSV/TSV 헤더에는 page(페이지)와 text(대사) 열이 필요합니다.");
  }
  if (rows.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCues) {
    fail("TOO_MANY_CUES", "한 파일에서 가져올 수 있는 대사는 최대 20,000개입니다.");
  }
  const warnings: string[] = [];
  const cues = rows.map((row, index) => {
    const candidate: Record<string, unknown> = {};
    columns.forEach((column, columnIndex) => {
      if (!column) return;
      const raw = row[columnIndex] ?? "";
      if (column === "page" || column === "panel" || column === "startMs" || column === "endMs") {
        candidate[column] = parseOptionalInteger(raw);
      } else {
        candidate[column] = raw;
      }
    });
    if (row.length > columns.length && row.slice(columns.length).some((cell) => cell.trim())) {
      warnings.push(`${index + 2}행의 헤더 밖 추가 열은 무시했습니다.`);
    }
    return normalizeCue(candidate, index);
  });
  return { document: { cues }, warnings, lossy: false };
}

function parsePageMarker(line: string): number | undefined {
  const match = /^(?:#{1,2}\s*)?(?:page|페이지)\s*(\d+)\s*:?$/iu.exec(line.trim());
  return match ? Number(match[1]) : undefined;
}

function parsePanelMarker(line: string): number | undefined {
  const match = /^(?:#{1,3}\s*)?(?:panel|cut|컷)\s*(\d+)\s*:?$/iu.exec(line.trim());
  return match ? Number(match[1]) : undefined;
}

function parseColonScript(text: string): StudioDialogueInterchangeResult {
  const cues: StudioDialogueCue[] = [];
  const warnings: string[] = [];
  let page = 1;
  let panel: number | undefined;
  for (const [lineIndex, rawLine] of text.replace(/\r\n?/gu, "\n").split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("<!--") || line.startsWith("//")) continue;
    const pageMarker = parsePageMarker(line.replace(/^@/u, ""));
    if (pageMarker != null) {
      page = pageMarker;
      panel = undefined;
      continue;
    }
    const panelMarker = parsePanelMarker(line.replace(/^@/u, ""));
    if (panelMarker != null) {
      panel = panelMarker;
      continue;
    }
    const dialogue = /^(?:[-*]\s*)?(?:\[([^\]]+)\]\s*)?([^:\n]{1,200}):\s*(.+)$/u.exec(line);
    if (!dialogue) {
      warnings.push(`${lineIndex + 1}행은 '화자: 대사' 형식이 아니어서 메모로 건너뛰었습니다.`);
      continue;
    }
    const location = dialogue[1];
    if (location) {
      const numbers = [...location.matchAll(/(?:p(?:age)?|페이지)\s*(\d+)|(?:c(?:ut)?|panel|컷)\s*(\d+)/giu)];
      for (const match of numbers) {
        if (match[1]) page = Number(match[1]);
        if (match[2]) panel = Number(match[2]);
      }
    }
    cues.push(normalizeCue({ page, panel, speaker: dialogue[2]!.trim(), text: dialogue[3]!.trim() }, cues.length));
    if (cues.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCues) {
      fail("TOO_MANY_CUES", "한 파일에서 가져올 수 있는 대사는 최대 20,000개입니다.");
    }
  }
  if (cues.length === 0) fail("INVALID_FORMAT", "가져올 수 있는 '화자: 대사' 행이 없습니다.");
  return { document: { cues }, warnings, lossy: warnings.length > 0 };
}

function parseFountain(text: string): StudioDialogueInterchangeResult {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const cues: StudioDialogueCue[] = [];
  const warnings: string[] = [];
  let page = 1;
  let panel: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    const pageMarker = parsePageMarker(line.replace(/^\.+/u, "").replace(/\s+-.*$/u, ""));
    if (pageMarker != null) {
      page = pageMarker;
      panel = undefined;
      continue;
    }
    const panelComment = /^\[\[\s*(?:panel|cut|컷)\s*(\d+)\s*\]\]$/iu.exec(line);
    const panelHeading = parsePanelMarker(line);
    if (panelComment || panelHeading != null) {
      panel = panelComment ? Number(panelComment[1]) : panelHeading;
      continue;
    }
    const forcedCharacter = line.startsWith("@") ? line.slice(1).trim() : line;
    const character = forcedCharacter.replace(/\s*\([^)]*\)\s*$/u, "");
    const looksLikeCharacter =
      character.length > 0 &&
      character.length <= STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxSpeakerCodeUnits &&
      (line.startsWith("@") || character === character.toLocaleUpperCase("ko-KR")) &&
      !/^(?:INT\.|EXT\.|EST\.|I\/E\.|\.|#|=|>|!)/u.test(line);
    if (!looksLikeCharacter) continue;
    const dialogueLines: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor]!.trim()) {
      const candidate = lines[cursor]!.trim();
      if (/^\(.+\)$/u.test(candidate) && dialogueLines.length === 0) {
        cursor += 1;
        continue;
      }
      dialogueLines.push(candidate);
      cursor += 1;
    }
    if (dialogueLines.length === 0) continue;
    cues.push(normalizeCue({ page, panel, speaker: character, text: dialogueLines.join("\n") }, cues.length));
    index = cursor;
    if (cues.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCues) {
      fail("TOO_MANY_CUES", "한 파일에서 가져올 수 있는 대사는 최대 20,000개입니다.");
    }
  }
  if (cues.length === 0) fail("INVALID_FORMAT", "Fountain 파일에서 대사 블록을 찾지 못했습니다.");
  warnings.push("장면 설명·전환·듀얼 대사·주석은 캔버스 대사로 가져오지 않습니다.");
  return { document: { cues }, warnings, lossy: true };
}

function parseTimestamp(value: string, vtt: boolean): number | undefined {
  const normalized = value.trim().replace(",", ".");
  const match = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})\.(\d{3})$/u.exec(normalized);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  if (minutes > 59 || seconds > 59 || (!vtt && match[1] == null)) return undefined;
  const result = ((hours * 60 + minutes) * 60 + seconds) * 1_000 + millis;
  return result <= STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxTimestampMs ? result : undefined;
}

function parseTimedText(text: string, vtt: boolean): StudioDialogueInterchangeResult {
  let normalized = text.replace(/\r\n?/gu, "\n").trim();
  if (vtt) {
    if (!/^WEBVTT(?:\s|$)/u.test(normalized)) fail("INVALID_FORMAT", "WEBVTT 헤더가 없습니다.");
    normalized = normalized.replace(/^WEBVTT[^\n]*\n*/u, "");
  }
  const blocks = normalized.split(/\n{2,}/u);
  const cues: StudioDialogueCue[] = [];
  const warnings: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2 || /^(?:NOTE|STYLE|REGION)(?:\s|$)/u.test(lines[0]!)) continue;
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = /^(.+?)\s*-->\s*(\S+)(?:\s+.*)?$/u.exec(lines[timingIndex]!);
    if (!timing) continue;
    const startMs = parseTimestamp(timing[1]!, vtt);
    const endMs = parseTimestamp(timing[2]!, vtt);
    if (startMs == null || endMs == null || endMs <= startMs) {
      fail("INVALID_CUE", "자막 시간 범위가 올바르지 않습니다.");
    }
    const payload = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]*>/gu, "").trim();
    if (!payload) continue;
    const firstLineEnd = payload.indexOf("\n");
    const firstLine = firstLineEnd >= 0 ? payload.slice(0, firstLineEnd) : payload;
    const speakerMatch = /^([^:\n]{1,200}):\s*(.*)$/u.exec(firstLine);
    const speaker = speakerMatch?.[1]?.trim();
    const firstDialogue = speakerMatch?.[2] ?? firstLine;
    const remainder = firstLineEnd >= 0 ? payload.slice(firstLineEnd + 1) : "";
    const cueText = [firstDialogue, remainder].filter(Boolean).join("\n");
    cues.push(normalizeCue({ page: 1, speaker, text: cueText, startMs, endMs }, cues.length));
    if (cues.length > STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxCues) {
      fail("TOO_MANY_CUES", "한 파일에서 가져올 수 있는 대사는 최대 20,000개입니다.");
    }
  }
  if (cues.length === 0) fail("INVALID_FORMAT", "가져올 수 있는 자막 큐가 없습니다.");
  warnings.push("자막 포맷에는 페이지·컷 배치가 없어 모든 대사를 1페이지로 가져옵니다.");
  return { document: { cues }, warnings, lossy: true };
}

export function parseStudioDialogueInterchange(
  format: StudioDialogueInterchangeFormat,
  source: string | Uint8Array | ArrayBuffer
): StudioDialogueInterchangeResult {
  const text = decodeStudioDialogueInterchangeText(source);
  switch (format) {
    case "json": return parseJson(text);
    case "csv": return parseDelimited(text, ",");
    case "tsv": return parseDelimited(text, "\t");
    case "fountain": return parseFountain(text);
    case "srt": return parseTimedText(text, false);
    case "vtt": return parseTimedText(text, true);
    case "txt":
    case "markdown": return parseColonScript(text);
  }
}

function csvCell(value: string, delimiter: "," | "\t"): string {
  // Prevent spreadsheet formula execution while preserving a visible, reversible value.
  const safe = /^[=+@]/u.test(value) || /^-\D/u.test(value) ? `'${value}` : value;
  if (safe.includes(delimiter) || /["\r\n]/u.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

function serializeDelimited(document: StudioDialogueInterchangeDocument, delimiter: "," | "\t"): string {
  const header = ["id", "page", "panel", "speaker", "text", "note", "start_ms", "end_ms"];
  const rows = document.cues.map((cue) => [
    cue.id ?? "",
    String(cue.page),
    cue.panel == null ? "" : String(cue.panel),
    cue.speaker ?? "",
    cue.text,
    cue.note ?? "",
    cue.startMs == null ? "" : String(cue.startMs),
    cue.endMs == null ? "" : String(cue.endMs),
  ].map((value) => csvCell(value, delimiter)).join(delimiter));
  return [header.join(delimiter), ...rows].join("\r\n") + "\r\n";
}

function serializeColonScript(document: StudioDialogueInterchangeDocument, markdown: boolean): string {
  const lines: string[] = [];
  let page = -1;
  let panel = -1;
  for (const cue of document.cues) {
    if (cue.page !== page) {
      if (lines.length > 0) lines.push("");
      lines.push(`${markdown ? "## " : "@"}페이지 ${cue.page}`);
      page = cue.page;
      panel = -1;
    }
    if (cue.panel != null && cue.panel !== panel) {
      lines.push(`${markdown ? "### " : "@"}컷 ${cue.panel}`);
      panel = cue.panel;
    }
    lines.push(`${markdown ? "- " : ""}${cue.speaker ?? "대사"}: ${cue.text.replaceAll("\n", " / ")}`);
  }
  return lines.join("\n") + "\n";
}

function serializeFountain(document: StudioDialogueInterchangeDocument): string {
  const lines: string[] = [];
  let page = -1;
  let panel = -1;
  for (const cue of document.cues) {
    if (cue.page !== page) {
      if (lines.length > 0) lines.push("");
      lines.push(`# PAGE ${cue.page}`);
      page = cue.page;
      panel = -1;
    }
    if (cue.panel != null && cue.panel !== panel) {
      lines.push("", `[[PANEL ${cue.panel}]]`);
      panel = cue.panel;
    }
    lines.push("", `@${cue.speaker ?? "DIALOGUE"}`, cue.text, "");
  }
  return lines.join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd() + "\n";
}

function formatTimestamp(milliseconds: number, vtt: boolean): string {
  const clamped = Math.max(0, Math.min(STUDIO_DIALOGUE_INTERCHANGE_LIMITS.maxTimestampMs, Math.round(milliseconds)));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const millis = clamped % 1_000;
  const separator = vtt ? "." : ",";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

function timedCueRange(cue: StudioDialogueCue, index: number): readonly [number, number, boolean] {
  if (cue.startMs != null && cue.endMs != null) return [cue.startMs, cue.endMs, false];
  const start = index * 3_250;
  return [start, start + 3_000, true];
}

function serializeTimedText(
  document: StudioDialogueInterchangeDocument,
  vtt: boolean
): { text: string; generatedTimings: boolean } {
  let generatedTimings = false;
  const blocks = document.cues.map((cue, index) => {
    const [start, end, generated] = timedCueRange(cue, index);
    generatedTimings ||= generated;
    const payload = cue.speaker ? `${cue.speaker}: ${cue.text}` : cue.text;
    const body = `${formatTimestamp(start, vtt)} --> ${formatTimestamp(end, vtt)}\n${payload}`;
    return vtt ? body : `${index + 1}\n${body}`;
  });
  return { text: `${vtt ? "WEBVTT\n\n" : ""}${blocks.join("\n\n")}\n`, generatedTimings };
}

export function serializeStudioDialogueInterchange(
  format: StudioDialogueInterchangeFormat,
  input: StudioDialogueInterchangeDocument
): StudioDialogueSerializedFile {
  const document = normalizeDocument(input);
  let text: string;
  let lossy = false;
  const warnings: string[] = [];
  switch (format) {
    case "json":
      text = `${JSON.stringify({
        schema: STUDIO_DIALOGUE_INTERCHANGE_SCHEMA,
        version: STUDIO_DIALOGUE_INTERCHANGE_VERSION,
        ...document,
      }, null, 2)}\n`;
      break;
    case "csv":
      text = serializeDelimited(document, ",");
      break;
    case "tsv":
      text = serializeDelimited(document, "\t");
      break;
    case "txt":
      text = serializeColonScript(document, false);
      lossy = document.cues.some((cue) => cue.note || cue.startMs != null || cue.endMs != null);
      if (lossy) warnings.push("TXT에는 메모와 시간 정보가 포함되지 않습니다.");
      break;
    case "markdown":
      text = serializeColonScript(document, true);
      lossy = document.cues.some((cue) => cue.note || cue.startMs != null || cue.endMs != null);
      if (lossy) warnings.push("Markdown에는 메모와 시간 정보가 포함되지 않습니다.");
      break;
    case "fountain":
      text = serializeFountain(document);
      warnings.push("Fountain 출력은 페이지·컷을 섹션/주석으로 보존하지만 캔버스 좌표는 포함하지 않습니다.");
      lossy = true;
      break;
    case "srt":
    case "vtt": {
      const timed = serializeTimedText(document, format === "vtt");
      text = timed.text;
      lossy = true;
      warnings.push("자막 출력에는 캔버스 페이지·컷 좌표가 포함되지 않습니다.");
      if (timed.generatedTimings) warnings.push("시간 정보가 없는 대사에는 3초 간격을 자동 배정했습니다.");
      break;
    }
  }
  assertFileBudget(text);
  const extension = format === "markdown" ? ".md" : (`.${format}` as const);
  const mimeType = format === "json"
    ? "application/json;charset=utf-8"
    : format === "csv"
      ? "text/csv;charset=utf-8"
      : format === "vtt"
        ? "text/vtt;charset=utf-8"
        : "text/plain;charset=utf-8";
  return { text, extension, mimeType, warnings, lossy };
}

/** Maps the existing page-ordered lettering view to the interchange cue model. */
export function studioDialogueItemsToInterchange(
  items: readonly DialogueBatchItem[],
  options: { title?: string; language?: string } = {}
): StudioDialogueInterchangeDocument {
  const panelCounters = new Map<number, number>();
  return normalizeDocument({
    ...options,
    cues: items.map((item) => {
      const page = item.pageIndex + 1;
      const panel = (panelCounters.get(page) ?? 0) + 1;
      panelCounters.set(page, panel);
      return {
        id: item.id,
        page,
        panel,
        text: item.text,
        note: item.locked ? "locked" : item.hidden ? "hidden" : undefined,
      };
    }),
  });
}

/**
 * Applies imported lettering to existing bubbles without creating, deleting or moving elements.
 * This is the safe translation round-trip path: exact exported IDs win, then page-local order,
 * then (only in auto/document-order modes) global reading order. One target can be consumed once.
 */
export function applyStudioDialogueInterchangeToPages(
  pages: readonly DialoguePageLike[],
  input: StudioDialogueInterchangeDocument,
  mode: StudioDialogueImportMatchMode = "auto"
): StudioDialogueImportApplyResult {
  const document = normalizeDocument(input);
  const items = collectDialogueItems(pages);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const byPage = new Map<number, DialogueBatchItem[]>();
  for (const item of items) {
    const list = byPage.get(item.pageIndex + 1);
    if (list) list.push(item);
    else byPage.set(item.pageIndex + 1, [item]);
  }
  const consumed = new Set<string>();
  const replacementById = new Map<string, string>();
  let matched = 0;
  let locked = 0;
  let missing = 0;
  let droppedMetadata = 0;

  document.cues.forEach((cue, cueIndex) => {
    let target: DialogueBatchItem | undefined;
    if ((mode === "auto" || mode === "id") && cue.id) target = byId.get(cue.id);
    if (!target && (mode === "auto" || mode === "page-order") && cue.panel != null) {
      target = byPage.get(cue.page)?.[cue.panel - 1];
    }
    if (!target && (mode === "auto" || mode === "document-order")) target = items[cueIndex];
    if (!target || consumed.has(target.id)) {
      missing += 1;
      return;
    }
    consumed.add(target.id);
    matched += 1;
    if (target.locked) {
      locked += 1;
      return;
    }
    if (cue.speaker || cue.note || cue.startMs != null || cue.endMs != null) droppedMetadata += 1;
    if (target.text !== cue.text) replacementById.set(target.id, cue.text);
  });

  if (replacementById.size === 0) {
    return { pages, matched, changed: 0, locked, missing, droppedMetadata };
  }
  let changed = 0;
  const next = pages.map((page) => {
    let pageChanged = false;
    const elements = page.elements.map((element) => {
      const text = replacementById.get(element.id);
      if (text == null || !isDialogueElement(element) || element.text === text) return element;
      pageChanged = true;
      changed += 1;
      return { ...element, text };
    });
    return pageChanged ? { ...page, elements } : page;
  });
  return { pages: next, matched, changed, locked, missing, droppedMetadata };
}
