import { describe, expect, it, vi } from "vitest";
import { candidateQuerySchema, readCandidateCursor, writeCandidateCursor } from "./hiring-candidate-cursor";
import { HiringMatchingController } from "./hiring-matching.controller";
import { parseHiring } from "./hiring.validation";
import type { HiringAvailabilityRepository } from "./hiring-availability.repository";

const scope = { postId: "11111111-1111-4111-8111-111111111111", slotId: "22222222-2222-4222-8222-222222222222", termsRevision: 3, postVersion: 5 };
describe("live candidate cursor contract", () => {
  it("roundtrips a position without granting authority or changing the result limit", () => {
    const cursor = writeCandidateCursor("artist_030", scope);
    expect(readCandidateCursor(cursor, scope)).toBe("artist_030");
    expect(readCandidateCursor(undefined, scope)).toBeNull();
    expect(parseHiring(candidateQuerySchema, { after: cursor, expectedRevision: "3" })).toEqual({ after: cursor, expectedRevision: 3 });
  });
  it.each([{ slotId: "other" }, { postId: "other" }, { termsRevision: 4 }, { postVersion: 6 }])("rejects different scope or edited conditions %j", (delta) => {
    expect(() => readCandidateCursor(writeCandidateCursor("artist", scope), { ...scope, ...delta })).toThrow(/처음부터/u);
  });
  it.each(["", "%%", "a".repeat(2049), Buffer.from("not json").toString("base64url"), Buffer.from('{"v":2}').toString("base64url")])("rejects malformed cursor %s", (raw) => {
    expect(() => readCandidateCursor(raw, scope)).toThrow();
  });
  it.each([{ after: ["abc"] }, { expectedRevision: [3] }, { expectedRevision: "0" }, { expectedRevision: "-1" }, { expectedRevision: "1e2" }, { expectedRevision: "9999999999" }, { limit: 10000 }, { actor: "forged" }])("rejects unsupported query fields or coercions %j", (input) => {
    expect(() => parseHiring(candidateQuerySchema, input)).toThrow();
  });
  it("validates the HTTP query and never accepts a claimed owner in the payload", async () => {
    const discover = vi.fn(async () => ({ items: [] }));
    const controller = new HiringMatchingController({ discover } as unknown as HiringAvailabilityRepository);
    expect(() => controller.discover(scope.postId, scope.slotId, undefined, {})).toThrow();
    expect(() => controller.discover(scope.postId, scope.slotId, "owner", { limit: 1000 })).toThrow();
    await controller.discover(scope.postId, scope.slotId, "owner", { expectedRevision: "3" });
    expect(discover).toHaveBeenCalledExactlyOnceWith("owner", scope.postId, scope.slotId, { expectedRevision: 3 });
  });
});
