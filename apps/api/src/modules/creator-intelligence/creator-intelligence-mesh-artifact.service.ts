import { createHash } from "node:crypto";

import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../platform/adapters/private-object-storage/private-object-storage.port";
import {
  STUDIO_REMOTE_REFERENCE_DNS_RESOLVER,
  STUDIO_REMOTE_REFERENCE_HTTP_REQUESTER,
  StudioRemoteReferenceNetworkPolicyError,
  resolveStudioRemoteReferenceEndpoint,
  type StudioRemoteReferenceDnsResolver,
  type StudioRemoteReferenceHttpRequester,
  type StudioRemoteReferenceHttpResponse,
} from "../creator/studio-remote-reference-image.network";
import {
  signCreatorIntelligenceMeshArtifactToken,
  type VerifiedCreatorIntelligenceMeshArtifact,
} from "./creator-intelligence-mesh-job-token";

const MAX_GLB_BYTES = 200 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const SIGNED_READ_SECONDS = 5 * 60;
const MAX_REDIRECTS = 3;
const ARTIFACT_FETCH_TIMEOUT_MS = 90_000;
const MESH_ARTIFACT_ACCEPT =
  "model/gltf-binary,image/png,image/jpeg,image/webp,application/octet-stream";

interface MeshProviderResult {
  readonly status: string;
  readonly provider?: string;
  readonly jobId?: string;
  readonly glbUrl?: string;
  readonly thumbnailUrl?: string;
  readonly [key: string]: unknown;
}

export interface CreatorIntelligenceMeshArtifactStatus {
  readonly configured: boolean;
  readonly requiredInProduction: true;
  readonly providerUrlsReturnedInProduction: false;
}

function artifactError(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: "creator_intelligence_mesh_artifact_storage_unavailable",
    message,
  });
}

function publicHttpsUrl(value: string, base?: URL): URL {
  let url: URL;
  try {
    url = base ? new URL(value, base) : new URL(value);
  } catch {
    throw artifactError("3D 공급자가 올바르지 않은 결과 주소를 반환했습니다.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw artifactError("3D 공급자가 안전하지 않은 결과 주소를 반환했습니다.");
  }
  return url;
}

function responseHeader(
  response: StudioRemoteReferenceHttpResponse,
  name: string,
): string | undefined {
  const value = response.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw artifactError("3D 공급자 응답 헤더가 올바르지 않습니다.");
    }
    return value[0];
  }
  return value;
}

async function readBoundedBytes(
  response: StudioRemoteReferenceHttpResponse,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLengthValue = responseHeader(response, "content-length");
  if (contentLengthValue) {
    if (!/^\d+$/u.test(contentLengthValue)) {
      throw artifactError("3D 공급자 결과 크기 정보가 올바르지 않습니다.");
    }
    const contentLength = Number(contentLengthValue);
    if (!Number.isSafeInteger(contentLength) || contentLength > maximumBytes) {
      throw artifactError("3D 결과 파일이 내부 저장 한도를 초과했습니다.");
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maximumBytes) {
      response.cancel();
      throw artifactError("3D 결과 파일이 내부 저장 한도를 초과했습니다.");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw artifactError("3D 공급자 결과 파일이 비어 있습니다.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function glbContentType(
  response: StudioRemoteReferenceHttpResponse,
  bytes: Uint8Array,
): string {
  if (
    bytes.byteLength < 12
    || bytes[0] !== 0x67
    || bytes[1] !== 0x6c
    || bytes[2] !== 0x54
    || bytes[3] !== 0x46
  ) {
    throw artifactError("3D 공급자 결과가 유효한 GLB 파일이 아닙니다.");
  }
  const declaredLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(8, true);
  if (declaredLength !== bytes.byteLength) {
    throw artifactError("3D 공급자 결과 길이가 GLB 헤더와 일치하지 않습니다.");
  }
  const type = responseHeader(response, "content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (type && type !== "model/gltf-binary" && type !== "application/octet-stream") {
    throw artifactError("3D 공급자가 GLB가 아닌 콘텐츠 형식을 반환했습니다.");
  }
  return "model/gltf-binary";
}

function thumbnailContentType(
  response: StudioRemoteReferenceHttpResponse,
  bytes: Uint8Array,
): string {
  const header = responseHeader(response, "content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  const png = bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47;
  const jpeg = bytes.byteLength >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  const webp = bytes.byteLength >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const detected = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : null;
  if (!detected) {
    throw artifactError("3D 썸네일이 지원되는 PNG/JPEG/WebP 형식이 아닙니다.");
  }
  if (header && header !== detected && header !== "application/octet-stream") {
    throw artifactError("3D 썸네일 콘텐츠 형식이 파일 내용과 일치하지 않습니다.");
  }
  return detected;
}

async function fetchArtifact(
  sourceValue: string,
  maximumBytes: number,
  dnsResolver: StudioRemoteReferenceDnsResolver,
  httpRequester: StudioRemoteReferenceHttpRequester,
  signal?: AbortSignal,
): Promise<{
  readonly response: StudioRemoteReferenceHttpResponse;
  readonly bytes: Uint8Array;
}> {
  let source = publicHttpsUrl(sourceValue);
  const visited = new Set<string>();

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (visited.has(source.href)) {
      throw artifactError("3D 결과 다운로드 리디렉션이 반복됩니다.");
    }
    visited.add(source.href);

    let endpoint;
    try {
      endpoint = await resolveStudioRemoteReferenceEndpoint(source, dnsResolver);
    } catch (error) {
      if (error instanceof StudioRemoteReferenceNetworkPolicyError) {
        throw artifactError("3D 공급자가 안전하지 않은 결과 주소를 반환했습니다.");
      }
      throw artifactError("3D 공급자 결과 주소의 네트워크 경로를 확인하지 못했습니다.");
    }

    const timeoutSignal = AbortSignal.timeout(ARTIFACT_FETCH_TIMEOUT_MS);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    const response = await httpRequester.request({
      url: source,
      endpoint,
      signal: requestSignal,
      accept: MESH_ARTIFACT_ACCEPT,
      userAgent: "ToonSpectrum-MeshArtifact/1.0",
    });

    if (response.statusCode >= 300 && response.statusCode < 400) {
      response.cancel();
      const location = responseHeader(response, "location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw artifactError("3D 결과 다운로드 리디렉션을 확인하지 못했습니다.");
      }
      source = publicHttpsUrl(location, source);
      continue;
    }
    if (response.statusCode !== 200) {
      response.cancel();
      throw artifactError(
        `3D 결과를 내부 저장소로 복사하지 못했습니다 (HTTP ${response.statusCode}).`,
      );
    }
    try {
      return {
        response,
        bytes: await readBoundedBytes(response, maximumBytes),
      };
    } catch (error) {
      response.cancel();
      throw error;
    }
  }
  throw artifactError("3D 결과 다운로드 리디렉션이 너무 많습니다.");
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function operationDigest(providerJobId: string, slot: "glb" | "thumbnail"): string {
  return createHash("sha256")
    .update(`${providerJobId}:${slot}`, "utf8")
    .digest("hex")
    .slice(0, 48);
}

@Injectable()
export class CreatorIntelligenceMeshArtifactService {
  constructor(
    @Optional()
    @Inject(PRIVATE_OBJECT_STORAGE_PORT)
    private readonly storage: PrivateObjectStoragePort | undefined,
    @Inject(STUDIO_REMOTE_REFERENCE_DNS_RESOLVER)
    private readonly dnsResolver: StudioRemoteReferenceDnsResolver,
    @Inject(STUDIO_REMOTE_REFERENCE_HTTP_REQUESTER)
    private readonly httpRequester: StudioRemoteReferenceHttpRequester,
  ) {}

  status(): CreatorIntelligenceMeshArtifactStatus {
    return Object.freeze({
      configured: Boolean(this.storage),
      requiredInProduction: true,
      providerUrlsReturnedInProduction: false,
    });
  }

  assertCreateReady(environment: NodeJS.ProcessEnv = process.env): void {
    if (environment.NODE_ENV === "production" && !this.storage) {
      throw artifactError(
        "3D 생성 결과를 영구 보관할 내부 객체 저장소가 준비되지 않아 Meshy 요청을 중지했어요.",
      );
    }
  }

  async internalize(
    userId: string,
    providerJobId: string,
    result: MeshProviderResult,
    signal?: AbortSignal,
  ): Promise<MeshProviderResult> {
    const storage = this.storage;
    if (!storage) {
      if (process.env.NODE_ENV === "production") this.assertCreateReady();
      return Object.freeze({
        ...result,
        artifactPersistence: "provider-temporary",
      });
    }

    const next: Record<string, unknown> = {
      ...result,
      artifactPersistence: "private-object-storage",
    };
    if (result.glbUrl) {
      const downloaded = await fetchArtifact(
        result.glbUrl,
        MAX_GLB_BYTES,
        this.dnsResolver,
        this.httpRequester,
        signal,
      );
      const contentType = glbContentType(downloaded.response, downloaded.bytes);
      const object = await storage.uploadImmutable({
        purpose: "derived",
        contentType,
        bytes: ownedBytes(downloaded.bytes),
        controlMetadata: {
          documentId: "creator-intelligence-mesh",
          operationId: `mesh-glb:${operationDigest(providerJobId, "glb")}`,
          labels: {
            product: "creator-intelligence",
            mediaSlot: "mesh-glb",
            ownerHash: createHash("sha256")
              .update(userId, "utf8")
              .digest("hex")
              .slice(0, 32),
          },
        },
      }, { signal });
      const token = signCreatorIntelligenceMeshArtifactToken(
        userId,
        object,
        `${providerJobId}.glb`,
      );
      next.glbUrl = `/api/creator-intelligence/mesh/artifacts/${encodeURIComponent(token)}`;
    }

    if (result.thumbnailUrl) {
      const downloaded = await fetchArtifact(
        result.thumbnailUrl,
        MAX_THUMBNAIL_BYTES,
        this.dnsResolver,
        this.httpRequester,
        signal,
      );
      const contentType = thumbnailContentType(downloaded.response, downloaded.bytes);
      const extension = contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
      const object = await storage.uploadImmutable({
        purpose: "derived",
        contentType,
        bytes: ownedBytes(downloaded.bytes),
        controlMetadata: {
          documentId: "creator-intelligence-mesh",
          operationId: `mesh-thumbnail:${operationDigest(providerJobId, "thumbnail")}`,
          labels: {
            product: "creator-intelligence",
            mediaSlot: "mesh-thumbnail",
            ownerHash: createHash("sha256")
              .update(userId, "utf8")
              .digest("hex")
              .slice(0, 32),
          },
        },
      }, { signal });
      const token = signCreatorIntelligenceMeshArtifactToken(
        userId,
        object,
        `${providerJobId}.${extension}`,
      );
      next.thumbnailUrl = `/api/creator-intelligence/mesh/artifacts/${encodeURIComponent(token)}`;
    }

    return Object.freeze(next) as MeshProviderResult;
  }

  async signedRead(
    artifact: VerifiedCreatorIntelligenceMeshArtifact,
    signal?: AbortSignal,
  ): Promise<{
    readonly url: string;
    readonly filename: string;
    readonly contentType: string;
  }> {
    const storage = this.storage;
    if (!storage) throw artifactError("3D 결과 내부 저장소에 연결할 수 없습니다.");
    const signed = await storage.createSignedReadUrl({
      object: artifact.object,
      expiresInSeconds: SIGNED_READ_SECONDS,
    }, { signal });
    return Object.freeze({
      url: signed.url,
      filename: artifact.filename,
      contentType: artifact.object.contentType,
    });
  }
}
