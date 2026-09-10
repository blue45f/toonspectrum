const DEFAULT_SECURE_RANDOM_ID_ERROR =
  "이 환경에서는 안전한 식별자를 만들 수 없습니다.";

/** Creates an RFC 4122 version 4 UUID using Web Crypto only. */
export function createSecureRandomUuid(
  errorMessage = DEFAULT_SECURE_RANDOM_ID_ERROR,
): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Some embedded WebViews expose a throwing randomUUID implementation.
    }
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(errorMessage);
  }
  const bytes = new Uint8Array(16);
  try {
    cryptoApi.getRandomValues(bytes);
  } catch {
    throw new Error(errorMessage);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
