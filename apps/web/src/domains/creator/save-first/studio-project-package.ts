import type { StudioProjectDocumentEntry } from "../studio-project-document-store";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import type { StudioSaveProfile } from "./studio-save-profile";
import type { StudioSubmission } from "./studio-submission-store";

export const STUDIO_PROJECT_PACKAGE_MIME = "application/vnd.toonstudio.project+zip";

export interface StudioProjectPackageManifest {
  readonly format: "toonstudio-project";
  readonly formatVersion: 1;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly createdAt: string;
  readonly exportedAt: string;
  readonly sourceRevision: number;
  readonly accessMode: StudioSaveProfile["accessMode"];
  readonly distributionState: StudioSaveProfile["distributionState"];
  readonly entryNames: readonly string[];
}

export interface StudioProjectPackageResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly manifest: StudioProjectPackageManifest;
}

interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

interface WritableFileHandle {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: readonly Readonly<{
      description: string;
      accept: Readonly<Record<string, readonly string[]>>;
    }>[];
  }) => Promise<WritableFileHandle>;
}

const encoder = new TextEncoder();

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function littleEndian16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function littleEndian32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function studioPackageCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value: string): { readonly date: number; readonly time: number } {
  const parsed = new Date(value);
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
  };
}

function buildZip(entries: readonly ZipEntry[], exportedAt: string): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const stamp = dosDateTime(exportedAt);
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = studioPackageCrc32(entry.bytes);
    const localHeader = concat([
      littleEndian32(0x04034b50),
      littleEndian16(20),
      littleEndian16(0x0800),
      littleEndian16(0),
      littleEndian16(stamp.time),
      littleEndian16(stamp.date),
      littleEndian32(crc),
      littleEndian32(entry.bytes.length),
      littleEndian32(entry.bytes.length),
      littleEndian16(name.length),
      littleEndian16(0),
      name,
    ]);
    localParts.push(localHeader, entry.bytes);

    centralParts.push(concat([
      littleEndian32(0x02014b50),
      littleEndian16(20),
      littleEndian16(20),
      littleEndian16(0x0800),
      littleEndian16(0),
      littleEndian16(stamp.time),
      littleEndian16(stamp.date),
      littleEndian32(crc),
      littleEndian32(entry.bytes.length),
      littleEndian32(entry.bytes.length),
      littleEndian16(name.length),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian32(0),
      littleEndian32(offset),
      name,
    ]));
    offset += localHeader.length + entry.bytes.length;
  }

  const central = concat(centralParts);
  const end = concat([
    littleEndian32(0x06054b50),
    littleEndian16(0),
    littleEndian16(0),
    littleEndian16(entries.length),
    littleEndian16(entries.length),
    littleEndian32(central.length),
    littleEndian32(offset),
    littleEndian16(0),
  ]);
  return concat([...localParts, central, end]);
}

function jsonEntry(name: string, value: unknown): ZipEntry {
  return { name, bytes: encoder.encode(`${JSON.stringify(value, null, 2)}\n`) };
}

function safeFileStem(value: string): string {
  const stem = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 100);
  return stem || "toonstudio-project";
}

export function buildStudioProjectPackage(input: {
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly profile: StudioSaveProfile;
  readonly submissions?: readonly StudioSubmission[];
  readonly exportedAt?: string;
  readonly additionalEntries?: Readonly<Record<string, string | Uint8Array>>;
}): StudioProjectPackageResult {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const entries: ZipEntry[] = [
    jsonEntry("project/project.json", input.project),
    jsonEntry("project/documents.json", input.documents),
    jsonEntry("storage/profile.json", input.profile),
    jsonEntry("distribution/submissions.json", input.submissions ?? []),
    {
      name: "README.txt",
      bytes: encoder.encode(
        "ToonStudio private project package. Opening or saving this file does not publish the work.\n",
      ),
    },
  ];

  for (const [name, value] of Object.entries(input.additionalEntries ?? {})) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,239}$/u.test(name) || name.includes("..")) continue;
    entries.push({ name: `workspace/${name}`, bytes: typeof value === "string" ? encoder.encode(value) : value });
  }

  const manifest: StudioProjectPackageManifest = Object.freeze({
    format: "toonstudio-project",
    formatVersion: 1,
    projectId: input.project.id,
    projectTitle: input.project.title,
    createdAt: input.project.createdAt,
    exportedAt,
    sourceRevision: input.profile.revision,
    accessMode: input.profile.accessMode,
    distributionState: input.profile.distributionState,
    entryNames: Object.freeze(["manifest.json", ...entries.map((entry) => entry.name)]),
  });
  const allEntries = [jsonEntry("manifest.json", manifest), ...entries];
  const zip = buildZip(allEntries, exportedAt);
  return Object.freeze({
    blob: new Blob([zip], { type: STUDIO_PROJECT_PACKAGE_MIME }),
    fileName: `${safeFileStem(input.project.title)}.toonstudio`,
    manifest,
  });
}

export async function saveStudioProjectPackage(
  result: StudioProjectPackageResult,
  ownerWindow: Window = window,
): Promise<"file-picker" | "download"> {
  const pickerWindow = ownerWindow as FilePickerWindow;
  if (typeof pickerWindow.showSaveFilePicker === "function") {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: result.fileName,
      types: [{
        description: "ToonStudio project",
        accept: { [STUDIO_PROJECT_PACKAGE_MIME]: [".toonstudio"] },
      }],
    });
    const writable = await handle.createWritable();
    await writable.write(result.blob);
    await writable.close();
    return "file-picker";
  }

  const url = URL.createObjectURL(result.blob);
  try {
    const anchor = ownerWindow.document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    ownerWindow.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return "download";
}
