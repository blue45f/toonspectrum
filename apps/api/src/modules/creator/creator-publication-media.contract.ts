import {
  CREATOR_WORK_MEDIA_MAX_BYTES,
  creatorWorkMediaPath,
  decodeCreatorWorkDataImage,
  type CreatorWorkMediaPayload,
  type CreatorWorkMediaTarget,
} from "../../server/creator-work-media";

export const CREATOR_PUBLICATION_MEDIA_MAX_MUTATION_BYTES = 96 * 1024 * 1024;
export const CREATOR_PUBLICATION_MEDIA_SIGNED_READ_SECONDS = 120;

export interface CreatorPublicationMediaMutableInput {
  readonly cover?: string;
  readonly pages?: readonly string[];
}

export interface CreatorPublicationMediaEntry {
  readonly target: CreatorWorkMediaTarget;
  readonly slot: string;
  readonly payload: CreatorWorkMediaPayload;
}

export interface CreatorPublicationMediaMutationPlan {
  readonly entries: readonly CreatorPublicationMediaEntry[];
  readonly stagedPatch: {
    readonly cover?: string;
    readonly pages?: string[];
  };
  readonly totalBytes: number;
}

export class CreatorPublicationMediaInputError extends Error {
  constructor(readonly reason: "invalid-data-url" | "mutation-too-large") {
    super(`creator_publication_media_${reason}`);
    this.name = "CreatorPublicationMediaInputError";
  }
}

export function creatorPublicationMediaSlot(target: CreatorWorkMediaTarget): string {
  return target.kind === "cover" ? "cover" : `page:${target.pageIndex}`;
}

export function creatorPublicationMediaPageIndex(
  target: CreatorWorkMediaTarget,
): number | null {
  return target.kind === "cover" ? null : target.pageIndex;
}

function inspectMediaValue(
  value: string,
  target: CreatorWorkMediaTarget,
): CreatorPublicationMediaEntry | null {
  if (!value.trimStart().startsWith("data:")) return null;
  const payload = decodeCreatorWorkDataImage(value, CREATOR_WORK_MEDIA_MAX_BYTES);
  if (!payload) throw new CreatorPublicationMediaInputError("invalid-data-url");
  return {
    target,
    slot: creatorPublicationMediaSlot(target),
    payload,
  };
}

export function planCreatorPublicationMediaMutation(
  input: CreatorPublicationMediaMutableInput,
  maximumTotalBytes = CREATOR_PUBLICATION_MEDIA_MAX_MUTATION_BYTES,
): CreatorPublicationMediaMutationPlan {
  const entries: CreatorPublicationMediaEntry[] = [];
  let totalBytes = 0;
  const stagedPatch: { cover?: string; pages?: string[] } = {};

  if (input.cover !== undefined) {
    const entry = inspectMediaValue(input.cover, { kind: "cover" });
    if (entry) {
      entries.push(entry);
      totalBytes += entry.payload.byteLength;
      stagedPatch.cover = "";
    } else {
      stagedPatch.cover = input.cover;
    }
  }

  if (input.pages !== undefined) {
    stagedPatch.pages = input.pages.map((page, pageIndex) => {
      const entry = inspectMediaValue(page, { kind: "page", pageIndex });
      if (!entry) return page;
      entries.push(entry);
      totalBytes += entry.payload.byteLength;
      return "";
    });
  }

  if (!Number.isSafeInteger(totalBytes) || totalBytes > maximumTotalBytes) {
    throw new CreatorPublicationMediaInputError("mutation-too-large");
  }
  return { entries, stagedPatch, totalBytes };
}

export function applyCreatorPublicationMediaPaths(
  workId: string,
  input: CreatorPublicationMediaMutableInput,
  plan: CreatorPublicationMediaMutationPlan,
): { cover?: string; pages?: string[] } {
  const bySlot = new Map(
    plan.entries.map((entry) => [
      entry.slot,
      creatorWorkMediaPath(workId, entry.target, entry.payload.sha256),
    ]),
  );
  const output: { cover?: string; pages?: string[] } = {};
  if (input.cover !== undefined) {
    output.cover = bySlot.get("cover") ?? input.cover;
  }
  if (input.pages !== undefined) {
    output.pages = input.pages.map(
      (page, pageIndex) => bySlot.get(`page:${pageIndex}`) ?? page,
    );
  }
  return output;
}
