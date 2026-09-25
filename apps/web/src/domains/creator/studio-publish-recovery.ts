import {
  createDefaultCreatorPublicationDirective,
  normalizeCreatorPublicationDirective,
  readCreatorPublicationDirective,
  writeCreatorPublicationDirective,
  type CreatorPublicationDirective,
} from "@/shared/lib/creator-publication-contract";
import type { StudioDestructiveActionRequest } from "./studio-destructive-action-preview";

import {
  getWork,
  updateWork,
  type UpdateWorkInput,
  type WorkDetail,
  type WorkSummary,
} from "@/platform/creator-client";

export class StudioPublishRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioPublishRecoveryError";
  }
}
export interface StudioPublishRecoveryDependencies {
  readonly loadWork?: (id: string, signal?: AbortSignal) => Promise<WorkDetail>;
  readonly updateWork?: (
    id: string,
    input: UpdateWorkInput,
    signal?: AbortSignal,
  ) => Promise<WorkSummary>;
}

export interface StudioPublishRecoveryResult {
  readonly work: WorkSummary;
  readonly directive: CreatorPublicationDirective;
  readonly doc: Record<string, unknown>;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
export function privateStudioPublicationDirective(
  value: unknown,
): CreatorPublicationDirective {
  const current = readCreatorPublicationDirective(value)
    ?? createDefaultCreatorPublicationDirective(browserTimeZone());
  return normalizeCreatorPublicationDirective({
    ...current,
    visibility: "private",
    mode: "immediate",
    scheduledAt: null,
    searchIndexing: false,
    publishedAt: null,
  });
}

function assertOwnedRevision(work: WorkDetail): number {
  if (!work.isOwner) {
    throw new StudioPublishRecoveryError(
      "작품 소유자만 게시를 취소하거나 비공개로 전환할 수 있습니다.",
    );
  }
  if (!Number.isSafeInteger(work.revision) || Number(work.revision) < 1) {
    throw new StudioPublishRecoveryError(
      "최신 작품 revision을 확인하지 못했습니다. 작품을 다시 불러와 주세요.",
    );
  }
  return Number(work.revision);
}
export function studioPublishRecoveryRequest(input: {
  readonly title: string;
  readonly scheduled: boolean;
}): StudioDestructiveActionRequest {
  const title = input.title.trim().slice(0, 120) || "이 작품";
  return {
    id: input.scheduled
      ? "studio.work.cancel-publication-schedule"
      : "studio.work.make-private",
    title: input.scheduled ? "게시 예약 취소" : "작품 비공개 전환",
    intro: input.scheduled
      ? `“${title}”의 예약 공개를 취소하고 비공개 초안으로 돌립니다.`
      : `“${title}”을 공개 화면과 탐색 결과에서 내리고 비공개 초안으로 돌립니다.`,
    losses: input.scheduled
      ? [{ label: "설정한 예약 공개 시각" }]
      : [{ label: "현재 공개 페이지와 탐색 노출" }],
    gains: ["소유자만 열 수 있는 비공개 초안"],
    reversibility: "document-untouched",
    undoNote: "원고와 revision은 유지되며 게시 설정에서 다시 공개할 수 있습니다.",
    confirmLabel: input.scheduled ? "예약 취소하고 비공개로" : "비공개로 전환",
  };
}

export async function makeStudioPublishedWorkPrivate(input: {
  readonly workId: string;
  readonly signal?: AbortSignal;
  readonly dependencies?: StudioPublishRecoveryDependencies;
}): Promise<StudioPublishRecoveryResult> {
  const workId = input.workId.trim();
  if (!workId) {
    throw new StudioPublishRecoveryError("비공개로 전환할 작품 ID가 없습니다.");
  }
  const load = input.dependencies?.loadWork ?? getWork;
  const update = input.dependencies?.updateWork ?? updateWork;
  const work = await load(workId, input.signal);
  const baseRevision = assertOwnedRevision(work);
  const directive = privateStudioPublicationDirective(work.doc);
  const doc = writeCreatorPublicationDirective(work.doc, directive);
  const saved = await update(
    workId,
    { status: "draft", doc, baseRevision },
    input.signal,
  );
  return Object.freeze({ work: saved, directive, doc });
}
