import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { studioWorldPublishSchema } from "@toonspectrum/studio-project-model";
import { StudioIdempotencyConflictError, StudioProjectForbiddenError, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { StudioWorldPublicationController, StudioWorldPublishDto } from "./studio-world-publication.controller";
import { StudioWorldPublicationConflictError, type StudioWorldPublicationRepository } from "./studio-world-publication.repository";
import { StudioWorldPublicationService } from "./studio-world-publication.service";

const body = studioWorldPublishSchema.parse({ expectedPublishedRevisionId: null, manifest: { id: "world", version: 1, width: 100, height: 100,
  backgroundAssetKey: "background", backgroundUrl: "/assets/test.png", rooms: [{ id: "room", x: 0, y: 0, width: 100, height: 100, labelKo: "방", labelEn: "Room" }],
  props: [], colliders: [], interactions: [], portals: [], spawns: [{ id: "spawn", point: { x: 10, y: 10 } }], npcs: [] } });
function setup() {
  const repository = { current: vi.fn().mockResolvedValue(null), publish: vi.fn().mockResolvedValue({ publication: null, replayed: false }) };
  const service = new StudioWorldPublicationService(repository as unknown as StudioWorldPublicationRepository);
  return { repository, service, controller: new StudioWorldPublicationController(service) };
}
describe("world publication endpoint boundary", () => {
  it("requires authenticated actor and validated retry key before forwarding", async () => {
    const f = setup(); expect(() => f.controller.current({ workId: "work" }, undefined)).toThrow();
    expect(() => f.controller.publish({ workId: "work" }, body, "short", "actor")).toThrow();
    expect(f.repository.current).not.toHaveBeenCalled(); expect(f.repository.publish).not.toHaveBeenCalled();
    await f.controller.publish({ workId: "work" }, body, " idempotency-123 ", " actor ");
    expect(f.repository.publish).toHaveBeenCalledWith("actor", "work", body, "idempotency-123");
  });
  it("uses the same strict manifest parser and private no-store responses", async () => {
    const f = setup(); expect(StudioWorldPublishDto.schema).toBe(studioWorldPublishSchema);
    expect(await f.controller.current({ workId: "work" }, "actor")).toEqual({ publication: null });
    for (const method of [f.controller.current, f.controller.publish]) {
      expect(Reflect.getMetadata("__headers__", method)).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "private, no-store, max-age=0" }]));
    }
  });
  it.each([
    [new StudioProjectNotFoundError("work"), 404], [new StudioProjectForbiddenError("manage"), 403],
    [new StudioWorldPublicationConflictError("current"), 409], [new StudioIdempotencyConflictError(), 409],
    [new StudioRepositoryInvariantError("world_publication_invalid", "Invalid publication"), 422],
  ] as const)("maps %s without downgrading failed authority", async (error, status) => {
    const f = setup(); f.repository.publish.mockRejectedValue(error);
    try { await f.service.publish("actor", "work", body, "idempotency-123"); throw new Error("expected rejection"); }
    catch (result) { expect(result).toBeInstanceOf(HttpException); expect((result as HttpException).getStatus()).toBe(status); }
  });
});
