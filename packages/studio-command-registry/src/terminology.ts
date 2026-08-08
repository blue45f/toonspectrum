/**
 * Terminology reverse index — "CSP/Photoshop/Krita/Procreate wording → our command".
 *
 * Migrating users search for the name they already know ("Paint Bucket",
 * "ペンツール", "ColorDrop"), not ours. §15.3 Help lists
 * "CSP/Photoshop terminology search" as a first-class menu entry, so the lookup
 * has to be a data structure, not a per-surface `includes()` scan.
 */

import type { CommandId, TerminologyAlias, TerminologyVendor } from "./types";

/**
 * Fold a term to its lookup key: case, whitespace and separator punctuation are
 * ignored so "Paint Bucket", "paint-bucket" and "페인트 버킷" behave predictably.
 * Non-Latin scripts are left intact (no transliteration).
 */
export function normalizeTerminologyTerm(term: string): string {
  return term
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s··_/-]+/gu, "");
}

export interface TerminologyMatch {
  commandId: CommandId;
  vendor: TerminologyVendor;
  term: string;
}

export interface TerminologyResolveOptions {
  /** Restrict to one dictionary, e.g. only CSP wording. */
  vendor?: TerminologyVendor;
  /** Also match terms that merely contain the query. Defaults to exact-key only. */
  fuzzy?: boolean;
}

/** Insertion-ordered multimap from normalized term to the commands that claim it. */
export class TerminologyIndex {
  private readonly byTerm = new Map<string, TerminologyMatch[]>();

  add(commandId: CommandId, aliases: readonly TerminologyAlias[]): void {
    for (const alias of aliases) {
      const key = normalizeTerminologyTerm(alias.term);
      if (key === "") continue;
      const bucket = this.byTerm.get(key);
      const match: TerminologyMatch = {
        commandId,
        vendor: alias.vendor,
        term: alias.term,
      };
      if (bucket) bucket.push(match);
      else this.byTerm.set(key, [match]);
    }
  }

  remove(commandId: CommandId): void {
    for (const [key, bucket] of this.byTerm) {
      const kept = bucket.filter((match) => match.commandId !== commandId);
      if (kept.length === 0) this.byTerm.delete(key);
      else if (kept.length !== bucket.length) this.byTerm.set(key, kept);
    }
  }

  resolve(
    term: string,
    options: TerminologyResolveOptions = {},
  ): TerminologyMatch[] {
    const key = normalizeTerminologyTerm(term);
    if (key === "") return [];
    const matches: TerminologyMatch[] = [];
    if (options.fuzzy) {
      for (const [indexedKey, bucket] of this.byTerm) {
        if (indexedKey.includes(key)) matches.push(...bucket);
      }
    } else {
      matches.push(...(this.byTerm.get(key) ?? []));
    }
    return options.vendor
      ? matches.filter((match) => match.vendor === options.vendor)
      : matches;
  }

  /** Terms claimed by more than one command — surfaced so ambiguity stays visible. */
  ambiguousTerms(): { term: string; commandIds: CommandId[] }[] {
    const ambiguous: { term: string; commandIds: CommandId[] }[] = [];
    for (const [key, bucket] of this.byTerm) {
      const ids = [...new Set(bucket.map((match) => match.commandId))];
      if (ids.length > 1) ambiguous.push({ term: key, commandIds: ids });
    }
    return ambiguous;
  }

  get size(): number {
    return this.byTerm.size;
  }
}
