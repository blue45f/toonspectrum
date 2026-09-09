import {
  createDefaultCreatorPublicationDirective,
  readCreatorPublicationDirective,
  type CreatorPublicationContentRating,
  type CreatorPublicationDirective,
  type CreatorPublicationReadingDirection,
} from "@/shared/lib/creator-publication-contract";

export const CREATOR_PUBLICATION_CONTENT_RATING_LABELS = {
  all: "전체 이용",
  teen: "청소년 주의",
  mature: "성인 대상",
} as const satisfies Readonly<Record<CreatorPublicationContentRating, string>>;

export interface CreatorPublicationReaderPolicy {
  directive: CreatorPublicationDirective;
  legacy: boolean;
  commentsAllowed: boolean;
  remixAllowed: boolean;
  contentRatingLabel: string;
  readingLabel: string;
  requiresMatureConfirmation: boolean;
}

/**
 * Public reader behavior is derived from the durable publication directive. Legacy works
 * retain their historical vertical, open-comment and remix-enabled behavior.
 */
export function resolveCreatorPublicationReaderPolicy(
  doc: unknown,
): CreatorPublicationReaderPolicy {
  const stored = readCreatorPublicationDirective(doc);
  const directive = stored ?? createDefaultCreatorPublicationDirective("UTC");
  const readingLabel =
    directive.readingMode === "vertical"
      ? "세로 스크롤"
      : directive.readingDirection === "rtl"
        ? "페이지 · 오른쪽→왼쪽"
        : "페이지 · 왼쪽→오른쪽";

  return {
    directive,
    legacy: stored === null,
    commentsAllowed: directive.comments === "open",
    remixAllowed: directive.allowRemix,
    contentRatingLabel:
      CREATOR_PUBLICATION_CONTENT_RATING_LABELS[directive.contentRating],
    readingLabel,
    requiresMatureConfirmation: directive.contentRating === "mature",
  };
}

export type CreatorPublicationPageCommand =
  | "first"
  | "last"
  | "next"
  | "previous";

export function resolveCreatorPublicationPageKey(
  key: string,
  direction: CreatorPublicationReadingDirection,
): CreatorPublicationPageCommand | null {
  switch (key) {
    case "ArrowLeft":
      return direction === "rtl" ? "next" : "previous";
    case "ArrowRight":
      return direction === "rtl" ? "previous" : "next";
    case "PageUp":
      return "previous";
    case "PageDown":
      return "next";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}
