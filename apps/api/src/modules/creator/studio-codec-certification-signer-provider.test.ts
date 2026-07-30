import {
  createHash,
  generateKeyPairSync,
  sign as signWithPrivateKey,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  StudioCodecCertificationSignerProviderConfigSchema,
  StudioCodecCertificationSignerProviderError,
  studioCodecCertificationSignerConfigHasNoSecrets,
  verifyStudioCodecCertificationSignerReadiness,
} from "./studio-codec-certification-signer-provider";

import type {
  StudioCodecCertificationAuthoritySigner,
} from "./studio-codec-certification-authority.service";

const NOW = Date.parse("2026-07-30T10:00:00.000Z");
const P256_ORDER = BigInt(
  "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"
);
const P256_HALF_ORDER = P256_ORDER >> BigInt(1);
const PINNED_SPKI = new Uint8Array(64).fill(4);
const PINNED_SPKI_SHA256 =
  `sha256:${createHash("sha256").update(PINNED_SPKI).digest("hex")}` as const;
const CONFIG = {
  schemaVersion: 1,
  kind: "toonspectrum-codec-certification-signer-config",
  adapterKind: "hsm",
  provider: "pkcs11-hsm",
  algorithm: "ed25519",
  keyId: "toonspectrum-codec-key-2026-01",
  keyResourceId: "hsm/cluster-a/slot-4/key-22",
  immutableKeyVersion: "version-22",
  publicKeySpkiSha256: PINNED_SPKI_SHA256,
  scopes: ["codec.qoi.encode"],
  validFrom: "2026-07-30T00:00:00.000Z",
  validUntil: "2027-07-30T00:00:00.000Z",
  requestTimeoutMs: 15_000,
  moduleRegistryId: "cloudhsm-production",
  slotId: "slot-4",
  keyLabel: "toon-codec-signing",
  signingMechanism: "CKM_EDDSA",
} as const;

function code(error: unknown): string | undefined {
  return error instanceof StudioCodecCertificationSignerProviderError
    ? error.code
    : undefined;
}

async function ed25519Fixture() {
  const keyPair = await crypto.subtle.generateKey(
    "Ed25519",
    false,
    ["sign", "verify"]
  );
  const sign = vi.fn(async (
    { canonicalBytes }: { canonicalBytes: Uint8Array }
  ) =>
    new Uint8Array(
      await crypto.subtle.sign("Ed25519", keyPair.privateKey, canonicalBytes)
    )
  );
  const verify = vi.fn(async (
    {
      canonicalBytes,
      signatureBytes,
    }: {
      canonicalBytes: Uint8Array;
      signatureBytes: Uint8Array;
    }
  ) =>
    crypto.subtle.verify(
      "Ed25519",
      keyPair.publicKey,
      signatureBytes,
      canonicalBytes
    )
  );
  const signer: StudioCodecCertificationAuthoritySigner = {
    adapterKind: "hsm",
    algorithm: "ed25519",
    keyId: CONFIG.keyId,
    scopes: CONFIG.scopes,
    validFrom: CONFIG.validFrom,
    validUntil: CONFIG.validUntil,
    sign,
    verify,
  };
  const publicKeySpkiDer = new Uint8Array(
    await crypto.subtle.exportKey("spki", keyPair.publicKey)
  );
  const config = {
    ...CONFIG,
    publicKeySpkiSha256:
      `sha256:${createHash("sha256")
        .update(publicKeySpkiDer)
        .digest("hex")}` as const,
  };
  return {
    config,
    keyPair,
    publicKeySpkiDer,
    sign,
    signer,
    verify,
  };
}

function bigintFromBigEndian(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) | BigInt(byte);
  return value;
}

function writeBigEndian(value: bigint, target: Uint8Array): void {
  let remaining = value;
  for (let index = target.byteLength - 1; index >= 0; index -= 1) {
    target[index] = Number(remaining & BigInt(0xff));
    remaining >>= BigInt(8);
  }
}

function canonicalP256Signature(signature: Uint8Array): Uint8Array {
  const canonical = Uint8Array.from(signature);
  const s = bigintFromBigEndian(canonical.subarray(32));
  if (s > P256_HALF_ORDER) {
    writeBigEndian(P256_ORDER - s, canonical.subarray(32));
  }
  return canonical;
}

describe("StudioCodecCertificationSignerProviderConfigSchema", () => {
  it("accepts only immutable, secret-free deployment references", () => {
    expect(
      StudioCodecCertificationSignerProviderConfigSchema.safeParse(CONFIG)
        .success
    ).toBe(true);
    expect(studioCodecCertificationSignerConfigHasNoSecrets(CONFIG)).toBe(true);
    expect(
      StudioCodecCertificationSignerProviderConfigSchema.safeParse({
        ...CONFIG,
        pin: "1234",
      }).success
    ).toBe(false);
    expect(
      studioCodecCertificationSignerConfigHasNoSecrets({
        ...CONFIG,
        privateKey: "-----BEGIN PRIVATE KEY-----",
      })
    ).toBe(false);
  });

  it("rejects mismatched PKCS#11 mechanisms and mutable/ambiguous key versions", () => {
    expect(
      StudioCodecCertificationSignerProviderConfigSchema.safeParse({
        ...CONFIG,
        signingMechanism: "CKM_ECDSA",
      }).success
    ).toBe(false);
    expect(
      StudioCodecCertificationSignerProviderConfigSchema.safeParse({
        ...CONFIG,
        immutableKeyVersion: "",
      }).success
    ).toBe(false);
  });
});

describe("verifyStudioCodecCertificationSignerReadiness", () => {
  it("signs and independently verifies a domain-separated challenge with the pinned SPKI", async () => {
    const {
      config,
      publicKeySpkiDer,
      sign,
      signer,
      verify,
    } = await ed25519Fixture();
    const create = vi.fn(async () => ({
      signer,
      immutableKeyVersion: CONFIG.immutableKeyVersion,
      publicKeySpkiDer,
    }));

    const readiness = await verifyStudioCodecCertificationSignerReadiness(
      config,
      { create },
      { nowEpochMs: NOW }
    );

    expect(readiness).toMatchObject({
      ready: true,
      provider: "pkcs11-hsm",
      adapterKind: "hsm",
      algorithm: "ed25519",
      keyId: CONFIG.keyId,
      immutableKeyVersion: CONFIG.immutableKeyVersion,
      publicKeySpkiSha256: config.publicKeySpkiSha256,
      checkedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(readiness.configSha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        keyResourceId: CONFIG.keyResourceId,
        immutableKeyVersion: CONFIG.immutableKeyVersion,
      }),
      expect.any(AbortSignal)
    );
    expect(sign).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it("independently verifies canonical P-256 signatures for KMS adapters", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const publicKeySpkiDer = Uint8Array.from(
      publicKey.export({ format: "der", type: "spki" })
    );
    const config = {
      schemaVersion: 1,
      kind: "toonspectrum-codec-certification-signer-config",
      adapterKind: "kms",
      provider: "aws-kms",
      algorithm: "ecdsa-p256-sha256",
      keyId: CONFIG.keyId,
      keyResourceId: "arn:aws:kms:ap-northeast-2:123456789012:key/key-22",
      immutableKeyVersion: CONFIG.immutableKeyVersion,
      publicKeySpkiSha256:
        `sha256:${createHash("sha256")
          .update(publicKeySpkiDer)
          .digest("hex")}` as const,
      scopes: CONFIG.scopes,
      validFrom: CONFIG.validFrom,
      validUntil: CONFIG.validUntil,
      requestTimeoutMs: CONFIG.requestTimeoutMs,
      region: "ap-northeast-2",
      signingAlgorithm: "ECDSA_SHA_256",
      messageType: "RAW",
    } as const;
    const verify = vi.fn(async () => true);
    const signer: StudioCodecCertificationAuthoritySigner = {
      adapterKind: "kms",
      algorithm: "ecdsa-p256-sha256",
      keyId: CONFIG.keyId,
      scopes: CONFIG.scopes,
      validFrom: CONFIG.validFrom,
      validUntil: CONFIG.validUntil,
      sign: vi.fn(async ({ canonicalBytes }) =>
        canonicalP256Signature(
          signWithPrivateKey(
            "sha256",
            Buffer.from(canonicalBytes),
            {
              key: privateKey,
              dsaEncoding: "ieee-p1363",
            }
          )
        )
      ),
      verify,
    };

    await expect(
      verifyStudioCodecCertificationSignerReadiness(
        config,
        {
          create: vi.fn(async () => ({
            signer,
            immutableKeyVersion: CONFIG.immutableKeyVersion,
            publicKeySpkiDer,
          })),
        },
        { nowEpochMs: NOW }
      )
    ).resolves.toMatchObject({
      ready: true,
      algorithm: "ecdsa-p256-sha256",
      provider: "aws-kms",
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails closed when resolved signer metadata differs from pinned configuration", async () => {
    const fixture = await ed25519Fixture();
    const signer: StudioCodecCertificationAuthoritySigner = {
      ...fixture.signer,
      keyId: "different-key",
    };
    await expect(
      verifyStudioCodecCertificationSignerReadiness(
        fixture.config,
        {
          create: vi.fn(async () => ({
            signer,
            immutableKeyVersion: CONFIG.immutableKeyVersion,
            publicKeySpkiDer: fixture.publicKeySpkiDer,
          })),
        },
        { nowEpochMs: NOW }
      )
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === "PROVIDER_MISMATCH"
    );
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("independently hashes provider-inspected SPKI DER and pins the resolved key version", async () => {
    const fixture = await ed25519Fixture();
    const other = await ed25519Fixture();
    for (const keyEvidence of [
      {
        immutableKeyVersion: "attacker-version",
        publicKeySpkiDer: fixture.publicKeySpkiDer,
      },
      {
        immutableKeyVersion: CONFIG.immutableKeyVersion,
        publicKeySpkiDer: other.publicKeySpkiDer,
      },
    ]) {
      await expect(
        verifyStudioCodecCertificationSignerReadiness(
          fixture.config,
          {
            create: vi.fn(async () => ({
              signer: fixture.signer,
              ...keyEvidence,
            })),
          },
          { nowEpochMs: NOW }
        )
      ).rejects.toSatisfy(
        (error: unknown) => code(error) === "PROVIDER_MISMATCH"
      );
    }
    expect(fixture.sign).not.toHaveBeenCalled();
  });

  it("rejects a malformed SPKI even when its bytes match the configured digest", async () => {
    const signer: StudioCodecCertificationAuthoritySigner = {
      adapterKind: "hsm",
      algorithm: "ed25519",
      keyId: CONFIG.keyId,
      scopes: CONFIG.scopes,
      validFrom: CONFIG.validFrom,
      validUntil: CONFIG.validUntil,
      sign: vi.fn(async () => new Uint8Array(64).fill(1)),
      verify: vi.fn(async () => true),
    };
    await expect(
      verifyStudioCodecCertificationSignerReadiness(
        CONFIG,
        {
          create: vi.fn(async () => ({
            signer,
            immutableKeyVersion: CONFIG.immutableKeyVersion,
            publicKeySpkiDer: PINNED_SPKI,
          })),
        },
        { nowEpochMs: NOW }
      )
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === "PROVIDER_MISMATCH"
    );
    expect(signer.sign).not.toHaveBeenCalled();
    expect(signer.verify).not.toHaveBeenCalled();
  });

  it("rejects a wrong-key signature even when the adapter verify method lies", async () => {
    const fixture = await ed25519Fixture();
    const signer: StudioCodecCertificationAuthoritySigner = {
      ...fixture.signer,
      sign: vi.fn(async () => new Uint8Array(64).fill(1)),
      verify: vi.fn(async () => true),
    };

    await expect(
      verifyStudioCodecCertificationSignerReadiness(
        fixture.config,
        {
          create: vi.fn(async () => ({
            signer,
            immutableKeyVersion: CONFIG.immutableKeyVersion,
            publicKeySpkiDer: fixture.publicKeySpkiDer,
          })),
        },
        { nowEpochMs: NOW }
      )
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === "READINESS_SIGNATURE_INVALID"
    );
    expect(signer.verify).not.toHaveBeenCalled();
  });

  it("aborts a never-settling provider factory at requestTimeoutMs", async () => {
    vi.useFakeTimers();
    try {
      let providerSignal: AbortSignal | undefined;
      const pending = verifyStudioCodecCertificationSignerReadiness(
        CONFIG,
        {
          create: vi.fn(async (_config, signal) => {
            providerSignal = signal;
            return await new Promise<never>(() => undefined);
          }),
        },
        { nowEpochMs: NOW }
      );
      const rejected = expect(pending).rejects.toSatisfy(
        (error: unknown) => code(error) === "PROVIDER_FAILED"
      );

      await vi.advanceTimersByTimeAsync(CONFIG.requestTimeoutMs);
      await rejected;
      expect(providerSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts a never-settling signer at requestTimeoutMs", async () => {
    const fixture = await ed25519Fixture();
    vi.useFakeTimers();
    try {
      let signerSignal: AbortSignal | undefined;
      const signer: StudioCodecCertificationAuthoritySigner = {
        ...fixture.signer,
        sign: vi.fn(async ({ signal }) => {
          signerSignal = signal;
          return await new Promise<Uint8Array>(() => undefined);
        }),
      };
      const pending = verifyStudioCodecCertificationSignerReadiness(
        fixture.config,
        {
          create: vi.fn(async () => ({
            signer,
            immutableKeyVersion: CONFIG.immutableKeyVersion,
            publicKeySpkiDer: fixture.publicKeySpkiDer,
          })),
        },
        { nowEpochMs: NOW }
      );
      const rejected = expect(pending).rejects.toSatisfy(
        (error: unknown) => code(error) === "PROVIDER_FAILED"
      );

      await vi.advanceTimersByTimeAsync(CONFIG.requestTimeoutMs);
      await rejected;
      expect(signerSignal?.aborted).toBe(true);
      expect(signer.verify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
