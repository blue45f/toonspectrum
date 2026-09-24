import type { CreatorPublicationSourceLink } from "@toonspectrum/contracts/creator-publication-integrity";

import type { StudioPublishEnvironment } from "./studio-publish-review-safety";
import type { StudioPublishResultKind } from "./studio-publish-result";

export interface StudioPublishReceiptPage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioPublishReceiptCommunity {
  readonly kind: string;
  readonly provenance: "human" | "ai_assisted" | "agent_assisted" | "ai_generated" | "mixed";
  readonly portfolio: boolean;
  readonly downloadAllowed: boolean;
  readonly trainingAllowed: boolean;
  readonly attributionText: string;
  readonly altText: string;
}

export interface StudioPublishReceiptRights {
  readonly comments: "open" | "closed";
  readonly allowRemix: boolean;
  readonly searchIndexing: boolean;
  readonly contentRating: "all" | "teen" | "mature";
}

export interface StudioPublishReceiptDetails {
  readonly title: string;
  readonly visibility: "public" | "unlisted" | "private";
  readonly publishedAt: string | null;
  readonly pages: readonly StudioPublishReceiptPage[];
  readonly source: CreatorPublicationSourceLink | null;
  readonly community: StudioPublishReceiptCommunity;
  readonly rights: StudioPublishReceiptRights;
  readonly preflight: {
    readonly errors: number;
    readonly warnings: number;
  };
}

export interface StudioPublishReceiptInput {
  readonly kind: StudioPublishResultKind;
  readonly workId: string;
  readonly revision?: number;
  readonly environment: StudioPublishEnvironment;
  readonly details?: StudioPublishReceiptDetails | null;
  readonly generatedAt?: string;
}

export interface StudioPublishReceiptDocument {
  readonly schema: "toonstudio.publish-receipt.v1";
  readonly generatedAt: string;
  readonly environment: StudioPublishEnvironment;
  readonly result: StudioPublishResultKind;
  readonly workId: string;
  readonly revision: number | null;
  readonly publicPath: string | null;
  readonly anonymousPreviewPath: string | null;
  readonly details: StudioPublishReceiptDetails | null;
}

function readerVisible(kind: StudioPublishResultKind): boolean {
  return kind === "published";
}

export function createStudioPublishReceipt(
  input: StudioPublishReceiptInput,
): StudioPublishReceiptDocument {
  const visible = readerVisible(input.kind);
  const encodedWorkId = encodeURIComponent(input.workId);
  return {
    schema: "toonstudio.publish-receipt.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    environment: input.environment,
    result: input.kind,
    workId: input.workId,
    revision: Number.isSafeInteger(input.revision) ? input.revision ?? null : null,
    publicPath: visible ? `/create/${encodedWorkId}` : null,
    anonymousPreviewPath: visible
      ? `/create/${encodedWorkId}?view=reader&publicPreview=1`
      : null,
    details: input.details ?? null,
  };
}

export function studioPublishReceiptFileName(
  receipt: Pick<StudioPublishReceiptDocument, "workId" | "revision">,
): string {
  const workId = receipt.workId.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "work";
  return `toonstudio-publish-${workId}-r${receipt.revision ?? "pending"}.json`;
}
