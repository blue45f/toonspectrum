// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioVirtualDecorationSync,
  type StudioVirtualDecorationTransport,
} from "./studio-virtual-space-decoration-sync";
import {
  readStudioVirtualDecorationState,
  writeStudioVirtualDecorationState,
  type StudioVirtualDecorationState,
} from "./studio-virtual-space-customization";

const DISTRICT = "story-terrace" as const;

function serverState(overrides: Record<string, unknown> = {}) {
  return {
    districtKey: DISTRICT,
    presetKey: "festival",
    presentationMode: "festival",
    placements: [{ id: "festival-rug", type: "rug", x: 10, y: 20, rotation: 0, scale: 1 }],
    revision: 3,
    layoutWidth: 1280,
    layoutHeight: 960,
    ...overrides,
  };
}

function localState(overrides: Partial<StudioVirtualDecorationState> = {}): StudioVirtualDecorationState {
  return Object.freeze({
    districtKey: DISTRICT,
    presetKey: "creator-garden",
    presentationMode: "decorated",
    placements: Object.freeze([]),
    revision: 1,
    layoutWidth: 1280,
    layoutHeight: 960,
    ...overrides,
  }) as StudioVirtualDecorationState;
}

let saved: unknown;
function transportOf(overrides: Partial<StudioVirtualDecorationTransport> = {}): StudioVirtualDecorationTransport {
  return {
    load: vi.fn().mockResolvedValue(serverState()),
    save: vi.fn(async (_district, body) => {
      saved = body;
      return { kind: "ok", body: serverState({ revision: 4 }) };
    }),
    ...overrides,
  } as StudioVirtualDecorationTransport;
}

beforeEach(() => {
  saved = undefined;
  writeStudioVirtualDecorationState(localState(), DISTRICT);
});

describe("load", () => {
  it("prefers the server and mirrors it into local storage", async () => {
    const sync = createStudioVirtualDecorationSync(transportOf());

    const result = await sync.load(DISTRICT);

    expect(result.status).toBe("server");
    expect(result.state.presetKey).toBe("festival");
    expect(readStudioVirtualDecorationState(DISTRICT).revision).toBe(3);
  });

  it("falls back to local state when the server is unreachable", async () => {
    const sync = createStudioVirtualDecorationSync(
      transportOf({ load: vi.fn().mockRejectedValue(new Error("offline")) }),
    );

    const result = await sync.load(DISTRICT);

    expect(result.status).toBe("local");
    expect(result.state.presetKey).toBe("creator-garden");
  });

  it("rejects a server payload for a different district instead of adopting it", async () => {
    const sync = createStudioVirtualDecorationSync(
      transportOf({ load: vi.fn().mockResolvedValue(serverState({ districtKey: "sky-port" })) }),
    );

    const result = await sync.load(DISTRICT);

    expect(result.status).toBe("local");
    expect(readStudioVirtualDecorationState(DISTRICT).districtKey).toBe(DISTRICT);
  });

  it("rejects a server payload that smuggles an unknown decor type", async () => {
    const sync = createStudioVirtualDecorationSync(
      transportOf({
        load: vi.fn().mockResolvedValue(
          serverState({
            placements: [{ id: "x", type: "weapon-rack", x: 1, y: 1, rotation: 0, scale: 1 }],
          }),
        ),
      }),
    );

    expect((await sync.load(DISTRICT)).status).toBe("local");
  });

  it("rejects a non integer revision so a client cannot be desynced on load", async () => {
    const sync = createStudioVirtualDecorationSync(
      transportOf({ load: vi.fn().mockResolvedValue(serverState({ revision: 1.5 })) }),
    );

    expect((await sync.load(DISTRICT)).status).toBe("local");
  });
});

describe("save", () => {
  it("writes locally first so an offline save is not lost", async () => {
    const sync = createStudioVirtualDecorationSync(
      transportOf({ save: vi.fn().mockResolvedValue({ kind: "unavailable" }) }),
    );

    const result = await sync.save(DISTRICT, localState({ presetKey: "festival" }));

    expect(result.status).toBe("local");
    expect(result.state.presetKey).toBe("festival");
    expect(readStudioVirtualDecorationState(DISTRICT).presetKey).toBe("festival");
  });

  it("sends the caller's revision as the expected revision", async () => {
    const sync = createStudioVirtualDecorationSync(transportOf());

    await sync.save(DISTRICT, localState({ revision: 3 }));

    expect(saved).toMatchObject({ expectedRevision: 3, districtKey: DISTRICT });
  });

  it("adopts the revision the server assigned on success", async () => {
    const sync = createStudioVirtualDecorationSync(transportOf());

    const result = await sync.save(DISTRICT, localState({ revision: 3 }));

    expect(result.status).toBe("server");
    expect(result.state.revision).toBe(4);
    expect(readStudioVirtualDecorationState(DISTRICT).revision).toBe(4);
  });

  it("hands back the server state when another device saved first", async () => {
    const sync = createStudioVirtualDecorationSync(
      transportOf({
        save: vi.fn().mockResolvedValue({ kind: "conflict", body: serverState({ revision: 9, presetKey: "night-market" }) }),
      }),
    );

    const result = await sync.save(DISTRICT, localState({ revision: 3 }));

    expect(result.status).toBe("conflict");
    expect(result.current?.revision).toBe(9);
    expect(result.current?.presetKey).toBe("night-market");
  });

  it("does not send a payload the contract rejects", async () => {
    const spy = vi.fn().mockResolvedValue({ kind: "unavailable" });
    const sync = createStudioVirtualDecorationSync(transportOf({ save: spy }));

    await sync.save(DISTRICT, localState({ placements: Object.freeze([{ id: "x", type: "weapon-rack", x: 0, y: 0, rotation: 0, scale: 1 }] as never) }));

    expect(spy).not.toHaveBeenCalled();
  });
});
