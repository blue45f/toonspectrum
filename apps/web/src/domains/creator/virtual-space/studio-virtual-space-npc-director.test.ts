import { describe, expect, it } from "vitest";
import {
  StudioNpcDirector,
  studioNpcInteraction,
  studioNpcLabel,
  studioNpcRole,
  type StudioNpcEnvironment,
} from "./studio-virtual-space-npc-director";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldNpcDefinition,
} from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

const npc: StudioWorldNpcDefinition = {
  id: "test-writer", skinKey: "npc-editor", roomId: "writers", point: { x: 55, y: 90 },
  facing: "right", speed: 62, behavior: "patrol", patrol: [{ x: 205, y: 90 }, { x: 200, y: 180 }],
};
const fixture = (npcs: readonly StudioWorldNpcDefinition[] = [npc]): StudioVirtualSpaceWorldManifest => ({
  ...DEFAULT_STUDIO_WORLD_MANIFEST,
  width: 280, height: 230, colliders: [{ x: 113, y: 45, width: 38, height: 110 }],
  props: [], rooms: [{ id: "writers", labelKo: "작가실", labelEn: "Writers", x: 0, y: 0, width: 280, height: 230 }],
  interactions: [], spawns: [{ id: "main", point: { x: 45, y: 190 } }], npcs,
});
const balanced: StudioNpcEnvironment = { people: [], atmosphere: "balanced" };
const run = (director: StudioNpcDirector, seconds: number, environment = balanced, hz = 60) => {
  for (let index = 0; index < seconds * hz; index++) director.advance(1 / hz, environment);
  return director.views;
};

describe("living studio NPC director", () => {
  it("registers the expanded collision-valid role cast connected only to real tool interactions", () => {
    expect(validateStudioWorldManifest(DEFAULT_STUDIO_WORLD_MANIFEST)).toEqual([]);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.map(studioNpcRole)).toEqual([
      "guide", "producer", "editor", "artist", "librarian", "cafe", "security", "host",
    ]);
    expect(new Set(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.map((actor) => actor.skinKey)).size)
      .toBe(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.length);
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.npcs.map((actor) => studioNpcInteraction(DEFAULT_STUDIO_WORLD_MANIFEST, actor)?.action))
      .toEqual(["assistant", "assistant", "review", "canvas", "assets", "community", "live", "live"]);
    for (const actor of DEFAULT_STUDIO_WORLD_MANIFEST.npcs) expect(studioNpcLabel(actor).en).toMatch(/^NPC · /u);
    expect(studioNpcInteraction(fixture(), npc)).toBeNull();
  });

  it("walks around furniture into varied work, observation and rest phases without tunnelling", () => {
    const manifest = fixture();
    const director = new StudioNpcDirector(manifest);
    const phases = new Set<string>();
    const reached = new Set<number>();
    let walkedAroundDesk = false;
    for (let index = 0; index < 180 * 60; index++) {
      const view = director.advance(1 / 60, balanced)[0]!;
      expect(studioWorldCanOccupy(manifest, view.point)).toBe(true);
      phases.add(view.phase);
      if (view.point.x > 100 && view.point.x < 165 && (view.point.y > 160 || view.point.y < 36)) walkedAroundDesk = true;
      [npc.point, ...npc.patrol!].forEach((anchor, anchorIndex) => {
        if (Math.hypot(view.point.x - anchor.x, view.point.y - anchor.y) < 4) reached.add(anchorIndex);
      });
    }
    expect(walkedAroundDesk).toBe(true);
    expect(phases).toEqual(new Set(["work", "walk", "inspect", "rest"]));
    expect(reached.size).toBe(3);
  });

  it("uses deterministic fixed-step routines across 30, 60 and 120 Hz render rates", () => {
    const outputs = [30, 60, 120].map((hz) => run(new StudioNpcDirector(fixture()), 52, balanced, hz)[0]!);
    for (const result of outputs.slice(1)) {
      expect(result.point.x).toBeCloseTo(outputs[0]!.point.x, 7);
      expect(result.point.y).toBeCloseTo(outputs[0]!.point.y, 7);
      expect(result.phase).toBe(outputs[0]!.phase);
      expect(result.distance).toBeCloseTo(outputs[0]!.distance, 7);
    }
  });

  it("steps aside for a player's predicted route before starting its own routine", () => {
    const definition = { ...npc, point: { x: 80, y: 100 }, patrol: [] };
    const director = new StudioNpcDirector(fixture([definition]));
    const player = { id: "real-person", point: { x: 80, y: 130 }, velocity: { x: 0, y: -62 } };
    const view = run(director, 1.5, { ...balanced, people: [player] })[0]!;
    expect(["yield", "rest"]).toContain(view.phase);
    expect(Math.abs(view.point.x - player.point.x)).toBeGreaterThan(20);
    expect(Math.hypot(view.point.x - player.point.x, view.point.y - player.point.y)).toBeGreaterThan(32);
    expect(studioWorldCanOccupy(fixture(), view.point)).toBe(true);
  });

  it("waits when a person occupies an anchor and does not walk through them", () => {
    const definition = { ...npc, point: { x: 45, y: 180 }, patrol: [{ x: 200, y: 180 }] };
    const director = new StudioNpcDirector(fixture([definition]));
    const environment = { ...balanced, people: [{ id: "person-at-workstation", point: { x: 200, y: 180 }, focused: true }] };
    const [view] = run(director, 45, environment);
    expect(view!.point).toEqual(definition.point);
    expect(view!.moving).toBe(false);
  });

  it("keeps quiet settings still and cancels a current walk without teleporting", () => {
    for (const environment of [{ ...balanced, atmosphere: "focus" as const }, { ...balanced, reducedMotion: true }]) {
      const quietDirector = new StudioNpcDirector(fixture());
      expect(run(quietDirector, 90, environment)[0]!.point).toEqual(npc.point);
      const activeDirector = new StudioNpcDirector(fixture());
      let active = activeDirector.views[0]!;
      for (let i = 0; i < 30 * 60 && !active.moving; i++) active = activeDirector.advance(1 / 60, balanced)[0]!;
      expect(active.moving).toBe(true);
      const paused = run(activeDirector, 1, environment)[0]!;
      expect(Math.hypot(paused.point.x - active.point.x, paused.point.y - active.point.y)).toBeLessThan(2);
      expect(paused.moving).toBe(false);
      expect(paused.greeting).toBe(false);
    }
  });

  it("can still yield to a real person in focus mode while suppressing greetings", () => {
    const definition = { ...npc, point: { x: 80, y: 100 }, patrol: [] };
    const director = new StudioNpcDirector(fixture([definition]));
    const view = run(director, 2, { atmosphere: "focus", people: [{ id: "person", point: { x: 80, y: 130 } }] })[0]!;
    expect(Math.hypot(view.point.x - 80, view.point.y - 130)).toBeGreaterThan(50);
    expect(view.greeting).toBe(false);
  });

  it("uses per-person greeting cooldowns, global spacing, and respects focused people", () => {
    const definition = { ...npc, point: { x: 50, y: 100 }, patrol: [] };
    const environment = { ...balanced, people: [{ id: "alice", point: { x: 50, y: 160 } }] };
    const director = new StudioNpcDirector(fixture([definition]));
    let transitions = 0, greeting = false;
    for (let i = 0; i < 35 * 60; i++) {
      const view = director.advance(1 / 60, environment)[0]!;
      if (view.greeting && !greeting) transitions++;
      greeting = view.greeting;
    }
    expect(transitions).toBe(1);
    const differentPerson = { ...balanced, people: [{ ...environment.people[0]!, id: "bob" }] };
    expect(run(director, 1, differentPerson)[0]!.greeting).toBe(true);
    expect(run(director, 0.1, { ...differentPerson, focused: true })[0]!.greeting).toBe(false);
    const focusedDirector = new StudioNpcDirector(fixture([definition]));
    const focusedPerson = { ...balanced, people: [{ ...environment.people[0]!, focused: true }] };
    for (let i = 0; i < 10 * 60; i++) expect(focusedDirector.advance(1 / 60, focusedPerson)[0]!.greeting).toBe(false);
  });

  it("bounds ambient movers and staggered decisions over twenty simulated minutes", () => {
    const director = new StudioNpcDirector(DEFAULT_STUDIO_WORLD_MANIFEST);
    let maxMoving = 0;
    const traveled = new Map<string, number>();
    const stepSeconds = 1 / 20;
    const iterations = Math.round(20 * 60 / stepSeconds);
    for (let i = 0; i < iterations; i++) {
      const views = director.advance(stepSeconds, balanced);
      maxMoving = Math.max(maxMoving, views.filter((view) => view.moving).length);
      for (const view of views) {
        if (i % 20 === 0) expect(studioWorldCanOccupy(DEFAULT_STUDIO_WORLD_MANIFEST, view.point)).toBe(true);
        traveled.set(view.id, view.distance);
      }
    }
    expect(maxMoving).toBeLessThanOrEqual(2);
    expect(maxMoving).toBeGreaterThan(0);
    expect([...traveled.values()].every((value) => value > 400)).toBe(true);
  }, 60_000);

  it("omits invalid spawns and bounds tab-resume catch-up without teleportation", () => {
    const blocked = { ...npc, point: { x: 130, y: 90 } };
    expect(new StudioNpcDirector(fixture([blocked])).views).toEqual([]);
    const director = new StudioNpcDirector(fixture());
    const before = run(director, 15)[0]!;
    const after = director.advance(120, balanced)[0]!;
    expect(Math.hypot(after.point.x - before.point.x, after.point.y - before.point.y)).toBeLessThan(5);
  });
});
