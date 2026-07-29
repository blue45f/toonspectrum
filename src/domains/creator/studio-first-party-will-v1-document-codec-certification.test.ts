import { describe, expect, it } from "vitest";

import {
  STUDIO_FIRST_PARTY_WILL_V1_DOCUMENT_CONFORMANCE_EVIDENCE_MEDIA_TYPE,
  executeAndCertifyStudioFirstPartyWillV1DocumentCodec,
  studioFirstPartyWillV1DocumentCodecCertificationScope,
  verifyStudioFirstPartyWillV1DocumentCertifiedExecution,
} from "./studio-first-party-will-v1-document-codec-certification";
import {
  STUDIO_FIRST_PARTY_WILL_V1_DOCUMENT_CODEC_PROVIDER,
  encodeStudioWillV1DocumentTransport,
} from "./studio-first-party-will-v1-document-codec-provider";
import {
  issueStudioProductCodecCertificate,
} from "./studio-product-codec-certification";

import type { StudioCodecProvider } from "./studio-codec-provider-contract";
import type {
  StudioProductCodecCertificationSigner,
  StudioProductCodecCertificationTrustRoot,
} from "./studio-product-codec-certification";

const ISSUED_AT = "2026-07-30T00:00:00.000Z";
const EXPIRES_AT = "2026-07-31T00:00:00.000Z";
const ROOT_START = "2026-07-01T00:00:00.000Z";
const ROOT_END = "2026-08-31T00:00:00.000Z";
const VERIFY_AT = Date.parse("2026-07-30T12:00:00.000Z");

async function inputBytes(): Promise<Uint8Array> {
  return encodeStudioWillV1DocumentTransport({
    width: 328,
    height: 439,
    title: "Certified bounded WILL",
    createdAt: "2026-07-30T12:34:56Z",
    application: "ToonSpectrum Studio",
    applicationVersion: "1.0.0",
    paths: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 8, y: 12 },
          { x: 16, y: 20 },
          { x: 28, y: 14 },
        ],
        strokeWidths: [0.75, 1.25],
        strokeColor: { r: 12, g: 34, b: 56, a: 220 },
        decimalPrecision: 2,
      },
    ],
  });
}

async function credentials(
  scope: string,
): Promise<Readonly<{
  signer: StudioProductCodecCertificationSigner;
  root: StudioProductCodecCertificationTrustRoot;
}>> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const keyId = "toonspectrum.product.release.will-v1-document.2026-07";
  return Object.freeze({
    signer: {
      algorithm: "ecdsa-p256-sha256",
      keyId,
      privateKey: pair.privateKey,
      scopes: [scope],
      validFrom: ROOT_START,
      validUntil: ROOT_END,
    },
    root: {
      algorithm: "ecdsa-p256-sha256",
      keyId,
      publicKey: pair.publicKey,
      scopes: [scope],
      validFrom: ROOT_START,
      validUntil: ROOT_END,
      revokedAt: null,
    },
  });
}

describe("first-party WILL v1 Annex B document product certification", () => {
  it("executes, proves, signs, and verifies exact bounded .will bytes", async () => {
    const scope =
      studioFirstPartyWillV1DocumentCodecCertificationScope("encode");
    const { signer, root } = await credentials(scope);
    const certified =
      await executeAndCertifyStudioFirstPartyWillV1DocumentCodec(
        {
          direction: "encode",
          inputBytes: await inputBytes(),
          issuedAt: ISSUED_AT,
          expiresAt: EXPIRES_AT,
        },
        signer,
      );
    expect(certified.conformance).toMatchObject({
      coverage: "annex-b-bounded-seven-part-document",
      annexBOpcContainerCovered: true,
      thirdPartyCodecCertification: false,
      vendorTrademarkAuthorization: false,
      arbitraryVendorFileInteroperabilityCertified: false,
      decision: "passed",
    });
    const verified =
      await verifyStudioFirstPartyWillV1DocumentCertifiedExecution(
        certified,
        { trustRoots: [root], nowEpochMs: VERIFY_AT },
      );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(
      verified.certificate.certification
        .officialToonSpectrumProductCertification,
    ).toBe(true);
    expect(
      verified.certificate.certification.codecVendorCertification,
    ).toBe(false);
  });

  it("rejects byte, canonical evidence object, and media-type substitution", async () => {
    const scope =
      studioFirstPartyWillV1DocumentCodecCertificationScope("encode");
    const { signer, root } = await credentials(scope);
    const certified =
      await executeAndCertifyStudioFirstPartyWillV1DocumentCodec(
        {
          direction: "encode",
          inputBytes: await inputBytes(),
          issuedAt: ISSUED_AT,
          expiresAt: EXPIRES_AT,
        },
        signer,
      );
    await expect(
      verifyStudioFirstPartyWillV1DocumentCertifiedExecution(
        {
          ...certified,
          bytes: Uint8Array.from([...certified.bytes, 0]),
        },
        { trustRoots: [root], nowEpochMs: VERIFY_AT },
      ),
    ).resolves.toMatchObject({ ok: false, code: "OUTPUT_MISMATCH" });
    await expect(
      verifyStudioFirstPartyWillV1DocumentCertifiedExecution(
        {
          ...certified,
          conformance: {
            ...certified.conformance,
            manifestSha256: `sha256:${"0".repeat(64)}`,
          },
        },
        { trustRoots: [root], nowEpochMs: VERIFY_AT },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "CERTIFIED_EXECUTION_IDENTITY_MISMATCH",
    });

    const mislabeled = await issueStudioProductCodecCertificate(
      {
        receipt: certified.receipt,
        outputBytes: certified.bytes,
        evidenceBytes: certified.conformanceBytes,
        evidenceMediaType: "application/vnd.toonspectrum.cross-protocol+json",
        scope,
        issuedAt: ISSUED_AT,
        expiresAt: EXPIRES_AT,
      },
      signer,
    );
    expect(
      STUDIO_FIRST_PARTY_WILL_V1_DOCUMENT_CONFORMANCE_EVIDENCE_MEDIA_TYPE,
    ).not.toBe("application/vnd.toonspectrum.cross-protocol+json");
    await expect(
      verifyStudioFirstPartyWillV1DocumentCertifiedExecution(
        { ...certified, certificateBytes: mislabeled },
        { trustRoots: [root], nowEpochMs: VERIFY_AT },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "CERTIFIED_EXECUTION_IDENTITY_MISMATCH",
    });
  });

  it("pins the built-in provider and claims one-shot ids only after identity", async () => {
    const scope =
      studioFirstPartyWillV1DocumentCodecCertificationScope("encode");
    const { signer, root } = await credentials(scope);
    const source = await inputBytes();
    const substituted: StudioCodecProvider = Object.freeze({
      manifest: STUDIO_FIRST_PARTY_WILL_V1_DOCUMENT_CODEC_PROVIDER.manifest,
      execute:
        STUDIO_FIRST_PARTY_WILL_V1_DOCUMENT_CODEC_PROVIDER.execute,
    });
    await expect(
      executeAndCertifyStudioFirstPartyWillV1DocumentCodec(
        {
          direction: "encode",
          inputBytes: source,
          issuedAt: ISSUED_AT,
          expiresAt: EXPIRES_AT,
          providers: [substituted],
        },
        signer,
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_FOUND" });

    const certified =
      await executeAndCertifyStudioFirstPartyWillV1DocumentCodec(
        {
          direction: "encode",
          inputBytes: source,
          issuedAt: ISSUED_AT,
          expiresAt: EXPIRES_AT,
        },
        signer,
      );
    const claimed = new Set<string>();
    const claimCertificateId = (certificateId: string) => {
      if (claimed.has(certificateId)) return false;
      claimed.add(certificateId);
      return true;
    };
    await expect(
      verifyStudioFirstPartyWillV1DocumentCertifiedExecution(
        {
          ...certified,
          receipt: {
            ...certified.receipt,
            providerId: "substituted.provider",
          },
        },
        {
          trustRoots: [root],
          nowEpochMs: VERIFY_AT,
          claimCertificateId,
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "CERTIFIED_EXECUTION_IDENTITY_MISMATCH",
    });
    expect(claimed.size).toBe(0);
    await expect(
      verifyStudioFirstPartyWillV1DocumentCertifiedExecution(certified, {
        trustRoots: [root],
        nowEpochMs: VERIFY_AT,
        claimCertificateId,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(claimed.size).toBe(1);
  });
});
