/** Small, page-owned proof settings. The original profile travels with JSON and CRDT backups. */
export const STUDIO_COLOR_PROOF_MAX_PROFILE_BYTES = 4096;
export interface StudioColorProofDocument {
  readonly version: 1;
  readonly sourceSpace: "srgb";
  readonly intent: "media-relative";
  readonly profile: {
    readonly name: string;
    readonly base64: string;
    readonly sha256: string;
    readonly embeddingAuthorized: true;
  };
}

/** Structural admission only; transform/export rechecks the byte hash, ICC policy and curves. */
export function parseStudioColorProofDocument(value: unknown): StudioColorProofDocument | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "intent,profile,sourceSpace,version"
    || input.version !== 1 || input.sourceSpace !== "srgb" || input.intent !== "media-relative") return null;
  if (typeof input.profile !== "object" || input.profile === null || Array.isArray(input.profile)) return null;
  const p = input.profile as Record<string, unknown>;
  if (Object.keys(p).sort().join(",") !== "base64,embeddingAuthorized,name,sha256"
    || typeof p.name !== "string" || p.name.length < 1 || p.name.length > 128
    || typeof p.base64 !== "string" || p.base64.length < 176 || p.base64.length > 5464
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(p.base64)
    || typeof p.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(p.sha256)
    || p.embeddingAuthorized !== true) return null;
  return { version: 1, sourceSpace: "srgb", intent: "media-relative", profile: {
    name: p.name, base64: p.base64, sha256: p.sha256, embeddingAuthorized: true,
  } };
}
