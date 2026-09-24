import type {
  CreatorPublicationDirective,
  CreatorPublicationWorkStatus,
} from "@/shared/lib/creator-publication-contract";

export type StudioPublishResultKind =
  | "published"
  | "scheduled"
  | "private"
  | "draft";

export interface StudioPublishResultCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly readerActionLabel: string | null;
}

const VALID_RESULT_KINDS = new Set<StudioPublishResultKind>([
  "published",
  "scheduled",
  "private",
  "draft",
]);

export function resolveStudioPublishResultKind(
  intent: "draft" | "publish",
  effectiveStatus: CreatorPublicationWorkStatus,
  directive: CreatorPublicationDirective | null,
): StudioPublishResultKind {
  if (intent === "draft") return "draft";
  if (directive?.visibility === "private") return "private";
  if (directive?.mode === "scheduled" && effectiveStatus !== "published") {
    return "scheduled";
  }
  return effectiveStatus === "published" ? "published" : "draft";
}

export function parseStudioPublishResultKind(
  value: string | null | undefined,
): StudioPublishResultKind | null {
  return value && VALID_RESULT_KINDS.has(value as StudioPublishResultKind)
    ? (value as StudioPublishResultKind)
    : null;
}

export function buildStudioPublishResultHref(
  workId: string,
  kind?: StudioPublishResultKind | null,
): string {
  const base = `/studio/work/${encodeURIComponent(workId)}/publish`;
  return kind ? `${base}?result=${kind}` : base;
}

export function studioPublishResultCopy(
  kind: StudioPublishResultKind,
): StudioPublishResultCopy {
  if (kind === "published") {
    return {
      eyebrow: "PUBLISHED",
      title: "작품 게시가 완료됐습니다",
      description:
        "운영 작품으로 반영했습니다. 독자 화면을 열어 이미지와 공개 범위를 다시 확인할 수 있습니다.",
      readerActionLabel: "독자 화면 열기",
    };
  }
  if (kind === "scheduled") {
    return {
      eyebrow: "SCHEDULED",
      title: "게시 예약을 저장했습니다",
      description:
        "설정한 시각이 되기 전까지는 공개되지 않습니다. 예약 시각과 공개 범위를 다시 검토할 수 있습니다.",
      readerActionLabel: null,
    };
  }
  if (kind === "private") {
    return {
      eyebrow: "PRIVATE DRAFT",
      title: "비공개 원고를 저장했습니다",
      description:
        "일반 독자와 비로그인 사용자는 열 수 없습니다. 공개할 준비가 되면 게시 설정에서 범위를 변경하세요.",
      readerActionLabel: null,
    };
  }
  return {
    eyebrow: "DRAFT SAVED",
    title: "초안을 안전하게 저장했습니다",
    description:
      "작품 ID와 revision이 생성됐습니다. 원고와 게시 설정을 계속 수정할 수 있습니다.",
    readerActionLabel: null,
  };
}
