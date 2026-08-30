export interface MarketSeedIdentity {
  readonly manifest: {
    readonly packageId: string;
    readonly resourceVersion: string;
  };
  readonly manifestHash: string;
}

export interface OwnedMarketResourceIdentity {
  readonly packageId: string;
  readonly resourceVersion: string;
  readonly manifestHash: string;
}

export type OwnedMarketSeedInspection<T extends OwnedMarketResourceIdentity> =
  | Readonly<{ status: "exact"; record: T }>
  | Readonly<{ status: "duplicate-exact"; records: readonly T[] }>
  | Readonly<{ status: "mismatch"; records: readonly T[] }>
  | Readonly<{ status: "missing" }>;

export function sameMarketSeedPackageVersion(
  record: OwnedMarketResourceIdentity,
  seed: MarketSeedIdentity,
): boolean {
  return (
    record.packageId === seed.manifest.packageId
    && record.resourceVersion === seed.manifest.resourceVersion
  );
}

/**
 * A publish conflict is idempotent only when the authenticated owner's catalogue proves the
 * complete packageId + resourceVersion + manifestHash identity. Package/version alone is not
 * enough: it can conceal changed seed contents behind a successful-looking 409 response.
 */
export function inspectOwnedMarketSeed<T extends OwnedMarketResourceIdentity>(
  records: readonly T[],
  seed: MarketSeedIdentity,
): OwnedMarketSeedInspection<T> {
  const packageVersionRecords = records.filter((record) =>
    sameMarketSeedPackageVersion(record, seed)
  );
  const exactRecords = packageVersionRecords.filter(
    (record) => record.manifestHash === seed.manifestHash,
  );
  if (exactRecords.length === 1) return { status: "exact", record: exactRecords[0]! };
  if (exactRecords.length > 1) return { status: "duplicate-exact", records: exactRecords };
  if (packageVersionRecords.length > 0) {
    return { status: "mismatch", records: packageVersionRecords };
  }
  return { status: "missing" };
}

export function isLoopbackMarketSeedApiUrl(url: URL): boolean {
  // Node exposes an IPv6 hostname with brackets (`[::1]`), unlike the bare IPv4/localhost forms.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return (
    url.protocol === "http:"
    && ["127.0.0.1", "localhost", "::1"].includes(hostname)
    && !url.username
    && !url.password
    && url.pathname === "/"
    && !url.search
    && !url.hash
  );
}
