import { describe, expect, it } from "vitest";

import {
  STUDIO_WORLD_MARKER_VISIBLE_DISTANCE,
  studioWorldMarkerVisible,
  studioWorldPromptTarget,
  type StudioWorldPromptCandidate,
} from "./studio-virtual-space-world-prompt";

const candidate = (id: string, kind: StudioWorldPromptCandidate["kind"], x: number, y: number, radius: number): StudioWorldPromptCandidate =>
  ({ id, kind, point: { x, y }, radius, labelKo: id, labelEn: id });

describe("월드 내 'E' 상호작용 프롬프트", () => {
  it("프롬프트는 반경 안 가장 가까운 대상 하나에만 표시된다", () => {
    const target = studioWorldPromptTarget({ x: 100, y: 100 }, [
      candidate("far", "interaction", 400, 100, 80),
      candidate("near", "interaction", 130, 100, 80),
      candidate("nearer-but-small", "interaction", 120, 100, 10),
      candidate("middle", "interaction", 160, 100, 80),
    ]);
    expect(target?.id).toBe("near");
    expect(target?.distance).toBeCloseTo(30);
    expect(studioWorldPromptTarget({ x: 100, y: 100 }, [candidate("far", "interaction", 400, 100, 80)])).toBeNull();
    expect(studioWorldPromptTarget({ x: 0, y: 0 }, [])).toBeNull();
  });

  it("E 키가 여는 순서대로 바닥 상호작용을 NPC보다 먼저 고른다", () => {
    const npcCloser = [candidate("npc", "npc", 105, 100, 55), candidate("desk", "interaction", 150, 100, 80)];
    expect(studioWorldPromptTarget({ x: 100, y: 100 }, npcCloser)?.id).toBe("desk");
    expect(studioWorldPromptTarget({ x: 100, y: 100 }, [candidate("npc", "npc", 140, 100, 55)])?.kind).toBe("npc");
    expect(studioWorldPromptTarget({ x: 100, y: 100 }, [candidate("bad", "interaction", Number.NaN, 100, 80)])).toBeNull();
  });

  it("2글자 원형 표식은 320px 밖에서 숨기고, 프롬프트 대상은 키캡이 대신해 숨긴다", () => {
    expect(studioWorldMarkerVisible({ distance: STUDIO_WORLD_MARKER_VISIBLE_DISTANCE + 1, prompted: false, showAll: true })).toBe(false);
    expect(studioWorldMarkerVisible({ distance: 120, prompted: false, showAll: true })).toBe(true);
    expect(studioWorldMarkerVisible({ distance: 120, prompted: false, showAll: false })).toBe(false);
    expect(studioWorldMarkerVisible({ distance: 10, prompted: true, showAll: true })).toBe(false);
  });
});
