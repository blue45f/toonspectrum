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

describe("STUDIO_FURNITURE_CATALOG", () => {
  it("상호작용 가구 종류가 12종 이상이다", () => {
    expect(STUDIO_FURNITURE_KINDS.length).toBeGreaterThanOrEqual(12);
    expect(STUDIO_FURNITURE_CATALOG.length).toBeGreaterThanOrEqual(12);
  });

  it("한영 이름·설명을 갖는다", () => {
    for (const item of STUDIO_FURNITURE_CATALOG) {
      expect(item.labelKo.trim().length).toBeGreaterThan(0);
      expect(item.labelEn.trim().length).toBeGreaterThan(0);
      expect(item.descriptionKo.trim().length).toBeGreaterThan(0);
      expect(item.descriptionEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("상호작용 가구는 힌트 문구를 갖는다", () => {
    for (const item of STUDIO_FURNITURE_CATALOG.filter((entry) => entry.interactable)) {
      expect(item.interactionHintKo?.trim().length).toBeGreaterThan(0);
      expect(item.interactionHintEn?.trim().length).toBeGreaterThan(0);
    }
  });

  it("카탈로그 구조 검증을 통과한다", () => {
    expect(validateFurnitureCatalog()).toEqual([]);
  });
});

describe("furnitureById / furnitureByKind / furnitureByTag", () => {
  it("id로 조회한다", () => {
    expect(furnitureById("meeting-table")?.kind).toBe("meeting-table");
    expect(furnitureById("whiteboard")?.interactionHintKo).toBe("보드에 그리기");
    expect(furnitureById("nope")).toBeNull();
  });

  it("종류·태그로 조회한다", () => {
    expect(furnitureByKind("chair").length).toBeGreaterThanOrEqual(1);
    const seats = furnitureByTag("seat").map((item) => item.id);
    expect(seats).toContain("chair-basic");
    expect(seats).toContain("sofa-two");
    expect(seats).toContain("meeting-table");
  });
});

describe("placeFurniture", () => {
  it("상대 collider를 절대 좌표로 변환한다", () => {
    const placed = placeFurniture("desk-standard", 300, 400)!;
    expect(placed.x).toBe(300);
    expect(placed.y).toBe(400);
    // desk-standard collider: { x: -60, y: -28, width: 120, height: 28 }
    expect(placed.collider).toMatchObject({ x: 240, y: 372, width: 120, height: 28 });
    expect(placed.interactionHintKo).toBe("작업 시작");
  });

  it("통과형 장식은 collider가 null이다", () => {
    expect(placeFurniture("rug-round", 100, 100)!.collider).toBeNull();
  });

  it("무효 입력을 거부한다", () => {
    expect(placeFurniture("unknown", 0, 0)).toBeNull();
    expect(placeFurniture("chair-basic", Number.NaN, 0)).toBeNull();
  });
});
