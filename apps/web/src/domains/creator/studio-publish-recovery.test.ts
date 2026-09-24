import { describe, expect, it, vi } from "vitest";

import {
  StudioPublishRecoveryError,
  makeStudioPublishedWorkPrivate,
  privateStudioPublicationDirective,
} from "./studio-publish-recovery";

import type {
  UpdateWorkInput,
  WorkDetail,
  WorkSummary,
} from "@/infrastructure/creator-client";

function detail(overrides: Partial<WorkDetail> = {}): WorkDetail {
  return {
    id: "work-1",
    title: "작품",
    description: "",
    tags: [],
    format: "upload",
    cover: "cover",
    pages: ["page"],
    titleId: null,
    status: "published",
    author: { id: "owner-1", name: "작가", avatar: "" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-09-24T00:00:00.000Z",
    doc: {},
    isOwner: true,
    revision: 7,
    series: null,
    prevEpisode: null,
    nextEpisode: null,
    challenge: null,
    remixFromTitle: null,
    ...overrides,
  };
}

function summary(): WorkSummary {
  return {
    id: "work-1",
    title: "작품",
    description: "",
    cover: "cover",
    tags: [],
    format: "upload",
    titleId: null,
    status: "draft",
    author: { id: "owner-1", name: "작가", avatar: "" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-09-24T00:00:00.000Z",
    revision: 8,
  };
}

describe("studio publish recovery", () => {
  it("changes published and scheduled directives into a private immediate draft", () => {
    const directive = privateStudioPublicationDirective({
      publication: {
        visibility: "public",
        mode: "scheduled",
        scheduledAt: "2026-09-25T00:00:00.000Z",
        timeZone: "Asia/Seoul",
        comments: "closed",
        allowRemix: true,
        contentRating: "teen",
        searchIndexing: true,
        socialTitle: "공유 제목",
        socialDescription: "공유 설명",
        canonicalSlug: "story",
        publishedAt: "2026-09-24T00:00:00.000Z",
      },
    });

    expect(directive).toMatchObject({
      visibility: "private",
      mode: "immediate",
      scheduledAt: null,
      searchIndexing: false,
      publishedAt: null,
      comments: "closed",
      allowRemix: true,
      contentRating: "teen",
      socialTitle: "공유 제목",
    });
  });

  it("rechecks ownership and revision before saving the private directive", async () => {
    const loadWork = vi.fn(async () => detail({
      doc: {
        publication: {
          visibility: "public",
          mode: "immediate",
          timeZone: "Asia/Seoul",
        },
        custom: "kept",
      },
    }));
    const updateWork = vi.fn(async (
      _id: string,
      _input: UpdateWorkInput,
      _signal?: AbortSignal,
    ) => summary());
    const signal = new AbortController().signal;

    const result = await makeStudioPublishedWorkPrivate({
      workId: " work-1 ",
      signal,
      dependencies: { loadWork, updateWork },
    });
    expect(loadWork).toHaveBeenCalledWith("work-1", signal);
    expect(updateWork).toHaveBeenCalledTimes(1);
    const [, patch, passedSignal] = updateWork.mock.calls[0]!;
    expect(patch).toMatchObject({
      status: "draft",
      baseRevision: 7,
      doc: {
        custom: "kept",
        publication: {
          visibility: "private",
          mode: "immediate",
          scheduledAt: null,
          searchIndexing: false,
          publishedAt: null,
        },
      },
    });
    expect(passedSignal).toBe(signal);
    expect(result.work.revision).toBe(8);
    expect(result.directive.visibility).toBe("private");
    expect(result.doc).toMatchObject({
      custom: "kept",
      publication: { visibility: "private" },
    });
  });

  it("rejects non-owners before mutation", async () => {
    const updateWork = vi.fn(async () => summary());
    await expect(makeStudioPublishedWorkPrivate({
      workId: "work-1",
      dependencies: {
        loadWork: async () => detail({ isOwner: false }),
        updateWork,
      },
    })).rejects.toBeInstanceOf(StudioPublishRecoveryError);
    expect(updateWork).not.toHaveBeenCalled();
  });

  it("rejects owner responses without an optimistic revision", async () => {
    await expect(makeStudioPublishedWorkPrivate({
      workId: "work-1",
      dependencies: {
        loadWork: async () => detail({ revision: undefined }),
        updateWork: async () => summary(),
      },
    })).rejects.toThrow(/revision/u);
  });
});
