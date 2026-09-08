import {
  QUERY_COLOR_ALIASES,
  QUERY_FIELD_ALIASES,
  QUERY_KIND_ALIASES,
  QUERY_ROLE_ALIASES,
  QUERY_SMART_ALIASES,
  QUERY_STATE_ALIASES,
} from "./studio-layer-query-aliases";
import type {
  StudioLayerQueryDiagnostic,
  StudioLayerQueryPlan,
  StudioLayerQueryTerm,
} from "./studio-layer-query-types";
import { normalizeStudioLayerSearchText } from "./studio-layer-smart-views";

function tokenize(input: string): { tokens: readonly string[]; unterminatedQuote: boolean } {
  const source = input.normalize("NFKC").slice(0, 512);
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return { tokens, unterminatedQuote: quote !== null };
}

function splitAlternatives(value: string): readonly string[] {
  return value
    .split(/[|,]/u)
    .map(normalizeStudioLayerSearchText)
    .filter(Boolean);
}

function resolveValues<Value extends string>(
  rawValue: string,
  aliases: ReadonlyMap<string, Value>,
  token: string,
  diagnostics: StudioLayerQueryDiagnostic[]
): { values: readonly Value[]; valid: boolean } {
  const values: Value[] = [];
  const unknown: string[] = [];
  for (const candidate of splitAlternatives(rawValue)) {
    const resolved = aliases.get(candidate);
    if (resolved) values.push(resolved);
    else unknown.push(candidate);
  }
  if (unknown.length > 0) {
    diagnostics.push({
      token,
      code: "unknown-value",
      message: `지원하지 않는 값: ${unknown.join(", ")}`,
    });
  }
  return { values: [...new Set(values)], valid: unknown.length === 0 };
}

function invalid(raw: string): StudioLayerQueryTerm {
  return { kind: "invalid", negated: false, raw };
}

function parseOpacity(
  value: string,
  raw: string,
  negated: boolean,
  diagnostics: StudioLayerQueryDiagnostic[]
): StudioLayerQueryTerm {
  const match = /^(?:(!=|<=|>=|=|<|>))?\s*(\d+(?:\.\d+)?)\s*(%)?$/u.exec(value);
  const numericText = match?.[2];
  if (!match || numericText === undefined) {
    diagnostics.push({ token: raw, code: "invalid-opacity", message: "불투명도는 0–1 또는 0–100%로 입력하세요." });
    return invalid(raw);
  }
  const numeric = Number(numericText);
  const normalized = match[3] || numeric > 1 ? numeric / 100 : numeric;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    diagnostics.push({ token: raw, code: "invalid-opacity", message: "불투명도 범위를 벗어났습니다." });
    return invalid(raw);
  }
  return {
    kind: "opacity",
    operator: (match[1] ?? "=") as "=" | "!=" | "<" | "<=" | ">" | ">=",
    value: normalized,
    negated,
    raw,
  };
}

export function parseStudioLayerQuery(query: string): StudioLayerQueryPlan {
  const lexed = tokenize(query);
  const terms: StudioLayerQueryTerm[] = [];
  const diagnostics: StudioLayerQueryDiagnostic[] = [];

  if (lexed.unterminatedQuote) {
    diagnostics.push({
      token: query.slice(0, 512),
      code: "unterminated-quote",
      message: "닫히지 않은 따옴표가 있습니다.",
    });
  }

  for (const originalToken of lexed.tokens) {
    let raw = originalToken;
    let negated = false;
    if ((raw.startsWith("-") || raw.startsWith("!")) && raw.length > 1) {
      negated = true;
      raw = raw.slice(1);
    }

    const separator = raw.indexOf(":");
    if (separator <= 0) {
      const value = normalizeStudioLayerSearchText(raw);
      if (value) terms.push({ kind: "text", value, negated, raw: originalToken });
      continue;
    }

    const rawField = normalizeStudioLayerSearchText(raw.slice(0, separator));
    const rawValue = raw.slice(separator + 1).trim();
    const field = QUERY_FIELD_ALIASES.get(rawField);
    if (!field) {
      const value = normalizeStudioLayerSearchText(raw);
      if (value) terms.push({ kind: "text", value, negated, raw: originalToken });
      continue;
    }
    if (!rawValue) {
      diagnostics.push({ token: originalToken, code: "empty-value", message: "필터 값이 비어 있습니다." });
      terms.push(invalid(originalToken));
      continue;
    }

    if (field === "kind") {
      const resolved = resolveValues(rawValue, QUERY_KIND_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "layer-kind", values: resolved.values, negated, raw: originalToken }
        : invalid(originalToken));
      continue;
    }
    if (field === "role") {
      const resolved = resolveValues(rawValue, QUERY_ROLE_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "role", values: resolved.values, negated, raw: originalToken }
        : invalid(originalToken));
      continue;
    }
    if (field === "color") {
      const resolved = resolveValues(rawValue, QUERY_COLOR_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "color", values: resolved.values, negated, raw: originalToken }
        : invalid(originalToken));
      continue;
    }
    if (field === "state") {
      const resolved = resolveValues(rawValue, QUERY_STATE_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "state", values: resolved.values, negated, raw: originalToken }
        : invalid(originalToken));
      continue;
    }
    if (field === "smart") {
      const resolved = resolveValues(rawValue, QUERY_SMART_ALIASES, originalToken, diagnostics);
      terms.push(resolved.valid && resolved.values.length > 0
        ? { kind: "smart", values: resolved.values, negated, raw: originalToken }
        : invalid(originalToken));
      continue;
    }
    if (field === "opacity") {
      terms.push(parseOpacity(rawValue, originalToken, negated, diagnostics));
      continue;
    }

    const value = normalizeStudioLayerSearchText(rawValue);
    if (field === "group") {
      const noneValues = ["none", "없음", "미지정", "ungrouped", "그룹 없음"];
      terms.push({ kind: "group", value: noneValues.includes(value) ? null : value, negated, raw: originalToken });
    } else if (field === "id") {
      terms.push({ kind: "id", value, negated, raw: originalToken });
    } else if (field === "name") {
      terms.push({ kind: "name", value, negated, raw: originalToken });
    } else {
      terms.push({ kind: "content", value, negated, raw: originalToken });
    }
  }

  return { terms, diagnostics };
}
