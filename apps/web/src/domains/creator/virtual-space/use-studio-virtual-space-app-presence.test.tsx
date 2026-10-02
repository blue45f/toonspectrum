// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createTileEffect,
  type StudioTileEffectDefinition,
} from "./studio-virtual-space-tile-effects";
import { useStudioVirtualSpaceAppPresence } from "./use-studio-virtual-space-app-presence";

const TILE = 16;
const center = (tile: number) => tile * TILE + TILE / 2;

function appEffect(): StudioTileEffectDefinition {
  const result = createTileEffect(
    { kind: "app", id: "app-1", name: "집중 타이머", tileX: 2, tileY: 2, url: "https://example.com/timer" },
    [],
  );
  if (!result.ok) throw new Error("test app effect must be valid");
  return result.effect;
}

const ON_TILE = { x: center(2), y: center(2) };
const OFF_TILE = { x: center(9), y: center(9) };

function setup() {
  const effects = [appEffect()];
  const harness = renderHook(
    ({ point }: { point: { x: number; y: number } }) => useStudioVirtualSpaceAppPresence(effects, point),
    { initialProps: { point: OFF_TILE } },
  );
  return {
    ...harness,
    moveTo: (next: { x: number; y: number }) => {
      act(() => { harness.rerender({ point: { ...next } }); });
    },
    close: () => { act(() => { harness.result.current.close(); }); },
  };
}

describe("useStudioVirtualSpaceAppPresence", () => {
  it("app 타일에 올라가면 열리고, 벗어나면 닫힌다", () => {
    const { result, moveTo } = setup();
    expect(result.current.openEffect).toBeNull();
    moveTo(ON_TILE);
    expect(result.current.openEffect?.id).toBe("app-1");
    moveTo({ x: center(2) + 2, y: center(2) });
    expect(result.current.openEffect?.id).toBe("app-1");
    moveTo(OFF_TILE);
    expect(result.current.openEffect).toBeNull();
  });

  it("사용자가 직접 닫으면 같은 타일에 머무는 동안 다시 열지 않는다", () => {
    const { result, moveTo, close } = setup();
    moveTo(ON_TILE);
    expect(result.current.openEffect?.id).toBe("app-1");
    close();
    expect(result.current.openEffect).toBeNull();
    moveTo({ x: center(2) + 2, y: center(2) });
    expect(result.current.openEffect).toBeNull();
    // 타일을 벗어나면 억제가 풀려 다시 들어올 때 열린다.
    moveTo(OFF_TILE);
    moveTo(ON_TILE);
    expect(result.current.openEffect?.id).toBe("app-1");
  });
});
