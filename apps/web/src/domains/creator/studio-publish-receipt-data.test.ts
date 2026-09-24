import { describe, expect, it } from "vitest";

import {
  createStudioPublishReceipt,
  studioPublishReceiptFileName,
} from "./studio-publish-receipt-data";

describe("studio publish receipt data", () => {
  it("records a public and anonymous reader path with source integrity", () => {
    const receipt = createStudioPublishReceipt({
      kind: "published",
      workId: "work / 1",
      revision: 7,
      environment: "production",
      generatedAt: "2026-09-24T10:47:14.280Z",
      details: {
        title: "성운의 왕관",
        visibility: "public",
        publishedAt: "2026-09-24T10:47:13.708Z",
        pages: [{ name: "page.webp", width: 1280, height: 1600 }],
        source: {
          version: 1,
          kind: "studio_document",
          projectId: "project-1",
          documentId: "document-1",
          revisionId: "studio-generation:7:history:12",
          contentChecksum: "a".repeat(64),
          disclosure: "브라우저 편집기에서 제작",
        },
        community: {
          kind: "illustration",
          provenance: "agent_assisted",
          portfolio: true,
          downloadAllowed: false,
          trainingAllowed: false,
          attributionText: "AI 에이전트 드로잉 · 소유자 최종 검수",
          altText: "별빛 왕관을 쓴 판타지 소녀",
        },
        rights: {
          comments: "open",
          allowRemix: true,
          searchIndexing: true,
          contentRating: "all",
        },
        preflight: { errors: 0, warnings: 0 },
      },
    });

    expect(receipt).toMatchObject({
      schema: "toonstudio.publish-receipt.v1",
      revision: 7,
      publicPath: "/create/work%20%2F%201",
      anonymousPreviewPath: "/create/work%20%2F%201?view=reader&publicPreview=1",
      details: {
        source: { contentChecksum: "a".repeat(64) },
        community: {
          provenance: "agent_assisted",
          altText: "별빛 왕관을 쓴 판타지 소녀",
        },
        preflight: { errors: 0, warnings: 0 },
      },
    });
    expect(studioPublishReceiptFileName(receipt)).toBe("toonstudio-publish-work-1-r7.json");
  });

  it("does not expose reader paths for a private draft", () => {
    expect(createStudioPublishReceipt({
      kind: "private",
      workId: "private-work",
      environment: "preview",
    })).toMatchObject({
      publicPath: null,
      anonymousPreviewPath: null,
      revision: null,
      details: null,
    });
  });
});
