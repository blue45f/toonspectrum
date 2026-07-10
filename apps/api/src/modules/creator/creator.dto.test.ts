import { describe, expect, it } from "vitest";

import {
  CreateCreatorWorkSchema,
  CreatorWorkRevisionListQuerySchema,
  CreatorWorkRevisionParamsSchema,
  RestoreCreatorWorkRevisionSchema,
  UpdateCreatorWorkSchema,
} from "./creator.dto";

describe("creator work zod contracts", () => {
  it("create는 제목을 요구하고 알려지지 않은 필드를 거부한다", () => {
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", status: "draft" }).success).toBe(true);
    expect(CreateCreatorWorkSchema.safeParse({ status: "draft" }).success).toBe(false);
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", admin: true }).success).toBe(false);
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", hidden: true, revision: 99 }).success).toBe(false);
  });

  it("update는 실제 변경 필드 하나 이상과 선택적 양의 baseRevision을 받는다", () => {
    expect(UpdateCreatorWorkSchema.safeParse({ doc: { pagesList: [] }, baseRevision: 7 }).success).toBe(true);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", baseRevision: 1 }).success).toBe(true);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "레거시 저장" }).success).toBe(true);
    expect(UpdateCreatorWorkSchema.safeParse({ baseRevision: 7 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", baseRevision: 0 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", baseRevision: 1.5 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", revision: 9 }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", restoredFromRevision: 3 }).success).toBe(false);
  });

  it("revision 경로·목록 limit·복원 body를 정수 상한 안에서 검증한다", () => {
    expect(CreatorWorkRevisionParamsSchema.parse({ id: "work-1", revision: "12" })).toEqual({
      id: "work-1",
      revision: 12,
    });
    expect(CreatorWorkRevisionListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(CreatorWorkRevisionListQuerySchema.safeParse({ limit: 21 }).success).toBe(false);
    expect(RestoreCreatorWorkRevisionSchema.safeParse({ baseRevision: 3 }).success).toBe(true);
    expect(RestoreCreatorWorkRevisionSchema.safeParse({ baseRevision: "3" }).success).toBe(false);
  });
});
