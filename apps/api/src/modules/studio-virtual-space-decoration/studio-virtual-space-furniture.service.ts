import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import {
  STUDIO_VIRTUAL_CUSTOM_FURNITURE_EDGE,
  admitStudioVirtualCustomFurniture,
} from "@toonstudio/contracts/studio-virtual-custom-furniture-contract";

import { PrivateObjectReferenceSchema } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import { SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION } from "../../platform/adapters/supabase-object-storage/supabase-object-storage.contract";
import { SUPABASE_OBJECT_STORAGE_PORT } from "../../platform/adapters/supabase-object-storage/supabase-object-storage.port";
import {
  db,
  studioVirtualSpaceCustomFurniture,
  users,
} from "../../platform/database";
import { reencodeStudioVirtualFurniture } from "./studio-virtual-space-furniture-reencode";

/** 서명 URL 수명. 렌더는 곧바로 쓰지만 단말 캐시가 잠깐 남을 수 있어 여유를 둔다. */
const READ_URL_TTL_SECONDS = 900;

/** 목록 한 번에 주는 개수. */
const LIST_LIMIT = 60;

function opaqueControlId(namespace: string, value: string): string {
  return `${namespace}:${createHash("sha256").update(value).digest("hex")}`;
}

export interface StudioVirtualCustomFurnitureSummary {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
}

@Injectable()
export class StudioVirtualSpaceFurnitureService {
  constructor(
    @Optional()
    @Inject(SUPABASE_OBJECT_STORAGE_PORT)
    private readonly objectStorage?: PrivateObjectStoragePort,
  ) {}

  private async requireActiveUser(userId: string | undefined): Promise<string> {
    const id = userId?.trim();
    if (!id) throw new ForbiddenException("로그인이 필요합니다.");

    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) throw new ForbiddenException("로그인이 필요합니다.");
    if (row.status !== "active") throw new ForbiddenException("사용할 수 없는 계정입니다.");
    return id;
  }

  private async requireStorage(): Promise<PrivateObjectStoragePort> {
    const storage = this.objectStorage;
    if (!storage) {
      throw new ServiceUnavailableException("가구 저장소가 구성되지 않았어요.");
    }
    return storage;
  }

  async list(userId: string | undefined): Promise<readonly StudioVirtualCustomFurnitureSummary[]> {
    const owner = await this.requireActiveUser(userId);

    const rows = await db
      .select()
      .from(studioVirtualSpaceCustomFurniture)
      .where(eq(studioVirtualSpaceCustomFurniture.userId, owner))
      .orderBy(desc(studioVirtualSpaceCustomFurniture.createdAt))
      .limit(LIST_LIMIT);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * 가구 1건을 올린다.
   *
   * 순서가 중요하다. 형식 확인 → 재인코딩 → 저장 → 레지스트리다. 재인코딩을 거치지
   * 않으면 EXIF가 버킷에 남고, 레지스트리를 먼저 쓰면 저장은 실패했는데 행만 남는 유령 행이 생긴다.
   */
  async upload(userId: string | undefined, body: unknown): Promise<StudioVirtualCustomFurnitureSummary> {
    const owner = await this.requireActiveUser(userId);
    const storage = await this.requireStorage();

    const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const declaredMime = input.declaredMime;
    const name = input.name;
    const dataBase64 = input.dataBase64;

    if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
      throw new BadRequestException("업로드할 이미지를 확인해 주세요.");
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(dataBase64, "base64"));
    } catch {
      throw new BadRequestException("업로드한 이미지를 읽지 못했어요.");
    }

    const admitted = admitStudioVirtualCustomFurniture({ declaredMime, name, bytes });
    if (!admitted.ok) throw new BadRequestException(admitted.error);

    const reencoded = await reencodeStudioVirtualFurniture(bytes, STUDIO_VIRTUAL_CUSTOM_FURNITURE_EDGE);
    if (!reencoded.ok) throw new BadRequestException(reencoded.error);

    const id = randomUUID();
    const reference = PrivateObjectReferenceSchema.parse(await storage.uploadImmutable({
      purpose: "source",
      contentType: "image/png",
      bytes: Uint8Array.from(reencoded.value.bytes),
      controlMetadata: {
        documentId: opaqueControlId("furniture", id),
        operationId: opaqueControlId("furniture-upload", id),
        labels: { purpose: "source", reference: opaqueControlId("ref", id) },
      },
    }));

    const [row] = await db
      .insert(studioVirtualSpaceCustomFurniture)
      .values({
        id,
        userId: owner,
        name: admitted.name,
        mimeType: "image/png",
        objectPath: reference.objectPath,
        digest: reference.digest,
        width: reencoded.value.width,
        height: reencoded.value.height,
        byteLength: reencoded.value.bytes.byteLength,
      })
      .returning();

    if (!row) throw new ConflictException("가구를 저장하지 못했어요.");

    return {
      id: row.id,
      name: row.name,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 렌더에 필요한 서명 읽기 URL을 준다. 남의 가구는 못 본다.
   * 오브젝트 경로는 클라이언트가 아니라 서버가 레지스트리에서 읽어 쓴다.
   */
  async createReadUrl(
    userId: string | undefined,
    furnitureId: string,
  ): Promise<{ readonly url: string; readonly expiresInSeconds: number }> {
    const owner = await this.requireActiveUser(userId);
    const storage = await this.requireStorage();

    const [row] = await db
      .select()
      .from(studioVirtualSpaceCustomFurniture)
      .where(
        and(
          eq(studioVirtualSpaceCustomFurniture.id, furnitureId),
          eq(studioVirtualSpaceCustomFurniture.userId, owner),
        ),
      )
      .limit(1);

    if (!row) throw new NotFoundException("가구를 찾을 수 없어요.");

    const object = PrivateObjectReferenceSchema.parse({
      contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: "source",
      digest: row.digest,
      objectPath: row.objectPath,
      byteLength: row.byteLength,
      contentType: row.mimeType,
    });

    const signed = await storage.createSignedReadUrl({
      object,
      expiresInSeconds: READ_URL_TTL_SECONDS,
    });

    return { url: signed.url, expiresInSeconds: READ_URL_TTL_SECONDS };
  }
}
