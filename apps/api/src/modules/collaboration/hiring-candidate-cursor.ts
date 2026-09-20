import { BadRequestException, ConflictException } from "@nestjs/common";
import { z } from "zod";

import { parseHiring } from "./hiring.validation";

const positiveRevision = z.number().int().min(1).max(2147483646);
export const candidateQuerySchema = z.strictObject({
  after: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/u).optional(),
  expectedRevision: z.union([positiveRevision, z.string().regex(/^[1-9][0-9]{0,9}$/u).transform(Number).pipe(positiveRevision)]).optional(),
});
const cursorSchema = z.strictObject({
  v: z.literal(1), postId: z.string().min(1).max(128), slotId: z.string().min(1).max(128),
  termsRevision: positiveRevision, postVersion: positiveRevision,
  after: z.string().min(1).max(128).refine((value) => [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)),
});
export interface CandidateCursorScope { postId: string; slotId: string; termsRevision: number; postVersion: number; }

// A cursor is a bounded position, NOT a credential. Every page re-authorizes the
// owner and re-queries current disclosure, account, block and capacity facts.
export function readCandidateCursor(raw: string | undefined, scope: CandidateCursorScope): string | null {
  if (raw === undefined) return null;
  if (raw.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(raw)) throw new BadRequestException("후보 페이지 주소가 올바르지 않아요.");
  let value: unknown;
  try {
    const buffer = Buffer.from(raw, "base64url");
    if (buffer.toString("base64url") !== raw) throw new Error("non-canonical");
    value = JSON.parse(buffer.toString("utf8"));
  } catch { throw new BadRequestException("후보 페이지 주소가 올바르지 않아요."); }
  const cursor = parseHiring(cursorSchema, value);
  if (cursor.postId !== scope.postId || cursor.slotId !== scope.slotId || cursor.termsRevision !== scope.termsRevision || cursor.postVersion !== scope.postVersion) {
    throw new ConflictException("모집 조건이 변경되었거나 다른 모집의 페이지예요. 처음부터 다시 조회해 주세요.");
  }
  return cursor.after;
}
export function writeCandidateCursor(after: string, scope: CandidateCursorScope): string {
  return Buffer.from(JSON.stringify(parseHiring(cursorSchema, { v: 1, ...scope, after })), "utf8").toString("base64url");
}
