import { describe, expect, it } from "vitest";

import {
  CreatorPublicationValidationError,
  filterCreatorPublicationSummaries,
  prepareCreatorPublicationMutation,
} from "./publication";

import {
  createDefaultCreatorPublicationDirective,
  readCreatorPublicationDirective,
  writeCreatorPublicationDirective,
} from "../../../../web/src/shared/lib/creator-publication-contract";

const now = new Date("2026-09-09T09:00:00.000Z");

function completeDirective(overrides: Record<string, unknown> = {}) {
  return {
    ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
    socialTitle: "공유 제목",
    socialDescription: "공유 설명",
    canonicalSlug: "episode-1",
    ...overrides,
  };
}

describe("prepareCreatorPublicationMutation", () => {
  it("stores a future schedule as a draft without losing its publishing intent", () => {
    const prepared = prepareCreatorPublicationMutation({
      input: {
        status: "published",
        doc: {
          format: "upload",
          publication: completeDirective({
            mode: "scheduled",
            scheduledAt: "2026-09-10T18:00:00+09:00",
          }),
        },
      },
      now,
    });

    expect(prepared.effectiveStatus).toBe("draft");
    expect(prepared.input.status).toBe("draft");
    expect(readCreatorPublicationDirective(prepared.input.doc)).toMatchObject({
      mode: "scheduled",
      scheduledAt: "2026-09-10T09:00:00.000Z",
      publishedAt: null,
    });
  });

  it("stamps an immediate public release in the same document mutation", () => {
    const prepared = prepareCreatorPublicationMutation({
      input: {
        status: "published",
        doc: { publication: completeDirective() },
      },
      now,
    });

    expect(prepared.input.status).toBe("published");
    expect(readCreatorPublicationDirective(prepared.input.doc)?.publishedAt).toBe(
      "2026-09-09T09:00:00.000Z",
    );
  });

  it("allows incomplete publication settings to remain in a draft", () => {
    const prepared = prepareCreatorPublicationMutation({
      input: {
        status: "draft",
        doc: { publication: completeDirective({ mode: "scheduled", scheduledAt: null }) },
      },
      now,
    });

    expect(prepared.input.status).toBe("draft");
    expect(readCreatorPublicationDirective(prepared.input.doc)?.scheduledAt).toBeNull();
  });

  it("rejects non-public challenge releases", () => {
    expect(() =>
      prepareCreatorPublicationMutation({
        input: {
          status: "published",
          doc: { publication: completeDirective({ visibility: "unlisted" }) },
        },
        challengeLinked: true,
        now,
      }),
    ).toThrow(CreatorPublicationValidationError);

    try {
      prepareCreatorPublicationMutation({
        input: {
          status: "published",
          doc: { publication: completeDirective({ visibility: "unlisted" }) },
        },
        challengeLinked: true,
        now,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CreatorPublicationValidationError);
      expect((error as CreatorPublicationValidationError).details.issues[0]?.code).toBe(
        "CHALLENGE_REQUIRES_PUBLIC",
      );
    }
  });

  it("preserves publication policy when a legacy editor replaces the rest of doc", () => {
    const existingDoc = writeCreatorPublicationDirective(
      { oldField: true },
      completeDirective({ visibility: "unlisted", comments: "closed" }),
    );
    const prepared = prepareCreatorPublicationMutation({
      input: { doc: { format: "cuttoon", pagesList: [] } },
      existingDoc,
      existingStatus: "published",
      now,
    });

    expect(prepared.input.status).toBeUndefined();
    expect(prepared.input.doc).toMatchObject({ format: "cuttoon", pagesList: [] });
    expect(readCreatorPublicationDirective(prepared.input.doc)).toMatchObject({
      visibility: "unlisted",
      comments: "closed",
    });
  });

  it("moves an already published work back to draft when it becomes private", () => {
    const prepared = prepareCreatorPublicationMutation({
      input: { doc: { publication: completeDirective({ visibility: "private" }) } },
      existingDoc: { format: "upload" },
      existingStatus: "published",
      now,
    });

    expect(prepared.input.status).toBe("draft");
    expect(prepared.effectiveStatus).toBe("draft");
  });

  it("leaves legacy documents without publication metadata unchanged", () => {
    const input = { status: "published", doc: { format: "upload" } };
    const prepared = prepareCreatorPublicationMutation({ input, now });

    expect(prepared).toEqual({
      input,
      directive: null,
      effectiveStatus: null,
    });
  });
});

describe("filterCreatorPublicationSummaries", () => {
  it("keeps legacy and public works while excluding unlisted and private discovery", () => {
    const works = [{ id: "legacy" }, { id: "public" }, { id: "unlisted" }, { id: "private" }];
    const documents = new Map<string, unknown>([
      ["legacy", {}],
      ["public", writeCreatorPublicationDirective({}, completeDirective())],
      [
        "unlisted",
        writeCreatorPublicationDirective({}, completeDirective({ visibility: "unlisted" })),
      ],
      [
        "private",
        writeCreatorPublicationDirective({}, completeDirective({ visibility: "private" })),
      ],
    ]);

    expect(filterCreatorPublicationSummaries(works, documents)).toEqual([
      { id: "legacy" },
      { id: "public" },
    ]);
  });

  it("fails closed when a discovery row has no matching document", () => {
    expect(filterCreatorPublicationSummaries([{ id: "missing" }], new Map())).toEqual([]);
  });
});
