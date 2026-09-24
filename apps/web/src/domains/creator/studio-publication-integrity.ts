import {
  normalizeCreatorPublicationAudit,
  normalizeCreatorPublicationSource,
  readCreatorPublicationAudit,
  readCreatorPublicationSource,
  writeCreatorPublicationAudit,
  writeCreatorPublicationSource,
  type CreatorPublicationActorMode,
  type CreatorPublicationSourceKind,
} from "@toonspectrum/contracts/creator-publication-integrity";

import { hashStudioAssetDataUrl } from "./studio-asset-library";

export interface WriteStudioPublicationIntegrityInput {
  readonly document: unknown;
  readonly sourceKind?: CreatorPublicationSourceKind;
  readonly projectId?: string | null;
  readonly documentId?: string | null;
  readonly revisionId?: string | null;
  readonly pageImages: readonly string[];
  readonly disclosure?: string | null;
  readonly aiUsage?: "none" | "assisted" | "generated";
  readonly editorActor?: CreatorPublicationActorMode;
  readonly publisherActor?: CreatorPublicationActorMode;
  readonly ownerApproved: boolean;
  readonly ownerUserId?: string | null;
  readonly approvedAt?: string | null;
  readonly toolIds?: readonly string[];
}

async function sha256Text(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pageFingerprint(value: string): Promise<string | null> {
  if (value.trimStart().startsWith("data:")) {
    try {
      return (await hashStudioAssetDataUrl(value)).replace(/^sha256:/u, "");
    } catch {
      return null;
    }
  }
  return sha256Text(value);
}

/**
 * Builds one stable checksum from ordered page content without concatenating every decoded image
 * into another large allocation. Each inline page is hashed sequentially, then the ordered digest
 * list is hashed once more. URL-backed pages hash the immutable reference string.
 */
export async function hashStudioPublicationPages(
  pageImages: readonly string[],
): Promise<string | null> {
  const fingerprints: string[] = [];
  for (const image of pageImages) {
    const fingerprint = await pageFingerprint(image);
    if (!fingerprint) return null;
    fingerprints.push(fingerprint);
  }
  return sha256Text(JSON.stringify(fingerprints));
}

function defaultDisclosure(
  kind: CreatorPublicationSourceKind,
  aiUsage: WriteStudioPublicationIntegrityInput["aiUsage"],
): string {
  if (kind === "uploaded_file") return "게시 명령 센터에서 업로드한 원고";
  if (kind === "external_tool") return "외부 제작 도구에서 가져온 원고";
  if (kind === "remix") return "기존 작품을 이어서 편집한 원고";
  if (aiUsage === "generated") return "ToonStudio에서 AI 생성 요소를 포함해 제작한 원고";
  if (aiUsage === "assisted") return "ToonStudio에서 AI 보조 기능을 사용해 제작한 원고";
  return "ToonStudio 브라우저 편집기에서 제작한 원고";
}

function uniqueTools(...groups: readonly (readonly string[] | undefined)[]): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, 16);
}

/**
 * Adds private audit metadata and a public-safe source link at the same document boundary that is
 * committed as the work revision. Existing explicit agent/automation attribution is preserved;
 * ordinary interactive saves default to the owner/collaborator actor supplied by the caller.
 */
export async function writeStudioPublicationIntegrity(
  input: WriteStudioPublicationIntegrityInput,
): Promise<Record<string, unknown>> {
  const existingSource = readCreatorPublicationSource(input.document);
  const existingAudit = readCreatorPublicationAudit(input.document);
  const sourceKind = input.sourceKind ?? existingSource?.kind ?? "uploaded_file";
  const contentChecksum = await hashStudioPublicationPages(input.pageImages);
  const disclosure = input.disclosure?.trim()
    || existingSource?.disclosure
    || defaultDisclosure(sourceKind, input.aiUsage);
  const source = normalizeCreatorPublicationSource({
    kind: sourceKind,
    projectId: input.projectId ?? existingSource?.projectId ?? null,
    documentId: input.documentId ?? existingSource?.documentId ?? null,
    revisionId: input.revisionId ?? existingSource?.revisionId ?? null,
    contentChecksum,
    disclosure,
  });
  const audit = normalizeCreatorPublicationAudit({
    editorActor: input.editorActor ?? existingAudit?.editorActor ?? "owner",
    publisherActor: input.publisherActor ?? existingAudit?.publisherActor ?? "owner",
    ownerApproved: input.ownerApproved,
    ownerUserId: input.ownerUserId ?? existingAudit?.ownerUserId ?? null,
    approvedAt: input.ownerApproved
      ? input.approvedAt ?? new Date().toISOString()
      : null,
    toolIds: uniqueTools(existingAudit?.toolIds, input.toolIds),
  });
  return writeCreatorPublicationAudit(
    writeCreatorPublicationSource(input.document, source),
    audit,
  );
}
