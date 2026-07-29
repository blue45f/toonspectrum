import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const authorityPath = fileURLToPath(
  new URL(
    "./studio-codec-certification-authority.service.ts",
    import.meta.url
  )
);
const controllerPath = fileURLToPath(
  new URL("./creator.controller.ts", import.meta.url)
);
const modulePath = fileURLToPath(
  new URL("./creator.module.ts", import.meta.url)
);

describe("Studio codec certification authority release boundary", () => {
  it("keeps the signing authority unreachable until concrete production adapters and authz exist", () => {
    const controller = readFileSync(controllerPath, "utf8");
    const module = readFileSync(modulePath, "utf8");

    expect(controller).not.toContain(
      "StudioCodecCertificationAuthorityService"
    );
    expect(module).not.toContain(
      "StudioCodecCertificationAuthorityService"
    );
    expect(controller).not.toMatch(/codec.{0,24}certif.{0,24}sign/iu);
  });

  it("requires independent execution verification and KMS/HSM self-verification before returning a signature", () => {
    const source = readFileSync(authorityPath, "utf8");

    expect(source).toContain(
      "STUDIO_CODEC_CERTIFICATION_AUTHORITY_EXECUTION_VERIFIER"
    );
    expect(source).toContain(
      "STUDIO_CODEC_CERTIFICATION_AUTHORITY_SIGNER"
    );
    expect(source).toContain("executionVerifier.verify({");
    expect(source).toContain("signer.sign({");
    expect(source).toContain("signer.verify({");
    expect(source).toContain(
      "if (signatureVerified !== true) fail(\"INVALID_SIGNATURE\")"
    );
    expect(source).toContain("private readonly adapterOperationLeases");
    expect(source).toContain("MAX_CONCURRENT_ADAPTER_OPERATIONS");
    expect(source).not.toMatch(/privateKey|secretAccessKey|BEGIN PRIVATE KEY/u);
  });

  it("keeps all external vendor and trademark claims fail-closed", () => {
    const source = readFileSync(authorityPath, "utf8");

    expect(source).toContain("externalAttestationAccepted: z.literal(false)");
    expect(source).toContain("officialCodec: z.literal(false)");
    expect(source).toContain("certified: z.literal(false)");
    expect(source).toContain("trademarkAuthorized: z.literal(false)");
    expect(source).toContain("codecVendorCertification: z.literal(false)");
    expect(source).toContain("trademarkAuthorization: z.literal(false)");
  });
});
