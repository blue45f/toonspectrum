const MAX_CHECK_DEFINITION_LENGTH = 32_768;

function isIdentifierCharacter(character: string | undefined): boolean {
  return character !== undefined && /[a-zA-Z0-9_$]/u.test(character);
}

function enclosesWholeExpression(value: string): boolean {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      if (quoted && value[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
    if (depth < 0) return false;
  }
  return depth === 0 && !quoted;
}

function unwrapOuterParentheses(value: string): string {
  let result = value.trim();
  while (enclosesWholeExpression(result)) result = result.slice(1, -1).trim();
  return result;
}

function splitTopLevelBoolean(value: string, operator: "and" | "or"): string[] {
  const parts: string[] = [];
  let parentheses = 0;
  let brackets = 0;
  let quoted = false;
  let start = 0;
  const lowered = value.toLowerCase();

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      if (quoted && value[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    if (parentheses !== 0 || brackets !== 0) continue;

    if (
      lowered.startsWith(operator, index) &&
      !isIdentifierCharacter(lowered[index - 1]) &&
      !isIdentifierCharacter(lowered[index + operator.length])
    ) {
      parts.push(value.slice(start, index).trim());
      start = index + operator.length;
      index += operator.length - 1;
    }
  }

  if (parts.length === 0) return [value];
  parts.push(value.slice(start).trim());
  return parts;
}

function normalizeLexicalTriviaOutsideStringLiterals(value: string): string {
  let quoted = false;
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quoted) result += character;
    else if (character !== '"' && !/\s/u.test(character)) result += character.toLowerCase();
    if (character !== "'") continue;
    if (quoted && value[index + 1] === "'") {
      result += value[index + 1];
      index += 1;
      continue;
    }
    quoted = !quoted;
  }
  return result;
}

function normalizeLeaf(value: string): string | null {
  const unwrapped = unwrapOuterParentheses(value);
  if (!unwrapped) return null;
  let normalized = normalizeLexicalTriviaOutsideStringLiterals(unwrapped)
    // PostgreSQL versions differ on printing an otherwise implicit text cast for literals and
    // scalar-array constants. Column casts (notably width::bigint) remain part of the fingerprint.
    .replace(/('(?:[^']|'')*')::(?:pg_catalog\.)?text\b/gu, "$1")
    .replace(/(array\[[^\]]*\])::(?:pg_catalog\.)?text\[\]/gu, "$1")
    // Likewise, an integer constant may be rendered as 0 or '0'::bigint depending on context.
    // This intentionally does not remove casts applied to identifiers or expressions.
    .replace(/'?(-?\d+)'?::(?:pg_catalog\.)?(?:smallint|integer|bigint)\b/gu, "$1")
    .replace(/\(('(?:[^']|'')*'|-?\d+)\)/gu, "$1");
  // pg_get_constraintdef(..., true) may retain parentheses around an atom or the canonical
  // overflow-safe multiplication on one PostgreSQL major and omit them on another. Iterating a
  // single balanced pair preserves an enclosing arithmetic group until its operands are clean.
  let previous: string;
  do {
    previous = normalized;
    normalized = normalized.replace(/\(([a-z_][a-z0-9_$]*)\)(?=::)/gu, "$1");
  } while (normalized !== previous);
  do {
    previous = normalized;
    normalized = normalized.replace(
      /\(([a-z_][a-z0-9_$]*::bigint\*[a-z_][a-z0-9_$]*::bigint)\)(?=<=)/gu,
      "$1"
    );
  } while (normalized !== previous);
  return normalized || null;
}

function fingerprintBooleanExpression(value: string): string | null {
  const unwrapped = unwrapOuterParentheses(value);
  const orParts = splitTopLevelBoolean(unwrapped, "or");
  if (orParts.length > 1) {
    const children = orParts.map(fingerprintBooleanExpression);
    if (!children.every((child): child is string => child !== null)) return null;
    return `or(${children.map((child) =>
      child.startsWith("or(") && child.endsWith(")") ? child.slice(3, -1) : child
    ).join(",")})`;
  }
  const andParts = splitTopLevelBoolean(unwrapped, "and");
  if (andParts.length > 1) {
    const children = andParts.map(fingerprintBooleanExpression);
    if (!children.every((child): child is string => child !== null)) return null;
    return `and(${children.map((child) =>
      child.startsWith("and(") && child.endsWith(")") ? child.slice(4, -1) : child
    ).join(",")})`;
  }
  return normalizeLeaf(unwrapped);
}

/**
 * Produce a strict structural fingerprint for the small CHECK-expression grammar owned by this
 * application. It accepts harmless PostgreSQL pretty-printing differences while preserving
 * boolean grouping, operator order, bounds, enum members, predicates, and expression casts.
 * Unknown/malformed definitions fail closed by returning null.
 */
export function fingerprintPostgresCheckDefinition(definition: unknown): string | null {
  if (
    typeof definition !== "string" ||
    definition.length === 0 ||
    definition.length > MAX_CHECK_DEFINITION_LENGTH
  ) {
    return null;
  }
  const trimmed = definition.trim();
  const checkMatch = /^check\b/iu.exec(trimmed);
  const expression = checkMatch
    ? trimmed.slice(checkMatch[0].length).trim()
    : trimmed;
  if (!expression) return null;
  return fingerprintBooleanExpression(expression);
}

export function matchesPostgresCheckDefinition(
  actual: unknown,
  canonical: string
): boolean {
  const actualFingerprint = fingerprintPostgresCheckDefinition(actual);
  const canonicalFingerprint = fingerprintPostgresCheckDefinition(canonical);
  return actualFingerprint !== null && actualFingerprint === canonicalFingerprint;
}
