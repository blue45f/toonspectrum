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

/**
 * Exact manifests emitted by the two development-seed generations superseded by the current
 * Studio-installable catalogue. Matching the hash keeps cleanup from deleting user-authored
 * records that merely reuse a reserved-looking package/version on a loopback database.
 */
export const MARKET_DEV_LEGACY_SEED_IDENTITIES = Object.freeze([
  { packageId: "seed/brush/ink-gpen-fine", resourceVersion: "1.0.0", manifestHash: "3245b267e1d41068e92b871ef31ad3d41a3cc843898459694b47331ef56e8c2f" },
  { packageId: "seed/brush/soft-water-wash", resourceVersion: "1.0.0", manifestHash: "1f137fd9915a9beb5dda26078c1152e1774690d43abe0c6281134396328333f7" },
  { packageId: "seed/filter/webtoon-duotone-dusk", resourceVersion: "1.0.0", manifestHash: "7b6190a683302cf717109fc9bd1b0066327746693343a3057c50ac7aaea35518" },
  { packageId: "seed/filter/manga-screentone-pop", resourceVersion: "1.0.0", manifestHash: "9166c5a6e770188f1bbc201aad90b4cf91b3f5fdd6315c40195bdc860a5d7e21" },
  { packageId: "seed/palette/pastel-cafe-morning", resourceVersion: "1.0.0", manifestHash: "fa3db8b96aa293cbce9ca4905fecfa8ec7cae5e9a68f9c471a5e3ee04dbe795e" },
  { packageId: "seed/template/three-cut-action-board", resourceVersion: "1.0.0", manifestHash: "9fda4c347bd1a83c40dd96b859b12caa38e95e6576604ca986633338354bb88c" },
  { packageId: "seed/template/emotional-two-shot", resourceVersion: "1.0.0", manifestHash: "553d47339f1e73076adf3c002f0bc3fa80afd2cdd7dd8a395891c6fcf07d9cdd" },
  { packageId: "seed/bg3d/rainy-alley-night", resourceVersion: "1.0.0", manifestHash: "a83aef59d5fd4f1be4ca934c5c26e45e3e8847afabe4d0e93420257adb8643cf" },
  { packageId: "seed/bg3d/sunset-rooftop-school", resourceVersion: "1.0.0", manifestHash: "21b3f78729f69c268ae6119fb43824056500381e0d188658e02443147ede608a" },
  { packageId: "seed/asset/procedural-teacup-set", resourceVersion: "1.0.0", manifestHash: "7497100e3fa8a0c680201ead9254de32f41cd00385bf1f10584882933b7191d3" },
  { packageId: "seed/asset/street-prop-pack", resourceVersion: "1.0.0", manifestHash: "4df14c8d7c95b87deaab05ff5fc1ebcaf9bb78a73c577e5f849a2c1be5f37c3a" },
  { packageId: "seed/brush/ink-gpen-fine", resourceVersion: "1.0.0", manifestHash: "912b72564c327ab40b852c08eb96b5fae0257f9f018b1583d358e63228cccb14" },
  { packageId: "seed/brush/soft-water-wash", resourceVersion: "1.0.0", manifestHash: "1c5434d752e5b50db03e22f77f14fadd95bb6e1fc8693378bb961d7922fa174b" },
  { packageId: "seed/filter/webtoon-duotone-dusk", resourceVersion: "1.0.0", manifestHash: "41362a935c2aeacbf6b6eeadc3392c4a96d80237cebc532c11f833668b230e7e" },
  { packageId: "seed/palette/pastel-cafe-morning", resourceVersion: "1.0.0", manifestHash: "3fe151b59108e2262a79d9b6b32a3cb87e9eefa197284f16a013167cd582ca5d" },
] satisfies readonly OwnedMarketResourceIdentity[]);

export function isExactLegacyMarketSeed(
  record: OwnedMarketResourceIdentity,
): boolean {
  return MARKET_DEV_LEGACY_SEED_IDENTITIES.some((identity) =>
    identity.packageId === record.packageId
    && identity.resourceVersion === record.resourceVersion
    && identity.manifestHash === record.manifestHash
  );
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
