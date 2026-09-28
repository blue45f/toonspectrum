import { describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_DECOR_TYPES as CONTRACT_DECOR_TYPES,
  STUDIO_VIRTUAL_DISTRICT_IDS as CONTRACT_DISTRICT_IDS,
  STUDIO_VIRTUAL_MAX_PLACEMENTS as CONTRACT_MAX_PLACEMENTS,
  STUDIO_VIRTUAL_PRESENTATION_MODES as CONTRACT_PRESENTATION_MODES,
  STUDIO_VIRTUAL_PRESET_KEYS as CONTRACT_PRESET_KEYS,
} from "@toonstudio/contracts/studio-virtual-space-placement-contract";

import {
  STUDIO_VIRTUAL_DECOR_TYPES,
  STUDIO_VIRTUAL_PRESENTATION_MODES,
  STUDIO_VIRTUAL_PRESET_KEYS,
} from "./studio-virtual-space-customization";
import { STUDIO_TOWN_DISTRICT_IDS } from "./studio-virtual-space-town-layout";

/**
 * 웹의 로컬 상수와 서버 계약이 어긋나면 서버가 거부하는 배치가 로컬에서는 그려진다.
 * 서버는 클라이언트를 믿지 않으므로 두 목록의 차이가 곧 "조용히 깨지는 배치"다.
 * 열이 하나라도 달라지면 이 테스트가 먼저 멈춘다.
 */
describe("virtual space contract does not drift from the web local model", () => {
  it("keeps the decor type allow list identical", () => {
    expect([...STUDIO_VIRTUAL_DECOR_TYPES].sort()).toEqual([...CONTRACT_DECOR_TYPES].sort());
  });

  it("keeps the district list identical", () => {
    expect([...STUDIO_TOWN_DISTRICT_IDS].sort()).toEqual([...CONTRACT_DISTRICT_IDS].sort());
  });

  it("keeps the preset keys identical", () => {
    expect([...STUDIO_VIRTUAL_PRESET_KEYS].sort()).toEqual([...CONTRACT_PRESET_KEYS].sort());
  });

  it("keeps the presentation modes identical", () => {
    expect([...STUDIO_VIRTUAL_PRESENTATION_MODES].sort()).toEqual(
      [...CONTRACT_PRESENTATION_MODES].sort(),
    );
  });

  it("does not advertise more placements than the server accepts", () => {
    expect(CONTRACT_MAX_PLACEMENTS).toBeGreaterThan(0);
    expect(CONTRACT_MAX_PLACEMENTS).toBe(36);
  });
});
