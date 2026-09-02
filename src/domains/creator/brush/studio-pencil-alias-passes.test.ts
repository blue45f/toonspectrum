import { describe, expect, it } from "vitest";

import { resolveStudioBrushAliasPencilPasses } from "./studio-brush-alias-profile";
import {
  STUDIO_PENCIL_DEFAULT_ALIAS_PASS,
  studioPencilAliasPassAlpha,
  studioPencilAliasPasses,
  studioPencilAliasPassPoints,
} from "./studio-pencil-alias-passes";

const LINE = [0, 0, 10, 0, 20, 0, 30, 0, 40, 0];

describe("studioPencilAliasPasses", () => {
  it("gives an un-profiled pencil exactly one core pass", () => {
    expect(studioPencilAliasPasses("pencil-grain")).toEqual([STUDIO_PENCIL_DEFAULT_ALIAS_PASS]);
    expect(studioPencilAliasPasses(undefined)).toEqual([STUDIO_PENCIL_DEFAULT_ALIAS_PASS]);
  });

  it("passes an alias profile's own passes straight through", () => {
    for (const id of ["pencil", "soft-pencil", "pencil--side-shade"] as const) {
      expect(studioPencilAliasPasses(id)).toEqual(resolveStudioBrushAliasPencilPasses(id));
      expect(studioPencilAliasPasses(id).length).toBeGreaterThan(0);
    }
  });

  it("keeps the side-shade skirt, which only the committed renderer used to draw", () => {
    // 실측: 라이브 14px/농도 95 vs 커밋 24px/농도 32. 치마가 곧 별칭 패스였다.
    const passes = studioPencilAliasPasses("pencil--side-shade");
    expect(passes.filter(({ role }) => role === "soft-edge").length).toBeGreaterThan(2);
    expect(Math.max(...passes.map(({ widthScale }) => widthScale))).toBeGreaterThan(1.5);
  });
});

describe("studioPencilAliasPassPoints", () => {
  it("is stable under append, so an incremental live builder lands on committed geometry", () => {
    const prefix = studioPencilAliasPassPoints(LINE.slice(0, 6), 0.75);
    const full = studioPencilAliasPassPoints(LINE, 0.75);
    expect(full.slice(0, prefix.length)).toEqual(prefix);
  });

  it("scales the frozen graphite offset by the pass radius, around the source point", () => {
    const source = [12, 34];
    const wide = studioPencilAliasPassPoints(source, 1.5);
    const narrow = studioPencilAliasPassPoints(source, 0.75);
    const zero = studioPencilAliasPassPoints(source, 0);
    expect(zero).toEqual(source);
    for (let index = 0; index < source.length; index += 1) {
      const wideOffset = wide[index]! - source[index]!;
      const narrowOffset = narrow[index]! - source[index]!;
      expect(wideOffset).toBeCloseTo(narrowOffset * 2, 10);
    }
  });

  it("returns the frozen default jitter unchanged at the default radius", () => {
    expect(studioPencilAliasPassPoints(LINE, 0.75))
      .toEqual(studioPencilAliasPassPoints([...LINE], 0.75));
  });
});

describe("studioPencilAliasPassAlpha", () => {
  it("folds the pass opacity into the cell's own pressure response and clamps at 1", () => {
    expect(studioPencilAliasPassAlpha({ ...STUDIO_PENCIL_DEFAULT_ALIAS_PASS, opacityScale: 0.5 }, 1, 1))
      .toBeCloseTo(0.5, 10);
    expect(studioPencilAliasPassAlpha(STUDIO_PENCIL_DEFAULT_ALIAS_PASS, 0.25, 0.25))
      .toBeCloseTo(0.25, 10);
    expect(studioPencilAliasPassAlpha({ ...STUDIO_PENCIL_DEFAULT_ALIAS_PASS, opacityScale: 4 }, 1, 1))
      .toBe(1);
  });
});
