import { createHash } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../infrastructure/private-object-storage/private-object-storage.port";
import {
  PrivateObjectReferenceSchema,
  type PrivateObjectReference,
} from "../../infrastructure/private-object-storage/private-object-storage.contract";
import type {
  CreatorWorkMediaPayload,
  CreatorWorkMediaTarget,
} from "../../server/creator-work-media";
import {
  CREATOR_PUBLICATION_MEDIA_SIGNED_READ_SECONDS,
  applyCreatorPublicationMediaPaths,
  planCreatorPublicationMediaMutation,
  type CreatorPublicationMediaMutableInput,
  type CreatorPublicationMediaMutationPlan,
} from "./creator-publication-media.contract";
import { resolveCreatorPublicationMediaStorageConfig } from "./creator-publication-media.config";
import {
  CreatorPublicationMediaRepository,
  type CreatorPublicationMediaStorageSummary,
} from "./creator-publication-media.repository";

export class CreatorPublicationMediaStorageUnavailableError extends Error {
  constructor(readonly reason: "not-configured" | "read-failed" | "write-failed") {
    super(`creator_publication_media_storage_${reason}`);
    this.name = "CreatorPublicationMediaStorageUnavailableError";
  }
}

export class CreatorPublicationMediaIntegrityError extends Error {
  constructor(readonly reason: string) {
    super(`creator_publication_media_integrity_${reason}`);
    this.name = "CreatorPublicationMediaIntegrityError";
  }
}

export interface CreatorPublicationMediaResolvedPlan {
  readonly plan: CreatorPublicationMediaMutationPlan;
  readonly shouldExternalize: boolean;
}

export interface CreatorPublicationMediaDiagnosticReceipt
  extends CreatorPublicationMediaStorageSummary {
  readonly mode: "legacy" | "optional" | "required";
  readonly storageConfigured: boolean;
}

export type CreatorPublicationMediaFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function expectedObject(
  payload: CreatorWorkMediaPayload,
): Pick<PrivateObjectReference, "purpose" | "digest" | "objectPath" | "byteLength" | "contentType"> {
  return {
    purpose: "export",
    digest: `sha256:${payload.sha256}`,
    objectPath: `sha256/${payload.sha256.slice(0, 2)}/${payload.sha256}`,
    byteLength: payload.byteLength,
    contentType: payload.mediaType,
  };
}

function assertUploadedObject(
  objectValue: PrivateObjectReference,
  payload: CreatorWorkMediaPayload,
): PrivateObjectReference {
  const object = PrivateObjectReferenceSchema.parse(objectValue);
  const expected = expectedObject(payload);
  if (
    object.purpose !== expected.purpose
    || object.digest !== expected.digest
    || object.objectPath !== expected.objectPath
    || object.byteLength !== expected.byteLength
    || object.contentType !== expected.contentType
  ) {
    throw new CreatorPublicationMediaIntegrityError("uploaded-object-mismatch");
  }
  return object;
}

export async function fetchCreatorPublicationMediaObject(
  urlValue: string,
  expected: {
    readonly digest: string;
    readonly mediaType: string;
    readonly byteLength: number;
  },
  fetcher: CreatorPublicationMediaFetch = globalThis.fetch,
): Promise<CreatorWorkMediaPayload> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") {
    throw new CreatorPublicationMediaIntegrityError("signed-url-protocol");
  }
  const response = await fetcher(url, {
    method: "GET",
    redirect: "error",
    headers: { accept: expected.mediaType },
  });
  if (!response.ok || response.status !== 200) {
    throw new CreatorPublicationMediaStorageUnavailableError("read-failed");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed !== expected.byteLength) {
      throw new CreatorPublicationMediaIntegrityError("content-length");
    }
  }
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== expected.mediaType) {
    throw new CreatorPublicationMediaIntegrityError("content-type");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expected.byteLength) {
    throw new CreatorPublicationMediaIntegrityError("byte-length");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expected.digest) {
    throw new CreatorPublicationMediaIntegrityError("digest");
  }
  return {
    bytes,
    byteLength: bytes.byteLength,
    mediaType: expected.mediaType as CreatorWorkMediaPayload["mediaType"],
    sha256,
  };
}

@Injectable()
export class CreatorPublicationMediaService {
  constructor(
    private readonly repository: CreatorPublicationMediaRepository,
    @Optional()
    @Inject(PRIVATE_OBJECT_STORAGE_PORT)
    private readonly objectStorage?: PrivateObjectStoragePort,
  ) {}

  resolveMutationPlan(
    input: CreatorPublicationMediaMutableInput,
  ): CreatorPublicationMediaResolvedPlan {
    const plan = planCreatorPublicationMediaMutation(input);
    if (plan.entries.length === 0) {
      return { plan, shouldExternalize: false };
    }
    const config = resolveCreatorPublicationMediaStorageConfig();
    if (!config.externalizationEnabled) {
      return { plan, shouldExternalize: false };
    }
    if (!this.objectStorage) {
      if (config.storageRequired) {
        throw new CreatorPublicationMediaStorageUnavailableError("not-configured");
      }
      return { plan, shouldExternalize: false };
    }
    return { plan, shouldExternalize: true };
  }

  async externalize(
    actorUserId: string,
    workId: string,
    input: CreatorPublicationMediaMutableInput,
    plan: CreatorPublicationMediaMutationPlan,
  ): Promise<{ cover?: string; pages?: string[] }> {
    if (plan.entries.length === 0) return applyCreatorPublicationMediaPaths(workId, input, plan);
    const storage = this.objectStorage;
    if (!storage) throw new CreatorPublicationMediaStorageUnavailableError("not-configured");
    const uploaded = new Map<string, PrivateObjectReference>();
    const persistence = [];
    try {
      for (const entry of plan.entries) {
        const key = `${entry.payload.mediaType}:${entry.payload.sha256}`;
        let object = uploaded.get(key);
        if (!object) {
          object = assertUploadedObject(
            await storage.uploadImmutable({
              purpose: "export",
              contentType: entry.payload.mediaType,
              bytes: Uint8Array.from(entry.payload.bytes),
              controlMetadata: {
                documentId: workId,
                operationId: `publication:${entry.payload.sha256}`,
                labels: {
                  product: "creator-work",
                  mediaSlot: entry.slot,
                },
              },
            }),
            entry.payload,
          );
          uploaded.set(key, object);
        }
        persistence.push({
          target: entry.target,
          object,
          mediaType: entry.payload.mediaType,
          byteLength: entry.payload.byteLength,
        });
      }
      await this.repository.persist(actorUserId, workId, persistence);
    } catch (error) {
      if (
        error instanceof CreatorPublicationMediaIntegrityError
        || error instanceof CreatorPublicationMediaStorageUnavailableError
      ) {
        throw error;
      }
      throw new CreatorPublicationMediaStorageUnavailableError("write-failed");
    }
    return applyCreatorPublicationMediaPaths(workId, input, plan);
  }

  async read(
    workId: string,
    target: CreatorWorkMediaTarget,
    digest: string,
  ): Promise<CreatorWorkMediaPayload | null> {
    const stored = await this.repository.find(workId, target, digest);
    if (!stored) return null;
    if (!this.objectStorage) {
      throw new CreatorPublicationMediaStorageUnavailableError("not-configured");
    }
    try {
      const signed = await this.objectStorage.createSignedReadUrl({
        object: stored.object,
        expiresInSeconds: CREATOR_PUBLICATION_MEDIA_SIGNED_READ_SECONDS,
      });
      return await fetchCreatorPublicationMediaObject(signed.url, {
        digest,
        mediaType: stored.mediaType,
        byteLength: stored.byteLength,
      });
    } catch (error) {
      if (
        error instanceof CreatorPublicationMediaIntegrityError
        || error instanceof CreatorPublicationMediaStorageUnavailableError
      ) {
        throw error;
      }
      throw new CreatorPublicationMediaStorageUnavailableError("read-failed");
    }
  }

  async diagnostics(
    actorUserId: string,
    workId: string,
  ): Promise<CreatorPublicationMediaDiagnosticReceipt> {
    const config = resolveCreatorPublicationMediaStorageConfig();
    const summary = await this.repository.summary(actorUserId, workId);
    return {
      mode: config.mode,
      storageConfigured: Boolean(this.objectStorage),
      ...summary,
    };
  }
}
