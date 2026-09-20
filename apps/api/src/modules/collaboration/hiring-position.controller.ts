import { Controller, Get, Header, Inject, Optional, Query } from "@nestjs/common";
import { z } from "zod";

import { HIRING_FORMATS, HIRING_TOOLS } from "../../../../../packages/contracts/src/creator-hiring";
import { HiringStore } from "./hiring.store";
import { hiringId, hiringRole, parseHiring, slotTermsSchema } from "./hiring.validation";

import type { HiringPositionPage, HiringPublicPosition } from "../../../../../packages/contracts/src/creator-hiring";

export const positionQuery = z.strictObject({
  postId: hiringId.optional(), after: hiringId.optional(), role: hiringRole.optional(),
  tool: z.enum(HIRING_TOOLS).optional(), format: z.enum(HIRING_FORMATS).optional(),
  model: slotTermsSchema.shape.model.optional(), compensation: slotTermsSchema.shape.compensation.optional(),
});
export class HiringPositionRepository {
  constructor(readonly store = new HiringStore()) {}
  list(input: z.infer<typeof positionQuery>): Promise<HiringPositionPage> {
    return this.store.tx(async (c) => {
      const rows = await c.query<{ id: string; post_id: string; title: string; revision: number; terms: HiringPublicPosition["terms"] }>(`SELECT s.id,s.post_id,s.revision,s.terms,p.title
        FROM creator_hiring_slot s JOIN creator_collab_post p ON p.id=s.post_id JOIN "user" u ON u.id=p."userId" AND u.status='active'
        WHERE (s.state IN ('open','matching') OR (s.state='reserved' AND NOT EXISTS (
          SELECT 1 FROM creator_hiring_commitment c WHERE c.slot_id=s.id AND (c.state='active' OR (c.state='reserved' AND c.hold_expires_at>clock_timestamp())))))
        AND s.due_at>clock_timestamp() AND p.status='open' AND NOT p.hidden AND p."deletedAt" IS NULL
        AND (p."deadlineAt" IS NULL OR p."deadlineAt">clock_timestamp())
        AND ($1::text IS NULL OR s.post_id=$1) AND ($2::text IS NULL OR s.terms->>'role'=$2)
        AND ($3::text IS NULL OR (s.terms->'tools') ? $3) AND ($4::text IS NULL OR (s.terms->'formats') ? $4)
        AND ($5::text IS NULL OR s.terms->>'model'=$5) AND ($6::text IS NULL OR s.terms->>'compensation'=$6)
        AND ($7::text IS NULL OR s.id>$7) ORDER BY s.id LIMIT 31`,
      [input.postId ?? null, input.role ?? null, input.tool ?? null, input.format ?? null, input.model ?? null, input.compensation ?? null, input.after ?? null]);
      const selected = rows.rows.slice(0, 30);
      return { items: selected.map((r) => ({ id: r.id, postId: r.post_id, postTitle: r.title, revision: r.revision, terms: r.terms })), next: rows.rows.length > 30 ? selected[29].id : null };
    });
  }
}
@Controller("/collaborations/hiring/positions")
export class HiringPositionController {
  constructor(@Optional() @Inject(HiringPositionRepository) private readonly positions = new HiringPositionRepository()) {}
  @Get() @Header("Cache-Control", "no-store, max-age=0")
  list(@Query() query: unknown) { return this.positions.list(parseHiring(positionQuery, query)); }
}
