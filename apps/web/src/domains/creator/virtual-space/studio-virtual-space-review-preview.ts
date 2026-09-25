import { z } from "zod";
import { studioReviewPageMappingSchema, type StudioReviewPageMapping } from "@toonspectrum/studio-project-model";

import { api, httpStatus } from "@/platform/api";

import { parseStudioVirtualSpaceReviewSubject, sameStudioVirtualSpaceReviewSubject,
  type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

const cursorSchema = z.string().regex(/^(0|[1-9][0-9]{0,6})\.[a-f0-9]{64}$/u)
  .refine((value) => Number(value.split(".")[0]) <= 1_000_000);
const previewSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), ordinal: z.number().int().min(0).max(1_000_000),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]), byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  url: z.string().max(8_192).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }),
  expiresAt: z.number().int().positive(),
  mapping: studioReviewPageMappingSchema.optional().default({ status: "unmapped", reason: "legacy-review" }),
}).strict();
const successSchema = z.object({ ok: z.literal(true), subject: z.unknown(),
  previews: z.array(previewSchema).min(1).max(32), nextCursor: cursorSchema.nullable() }).strict();
const failureSchema = z.object({ ok: z.literal(false),
  reason: z.enum(["preview-unavailable", "closed", "version-mismatch"]) }).strict();

export type StudioVirtualSpaceReviewPreview = z.infer<typeof previewSchema>;
export type { StudioReviewPageMapping };
export type StudioVirtualSpaceReviewPreviews = {
  readonly ok: true;
  readonly subject: StudioVirtualSpaceReviewSubject;
  readonly previews: readonly StudioVirtualSpaceReviewPreview[];
  readonly nextCursor: string | null;
} | { readonly ok: false; readonly reason: "preview-unavailable" | "closed" | "version-mismatch" | "access-denied" };

/**
 * Explicit local read only. Signed URLs stay in memory, expire within 30 seconds and never enter
 * invitations, project storage or logs. The UI must remove expired images and use no-referrer.
 */
export async function getStudioVirtualSpaceReviewPreview(
  rawSubject: StudioVirtualSpaceReviewSubject,
  cursor: string | null = null,
): Promise<StudioVirtualSpaceReviewPreviews> {
  const subject = parseStudioVirtualSpaceReviewSubject(rawSubject);
  if (!subject || (cursor !== null && !cursorSchema.safeParse(cursor).success)) return { ok: false, reason: "version-mismatch" };
  const query = new URLSearchParams({ projectId: subject.projectId, workId: subject.workId,
    artifactId: subject.artifactId, revisionId: subject.revisionId, rootGraphHash: subject.rootGraphHash });
  if (cursor) query.set("cursor", cursor);
  try {
    const body = await api.get<unknown>(`/studio-project-graph/reviews/${encodeURIComponent(subject.reviewId)}/previews?${query.toString()}`);
    const failed = failureSchema.safeParse(body);
    if (failed.success) return failed.data;
    const response = successSchema.parse(body);
    const receivedSubject = parseStudioVirtualSpaceReviewSubject(response.subject);
    if (!receivedSubject || !sameStudioVirtualSpaceReviewSubject(subject, receivedSubject)) return { ok: false, reason: "version-mismatch" };
    const now = Date.now();
    const identities = new Set<string>();
    let previousOrdinal = cursor ? Number(cursor.split(".")[0]) : -1;
    for (const preview of response.previews) {
      if (preview.expiresAt <= now || preview.expiresAt > now + 30_000
        || identities.has(preview.sha256) || preview.ordinal <= previousOrdinal) return { ok: false, reason: "preview-unavailable" };
      if (preview.mapping.status === "mapped" && (preview.mapping.sourceContentDigest !== subject.rootGraphHash
        || preview.mapping.page.ordinal !== preview.ordinal)) return { ok: false, reason: "version-mismatch" };
      identities.add(preview.sha256);
      previousOrdinal = preview.ordinal;
    }
    const last = response.previews[response.previews.length - 1]!;
    if (response.nextCursor !== null && response.nextCursor !== `${last.ordinal}.${last.sha256}`) return { ok: false, reason: "preview-unavailable" };
    return { ok: true, subject: receivedSubject, previews: Object.freeze(response.previews), nextCursor: response.nextCursor };
  } catch (error) {
    return { ok: false, reason: [401, 403].includes(httpStatus(error) ?? 0) ? "access-denied" : "preview-unavailable" };
  }
}
