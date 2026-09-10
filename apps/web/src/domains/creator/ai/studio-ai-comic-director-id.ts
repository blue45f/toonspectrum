export type StudioAiComicDirectorCrypto = Partial<
  Pick<Crypto, "randomUUID" | "getRandomValues">
>;

function normalizedIdPrefix(prefix: string): string {
  return prefix
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32) || "id";
}

/**
 * Creates identifiers exclusively from Web Crypto entropy. Environments without a secure random
 * source fail closed rather than silently falling back to predictable pseudo-randomness.
 */
export function createStudioAiComicDirectorId(
  prefix: string,
  cryptoApi: StudioAiComicDirectorCrypto | undefined =
    typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto,
): string {
  if (typeof cryptoApi?.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Some embedded browsers expose randomUUID but reject it at call time.
    }
  }

  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("Web Crypto randomness is required to create Studio AI comic IDs.");
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  const token = Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${normalizedIdPrefix(prefix)}-${token}`;
}
