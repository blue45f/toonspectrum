import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  signCreatorIntelligenceMeshArtifactToken,
  signCreatorIntelligenceMeshJobToken,
  verifyCreatorIntelligenceMeshArtifactToken,
  verifyCreatorIntelligenceMeshJobToken,
} from "./creator-intelligence-mesh-job-token";

describe("Creator Intelligence mesh job token", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SESSION_SECRET", "creator-intelligence-test-secret-with-32-bytes");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("binds a provider task to one authenticated user", () => {
    const token = signCreatorIntelligenceMeshJobToken("user-a", "meshy_job_123", 1_000);
    expect(verifyCreatorIntelligenceMeshJobToken(token, "user-a", 2_000)).toBe(
      "meshy_job_123",
    );
    expect(verifyCreatorIntelligenceMeshJobToken(token, "user-b", 2_000)).toBeNull();
  });

  it("rejects tampering and expiry", () => {
    const token = signCreatorIntelligenceMeshJobToken("user-a", "meshy_job_123", 1_000);
    expect(verifyCreatorIntelligenceMeshJobToken(`${token}x`, "user-a", 2_000)).toBeNull();
    expect(verifyCreatorIntelligenceMeshJobToken(
      token,
      "user-a",
      8 * 24 * 60 * 60_000,
    )).toBeNull();
  });

  it("binds an internal artifact reference to the creating user", () => {
    const digest = "a".repeat(64);
    const token = signCreatorIntelligenceMeshArtifactToken(
      "user-a",
      {
        contractVersion: "toonspectrum.private-object-storage.v2",
        providerId: "supabase",
        purpose: "derived",
        digest: `sha256:${digest}`,
        objectPath: `sha256/aa/${digest}`,
        byteLength: 12,
        contentType: "model/gltf-binary",
      },
      "mesh_job_123.glb",
      1_000,
    );
    expect(verifyCreatorIntelligenceMeshArtifactToken(token, "user-a", 2_000)).toMatchObject({
      filename: "mesh_job_123.glb",
      object: { contentType: "model/gltf-binary" },
    });
    expect(verifyCreatorIntelligenceMeshArtifactToken(token, "user-b", 2_000)).toBeNull();
    expect(verifyCreatorIntelligenceMeshArtifactToken(
      token,
      "user-a",
      31 * 24 * 60 * 60_000,
    )).toBeNull();
  });

});
