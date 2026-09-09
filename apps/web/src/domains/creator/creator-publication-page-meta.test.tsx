// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCreatorPublicationPageMetaModel,
  useCreatorPublicationPageMeta,
  type CreatorPublicationPageMetaInput,
} from "./creator-publication-page-meta";

import { createDefaultCreatorPublicationDirective } from "@/shared/lib/creator-publication-contract";

function input(
  overrides: Partial<CreatorPublicationPageMetaInput> = {},
): CreatorPublicationPageMetaInput {
  return {
    workId: "work/1",
    title: "원래 제목",
    description: "원래 설명",
    cover: "/covers/work-1.png",
    authorName: "작가",
    createdAt: "2026-09-08T00:00:00.000Z",
    status: "published",
    directive: {
      ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
      socialTitle: "공유 제목",
      socialDescription: "공유 설명",
      canonicalSlug: "episode-1",
      publishedAt: "2026-09-09T00:00:00.000Z",
    },
    ...overrides,
  };
}

function Harness({ value }: { value: CreatorPublicationPageMetaInput }) {
  useCreatorPublicationPageMeta(value);
  return null;
}

afterEach(() => {
  document.head.querySelector('meta[name="robots"]')?.remove();
  document.head
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((element) => element.remove());
});

describe("createCreatorPublicationPageMetaModel", () => {
  it("uses author-provided social metadata and a stable encoded canonical path", () => {
    const model = createCreatorPublicationPageMetaModel(input());

    expect(model).toMatchObject({
      canonicalPath: "/create/work%2F1",
      title: "공유 제목",
      description: "공유 설명",
      indexable: true,
    });
    expect(model?.image).toContain("/covers/work-1.png");
    expect(model?.structuredData).toMatchObject({
      name: "공유 제목",
      contentRating: "전체 이용",
      isFamilyFriendly: true,
    });
  });

  it("forces private, unlisted and draft owner views out of search indexing", () => {
    const directive = {
      ...createDefaultCreatorPublicationDirective("UTC"),
      visibility: "unlisted" as const,
      searchIndexing: false,
    };
    expect(
      createCreatorPublicationPageMetaModel(input({ directive }))?.indexable,
    ).toBe(false);
    expect(
      createCreatorPublicationPageMetaModel(input({ status: "draft" }))?.indexable,
    ).toBe(false);
  });
});

describe("useCreatorPublicationPageMeta", () => {
  it("creates a noindex robots contract and restores the head on unmount", () => {
    const directive = {
      ...createDefaultCreatorPublicationDirective("UTC"),
      visibility: "unlisted" as const,
      searchIndexing: false,
    };
    const view = render(<Harness value={input({ directive })} />);

    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex,nofollow,noarchive");
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeTruthy();

    view.unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
