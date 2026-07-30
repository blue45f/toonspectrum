import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_CODEC_CERTIFICATION_AUTHORITY_SIGNATURE_KIND,
} from "./studio-codec-certification-authority.service";
import {
  STUDIO_CODEC_CERTIFICATION_EXECUTION_EVIDENCE_KIND,
  STUDIO_CODEC_CERTIFICATION_EXECUTION_EVIDENCE_VERSION,
  StudioCodecCertificationExecutionEvidenceError,
  StudioCodecCertificationExecutionEvidenceRecordSchema,
  StudioCodecCertificationExecutionEvidenceVerifier,
  StudioCodecCertificationPrincipalBindingSchema,
} from "./studio-codec-certification-execution-evidence";

const NOW = Date.parse("2026-07-30T10:00:00.000Z");
const PRINCIPAL = {
  tenantId: "tenant-1",
  subjectId: "artist-1",
  authenticationSessionId: "session-1",
  authorizationVersion: 7,
};
const blobs = {
  canonical: Uint8Array.from([1, 2, 3]),
  receipt: Uint8Array.from([4, 5]),
  input: Uint8Array.from([6]),
  output: Uint8Array.from([7, 8, 9]),
  evidence: Uint8Array.from([10, 11]),
};

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function durableSignature() {
  return {
    schemaVersion: 1 as const,
    kind: STUDIO_CODEC_CERTIFICATION_AUTHORITY_SIGNATURE_KIND,
    algorithm: "ed25519" as const,
    keyId: "kms/toonspectrum/product-codec/2026-01",
    scope: "codec.qoi.encode",
    executionId: "execution-1",
    canonicalByteLength: blobs.canonical.byteLength,
    canonicalSha256: sha256(blobs.canonical),
    signatureValue: Buffer.alloc(64, 7).toString("base64url"),
  };
}

function objectReference(name: keyof typeof blobs) {
  const bytes = blobs[name];
  return {
    objectId: `codec/executions/execution-1/${name}`,
    versionId: `${name}-v1`,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function evidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: STUDIO_CODEC_CERTIFICATION_EXECUTION_EVIDENCE_VERSION,
    kind: STUDIO_CODEC_CERTIFICATION_EXECUTION_EVIDENCE_KIND,
    executionId: "execution-1",
    principalBinding: PRINCIPAL,
    scope: "codec.qoi.encode",
    createdAt: "2026-07-30T09:59:00.000Z",
    expiresAt: "2026-07-30T10:10:00.000Z",
    objects: {
      canonical: objectReference("canonical"),
      receipt: objectReference("receipt"),
      input: objectReference("input"),
      output: objectReference("output"),
      evidence: objectReference("evidence"),
    },
    provenance: {
      providerId: "toonspectrum.raster.qoi.v1",
      mode: "public-clean-room",
      direction: "encode",
      format: "qoi",
      profile: "rgba8",
      version: "1.0",
      mimeType: "image/qoi",
      extension: ".qoi",
      deterministic: true,
      evidenceMediaType: "application/json",
      licenseGrantId: "toonspectrum-public-clean-room-raster-v1",
      licenseGrantScopes: [
        "public-clean-room",
        "commercial-use",
        "encode",
      ],
      licenseGrantExpiresAt: null,
    },
    ...overrides,
  };
}

function verificationRequest(signal = new AbortController().signal) {
  return {
    executionId: "execution-1",
    scope: "codec.qoi.encode",
    providerId: "toonspectrum.raster.qoi.v1",
    mode: "public-clean-room" as const,
    direction: "encode" as const,
    format: "qoi",
    profile: "rgba8",
    version: "1.0",
    mimeType: "image/qoi",
    extension: ".qoi",
    signal,
  };
}

function harness(options: {
  record?: ReturnType<typeof evidenceRecord>;
  reservationStatus?:
    | "completed"
    | "expired"
    | "forbidden"
    | "missing"
    | "replayed";
  corruptObject?: keyof typeof blobs;
  admission?: unknown;
  completedSignature?: unknown;
} = {}) {
  const reserveOneUse = vi.fn(async (
    { attemptId }: { attemptId: string }
  ) => {
    if (options.reservationStatus === "completed") {
      return {
        status: "completed",
        executionId: "execution-1",
        consumptionId: "consumption-1",
        consumedAt: "2026-07-30T10:00:00.000Z",
        replayTombstoneExpiresAt: "2026-07-31T10:00:00.000Z",
        record: options.record ?? evidenceRecord(),
        signature: options.completedSignature ?? durableSignature(),
      };
    }
    return options.reservationStatus
      ? { status: options.reservationStatus }
      : {
          status: "reserved",
          reservationId: "reservation-1",
          attemptId,
          reservedAt: "2026-07-30T10:00:00.000Z",
          reservationExpiresAt: "2026-07-30T10:06:00.000Z",
          record: options.record ?? evidenceRecord(),
        };
  });
  const completeOneUse = vi.fn(async (
    request: {
      attemptId: string;
      outcome: string;
      signature?: ReturnType<typeof durableSignature>;
    }
  ) =>
    request.outcome === "release"
      ? {
          status: "released",
          executionId: "execution-1",
          reservationId: "reservation-1",
          attemptId: request.attemptId,
        }
      : request.outcome === "reject"
        ? {
            status: "rejected",
            executionId: "execution-1",
            reservationId: "reservation-1",
            attemptId: request.attemptId,
            consumptionId: "consumption-1",
            consumedAt: "2026-07-30T10:00:00.000Z",
            replayTombstoneExpiresAt: "2026-07-31T10:00:00.000Z",
          }
        : {
          status: "consumed",
          executionId: "execution-1",
          reservationId: "reservation-1",
          attemptId: request.attemptId,
          consumptionId: "consumption-1",
          consumedAt: "2026-07-30T10:00:00.000Z",
          replayTombstoneExpiresAt: "2026-07-31T10:00:00.000Z",
          signature: request.signature,
        }
  );
  const read = vi.fn(async ({ objectId }: { objectId: string }) => {
    const name = objectId.split("/").at(-1) as keyof typeof blobs;
    const source = options.corruptObject === name
      ? Uint8Array.from([255])
      : blobs[name];
    return (async function* stream() {
      yield source.subarray(0, 1);
      if (source.byteLength > 1) yield source.subarray(1);
    })();
  });
  const acquire = vi.fn(async () =>
    options.admission ?? {
      granted: true,
      leaseId: "lease-1",
      expiresAt: "2026-07-30T10:06:00.000Z",
    }
  );
  const release = vi.fn(async () => undefined);
  const verifier = new StudioCodecCertificationExecutionEvidenceVerifier(
    { reserveOneUse, completeOneUse },
    { read },
    { acquire, release },
    PRINCIPAL,
    { now: () => NOW }
  );
  return {
    verifier,
    reserveOneUse,
    completeOneUse,
    read,
    acquire,
    release,
  };
}

function code(error: unknown): string | undefined {
  return error instanceof StudioCodecCertificationExecutionEvidenceError
    ? error.code
    : undefined;
}

describe("studio codec certification execution evidence schemas", () => {
  it("are strict, principal-bound, TTL-bounded and provenance-aware", () => {
    expect(
      StudioCodecCertificationPrincipalBindingSchema.safeParse(PRINCIPAL)
        .success
    ).toBe(true);
    expect(
      StudioCodecCertificationPrincipalBindingSchema.safeParse({
        ...PRINCIPAL,
        bearerToken: "must-never-be-stored",
      }).success
    ).toBe(false);
    expect(
      StudioCodecCertificationExecutionEvidenceRecordSchema.safeParse(
        evidenceRecord()
      ).success
    ).toBe(true);
    expect(
      StudioCodecCertificationExecutionEvidenceRecordSchema.safeParse(
        evidenceRecord({
          expiresAt: "2026-07-30T11:00:00.000Z",
        })
      ).success
    ).toBe(false);
  });
});

describe("StudioCodecCertificationExecutionEvidenceVerifier", () => {
  it("reserves first, independently streams every blob, and consumes only after explicit completion", async () => {
    const {
      verifier,
      reserveOneUse,
      completeOneUse,
      read,
      acquire,
      release,
    } = harness();
    const result = await verifier.verify(verificationRequest());

    expect(result).toMatchObject({
      verified: true,
      executionId: "execution-1",
      canonicalSha256: sha256(blobs.canonical),
      receiptSha256: sha256(blobs.receipt),
      inputSha256: sha256(blobs.input),
      outputSha256: sha256(blobs.output),
      evidenceSha256: sha256(blobs.evidence),
      providerId: "toonspectrum.raster.qoi.v1",
      authorization: {
        status: "reserved",
        reservationId: "reservation-1",
        attemptId: expect.any(String),
        admissionLeaseId: "lease-1",
        expiresAt: "2026-07-30T10:06:00.000Z",
      },
    });
    expect(reserveOneUse).toHaveBeenCalledWith(expect.objectContaining({
      principalBinding: PRINCIPAL,
      minimumReplayTombstoneExpiresAt: "2026-07-31T10:00:00.000Z",
    }));
    expect(completeOneUse).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    if (
      !result.verified
      || result.authorization.status !== "reserved"
    ) {
      throw new Error("expected a live reservation");
    }
    await expect(verifier.complete({
      executionId: "execution-1",
      reservationId: "reservation-1",
      attemptId: result.authorization.attemptId,
      admissionLeaseId: result.authorization.admissionLeaseId,
      outcome: "consume",
      signature: durableSignature(),
      signal: new AbortController().signal,
    })).resolves.toBe(true);
    expect(completeOneUse).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "consume",
      reservationId: "reservation-1",
    }));
    expect(read).toHaveBeenCalledTimes(5);
    expect(acquire).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      subjectId: "artist-1",
      executionId: "execution-1",
      leaseTtlMs: 360_000,
    }));
    expect(release).toHaveBeenCalledWith(expect.objectContaining({
      leaseId: "lease-1",
      outcome: "reserved",
    }));
  });

  it("recovers a strict durable completed signature without reopening a signing reservation", async () => {
    const {
      verifier,
      completeOneUse,
      read,
      release,
    } = harness({ reservationStatus: "completed" });

    const result = await verifier.verify(verificationRequest());

    expect(result).toMatchObject({
      verified: true,
      executionId: "execution-1",
      canonicalSha256: sha256(blobs.canonical),
      authorization: {
        status: "completed",
        signature: durableSignature(),
      },
    });
    expect(read).toHaveBeenCalledTimes(5);
    expect(completeOneUse).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(expect.objectContaining({
      leaseId: "lease-1",
      outcome: "reserved",
    }));

    const malformed = harness({
      reservationStatus: "completed",
      completedSignature: {
        ...durableSignature(),
        signatureValue: "not-base64url",
      },
    });
    await expect(
      malformed.verifier.verify(verificationRequest())
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === "EVIDENCE_REPOSITORY_FAILED"
    );
    expect(malformed.read).not.toHaveBeenCalled();
  });

  it("maps replay, forbidden, expired and missing records to one non-enumerating failure", async () => {
    for (const status of [
      "replayed",
      "forbidden",
      "expired",
      "missing",
    ] as const) {
      const { verifier, read } = harness({ reservationStatus: status });
      await expect(verifier.verify(verificationRequest())).rejects.toSatisfy(
        (error: unknown) => code(error) === "EXECUTION_UNAVAILABLE"
      );
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("burns the one-use record and fails closed on principal/provenance or blob mismatch", async () => {
    const wrongPrincipal = harness({
      record: evidenceRecord({
        principalBinding: {
          ...PRINCIPAL,
          subjectId: "other-artist",
        },
      }),
    });
    await expect(
      wrongPrincipal.verifier.verify(verificationRequest())
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === "EVIDENCE_INTEGRITY_FAILED"
    );
    expect(wrongPrincipal.reserveOneUse).toHaveBeenCalledTimes(1);
    expect(wrongPrincipal.completeOneUse).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "reject" })
    );
    expect(wrongPrincipal.read).not.toHaveBeenCalled();

    const corrupt = harness({ corruptObject: "output" });
    await expect(
      corrupt.verifier.verify(verificationRequest())
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === "EVIDENCE_INTEGRITY_FAILED"
    );
    expect(corrupt.reserveOneUse).toHaveBeenCalledTimes(1);
    expect(corrupt.completeOneUse).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "reject" })
    );
    expect(corrupt.release).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "rejected",
    }));
  });

  it("requires a distributed admission grant before revealing or consuming evidence", async () => {
    const { verifier, reserveOneUse } = harness({
      admission: {
        granted: false,
        retryAfterMs: 1_000,
      },
    });
    await expect(verifier.verify(verificationRequest())).rejects.toSatisfy(
      (error: unknown) => code(error) === "ADMISSION_DENIED"
    );
    expect(reserveOneUse).not.toHaveBeenCalled();
  });

  it("releases admission leases that cannot cover the authority pipeline or exceed the grant budget", async () => {
    for (const expiresAt of [
      "2026-07-30T10:00:30.000Z",
      "2026-07-30T11:00:00.000Z",
    ]) {
      const { verifier, reserveOneUse, release } = harness({
        admission: {
          granted: true,
          leaseId: "lease-invalid-expiry",
          expiresAt,
        },
      });

      await expect(verifier.verify(verificationRequest())).rejects.toSatisfy(
        (error: unknown) => code(error) === "ADMISSION_FAILED"
      );
      expect(reserveOneUse).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledWith(expect.objectContaining({
        leaseId: "lease-invalid-expiry",
        outcome: "rejected",
      }));
    }
  });
});
