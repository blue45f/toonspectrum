import { describe, expect, it } from "vitest";

import {
  STUDIO_SPACE_MODULES,
  STUDIO_THEME_ROOM_TEMPLATES,
  validateStudioSpaceModules,
  validateStudioThemeRoomTemplates,
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

  it("publishes the three theme-space template modules", () => {
    const templates = STUDIO_SPACE_MODULES.filter((module) => module.entry.type === "template");
    expect(templates.map((module) => module.id).sort()).toEqual([
      "theme-gallery",
      "theme-recording-booth",
      "theme-storyboard-room",
    ]);
    for (const module of templates) {
      expect(module.entry.type).toBe("template");
      expect(module.requiresProject).toBe(true);
    }
    expect(validateStudioSpaceModules()).toEqual([]);
  });

  it("rejects template entries that reference an unknown theme kind", () => {
    const invalid: StudioSpaceModule = {
      ...STUDIO_SPACE_MODULES.find((module) => module.id === "theme-gallery")!,
      id: "bad-theme-entry",
      entry: { type: "template", template: "unknown-room" as never },
    };
    expect(validateStudioSpaceModules([invalid])).toEqual(["unknown template entry: bad-theme-entry"]);
  });

  it("publishes valid theme room templates with furniture, decor and acoustic zones", () => {
    expect(validateStudioThemeRoomTemplates()).toEqual([]);
    expect(STUDIO_THEME_ROOM_TEMPLATES.map((template) => template.kind).sort()).toEqual([
      "gallery",
      "recording-booth",
      "storyboard-room",
    ]);
    const booth = STUDIO_THEME_ROOM_TEMPLATES.find((template) => template.kind === "recording-booth")!;
    expect(booth.acoustic.policy).toBe("private");
    expect(booth.acoustic.doorId).toBe("recording-booth-door");
    expect(booth.furniture.find((prop) => prop.id === "booth-script-stand")?.action).toBe("story");
    const storyboard = STUDIO_THEME_ROOM_TEMPLATES.find((template) => template.kind === "storyboard-room")!;
    expect(storyboard.furniture.find((prop) => prop.id === "storyboard-review-board")?.action).toBe("review");
    expect(storyboard.seats).toHaveLength(4);
    const gallery = STUDIO_THEME_ROOM_TEMPLATES.find((template) => template.kind === "gallery")!;
    expect(gallery.furniture.filter((prop) => prop.action === "comic")).toHaveLength(6);
    expect(gallery.furniture.filter((prop) => prop.kind === "decor" && prop.depth === "foreground")).toHaveLength(6);
    expect(gallery.npc?.patrol).toHaveLength(4);
  });
});
