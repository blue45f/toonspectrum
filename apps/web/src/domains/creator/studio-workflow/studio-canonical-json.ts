import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

import { createSha256Portable } from "../studio-sha256";

// Shared with Archive v3: sort object keys recursively and retain array order.
// Keep the existing persisted JSON preimage and SHA-256 implementation unchanged.
function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort(compareCodeUnitStrings).map((key) => [
      key,
      canonicalJsonValue(record[key]),
    ]));
  }
  return value;
}

export function digestStudioCanonicalJsonValue(value: unknown): string {
  const hasher = createSha256Portable();
  hasher.update(new TextEncoder().encode(JSON.stringify(canonicalJsonValue(value))));
  return `sha256:${hasher.finalizeHex()}`;
}
