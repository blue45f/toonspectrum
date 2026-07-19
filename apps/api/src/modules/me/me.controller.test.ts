import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { MeController } from "./me.controller";
import {
  CollectionMutationDto,
  CollectionMutationSchema,
} from "./me.dto";

import type { MeService } from "./me.service";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const bodyMetadata = { type: "body" as const, metatype: undefined, data: undefined };

function pipeBody(value: unknown): CollectionMutationDto {
  return new ZodValidationPipe(CollectionMutationDto).transform(
    value,
    bodyMetadata
  ) as CollectionMutationDto;
}

describe("MeController collection contract", () => {
  it("accepts a client UUID v4 and preserves the legacy no-id create wire shape", () => {
    expect(pipeBody({ action: "create", id: CLIENT_ID, name: " 새 컬렉션 " })).toEqual({
      action: "create",
      id: CLIENT_ID,
      name: " 새 컬렉션 ",
    });
    expect(pipeBody({ action: "create", name: "구버전", emoji: "📚" })).toEqual({
      action: "create",
      name: "구버전",
      emoji: "📚",
    });
  });

  it("canonicalizes names and emoji while retaining bounded legacy opaque IDs", () => {
    expect(CollectionMutationSchema.parse({
      action: "create",
      id: CLIENT_ID,
      name: `  ${"이름".repeat(100)}  `,
      emoji: " ",
    })).toEqual({
      action: "create",
      id: CLIENT_ID,
      name: "이름".repeat(40),
      emoji: "📚",
    });
    expect(CollectionMutationSchema.parse({
      action: "rename",
      id: " seed-col-1 ",
      name: " 보관함 ",
    })).toEqual({ action: "rename", id: "seed-col-1", name: "보관함" });
    expect(CollectionMutationSchema.parse({
      action: "create",
      id: CLIENT_ID.toUpperCase(),
      name: "대문자 UUID",
    }).id).toBe(CLIENT_ID);
  });

  it("rejects non-v4 client IDs, incomplete set commands, and mass-assignment keys", () => {
    expect(() => pipeBody({
      action: "create",
      id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      name: "v1",
    })).toThrow(BadRequestException);
    expect(() => pipeBody({
      action: "set-item",
      id: "seed-col-1",
      titleId: "title-1",
    })).toThrow(BadRequestException);
    expect(() => pipeBody({
      action: "create",
      id: CLIENT_ID,
      name: "컬렉션",
      userId: "attacker",
    })).toThrow(BadRequestException);
  });

  it("passes only the authenticated user and canonical command to the service", async () => {
    const updateCollection = vi.fn().mockResolvedValue({ ok: true, id: CLIENT_ID });
    const controller = new MeController({ updateCollection } as unknown as MeService);

    await expect(controller.updateCollection(
      "owner-1",
      pipeBody({
        action: "create",
        id: CLIENT_ID,
        name: "  컬렉션  ",
        emoji: "",
      })
    )).resolves.toEqual({ ok: true, id: CLIENT_ID });
    expect(updateCollection).toHaveBeenCalledWith("owner-1", {
      action: "create",
      id: CLIENT_ID,
      name: "컬렉션",
      emoji: "📚",
    });
  });

  it("rejects unauthenticated collection mutations before calling the service", async () => {
    const updateCollection = vi.fn();
    const controller = new MeController({ updateCollection } as unknown as MeService);

    await expect(controller.updateCollection(
      undefined,
      pipeBody({ action: "delete", id: "seed-col-1" })
    )).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateCollection).not.toHaveBeenCalled();
  });
});
