import { describe, expect, it } from "vitest";

import {
  furnitureById,
  furnitureByKind,
  furnitureByTag,
  placeFurniture,
  STUDIO_FURNITURE_CATALOG,
  STUDIO_FURNITURE_KINDS,
  validateFurnitureCatalog,
} from "./studio-virtual-space-furniture-catalog";

const NEW_KINDS = ["desk-monitor", "vending-machine", "water-cooler", "wall-clock", "wall-art", "neon-sign"] as const;

const NEW_SPEC_IDS = [
  "desk-dual-monitor", "desk-standing-monitor",
  "vending-snack", "vending-drink", "water-cooler",
  "wall-clock-round", "wall-poster-toon", "wall-art-landscape", "neon-sign-open",
  "sofa-three", "armchair-lounge", "plant-monstera", "rug-rect-lounge", "bookshelf-low-archive",
] as const;

describe("사무실 확장 가구 (트랙 G)", () => {
  it("신규 종류 6종이 카탈로그 종류 목록에 있다", () => {
    for (const kind of NEW_KINDS) expect(STUDIO_FURNITURE_KINDS).toContain(kind);
    expect(STUDIO_FURNITURE_KINDS.length).toBe(20);
  });

  it("신규 스펙 14종이 모두 조회된다", () => {
    for (const id of NEW_SPEC_IDS) expect(furnitureById(id), id).not.toBeNull();
    expect(STUDIO_FURNITURE_CATALOG.length).toBe(34);
  });

  it("카탈로그 구조 검증을 통과한다", () => {
    expect(validateFurnitureCatalog()).toEqual([]);
  });

  it("바닥 가구에는 콜라이더가 있고 벽 가구는 통과형이다", () => {
    for (const id of ["desk-dual-monitor", "vending-snack", "vending-drink", "water-cooler", "sofa-three", "armchair-lounge", "plant-monstera", "bookshelf-low-archive"]) {
      expect(furnitureById(id)?.collider, id).toBeDefined();
    }
    for (const id of ["wall-clock-round", "wall-poster-toon", "wall-art-landscape", "neon-sign-open", "rug-rect-lounge"]) {
      expect(furnitureById(id)?.collider, id).toBeUndefined();
    }
  });

  it("상호작용 가구는 힌트와 반경을 갖는다", () => {
    for (const id of NEW_SPEC_IDS) {
      const spec = furnitureById(id)!;
      if (!spec.interactable) continue;
      expect(spec.interactionHintKo?.trim().length, id).toBeGreaterThan(0);
      expect(spec.interactionHintEn?.trim().length, id).toBeGreaterThan(0);
      expect(spec.interactionRadius, id).toBeGreaterThan(0);
    }
  });

  it("종류·태그 조회가 신규 가구를 찾는다", () => {
    expect(furnitureByKind("vending-machine").map((item) => item.id)).toEqual(["vending-snack", "vending-drink"]);
    expect(furnitureByKind("desk-monitor").length).toBe(2);
    expect(furnitureByTag("lounge").map((item) => item.id)).toContain("sofa-three");
    expect(furnitureByTag("archive").map((item) => item.id)).toContain("bookshelf-low-archive");
  });

  it("라운지 소파는 3인석이다", () => {
    expect(furnitureById("sofa-three")?.seats).toBe(3);
  });

  it("placeFurniture가 신규 가구의 절대 콜라이더를 계산한다", () => {
    const desk = placeFurniture("desk-dual-monitor", 500, 600)!;
    // desk-dual-monitor collider: { x: -64, y: -30, width: 128, height: 30 }
    expect(desk.collider).toMatchObject({ x: 436, y: 570, width: 128, height: 30 });
    expect(desk.kind).toBe("desk-monitor");
    const clock = placeFurniture("wall-clock-round", 500, 600)!;
    expect(clock.collider).toBeNull();
    expect(clock.interactable).toBe(true);
  });
});
