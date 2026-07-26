import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  CreatorMarketplacePublicManifestSchema,
  CreatorMarketplaceResourceListPageSchema,
  CreatorMarketplaceResourceManifestSchema,
  CreatorMarketplaceResourceRecordSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "../../../../../lib/creator-marketplace-resource-contract";
import { rateLimit } from "../../../../../lib/rate-limit";

import {
  CREATOR_MARKETPLACE_RESOURCE_REPOSITORY,
  CreatorMarketplaceResourceDuplicateError,
} from "./creator-marketplace.repository-contract";

import type {
  CreatorMarketplaceResourceListQueryDto,
  PublishCreatorMarketplaceResourceDto,
} from "./creator-marketplace.dto";
import type {
  CreatorMarketplaceResourceCursor,
  CreatorMarketplaceResourceRepository,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";
import type {
  CreatorMarketplaceResourceListPage,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceRecord,
} from "../../../../../lib/creator-marketplace-resource-contract";

interface CreatorMarketplaceCursorEnvelope {
  version: 1;
  createdAt: string;
  id: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCursor(value: string | undefined): CreatorMarketplaceResourceCursor | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.byteLength < 1 || decoded.byteLength > 512) throw new Error("cursor_size");
    const envelope = JSON.parse(decoded.toString("utf8")) as Partial<CreatorMarketplaceCursorEnvelope>;
    if (
      envelope.version !== 1 ||
      typeof envelope.createdAt !== "string" ||
      typeof envelope.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        envelope.id
      )
    ) {
      throw new Error("cursor_shape");
    }
    const createdAt = new Date(envelope.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== envelope.createdAt) {
      throw new Error("cursor_date");
    }
    return { createdAt, id: envelope.id };
  } catch {
    throw new BadRequestException({
      code: "creator_marketplace_cursor_invalid",
      message: "마켓 목록 커서가 올바르지 않습니다.",
    });
  }
}

function encodeCursor(row: CreatorMarketplaceResourceStoredRow): string {
  const envelope: CreatorMarketplaceCursorEnvelope = {
    version: 1,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

function findEntryHashMismatch(
  manifest: CreatorMarketplaceResourceManifest
): number | null {
  for (const [index, entry] of manifest.entries.entries()) {
    const canonicalContent = canonicalizeCreatorMarketplaceJson(
      entry.delivery.mode === "builtin-ref"
        ? {
            mode: entry.delivery.mode,
            runtimeRef: entry.delivery.runtimeRef,
          }
        : entry.delivery.payload
    );
    if (sha256(canonicalContent) !== entry.delivery.sha256) return index;
  }
  return null;
}

function projectRecord(
  row: CreatorMarketplaceResourceStoredRow,
  viewerId?: string
): CreatorMarketplaceResourceRecord {
  const storedManifest = CreatorMarketplaceResourceManifestSchema.parse(row.manifest);
  const canonicalManifest = canonicalizeCreatorMarketplaceJson(storedManifest);
  if (
    findEntryHashMismatch(storedManifest) !== null ||
    sha256(canonicalManifest) !== row.manifestHash ||
    creatorMarketplaceJsonByteSize(storedManifest) !== row.manifestByteSize
  ) {
    throw new Error("creator_marketplace_stored_manifest_integrity_mismatch");
  }

  const publicManifestInput: Record<string, unknown> = { ...storedManifest };
  Reflect.deleteProperty(publicManifestInput, "rightsConfirmed");
  const manifest = CreatorMarketplacePublicManifestSchema.parse(publicManifestInput);
  return CreatorMarketplaceResourceRecordSchema.parse({
    ...manifest,
    id: row.id,
    manifestHash: row.manifestHash,
    manifestByteSize: row.manifestByteSize,
    publisher: {
      id: row.publisherId,
      name: row.publisherName?.trim() || "창작자",
      avatar: row.publisherAvatar,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isOwner: Boolean(viewerId && viewerId === row.publisherId),
    access: "free",
  });
}

@Injectable()
export class CreatorMarketplaceService {
  constructor(
    @Inject(CREATOR_MARKETPLACE_RESOURCE_REPOSITORY)
    private readonly repository: CreatorMarketplaceResourceRepository
  ) {}

  async list(
    query: CreatorMarketplaceResourceListQueryDto,
    options: { publisherId?: string; viewerId?: string } = {}
  ): Promise<CreatorMarketplaceResourceListPage> {
    const cursor = parseCursor(query.cursor);
    try {
      const rows = await this.repository.list({
        publisherId: options.publisherId,
        viewerId: options.viewerId,
        limit: query.limit,
        cursor,
        search: query.search,
        tag: query.tag,
        kind: query.kind,
        license: query.license,
      });
      const hasMore = rows.length > query.limit;
      const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
      return CreatorMarketplaceResourceListPageSchema.parse({
        items: pageRows.map((row) => projectRecord(row, options.viewerId)),
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!)
          : null,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: "creator_marketplace_unavailable",
        message: "공유 리소스 마켓을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async publish(
    publisherId: string,
    body: PublishCreatorMarketplaceResourceDto
  ): Promise<CreatorMarketplaceResourceRecord> {
    if (!rateLimit(`creator-marketplace-publish:${publisherId}`, 20, 60 * 60_000)) {
      throw new HttpException(
        {
          code: "creator_marketplace_publish_rate_limited",
          message: "공유 패키지를 너무 자주 게시하고 있습니다. 잠시 후 다시 시도해 주세요.",
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const parsedManifest = CreatorMarketplaceResourceManifestSchema.safeParse(body);
    if (!parsedManifest.success) {
      throw new BadRequestException({
        code: "creator_marketplace_manifest_invalid",
        message: "공유 리소스 manifest가 올바르지 않습니다.",
      });
    }
    const manifest = parsedManifest.data;
    const entryHashMismatch = findEntryHashMismatch(manifest);
    if (entryHashMismatch !== null) {
      throw new BadRequestException({
        code: "creator_marketplace_entry_hash_mismatch",
        message: `${entryHashMismatch + 1}번째 리소스의 콘텐츠 해시가 일치하지 않습니다.`,
      });
    }
    const canonicalManifest = canonicalizeCreatorMarketplaceJson(manifest);
    const manifestByteSize = creatorMarketplaceJsonByteSize(manifest);
    const manifestHash = sha256(canonicalManifest);

    try {
      const row = await this.repository.publish({
        id: randomUUID(),
        publisherId,
        manifest,
        manifestHash,
        manifestByteSize,
      });
      return projectRecord(row, publisherId);
    } catch (error) {
      if (error instanceof CreatorMarketplaceResourceDuplicateError) {
        throw new ConflictException({
          code: "creator_marketplace_resource_duplicate",
          message: "같은 패키지 버전 또는 동일한 manifest를 이미 공유했습니다.",
        });
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: "creator_marketplace_publish_unavailable",
        message: "공유 패키지를 게시할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async deleteOwned(publisherId: string, id: string): Promise<{ deleted: true }> {
    try {
      if (!(await this.repository.deleteOwned(publisherId, id))) {
        throw new NotFoundException("삭제할 공유 리소스를 찾을 수 없습니다.");
      }
      return { deleted: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: "creator_marketplace_delete_unavailable",
        message: "공유 리소스를 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }
}
