import { Controller, Get, Header, Headers, Inject, Injectable, Param, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { studioWorkSessionId } from "@toonspectrum/studio-project-model/work-session";
import { studioSessionEvidenceResponseSchema, type StudioSessionEvidence } from "@toonspectrum/studio-project-model/work-session-evidence";
import { dbPool } from "../../platform/database";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioWorkSessionService } from "./studio-work-session.controller";
import { StudioWorkSessionRepository, StudioWorkSessionRepositoryError } from "./studio-work-session.repository";
import { loadStudioReviewResolutionCaptures } from "./studio-review-capture-attestation";
import { studioReviewMappingsFromOperation, studioReviewPageRasterSchema } from "./studio-review-source-map";
import { projectStudioSessionEvidence } from "./studio-session-evidence-projection";

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
class Params extends createZodDto(z.object({ workId: studioWorkSessionId, sessionId: studioWorkSessionId }).strict()) {}
class QueryDto extends createZodDto(z.object({ offset: z.coerce.number().int().min(0).max(99_999).optional() }).strict()) {}
@Injectable()
export class StudioSessionEvidenceService {
  constructor(@Inject(StudioWorkSessionRepository) private readonly repository: StudioWorkSessionRepository) {}
  async read(actor: string, workId: string, sessionId: string, offset = 0) {
    const { session } = await this.repository.current(actor, workId, sessionId);
    const pin = session.input, client = await dbPool.connect();
    let evidence: StudioSessionEvidence | null = null, nextOffset: number | null = null;
    try {
      const captures = await loadStudioReviewResolutionCaptures(client, pin.artifactId, [pin.reviewId]);
      const capture = captures.length === 1 ? captures[0] : null;
      if (capture && canonicalJson(capture.subject) === canonicalJson(pin)) {
        const result = await client.query<{ operation: unknown; receipt: unknown }>(
          `SELECT operation.operation, to_jsonb(receipt) AS receipt FROM studio_operation operation
           JOIN studio_mutation_receipt receipt ON receipt."artifactId"=operation."artifactId"
             AND receipt."resultRevisionId"=operation."resultRevisionId" AND receipt."actorUserId"=operation."actorUserId"
             AND receipt.response->>'status'='completed' AND receipt.response->'subject'->>'reviewId'=$3
           WHERE operation."artifactId"=$1 AND operation."resultRevisionId"=$2
             AND operation."commandType"='review.snapshot-create' LIMIT 2`, [pin.artifactId, pin.revisionId, pin.reviewId]);
        const row = result.rows.length === 1 ? result.rows[0] : null, payload = record(record(row?.operation)?.payload);
        const rasters = z.array(studioReviewPageRasterSchema).min(1).max(100_000).safeParse(payload?.pageRasters);
        if (row && payload && rasters.success) {
          const page = rasters.data.slice(offset, offset + 25);
          const mappings = studioReviewMappingsFromOperation(row.operation, pin, page.map((item) => ({ ordinal: item.ordinal, hash: item.sha256 })), row.receipt);
          evidence = projectStudioSessionEvidence(payload.sourceSnapshot, mappings, {
            sourceContentDigest: pin.rootGraphHash, sourceServerRevision: capture.sourceServerRevision });
          nextOffset = offset + 25 < rasters.data.length ? offset + 25 : null;
        }
      }
    } finally { client.release(); }
    // Recheck current invitation and membership after the read. No stale view grants future access.
    const current = await this.repository.current(actor, workId, sessionId);
    if (canonicalJson(current.session.input) !== canonicalJson(pin)) throw new StudioWorkSessionRepositoryError("invalid-target");
    return studioSessionEvidenceResponseSchema.parse({ workId, sessionId, inputDigest: pin.rootGraphHash,
      offset, expiresAt: new Date(Date.now() + 15_000).toISOString(), evidence, nextOffset });
  }
}

@Controller("/creator/works/:workId/work-sessions/:sessionId/evidence")
export class StudioSessionEvidenceController {
  constructor(@Inject(StudioWorkSessionService) private readonly authority: StudioWorkSessionService,
    @Inject(StudioSessionEvidenceService) private readonly evidence: StudioSessionEvidenceService) {}
  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Referrer-Policy", "no-referrer")
  read(@Param(new ZodValidationPipe(Params)) params: Params,
    @Query(new ZodValidationPipe(QueryDto)) query: QueryDto, @Headers("x-user-id") actor?: string) {
    return this.authority.run(actor, (user) => this.evidence.read(user, params.workId, params.sessionId, query.offset ?? 0));
  }
}
