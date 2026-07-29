/**
 * End-to-end first-party raster codec execution + ToonSpectrum product certification.
 *
 * This composes the generic provider boundary, deterministic conformance vectors, and the
 * deployment-owned signing authority. The result is an exact-source ToonSpectrum product
 * certificate. It is not a third-party standards-body, codec-vendor, or trademark certificate.
 */

import {
  executeStudioCodecProvider,
  type StudioCodecDirection,
  type StudioCodecExecutionReceipt,
  type StudioCodecExecutionRequest,
  type StudioCodecProvider,
} from "./studio-codec-provider-contract";
import {
  createStudioFirstPartyRasterConformanceEvidence,
  serializeStudioFirstPartyRasterConformanceEvidence,
  type StudioFirstPartyRasterConformanceEvidence,
} from "./studio-first-party-raster-codec-conformance";
import {
  STUDIO_FIRST_PARTY_RASTER_CODEC_PROFILE,
  STUDIO_FIRST_PARTY_RASTER_CODEC_PROVIDERS,
  STUDIO_FIRST_PARTY_RASTER_CODEC_VERSION,
} from "./studio-first-party-raster-codec-provider";
import {
  issueStudioProductCodecCertificate,
  verifyStudioProductCodecCertificate,
  type StudioProductCodecCertificate,
  type StudioProductCodecCertificationSigner,
  type StudioProductCodecCertificationTrustRoot,
  type StudioProductCodecCertificateVerificationResult,
} from "./studio-product-codec-certification";

import type { StudioRasterInterchangeFormat } from "./studio-raster-interchange";

export const STUDIO_FIRST_PARTY_RASTER_CONFORMANCE_EVIDENCE_MEDIA_TYPE =
  "application/vnd.toonspectrum.raster-codec-conformance+json" as const;

export interface ExecuteAndCertifyStudioFirstPartyRasterCodecInput {
  readonly format: StudioRasterInterchangeFormat;
  readonly direction: StudioCodecDirection;
  readonly inputBytes: Uint8Array;
  readonly issuedAt: string;
  readonly notBefore?: string;
  readonly expiresAt: string;
  readonly providers?: readonly StudioCodecProvider[];
}

export interface StudioFirstPartyRasterCertifiedExecution {
  readonly kind: "toonspectrum-first-party-raster-certified-execution";
  readonly format: StudioRasterInterchangeFormat;
  readonly direction: StudioCodecDirection;
  readonly scope: string;
  readonly bytes: Uint8Array;
  readonly receipt: StudioCodecExecutionReceipt;
  readonly conformance: StudioFirstPartyRasterConformanceEvidence;
  readonly conformanceBytes: Uint8Array;
  readonly certificateBytes: Uint8Array;
}

export interface VerifyStudioFirstPartyRasterCertifiedExecutionOptions {
  readonly trustRoots: readonly StudioProductCodecCertificationTrustRoot[];
  readonly nowEpochMs?: number;
  readonly revokedCertificateIds?: ReadonlySet<string>;
  readonly revokedKeyIds?: ReadonlySet<string>;
  readonly claimCertificateId?: (
    certificateId: string,
  ) => boolean | Promise<boolean>;
}

export type StudioFirstPartyRasterCertifiedExecutionVerification =
  | Readonly<{
      ok: true;
      certificate: StudioProductCodecCertificate;
    }>
  | Extract<
      StudioProductCodecCertificateVerificationResult,
      { readonly ok: false }
    >
  | Readonly<{
      ok: false;
      code: "CERTIFIED_EXECUTION_IDENTITY_MISMATCH";
      message: string;
    }>;

export class StudioFirstPartyRasterCodecCertificationError extends Error {
  readonly code:
    | "CODEC_EXECUTION_FAILED"
    | "PROVIDER_NOT_FOUND";

  constructor(
    code: StudioFirstPartyRasterCodecCertificationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StudioFirstPartyRasterCodecCertificationError";
    this.code = code;
  }
}

export function studioFirstPartyRasterCodecCertificationScope(
  format: StudioRasterInterchangeFormat,
  direction: StudioCodecDirection,
): string {
  return `toonspectrum.product.codec-conformance.${format}-${direction}`;
}

function providerFor(
  format: StudioRasterInterchangeFormat,
  providers: readonly StudioCodecProvider[],
): StudioCodecProvider {
  const expected = STUDIO_FIRST_PARTY_RASTER_CODEC_PROVIDERS.find(
    (provider) => provider.manifest.format === format,
  );
  const matches = expected
    ? providers.filter((provider) => provider === expected)
    : [];
  if (matches.length !== 1 || !matches[0]) {
    throw new StudioFirstPartyRasterCodecCertificationError(
      "PROVIDER_NOT_FOUND",
      `Expected one first-party ${format} codec provider.`,
    );
  }
  return matches[0];
}

function requestFor(
  provider: StudioCodecProvider,
  direction: StudioCodecDirection,
): StudioCodecExecutionRequest {
  const mimeType = provider.manifest.mimeTypes[0];
  const extension = provider.manifest.extensions[0];
  if (!mimeType || !extension) {
    throw new StudioFirstPartyRasterCodecCertificationError(
      "PROVIDER_NOT_FOUND",
      "First-party raster provider identity is incomplete.",
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    direction,
    format: provider.manifest.format,
    profile: provider.manifest.profile,
    version: provider.manifest.version,
    mimeType,
    extension,
    allowedModes: Object.freeze(["public-clean-room"] as const),
    requireDeterministic: true,
    maxInputBytes: provider.manifest.maxInputBytes,
    maxOutputBytes: provider.manifest.maxOutputBytes,
  });
}

function sameReceipt(
  actual: StudioCodecExecutionReceipt,
  certified: StudioCodecExecutionReceipt,
): boolean {
  return actual.schemaVersion === certified.schemaVersion
    && actual.kind === certified.kind
    && actual.providerId === certified.providerId
    && actual.mode === certified.mode
    && actual.direction === certified.direction
    && actual.format === certified.format
    && actual.profile === certified.profile
    && actual.version === certified.version
    && actual.mimeType === certified.mimeType
    && actual.extension === certified.extension
    && actual.deterministic === certified.deterministic
    && actual.input.byteLength === certified.input.byteLength
    && actual.input.sha256 === certified.input.sha256
    && actual.output.byteLength === certified.output.byteLength
    && actual.output.sha256 === certified.output.sha256
    && actual.licenseGrant.id === certified.licenseGrant.id
    && actual.licenseGrant.expiresAt === certified.licenseGrant.expiresAt
    && actual.licenseGrant.scope.length === certified.licenseGrant.scope.length
    && actual.licenseGrant.scope.every(
      (scope, index) => scope === certified.licenseGrant.scope[index],
    )
    && actual.officialClaims.externalAttestationAccepted
      === certified.officialClaims.externalAttestationAccepted
    && actual.officialClaims.officialCodec
      === certified.officialClaims.officialCodec
    && actual.officialClaims.certified
      === certified.officialClaims.certified
    && actual.officialClaims.trademarkAuthorized
      === certified.officialClaims.trademarkAuthorized;
}

function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.byteLength === second.byteLength
    && first.every((byte, index) => byte === second[index]);
}

function conformanceObjectMatches(
  execution: StudioFirstPartyRasterCertifiedExecution,
): boolean {
  try {
    return sameBytes(
      serializeStudioFirstPartyRasterConformanceEvidence(
        execution.conformance,
      ),
      execution.conformanceBytes,
    );
  } catch {
    return false;
  }
}

export async function executeAndCertifyStudioFirstPartyRasterCodec(
  input: ExecuteAndCertifyStudioFirstPartyRasterCodecInput,
  signer: StudioProductCodecCertificationSigner,
): Promise<StudioFirstPartyRasterCertifiedExecution> {
  const providers =
    input.providers ?? STUDIO_FIRST_PARTY_RASTER_CODEC_PROVIDERS;
  const provider = providerFor(input.format, providers);
  const execution = await executeStudioCodecProvider(
    requestFor(provider, input.direction),
    input.inputBytes,
    [provider],
  );
  if (!execution.ok) {
    throw new StudioFirstPartyRasterCodecCertificationError(
      "CODEC_EXECUTION_FAILED",
      `First-party raster codec execution failed (${execution.code}).`,
    );
  }
  const conformance =
    await createStudioFirstPartyRasterConformanceEvidence(
      input.format,
      [provider],
    );
  const scope = studioFirstPartyRasterCodecCertificationScope(
    input.format,
    input.direction,
  );
  const certificateBytes = await issueStudioProductCodecCertificate(
    {
      receipt: execution.receipt,
      outputBytes: execution.bytes,
      evidenceBytes: conformance.bytes,
      evidenceMediaType:
        STUDIO_FIRST_PARTY_RASTER_CONFORMANCE_EVIDENCE_MEDIA_TYPE,
      scope,
      issuedAt: input.issuedAt,
      ...(input.notBefore ? { notBefore: input.notBefore } : {}),
      expiresAt: input.expiresAt,
    },
    signer,
  );
  return Object.freeze({
    kind: "toonspectrum-first-party-raster-certified-execution",
    format: input.format,
    direction: input.direction,
    scope,
    bytes: execution.bytes,
    receipt: execution.receipt,
    conformance: conformance.evidence,
    conformanceBytes: conformance.bytes,
    certificateBytes,
  });
}

export async function verifyStudioFirstPartyRasterCertifiedExecution(
  execution: StudioFirstPartyRasterCertifiedExecution,
  options: VerifyStudioFirstPartyRasterCertifiedExecutionOptions,
): Promise<StudioFirstPartyRasterCertifiedExecutionVerification> {
  const expectedScope = studioFirstPartyRasterCodecCertificationScope(
    execution.format,
    execution.direction,
  );
  const verified = await verifyStudioProductCodecCertificate(
    execution.certificateBytes,
    {
      outputBytes: execution.bytes,
      evidenceBytes: execution.conformanceBytes,
      trustRoots: options.trustRoots,
      expectedScope,
      ...(options.nowEpochMs === undefined
        ? {}
        : { nowEpochMs: options.nowEpochMs }),
      ...(options.revokedCertificateIds
        ? { revokedCertificateIds: options.revokedCertificateIds }
        : {}),
      ...(options.revokedKeyIds
        ? { revokedKeyIds: options.revokedKeyIds }
        : {}),
    },
  );
  if (!verified.ok) return verified;
  const receipt = verified.certificate.receipt;
  const expectedProvider = providerFor(
    execution.format,
    STUDIO_FIRST_PARTY_RASTER_CODEC_PROVIDERS,
  );
  if (
    execution.kind !==
      "toonspectrum-first-party-raster-certified-execution"
    || execution.scope !== expectedScope
    || verified.certificate.evidence.mediaType
      !== STUDIO_FIRST_PARTY_RASTER_CONFORMANCE_EVIDENCE_MEDIA_TYPE
    || !conformanceObjectMatches(execution)
    || !sameReceipt(execution.receipt, receipt)
    || receipt.format !== execution.format
    || receipt.providerId !== expectedProvider.manifest.providerId
    || receipt.direction !== execution.direction
    || receipt.profile !== STUDIO_FIRST_PARTY_RASTER_CODEC_PROFILE
    || receipt.version !== STUDIO_FIRST_PARTY_RASTER_CODEC_VERSION
    || receipt.mode !== "public-clean-room"
    || execution.conformance.format !== execution.format
    || execution.conformance.profile
      !== STUDIO_FIRST_PARTY_RASTER_CODEC_PROFILE
    || execution.conformance.providerId !== receipt.providerId
    || execution.conformance.decision !== "passed"
  ) {
    return Object.freeze({
      ok: false,
      code: "CERTIFIED_EXECUTION_IDENTITY_MISMATCH",
      message:
        "Certified execution identity does not match the product certificate.",
    });
  }
  if (options.claimCertificateId) {
    let claimed: boolean;
    try {
      claimed = await options.claimCertificateId(
        verified.certificate.certificateId,
      );
    } catch {
      claimed = false;
    }
    if (!claimed) {
      return Object.freeze({
        ok: false,
        code: "REPLAYED_CERTIFICATE",
        message: "Codec product certificate id was already consumed.",
      });
    }
  }
  return verified;
}
