import type { CharacterDocumentV2 } from "./character-document-v2";

export type CharacterDocumentDiffKind = "added" | "removed" | "changed";

export interface CharacterDocumentDiffEntry {
  readonly path: string;
  readonly kind: CharacterDocumentDiffKind;
  readonly before: unknown;
  readonly after: unknown;
}

export interface CharacterDocumentDiffOptions {
  readonly ignoredPaths?: readonly string[];
}

const DEFAULT_IGNORED_PATHS = Object.freeze(["revision", "updatedAt"] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equalAtomic(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => equalAtomic(item, right[index]));
  }
  return false;
}

function pathIgnored(path: string, ignored: ReadonlySet<string>): boolean {
  if (ignored.has(path)) return true;
  for (const prefix of ignored) {
    if (path.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

function appendDiff(
  entries: CharacterDocumentDiffEntry[],
  path: string,
  before: unknown,
  after: unknown,
  ignored: ReadonlySet<string>,
): void {
  if (pathIgnored(path, ignored) || Object.is(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort((left, right) => left.localeCompare(right, "en"))) {
      appendDiff(entries, path ? `${path}.${key}` : key, before[key], after[key], ignored);
    }
    return;
  }
  if (equalAtomic(before, after)) return;
  entries.push({
    path,
    kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
    before,
    after,
  });
}

export function diffCharacterDocuments(
  before: CharacterDocumentV2,
  after: CharacterDocumentV2,
  options: CharacterDocumentDiffOptions = {},
): readonly CharacterDocumentDiffEntry[] {
  const ignored = new Set<string>([
    ...DEFAULT_IGNORED_PATHS,
    ...(options.ignoredPaths ?? []),
  ]);
  const entries: CharacterDocumentDiffEntry[] = [];
  appendDiff(entries, "", before, after, ignored);
  return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

export function characterDocumentChangedPaths(
  before: CharacterDocumentV2,
  after: CharacterDocumentV2,
  options?: CharacterDocumentDiffOptions,
): readonly string[] {
  return Object.freeze(diffCharacterDocuments(before, after, options).map((entry) => entry.path));
}
