import { describe, expect, it } from "vitest";
import { StudioNpcDirector, studioNpcMotionBudget, type StudioNpcEnvironment } from "./studio-virtual-space-npc-director";
import { StudioNpcActivityReservations, type StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldManifestToTiledMap, parseStudioWorldAuthoringImport } from "./studio-virtual-space-world-authoring";
import { studioWorldManifestFromTiled, type StudioTiledMapLike } from "./studio-virtual-space-tiled-adapter";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

const anchor: StudioWorldNpcActivityAnchor = { id: "local-chair", roomId: "lounge", approachPoint: { x: 140, y: 120 },
  anchorPoint: { x: 166, y: 120 }, exitPoint: { x: 198, y: 120 }, seatAttachmentPoint: { x: 166, y: 80 },
  facing: "up", activity: "rest", animation: "sit", minDurationMs: 2500, maxDurationMs: 2500 };
function fixture(): StudioVirtualSpaceWorldManifest {
  return { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 360, height: 260, props: [], colliders: [], portals: [],
    rooms: [{ id: "lounge", labelKo: "라운지", labelEn: "Lounge", x: 0, y: 0, width: 360, height: 260 }],
    spawns: [{ id: "main", point: { x: 40, y: 220 } }], interactionSlots: [], occlusionLayers: [], acousticZones: [],
    interactions: [{ id: "story", zoneId: "lounge", action: "story", point: { x: 260, y: 90 }, radius: 45, labelKo: "대본", labelEn: "Story" },
      { id: "canvas", zoneId: "lounge", action: "canvas", point: { x: 270, y: 210 }, radius: 45, labelKo: "그림", labelEn: "Canvas" }],
    npcActivityAnchors: [anchor],
    npcs: [{ id: "guide", skinKey: "dark", roomId: "lounge", point: { x: 60, y: 120 }, speed: 62, activityAnchorIds: [anchor.id] }] };
}
const balanced: StudioNpcEnvironment = { atmosphere: "balanced", people: [] };
const advance = (director: StudioNpcDirector, seconds: number, env = balanced) => {
  for (let i = 0; i < seconds * 60; i++) director.advance(1 / 60, env);
  return director.views[0]!;
};

describe("authored NPC activities", () => {
  it("performs pink drawing on each authored facing before restoring exit walking", () => {
    for (const facing of ["down", "left", "right", "up"] as const) {
      const m = fixture();
      const drawing = { ...anchor, facing, activity: "work" as const, animation: "draw" as const, seatAttachmentPoint: undefined };
      const world = { ...m, npcActivityAnchors: [drawing], npcs: [{ ...m.npcs[0]!, skinKey: "pink" }] };
      expect(validateStudioWorldManifest(world)).toEqual([]);
      const director = new StudioNpcDirector(world);
      let performed = false, exited = false;
      for (let frame = 0; frame < 20 * 60; frame++) {
        const [view] = director.advance(1 / 60, balanced);
        if (view!.activityStage === "perform") {
          performed = true; expect(view!.animation).toBe("draw"); expect(view!.facing).toBe(facing);
          expect(view!.moving).toBe(false); expect(view!.seatAttachmentPoint).toBeUndefined();
        }
        if (performed && view!.activityStage === "exit" && view!.moving) {
          exited = true; expect(view!.animation).toBe("walk"); break;
        }
      }
      expect(performed).toBe(true); expect(exited).toBe(true); director.dispose();
    }
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcActivityAnchors!.find((activity) => activity.id === "studio-artist-0")?.animation).toBe("draw");
  });
  it("performs silver's real review action in every authored direction and returns to floor movement on exit", () => {
    for (const facing of ["down", "left", "right", "up"] as const) {
      const m = fixture();
      const review = { ...anchor, facing, activity: "inspect" as const, animation: "review" as const, seatAttachmentPoint: undefined };
      const world = { ...m, npcActivityAnchors: [review], npcs: [{ ...m.npcs[0]!, skinKey: "silver" }] };
      expect(validateStudioWorldManifest(world)).toEqual([]);
      const director = new StudioNpcDirector(world);
      let performed = false, exited = false;
      for (let frame = 0; frame < 20 * 60; frame++) {
        const [view] = director.advance(1 / 60, balanced);
        if (view!.activityStage === "perform") {
          performed = true;
          expect(view!.animation).toBe("review"); expect(view!.facing).toBe(facing);
          expect(view!.moving).toBe(false); expect(view!.seatAttachmentPoint).toBeUndefined();
        }
        if (performed && view!.activityStage === "exit" && view!.moving) {
          exited = true; expect(view!.animation).toBe("walk"); break;
        }
      }
      expect(performed).toBe(true); expect(exited).toBe(true); director.dispose();
    }
    const writer = DEFAULT_STUDIO_WORLD_MANIFEST.npcActivityAnchors!.filter((activity) => activity.id.startsWith("studio-writer-"));
    expect(writer.map((activity) => activity.animation)).toEqual(["review", "review", "idle"]);
  });
  it("validates real floor reachability, durations, furniture attachment and available skin clips", () => {
    const m = fixture(); expect(validateStudioWorldManifest(m)).toEqual([]);
    for (const changed of [
      { ...anchor, approachPoint: { x: -2, y: 120 } }, { ...anchor, minDurationMs: 0 },
      { ...anchor, seatAttachmentPoint: undefined }, { ...anchor, seatAttachmentPoint: { x: 900, y: 80 } },
      { ...anchor, roomId: "missing" }, { ...anchor, script: "alert(1)" },
    ]) expect(validateStudioWorldManifest({ ...m, npcActivityAnchors: [changed] }).length).toBeGreaterThan(0);
    expect(validateStudioWorldManifest({ ...m, npcActivityAnchors: [anchor, anchor] })).toContain("NPC activity anchor id is invalid or duplicate: local-chair");
    expect(validateStudioWorldManifest({ ...m, npcActivityAnchors: [{ ...anchor, animation: "draw", seatAttachmentPoint: undefined }] }))
      .toContain("npc activity clip is unavailable: guide/local-chair");
    expect(validateStudioWorldManifest({ ...m, colliders: [{ x: 153, y: 0, width: 3, height: 260 }] }).some((error) => error.includes("unreachable"))).toBe(true);
  });

  it("keeps local decorative reservations separate from human shared seats", () => {
    const m = fixture();
    expect(validateStudioWorldManifest({ ...m, interactionSlots: [{ id: "human", roomId: "lounge", labelKo: "좌석", labelEn: "Seat",
      approachPoint: anchor.approachPoint, anchorPoint: anchor.anchorPoint, exitPoint: anchor.exitPoint, facing: "up", radius: 9 }] }))
      .toContain("NPC activity overlaps a human shared seat: local-chair");
    const a = new StudioNpcActivityReservations(), b = new StudioNpcActivityReservations();
    expect(a.reserve(anchor, "a", [], 0)).toBe(true);
    expect(a.reserve(anchor, "b", [], 100)).toBe(false);
    expect(b.reserve(anchor, "b", [], 100)).toBe(true);
    expect(a.reserve(anchor, "b", [], 30001)).toBe(true);
    a.release("b"); expect(a.size).toBe(0);
    expect(a.reserve(anchor, "a", [{ point: anchor.approachPoint }], 40000)).toBe(false);
  });

  it("roundtrips anchor references and relative attachment geometry through Tiled groups", () => {
    const m = fixture(), tiled = studioWorldManifestToTiledMap(m) as unknown as StudioTiledMapLike;
    const imported = parseStudioWorldAuthoringImport(JSON.stringify(tiled), m);
    expect(imported.npcActivityAnchors).toEqual(m.npcActivityAnchors);
    expect(imported.npcs[0]?.activityAnchorIds).toEqual([anchor.id]);
    const activity = tiled.layers!.find((layer) => layer.name === "npc-activity-anchors")!;
    const shifted = studioWorldManifestFromTiled({ ...tiled, layers: [{ type: "group", name: "moved", offsetx: 8, offsety: 12, layers: [activity] }] }, m);
    expect(shifted.npcActivityAnchors?.[0]?.anchorPoint).toEqual({ x: 174, y: 132 });
    expect(shifted.npcActivityAnchors?.[0]?.seatAttachmentPoint).toEqual({ x: 174, y: 92 });
    expect(studioWorldManifestFromTiled({ ...tiled, layers: [{ ...activity, visible: false }] }, m).npcActivityAnchors).toEqual([]);
    expect(studioWorldManifestFromTiled({ ...tiled, layers: [] }, m).npcActivityAnchors).toEqual([]);
  });

  it("approaches, aligns, performs a real sit pose at separate visual hips and exits on the floor", () => {
    const m = fixture(), director = new StudioNpcDirector(m), stages = new Set<string>();
    let sitting = false, exited = false;
    for (let i = 0; i < 18 * 60; i++) {
      const view = director.advance(1 / 60, balanced)[0]!;
      if (view.activityStage) stages.add(view.activityStage);
      expect(studioWorldCanOccupy(m, view.point)).toBe(true);
      if (view.activityStage === "perform") {
        sitting = true; expect(view.animation).toBe("sit"); expect(view.facing).toBe("up"); expect(view.moving).toBe(false);
        expect(view.seatAttachmentPoint).toEqual(anchor.seatAttachmentPoint);
        expect(Math.hypot(view.point.x - anchor.anchorPoint.x, view.point.y - anchor.anchorPoint.y)).toBeLessThan(3);
      } else expect(view.seatAttachmentPoint).toBeUndefined();
      if (sitting && !view.activityStage && view.point.x > 195) exited = true;
    }
    expect(stages).toEqual(new Set(["approach", "align", "perform", "exit"])); expect(exited).toBe(true);
  });

  it("reserves each local activity once, releases immediately for a person and clears on disposal", () => {
    const m = fixture();
    const director = new StudioNpcDirector({ ...m, npcs: [m.npcs[0]!, { ...m.npcs[0]!, id: "other", point: { x: 280, y: 120 } }] });
    let performer: string | undefined;
    for (let i = 0; i < 8 * 60; i++) {
      const views = director.advance(1 / 60, balanced);
      expect(views.filter((view) => view.activityAnchorId === anchor.id).length).toBeLessThanOrEqual(1);
      performer ??= views.find((view) => view.activityStage === "perform")?.id;
    }
    expect(performer).toBeDefined();
    const occupied = director.advance(1 / 60, { ...balanced, people: [{ id: "human", point: anchor.anchorPoint }] });
    expect(occupied.every((view) => !view.seatAttachmentPoint && !view.activityAnchorId)).toBe(true);
    director.dispose(); const stopped = director.views; advance(director, 10);
    expect(director.views).toEqual(stopped);
  });

  it("stops offscreen work and reduces only ambient motion for crowd, mobile, focus and reduced motion", () => {
    expect(studioNpcMotionBudget({ ...balanced, mobile: true })).toEqual({ movers: 1, routines: 1 });
    expect(studioNpcMotionBudget({ ...balanced, people: Array.from({ length: 16 }, (_, id) => ({ id: String(id), point: { x: 0, y: 0 } })) })).toEqual({ movers: 2, routines: 0 });
    for (const env of [{ ...balanced, atmosphere: "focus" as const }, { ...balanced, reducedMotion: true },
      { ...balanced, viewport: { x: 800, y: 800, width: 100, height: 100 } }]) {
      const director = new StudioNpcDirector(fixture()); expect(advance(director, 30, env).point).toEqual(fixture().npcs[0]!.point);
      expect(director.views[0]!.activityAnchorId).toBeUndefined();
    }
  });

  it("keeps authored anchors collision-safe and exclusive through twenty simulated minutes with eight people", () => {
    const m = DEFAULT_STUDIO_WORLD_MANIFEST, director = new StudioNpcDirector(m);
    const completed = new Set<string>(), previousStage = new Map<string, string | null>();
    for (let frame = 0; frame < 1200 * 30; frame++) {
      const cycle = Math.floor(frame / 900), busy = frame % 900 < 240;
      const contested = m.npcActivityAnchors![cycle % m.npcActivityAnchors!.length]!;
      const people = Array.from({ length: 8 }, (_, index) => ({ id: `person-${index}`, focused: true,
        point: busy && index === 0 ? contested.anchorPoint : { x: 410 + index * 3, y: 745 } }));
      const views = director.advance(1 / 30, { ...balanced, people });
      expect(views.filter((view) => view.moving).length).toBeLessThanOrEqual(2);
      const claimed = views.map((view) => view.activityAnchorId).filter(Boolean);
      expect(new Set(claimed).size).toBe(claimed.length);
      for (const view of views) {
        if (frame % 30 === 0) expect(studioWorldCanOccupy(m, view.point)).toBe(true);
        if (previousStage.get(view.id) === "exit" && view.activityStage === null) completed.add(view.id);
        previousStage.set(view.id, view.activityStage);
      }
    }
    expect(completed.size).toBe(4);
    expect(director.views.every((view) => view.distance > 250)).toBe(true);
  });
});

describe("explicit guide tour", () => {
  it("never starts itself, waits for its user, visits existing stops and never moves the user", () => {
    const m = fixture(), director = new StudioNpcDirector(m);
    expect(director.guideTourState).toBeNull();
    director.startGuideTour({ id: "requested", guideId: "guide" }, "human");
    const far = { id: "human", point: { x: 320, y: 240 } };
    expect(advance(director, 2, { ...balanced, people: [far] }).point).toEqual(m.npcs[0]!.point);
    expect(director.guideTourState?.status).toBe("waiting-for-user");
    const statuses = new Set<string>(), actions = new Set<string>();
    for (let i = 0; i < 30 * 60; i++) {
      const guide = director.views[0]!;
      const person = { id: "human", point: { x: guide.point.x - 60, y: guide.point.y } };
      director.advance(1 / 60, { ...balanced, people: [person] });
      statuses.add(director.guideTourState!.status); actions.add(director.guideTourState!.stopAction!);
      if (director.guideTourState?.status === "complete") break;
    }
    expect(statuses.has("walking")).toBe(true); expect(statuses.has("at-stop")).toBe(true);
    expect(director.guideTourState?.status).toBe("complete"); expect(actions).toEqual(new Set(["story", "canvas"]));
    expect(far.point).toEqual({ x: 320, y: 240 });
  });

  it("stops on explicit cancel, focus, reduced motion, missing user and scene teardown without replay", () => {
    for (const reason of ["explicit", "focus", "reduced", "missing", "dispose"] as const) {
      const director = new StudioNpcDirector(fixture()), request = { id: "one", guideId: "guide" };
      director.startGuideTour(request, "human");
      const people = [{ id: "human", point: { x: 60, y: 180 } }];
      advance(director, .3, { ...balanced, people });
      if (reason === "explicit") director.cancelGuideTour();
      if (reason === "dispose") director.dispose();
      director.advance(1 / 60, { ...balanced, people: reason === "missing" ? [] : people,
        focused: reason === "focus", reducedMotion: reason === "reduced" });
      expect(director.guideTourState?.status).toBe("cancelled");
      director.startGuideTour(request, "human"); expect(director.guideTourState?.status).toBe("cancelled");
    }
  });
});
