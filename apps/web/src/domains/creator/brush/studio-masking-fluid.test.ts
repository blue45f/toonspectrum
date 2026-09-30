import { describe, expect, it } from "vitest";

import {
  createStudioMaskingFluidField,
  depositStudioMaskingFluid,
  deserializeStudioMaskingFluid,
  isStudioMaskingFluidBlocked,
  liftStudioMaskingFluid,
  queryStudioMaskingFluid,
  serializeStudioMaskingFluid,
  studioMaskingFluidCellAt,
  studioMaskingFluidCellCount,
  STUDIO_MASKING_FLUID_BLOCK_THRESHOLD,
} from "./studio-masking-fluid";

describe("studio-masking-fluid", () => {
  it("빈 필드는 차단하지 않는다", () => {
    const field = createStudioMaskingFluidField();
    expect(studioMaskingFluidCellCount(field)).toBe(0);
    expect(isStudioMaskingFluidBlocked(field, 100, 100)).toBe(false);
    expect(queryStudioMaskingFluid(field, 100, 100)).toBe(0);
  });

  it("침착한 영역은 차단된다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 20, 1);
    expect(studioMaskingFluidCellCount(field)).toBeGreaterThan(0);
    expect(isStudioMaskingFluidBlocked(field, 50, 50)).toBe(true);
    expect(queryStudioMaskingFluid(field, 50, 50)).toBeCloseTo(1, 5);
  });

  it("반경 밖은 차단되지 않는다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 10, 1);
    expect(isStudioMaskingFluidBlocked(field, 200, 200)).toBe(false);
  });

  it("강도는 누적되며 1로 클램프된다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 20, 0.6);
    field = depositStudioMaskingFluid(field, 50, 50, 20, 0.6);
    expect(queryStudioMaskingFluid(field, 50, 50)).toBeLessThanOrEqual(1);
    expect(queryStudioMaskingFluid(field, 50, 50)).toBeCloseTo(1, 5);
  });

  it("약한 침착은 임계값 미만이라 차단하지 않는다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 20, 0.2);
    expect(queryStudioMaskingFluid(field, 50, 50)).toBeGreaterThan(0);
    expect(isStudioMaskingFluidBlocked(field, 50, 50)).toBe(false);
    expect(
      isStudioMaskingFluidBlocked(field, 50, 50, 0.1),
    ).toBe(true);
    expect(STUDIO_MASKING_FLUID_BLOCK_THRESHOLD).toBe(0.5);
  });

  it("가장자리는 폴오프된다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 20, 1);
    const center = queryStudioMaskingFluid(field, 50, 50);
    const edge = queryStudioMaskingFluid(field, 50 + 19, 50);
    expect(edge).toBeLessThan(center);
    expect(edge).toBeGreaterThan(0);
  });

  it("lift로 마스크를 벗겨낼 수 있다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 20, 1);
    expect(isStudioMaskingFluidBlocked(field, 50, 50)).toBe(true);
    field = liftStudioMaskingFluid(field, 50, 50, 30);
    expect(isStudioMaskingFluidBlocked(field, 50, 50)).toBe(false);
    expect(studioMaskingFluidCellCount(field)).toBe(0);
  });

  it("lift는 반경 밖 마스크를 보존한다", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 10, 1);
    field = depositStudioMaskingFluid(field, 300, 300, 10, 1);
    field = liftStudioMaskingFluid(field, 50, 50, 30);
    expect(isStudioMaskingFluidBlocked(field, 50, 50)).toBe(false);
    expect(isStudioMaskingFluidBlocked(field, 300, 300)).toBe(true);
  });

  it("결정적이다: 같은 침착은 같은 필드", () => {
    const left = depositStudioMaskingFluid(createStudioMaskingFluidField(), 50, 50, 20, 0.8);
    const right = depositStudioMaskingFluid(createStudioMaskingFluidField(), 50, 50, 20, 0.8);
    expect(serializeStudioMaskingFluid(left)).toEqual(serializeStudioMaskingFluid(right));
  });

  it("직렬화·역직렬화 라운드트립", () => {
    let field = createStudioMaskingFluidField();
    field = depositStudioMaskingFluid(field, 50, 50, 20, 1);
    const restored = deserializeStudioMaskingFluid(serializeStudioMaskingFluid(field));
    expect(isStudioMaskingFluidBlocked(restored, 50, 50)).toBe(true);
    expect(studioMaskingFluidCellCount(restored)).toBe(studioMaskingFluidCellCount(field));
  });

  it("잘못된 입력은 안전하게 처리된다", () => {
    const field = createStudioMaskingFluidField();
    expect(depositStudioMaskingFluid(field, 50, 50, 0, 1)).toBe(field);
    expect(depositStudioMaskingFluid(field, 50, 50, 20, 0)).toBe(field);
    expect(depositStudioMaskingFluid(field, 50, 50, -5, 1)).toBe(field);
    const restored = deserializeStudioMaskingFluid({ cellSize: "x", cells: [["bad", 1], ["1,2", 0.7]] });
    expect(queryStudioMaskingFluid(restored, 6, 10)).toBeCloseTo(0.7, 5);
  });

  it("셀 양자화는 일관된다", () => {
    const field = createStudioMaskingFluidField(4);
    expect(studioMaskingFluidCellAt(field, 8, 12)).toEqual({ cx: 2, cy: 3 });
    expect(studioMaskingFluidCellAt(field, 8, 12)).toEqual(studioMaskingFluidCellAt(field, 9, 13));
  });
});
