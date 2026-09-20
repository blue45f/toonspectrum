import "reflect-metadata";
import { HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { CreatorMeetingController } from "../meeting/meeting.controller";
import { CreatorCareerController } from "../recruitment/career.controller";
import { CreatorTeamController } from "../recruitment/team.controller";
import { CollaborationModule } from "./collaboration.module";
import { HiringCampaignController } from "./hiring-campaign.controller";
import { HiringMatchingController } from "./hiring-matching.controller";
import { HiringPositionController, HiringPositionRepository } from "./hiring-position.controller";
import { HiringSlotController } from "./hiring-slot.controller";
import { HiringController } from "./hiring.controller";
import { HiringStore } from "./hiring.store";

import type { Pool } from "pg";

describe("registered hiring HTTP surface without binding a socket", () => {
  it("constructs the actual Nest module and rejects missing verified actors", async () => {
    const app = await NestFactory.createApplicationContext(CollaborationModule, { logger: false, abortOnError: false });
    try {
      expect(() => app.get(HiringController).list()).toThrow();
      expect(() => app.get(CreatorTeamController).list()).toThrow();
      expect(() => app.get(CreatorMeetingController).list()).toThrow();
      expect(app.get(HiringPositionController)).toBeInstanceOf(HiringPositionController);
    } finally { await app.close(); }
  });
  it("marks every new controller response no-store, including gallery and public positions", () => {
    for (const controller of [HiringController, HiringSlotController, HiringMatchingController, HiringCampaignController, HiringPositionController, CreatorTeamController, CreatorCareerController, CreatorMeetingController]) {
      const proto = controller.prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const method = Object.getOwnPropertyDescriptor(proto, name)?.value;
        if (typeof method !== "function" || Reflect.getMetadata(PATH_METADATA, method) === undefined) continue;
        const headers = Reflect.getMetadata(HEADERS_METADATA, method) as { name: string; value: string }[];
        expect(headers.some((h) => h.name.toLowerCase() === "cache-control" && h.value.includes("no-store"))).toBe(true);
      }
    }
  });
  it("strictly bounds public filters and projects no private post/application fields", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [{ id: "slot", post_id: "post", title: "공고", revision: 2, terms: { role: "lineart" }, user_id: "private", contact: "private", details: { project: "private" } }] }));
    const store = new HiringStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);
    const controller = new HiringPositionController(new HiringPositionRepository(store));
    for (const input of [{ role: "unknown" }, { userId: "forged" }, { tool: ["Photoshop"] }, { after: "sql payload" }, { limit: 100000 }]) expect(() => controller.list(input)).toThrow();
    const page = await controller.list({ role: "lineart", compensation: "paid" });
    expect(page.items[0]).toEqual({ id: "slot", postId: "post", postTitle: "공고", revision: 2, terms: { role: "lineart" } });
  });
});
