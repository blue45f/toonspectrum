import { describe, expect, it } from "vitest";
import { parseNavigationInput, parseNavigationWaypoints } from "./specialist-navigation-input";

const settings = { start: [-2, 0, -2] as [number, number, number], end: [2, 0, 2] as [number, number, number], cellSize: 0.2, agentHeight: 1.8, agentRadius: 0.3, maxStepHeight: 0.3, maxSlopeDegrees: 45 };

describe("navigation input preflight", () => {
  it("accepts decimals, CRLF and scientific notation", () => {
    expect(parseNavigationWaypoints(" +2, 0, -2\r\n-.5 1e-1 2 ")).toEqual([[2, 0, -2], [-0.5, 0.1, 2]]);
    expect(parseNavigationWaypoints(" \n ")).toEqual([]);
    expect(parseNavigationWaypoints(Array(8).fill("0,0,0").join("\n"))).toHaveLength(8);
  });
});

it.each(["0,1,", ",1,0", "0,,1", "0 1", "0, 1 2", "0x10,0,1", "Infinity,0,0", "1e999,0,0", "10001,0,0", "0,0,0\n\n1,0,1", Array(9).fill("0,0,0").join("\n"), " ".repeat(1025)])("rejects invalid waypoint input: %s", (text) => {
  expect(parseNavigationWaypoints(text)).toBeNull();
  expect(parseNavigationInput(settings, text)).toEqual({ ok: false, reason: "waypoints" });
});
it("validates grid and agent constraints before execution", () => {
  for (const change of [{ cellSize: 2 }, { agentRadius: 0 }, { agentHeight: NaN }, { maxStepHeight: 2 }, { maxSlopeDegrees: 90 }, { agentHeight: 0.31, maxStepHeight: 0.35 }]) {
    expect(parseNavigationInput({ ...settings, ...change }, "")).toEqual({ ok: false, reason: "settings" });
  }
  expect(parseNavigationInput(settings, "2,0,-2")).toMatchObject({ ok: true, options: { kind: "navigation", waypoints: [[2, 0, -2]] } });
});
it("rejects stationary requests but permits an ordered round trip", () => {
  expect(parseNavigationInput({ ...settings, end: settings.start }, "")).toEqual({ ok: false, reason: "settings" });
  expect(parseNavigationInput({ ...settings, end: settings.start }, "2,0,2").ok).toBe(true);
});
