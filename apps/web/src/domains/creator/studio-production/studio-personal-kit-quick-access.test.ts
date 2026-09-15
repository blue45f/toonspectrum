import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_QUICK_ACCESS_STATE,
  configureStudioQuickAccessView,
  createStudioQuickAccessSet,
} from "../studio-quick-access";
import {
  readStudioQuickAccessPersonalKit,
  studioQuickAccessStatesEqual,
  withStudioQuickAccessPersonalKit,
} from "./studio-personal-kit-quick-access";

import type { StudioPersonalKitDocument } from "./studio-production-server-client";

const NOW = new Date("2026-09-15T00:00:00.000Z");

function document(): StudioPersonalKitDocument {
  return {
    schemaVersion: 1,
    updatedAt: "2026-09-14T00:00:00.000Z",
    workspaceProfiles: [{ id: "focus", density: "focus" }],
    quickAccess: {},
    gestureMap: { twoFingerTap: "undo" },
    penButtonMap: { primary: "radial-menu" },
    touchPolicy: "pen-draw-touch-pan",
    favoriteRefs: ["brush:ink"],
  };
}
describe("Studio Quick Access Personal Kit", () => {
  it("round-trips canonical quick access without replacing unrelated preferences", () => {
    const state = configureStudioQuickAccessView(
      createStudioQuickAccessSet(
        DEFAULT_STUDIO_QUICK_ACCESS_STATE,
        "레터링",
        () => "lettering-set",
      ),
      { displayMode: "list", density: "compact" },
    );
    const original = document();
    const next = withStudioQuickAccessPersonalKit(original, state, NOW);
    const entry = readStudioQuickAccessPersonalKit(next);

    expect(next.updatedAt).toBe(NOW.toISOString());
    expect(next.workspaceProfiles).toEqual(original.workspaceProfiles);
    expect(next.gestureMap).toEqual(original.gestureMap);
    expect(next.favoriteRefs).toEqual(original.favoriteRefs);
    expect(entry?.updatedAt).toBe(NOW.toISOString());
    expect(entry?.state).toMatchObject({
      activeSetId: "lettering-set",
      displayMode: "list",
      density: "compact",
    });
    expect(studioQuickAccessStatesEqual(entry!.state, state)).toBe(true);
  });
  it("ignores malformed or unsupported quick-access envelopes", () => {
    expect(readStudioQuickAccessPersonalKit(document())).toBeNull();
    expect(readStudioQuickAccessPersonalKit({
      ...document(),
      quickAccess: {
        schemaVersion: 2,
        updatedAt: NOW.toISOString(),
        state: DEFAULT_STUDIO_QUICK_ACCESS_STATE,
      },
    })).toBeNull();
    expect(readStudioQuickAccessPersonalKit({
      ...document(),
      quickAccess: {
        schemaVersion: 1,
        updatedAt: NOW.toISOString(),
        state: {
          ...DEFAULT_STUDIO_QUICK_ACCESS_STATE,
          sets: [],
          activeSetId: "missing-set",
        },
      },
    })).toBeNull();
  });

  it("compares normalized durable state rather than object identity", () => {
    const copy = JSON.parse(JSON.stringify(DEFAULT_STUDIO_QUICK_ACCESS_STATE));
    expect(studioQuickAccessStatesEqual(
      DEFAULT_STUDIO_QUICK_ACCESS_STATE,
      copy,
    )).toBe(true);
  });
});
