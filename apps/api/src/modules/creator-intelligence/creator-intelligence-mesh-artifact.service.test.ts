import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrivateObjectStoragePort } from "../../infrastructure/private-object-storage/private-object-storage.port";
import type { PrivateObjectReference } from "../../infrastructure/private-object-storage/private-object-storage.contract";
import type {
  StudioRemoteReferenceDnsResolver,
  StudioRemoteReferenceHttpRequester,
  StudioRemoteReferenceHttpResponse,
} from "../creator/studio-remote-reference-image.network";
import { CreatorIntelligenceMeshArtifactService } from "./creator-intelligence-mesh-artifact.service";
import { verifyCreatorIntelligenceMeshArtifactToken } from "./creator-intelligence-mesh-job-token";

function glbBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  new DataView(bytes.buffer).setUint32(4, 2, true);
  new DataView(bytes.buffer).setUint32(8, bytes.byteLength, true);
  return bytes;
}

function pngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function reference(
  contentType: string,
  bytes: Uint8Array,
): PrivateObjectReference {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return {
    contractVersion: "toonspectrum.private-object-storage.v2",
    providerId: "supabase",
    purpose: "derived",
    digest: `sha256:${digest}`,
    objectPath: `sha256/${digest.slice(0, 2)}/${digest}`,
    byteLength: bytes.byteLength,
    contentType,
  };
}

function storage(): PrivateObjectStoragePort {
  return {
    verifyPrivatePurposeBuckets: vi.fn(async () => ({
      ready: true,
      privatePurposeBuckets: 3,
    })),
    uploadImmutable: vi.fn(async (input) => reference(
      input.contentType,
      input.bytes,
    )),
    createSignedReadUrl: vi.fn(async () => ({
      url: "https://storage.example.com/private-artifact",
      expiresAtEpochMs: Date.now() + 300_000,
    })),
    deleteGeneratedObject: vi.fn(async () => undefined),
  };
}

function publicDns(
  addresses: readonly { readonly address: string; readonly family: 4 | 6 }[] = [
    { address: "93.184.216.34", family: 4 },
  ],
): StudioRemoteReferenceDnsResolver {
  return {
    resolve: vi.fn(async () => addresses),
  };
}

function httpResponse(
  bytes: Uint8Array,
  contentType: string,
  statusCode = 200,
  extraHeaders: Readonly<Record<string, string>> = {},
): StudioRemoteReferenceHttpResponse {
  return {
    statusCode,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
      ...extraHeaders,
    },
    body: (async function* body() {
      yield bytes;
    })(),
    cancel: vi.fn(),
  };
}

function requester(): StudioRemoteReferenceHttpRequester {
  return {
    request: vi.fn(async ({ url }) => (
      url.pathname.endsWith(".glb")
        ? httpResponse(glbBytes(), "model/gltf-binary")
        : httpResponse(pngBytes(), "image/png")
    )),
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv(
    "AUTH_SESSION_SECRET",
    "creator-intelligence-artifact-test-secret-with-32-bytes",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CreatorIntelligenceMeshArtifactService", () => {
  it("fails closed in production when durable private storage is absent", () => {
    const service = new CreatorIntelligenceMeshArtifactService(
      undefined,
      publicDns(),
      requester(),
    );
    expect(() => service.assertCreateReady({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv)).toThrow("내부 객체 저장소");
  });

  it("copies provider artifacts into private storage and returns owner-bound URLs", async () => {
    const objectStorage = storage();
    const http = requester();
    const service = new CreatorIntelligenceMeshArtifactService(
      objectStorage,
      publicDns(),
      http,
    );

    const result = await service.internalize(
      "user-a",
      "mesh_job_123",
      {
        status: "ready",
        provider: "meshy",
        jobId: "mesh_job_123",
        glbUrl: "https://provider.example.com/result.glb",
        thumbnailUrl: "https://provider.example.com/preview.png",
      },
    );

    expect(result).toMatchObject({
      status: "ready",
      artifactPersistence: "private-object-storage",
    });
    expect(result.glbUrl).toMatch(/^\/api\/creator-intelligence\/mesh\/artifacts\//u);
    expect(result.thumbnailUrl).toMatch(/^\/api\/creator-intelligence\/mesh\/artifacts\//u);
    expect(result.glbUrl).not.toContain("provider.example.com");
    expect(result.thumbnailUrl).not.toContain("provider.example.com");
    expect(objectStorage.uploadImmutable).toHaveBeenCalledTimes(2);
    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: { address: "93.184.216.34", family: 4 },
      accept: expect.stringContaining("model/gltf-binary"),
    }));

    const token = decodeURIComponent(String(result.glbUrl).split("/").at(-1) ?? "");
    expect(verifyCreatorIntelligenceMeshArtifactToken(token, "user-a")).toMatchObject({
      filename: "mesh_job_123.glb",
    });
    expect(verifyCreatorIntelligenceMeshArtifactToken(token, "user-b")).toBeNull();
  });

  it("creates only short-lived private read redirects", async () => {
    const objectStorage = storage();
    const service = new CreatorIntelligenceMeshArtifactService(
      objectStorage,
      publicDns(),
      requester(),
    );
    const object = reference("model/gltf-binary", glbBytes());

    await expect(service.signedRead({
      object,
      filename: "mesh_job_123.glb",
    })).resolves.toEqual({
      url: "https://storage.example.com/private-artifact",
      filename: "mesh_job_123.glb",
      contentType: "model/gltf-binary",
    });
    expect(objectStorage.createSignedReadUrl).toHaveBeenCalledWith({
      object,
      expiresInSeconds: 300,
    }, { signal: undefined });
  });

  it("rejects literal private-network provider URLs before opening a socket", async () => {
    const http = requester();
    const service = new CreatorIntelligenceMeshArtifactService(
      storage(),
      publicDns(),
      http,
    );

    await expect(service.internalize(
      "user-a",
      "mesh_job_123",
      {
        status: "ready",
        jobId: "mesh_job_123",
        glbUrl: "https://127.0.0.1/private.glb",
      },
    )).rejects.toThrow("안전하지 않은 결과 주소");
    expect(http.request).not.toHaveBeenCalled();
  });

  it("rejects a split DNS answer containing any private route", async () => {
    const http = requester();
    const service = new CreatorIntelligenceMeshArtifactService(
      storage(),
      publicDns([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ]),
      http,
    );

    await expect(service.internalize(
      "user-a",
      "mesh_job_123",
      {
        status: "ready",
        jobId: "mesh_job_123",
        glbUrl: "https://provider.example.com/private-route.glb",
      },
    )).rejects.toThrow("안전하지 않은 결과 주소");
    expect(http.request).not.toHaveBeenCalled();
  });

  it("revalidates and pins every redirect target", async () => {
    const dns = publicDns();
    const http: StudioRemoteReferenceHttpRequester = {
      request: vi.fn(async ({ url }) => (
        url.hostname === "provider.example.com"
          ? httpResponse(new Uint8Array([1]), "application/octet-stream", 302, {
              location: "https://cdn.example.com/result.glb",
            })
          : httpResponse(glbBytes(), "model/gltf-binary")
      )),
    };
    const service = new CreatorIntelligenceMeshArtifactService(storage(), dns, http);

    await expect(service.internalize(
      "user-a",
      "mesh_job_123",
      {
        status: "ready",
        jobId: "mesh_job_123",
        glbUrl: "https://provider.example.com/start.glb",
      },
    )).resolves.toMatchObject({
      artifactPersistence: "private-object-storage",
    });
    expect(dns.resolve).toHaveBeenCalledTimes(2);
    expect(http.request).toHaveBeenCalledTimes(2);
  });
});
