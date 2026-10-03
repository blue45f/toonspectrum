import { describe, expect, it } from "vitest";

import { CREATOR_ROLE_IDS } from "@/shared/lib/creator-role-contract";

import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import { studioVirtualSpaceRolePreset } from "./studio-virtual-space-role-preset";

describe("가상스튜디오 직군 프리셋", () => {
  it("16개 직군 전부가 카탈로그에 실재하는 공간 2곳 이상을 추천한다", () => {
    const catalogIds = new Set(STUDIO_VIRTUAL_PLACES.map((place) => place.id));
    for (const roleId of CREATOR_ROLE_IDS) {
      const preset = studioVirtualSpaceRolePreset(roleId);
      expect(preset.definition?.id).toBe(roleId);
      expect(preset.places.length).toBeGreaterThanOrEqual(2);
      for (const place of preset.places) {
        expect(catalogIds.has(place.id)).toBe(true);
      }
      // 미니맵 강조 방 id는 추천 공간의 방 id와 정확히 일치해야 한다.
      expect(preset.roomIds).toEqual(preset.places.map((place) => place.roomId));
    }
  });

  it("직군마다 첫 추천 공간이 그 직군의 주 작업 공간이다", () => {
    expect(studioVirtualSpaceRolePreset("story").places[0]?.id).toBe("story-lab");
    expect(studioVirtualSpaceRolePreset("reviewer").places[0]?.id).toBe("review-gallery");
    expect(studioVirtualSpaceRolePreset("editor").places[0]?.id).toBe("review-gallery");
    expect(studioVirtualSpaceRolePreset("producer").places[0]?.id).toBe("production-control");
    expect(studioVirtualSpaceRolePreset("color").places[0]?.id).toBe("personal-atelier");
    expect(studioVirtualSpaceRolePreset("line-art").places[0]?.id).toBe("personal-atelier");
  });

  it("직군이 없으면 정의 없이 중립 추천만 돌려주고 미니맵 강조는 비운다", () => {
    const preset = studioVirtualSpaceRolePreset(null);
    expect(preset.definition).toBeNull();
    expect(preset.roleId).toBeNull();
    expect(preset.places.length).toBeGreaterThanOrEqual(2);
    expect(preset.roomIds).toEqual([]);
  });

  it("개인 모드에서는 프로젝트 전용 공간을 추천에서 제외한다", () => {
    const team = studioVirtualSpaceRolePreset("producer", false);
    const personal = studioVirtualSpaceRolePreset("producer", true);
    expect(team.places.map((place) => place.id)).toContain("production-control");
    expect(personal.places.map((place) => place.id)).not.toContain("production-control");
    expect(personal.places.map((place) => place.id)).not.toContain("team-meeting");
    expect(personal.places.length).toBeGreaterThanOrEqual(1);
  });
});
