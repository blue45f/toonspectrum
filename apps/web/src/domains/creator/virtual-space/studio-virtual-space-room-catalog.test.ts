import { describe, expect, it } from "vitest";

import {
  STUDIO_SPACE_MODULES,
  validateStudioSpaceModules,
  type StudioSpaceModule,
} from "./studio-virtual-space-room-catalog";

describe("virtual studio room catalog", () => {
  it("publishes unique, safe and bounded room modules", () => {
    expect(validateStudioSpaceModules()).toEqual([]);
    expect(new Set(STUDIO_SPACE_MODULES.map((module) => module.id)).size)
      .toBe(STUDIO_SPACE_MODULES.length);
    expect(STUDIO_SPACE_MODULES.map((module) => module.id)).toEqual(expect.arrayContaining([
      "p2p-huddle",
      "p2p-whiteboard",
      "interview-waiting",
      "interview-room",
      "quiet-lounge",
      "tarot-table",
      "saju-room",
      "arcade",
    ]));
  });

  it("rejects token-bearing routes and public interview rooms", () => {
    const unsafe: StudioSpaceModule[] = [
      {
        id: "public-interview",
        category: "interview",
        labelKo: "면접",
        labelEn: "Interview",
        descriptionKo: "unsafe",
        descriptionEn: "unsafe",
        privacy: "public",
        transport: "none",
        capacity: null,
        requiresProject: false,
        entry: { type: "route", href: "/collaborate?invite=secret" },
      },
    ];
    expect(validateStudioSpaceModules(unsafe)).toEqual([
      "unsafe module route: public-interview",
      "public interview module: public-interview",
    ]);
  });

  it("requires a real bounded capacity for direct P2P modules", () => {
    const invalid: StudioSpaceModule = {
      ...STUDIO_SPACE_MODULES[0]!,
      id: "bad-p2p-room",
      capacity: 25,
    };
    expect(validateStudioSpaceModules([invalid]))
      .toEqual(["invalid P2P capacity: bad-p2p-room"]);
  });
});
