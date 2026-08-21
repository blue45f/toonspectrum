const LEGACY_FULL_VERIFICATION_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

function isPostgresProtocol(protocol: string): boolean {
  return protocol === "postgres:" || protocol === "postgresql:";
}

function isNeonHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "neon.tech" || normalized.endsWith(".neon.tech");
}

/**
 * Preserve node-postgres' current certificate + hostname verification semantics
 * without relying on sslmode aliases whose meaning changes in pg v9.
 *
 * The returned URL is safe to pass as the only TLS source to `new Pool()`.
 * Supplying a separate `ssl` object together with `sslmode` is intentionally
 * avoided because node-postgres lets connection-string SSL fields replace it.
 */
export function normalizePgConnectionStringForTls(connectionString: string): string {
  const parsed = new URL(connectionString);
  if (!isPostgresProtocol(parsed.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  const sslModes = parsed.searchParams.getAll("sslmode");
  if (sslModes.length > 1) {
    throw new Error("DATABASE_URL must not repeat sslmode");
  }

  const sslMode = sslModes[0]?.trim().toLowerCase();
  const neon = isNeonHost(parsed.hostname);

  if (neon && sslMode === "disable") {
    throw new Error("Neon DATABASE_URL must not disable TLS");
  }

  if (sslMode && LEGACY_FULL_VERIFICATION_SSL_MODES.has(sslMode)) {
    parsed.searchParams.set("sslmode", "verify-full");
  } else if (neon && !sslMode) {
    parsed.searchParams.set("sslmode", "verify-full");
  }

  return parsed.toString();
}
