import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceDecorationService } from "./studio-virtual-space-decoration.service";

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../platform/database", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const { studioVirtualSpaceDecorationLayouts } = await import(
    "../../platform/database/schema/studio-virtual-space-decoration.schema"
  );
  const { users } = await import("../../platform/database/schema/auth.schema");
  return {
    studioVirtualSpaceDecorationLayouts,
    users,
    db: drizzle((query, parameters, method) => boundary.query(query, parameters, method)),
  };
});

const service = new StudioVirtualSpaceDecorationService();

function placement(overrides: Record<string, unknown> = {}) {
  return { id: "bench-1", type: "bench", x: 10, y: 20, rotation: 0, scale: 1, ...overrides };
}

const SCOPE = '["proj-1","office","personal"]';

function saveBody(overrides: Record<string, unknown> = {}) {
  return {
    scopeKey: SCOPE,
    districtKey: "story-terrace",
    presetKey: "minimal",
    presentationMode: "minimal",
    placements: [placement()],
    expectedRevision: 0,
    layoutWidth: 1280,
    layoutHeight: 960,
    ...overrides,
  };
}

// pg-proxy는 컬럼을 위치 배열로 돌려준다. 객체로 주면 status가 undefined가 된다.
const ACTIVE_USER = { rows: [["active"]] };

beforeEach(() => {
  boundary.query.mockReset();
  boundary.query.mockResolvedValue(ACTIVE_USER);
});

describe("ownership", () => {
  it("refuses an anonymous caller", async () => {
    await expect(service.getState(undefined, SCOPE, "sky-port")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a blank user id", async () => {
    await expect(service.getState("   ", SCOPE, "sky-port")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a suspended account", async () => {
    boundary.query.mockResolvedValue({ rows: [["suspended"]] });

    await expect(service.getState("u1", SCOPE, "sky-port")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an unknown district", async () => {
    await expect(service.getState("u1", SCOPE, "moon-base")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("read", () => {
  it("returns the empty state at revision 0 when nothing is stored", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.getState("u1", SCOPE, "sky-port")).resolves.toEqual({
      scopeKey: SCOPE,
      districtKey: "sky-port",
      presetKey: "minimal",
      presentationMode: "minimal",
      placements: [],
      revision: 0,
      layoutWidth: 1280,
      layoutHeight: 960,
    });
  });
});

describe("first write", () => {
  it("inserts and does not overwrite a row another device already created", async () => {
    boundary.query.mockResolvedValueOnce(ACTIVE_USER).mockResolvedValueOnce({ rows: [] });

    await expect(service.save("u1", SCOPE, "story-terrace", saveBody())).rejects.toBeInstanceOf(ConflictException);

    const [insertSql] = boundary.query.mock.calls[1];
    expect(insertSql).toContain("insert into");
    expect(insertSql).toMatch(/on conflict do nothing/i);
  });

  it("returns revision 1 after a successful first write", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [[1]] });

    const saved = await service.save("u1", SCOPE, "story-terrace", saveBody());

    expect(saved.revision).toBe(1);
    expect(saved.placements).toHaveLength(1);
  });
});

describe("later writes use compare-and-swap", () => {
  it("updates only when the stored revision still matches the caller's", async () => {
    boundary.query.mockResolvedValueOnce(ACTIVE_USER).mockResolvedValueOnce({ rows: [[1]] });

    const saved = await service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: 7 }));

    const [updateSql, updateParams] = boundary.query.mock.calls[1];
    expect(updateSql).toContain("update");
    expect(updateSql).toMatch(/"studio_virtual_space_decoration_layout"\."revision" = \$/);
    expect(updateParams).toContain(7);
    expect(saved.revision).toBe(8);
  });

  it("refuses to overwrite a newer row and hands back the current state", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [["u1", SCOPE, "story-terrace", "festival", "festival", [], 9, 1280, 960, new Date(0)]] });

    const failure = await service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: 7 })).catch((e) => e);

    expect(failure).toBeInstanceOf(ConflictException);
    expect(failure.getResponse()).toMatchObject({ current: { revision: 9 } });
  });
});

describe("payload", () => {
  it("refuses a body whose district disagrees with the path", async () => {
    await expect(
      service.save("u1", SCOPE, "sky-port", saveBody({ districtKey: "story-terrace" })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a payload that the shared contract rejects", async () => {
    await expect(
      service.save("u1", SCOPE, "story-terrace", saveBody({ placements: [placement({ type: "weapon-rack" })] })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a body whose scope disagrees with the path", async () => {
    await expect(
      service.save("u1", SCOPE, "story-terrace", saveBody({ scopeKey: "other" })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a scope key longer than the contract allows", async () => {
    await expect(
      service.save("u1", "x".repeat(300), "story-terrace", saveBody()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a stale negative revision", async () => {
    await expect(
      service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: -3 })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
