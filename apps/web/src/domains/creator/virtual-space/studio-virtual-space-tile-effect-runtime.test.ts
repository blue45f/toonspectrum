import { describe, expect, it } from "vitest";

import { createOfficeZone } from "./studio-virtual-space-office-zones";
import { StudioTileEffectRuntimeTracker } from "./studio-virtual-space-tile-effect-runtime";
import {
  createTileEffect,
  type StudioTileEffectDefinition,
} from "./studio-virtual-space-tile-effects";
import {
  parseStudioTileEffects,
  readStudioTileEffects,
  writeStudioTileEffects,
} from "./studio-virtual-space-tile-effects-storage";

const TILE = 16;
const center = (tile: number) => tile * TILE + TILE / 2;

function effect(input: Parameters<typeof createTileEffect>[0]): StudioTileEffectDefinition {
  const result = createTileEffect(input, []);
  if (!result.ok) throw new Error("test effect must be valid");
  return result.effect;
}

const LOBBY = createOfficeZone({
  id: "zone-lobby",
  type: "lobby",
  labelKo: "로비",
  labelEn: "Lobby",
  shape: { kind: "rect", x: 0, y: 0, width: 320, height: 320 },
  rules: [],
})!;

describe("StudioTileEffectRuntimeTracker", () => {
  it("타일 진입 시 한 번만 트리거를 알리고, 머무는 동안은 반복하지 않는다", () => {
    const portal = effect({ kind: "portal", id: "p1", name: "포털", tileX: 2, tileY: 2, destinationRoom: "lobby", destinationTileX: 1, destinationTileY: 1 });
    const tracker = new StudioTileEffectRuntimeTracker({ effects: [portal], officeZones: [] });
    // 첫 판정은 기준선이라 알리지 않는다.
    expect(tracker.next({ x: center(0), y: center(0) }, { reducedMotion: false }).trigger).toBeNull();
    const entered = tracker.next({ x: center(2), y: center(2) }, { reducedMotion: false });
    expect(entered.trigger?.kind).toBe("portal");
    expect(entered.trigger?.effect.id).toBe("p1");
    expect(tracker.next({ x: center(2) + 2, y: center(2) }, { reducedMotion: false }).trigger).toBeNull();
    // 나갔다 다시 들어오면 다시 알린다.
    tracker.next({ x: center(0), y: center(0) }, { reducedMotion: false });
    expect(tracker.next({ x: center(2), y: center(2) }, { reducedMotion: false }).trigger?.effect.id).toBe("p1");
  });

  it("오피스 존 진입 시에만 파티클 스펙을 돌려주고, reduced motion이면 끈다", () => {
    const tracker = new StudioTileEffectRuntimeTracker({ effects: [], officeZones: [LOBBY] });
    tracker.next({ x: 900, y: 900 }, { reducedMotion: false });
    const entered = tracker.next({ x: 100, y: 100 }, { reducedMotion: false });
    expect(entered.zoneEntryParticle?.shape).toBe("sparkle");
    expect(tracker.next({ x: 120, y: 120 }, { reducedMotion: false }).zoneEntryParticle).toBeNull();

    const reduced = new StudioTileEffectRuntimeTracker({ effects: [], officeZones: [LOBBY] });
    reduced.next({ x: 900, y: 900 }, { reducedMotion: true });
    expect(reduced.next({ x: 100, y: 100 }, { reducedMotion: true }).zoneEntryParticle).toBeNull();
  });

  it("reset 후 첫 판정은 새 기준선이라 발동하지 않는다", () => {
    const portal = effect({ kind: "portal", id: "p1", name: "포털", tileX: 2, tileY: 2, destinationRoom: "lobby", destinationTileX: 1, destinationTileY: 1 });
    const tracker = new StudioTileEffectRuntimeTracker({ effects: [portal], officeZones: [] });
    tracker.next({ x: center(0), y: center(0) }, { reducedMotion: false });
    expect(tracker.next({ x: center(2), y: center(2) }, { reducedMotion: false }).trigger).not.toBeNull();
    tracker.reset();
    expect(tracker.next({ x: center(2), y: center(2) }, { reducedMotion: false }).trigger).toBeNull();
  });
});

describe("tile-effects-storage", () => {
  it("쓰고 읽으면 같은 목록이 돌아오고, 깨진 항목은 버려진다", () => {
    const portal = effect({ kind: "portal", id: "p1", name: "포털", tileX: 2, tileY: 2, destinationRoom: "lobby", destinationTileX: 1, destinationTileY: 1 });
    const store = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
    });
    try {
      expect(writeStudioTileEffects([portal], "scope-a")).toBe(true);
      expect(readStudioTileEffects("scope-a").map((item) => item.id)).toEqual(["p1"]);
      expect(readStudioTileEffects("scope-b")).toEqual([]);
      expect(parseStudioTileEffects("not-json")).toEqual([]);
      expect(parseStudioTileEffects(JSON.stringify([{ kind: "portal" }, { kind: "nope" }]))).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
    }
  });
});
