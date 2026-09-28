/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_3D_TOOL_ICON_NAMES } from "./studio-3d-tool-icons";
import { Studio3dToolIcon } from "./Studio3dToolIcon";

import type { ReactElement } from "react";

afterEach(cleanup);

const MIN = 0;
const MAX = 24;

/**
 * 24 그리드 아이콘의 기하 계약.
 *
 * jsdom에는 `getBBox`가 없어 렌더 결과를 직접 잴 수 없으므로, 좌표를 정적으로
 * 해석해 이탈을 판정한다. Bézier 곡선은 자기 제어점의 볼록 껍질 안에 있으므로
 * 좌표가 [0,24]면 곡선도 안이다. 호는 이 성질이 통하지 않으므로, 호가 그려질
 * 수 있는 회전 타원의 축 정렬 경계 상자를 따로 계산한다.
 * `ears` 글리프가 y=-2.4로 위쪽이 잘렸던 사고는 이 호 계산이 없으면 놓친다.
 */
interface Box { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number }

function svgOf(node: ReactElement): SVGSVGElement {
  const { container, unmount } = render(node);
  const host = document.createElement("div");
  host.innerHTML = container.innerHTML;
  unmount();
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("아이콘 SVG가 렌더되지 않았습니다.");
  return svg;
}

const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** 호가 실제로 그리는 구간의 좌표. 스윕에 들어오는 극값만 후보로 삼는다. */
function arcPoints(x1: number, y1: number, x2: number, y2: number, rx0: number, ry0: number, rotDeg: number, largeArc: number, sweepFlag: number) {
  const rot = (rotDeg * Math.PI) / 180;
  const cosR = Math.cos(rot); const sinR = Math.sin(rot);
  let rx = Math.abs(rx0); let ry = Math.abs(ry0);
  if (rx < 1e-9 || ry < 1e-9) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const dx = (x1 - x2) / 2; const dy = (y1 - y2) / 2;
  const xp = cosR * dx + sinR * dy;
  const yp = -sinR * dx + cosR * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) { const k = Math.sqrt(lambda); rx *= k; ry *= k; }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweepFlag) coef = -coef;
  const cxp = coef * ((rx * yp) / ry);
  const cyp = coef * (-(ry * xp) / rx);
  const cx = cosR * cxp - sinR * cyp + (x1 + x2) / 2;
  const cy = sinR * cxp + cosR * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const d = (ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
    const a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1))));
    return d < 0 ? -a : a;
  };
  const ux = (xp - cxp) / rx; const uy = (yp - cyp) / ry;
  const vx = (-xp - cxp) / rx; const vy = (-yp - cyp) / ry;
  const theta1 = ang(1, 0, ux, uy);
  let dTheta = ang(ux, uy, vx, vy);
  if (sweepFlag === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag === 1 && dTheta < 0) dTheta += 2 * Math.PI;
  const cands = [theta1, theta1 + dTheta];
  for (const base of [
    Math.atan2(-ry * sinR, rx * cosR),
    Math.atan2(ry * cosR, rx * sinR),
  ]) {
    for (const t of [base, base + Math.PI]) {
      let n = t;
      while (n < theta1) n += 2 * Math.PI;
      while (n > theta1 + 2 * Math.PI) n -= 2 * Math.PI;
      if (n >= theta1 && n <= theta1 + dTheta) cands.push(n);
    }
  }
  return cands.map((t) => ({
    x: cx + rx * Math.cos(t) * cosR - ry * Math.sin(t) * sinR,
    y: cy + rx * Math.cos(t) * sinR + ry * Math.sin(t) * cosR,
  }));
}

function pathPoints(d: string): { readonly x: number; readonly y: number }[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: { x: number; readonly y: number }[] = [];
  let i = 0;
  let cmd = "";
  let firstPair = true;
  let cx = 0; let cy = 0;
  let sx = 0; let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i]!)) { cmd = tokens[i++]!; firstPair = true; }
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const n = ARITY[upper];
    if (n === undefined) throw new Error(`알 수 없는 path 명령: ${cmd}`);
    if (n === 0) { cx = sx; cy = sy; continue; }
    const args: number[] = [];
    for (let k = 0; k < n; k += 1) args.push(num());
    const at = (a: number, axis: 0 | 1) => (rel ? (axis === 0 ? cx : cy) + a : a);
    if (upper === "H") { cx = at(args[0]!, 0); out.push({ x: cx, y: cy }); continue; }
    if (upper === "V") { cy = at(args[0]!, 1); out.push({ x: cx, y: cy }); continue; }
    if (upper === "A") {
      const ex = at(args[5]!, 0);
      const ey = at(args[6]!, 1);
      out.push(...arcPoints(cx, cy, ex, ey, args[0]!, args[1]!, args[2]!, args[3]!, args[4]!));
      cx = ex;
      cy = ey;
      continue;
    }
    // C/S/Q/T의 모든 좌표는 이 세그먼트의 시작점 기준이다. 쌍마다 cx를 갱신해
    // 누적하면 제어점이 다음 쌍의 기준이 되어 값이 계속 밀린다.
    // 예외: M/m의 첫 쌍만 moveto고 나머지는 그 새 점에서 이어지는 암묵적 lineto다.
    let ox = cx; let oy = cy;
    for (let k = 0; k + 1 < args.length; k += 2) {
      if (upper === "M" && firstPair) {
        firstPair = false;
        cx = rel ? ox + args[0]! : args[0]!;
        cy = rel ? oy + args[1]! : args[1]!;
        ox = cx; oy = cy;
        sx = cx; sy = cy;
        out.push({ x: cx, y: cy });
        continue;
      }
      cx = rel ? ox + args[k]! : args[k]!;
      cy = rel ? oy + args[k + 1]! : args[k + 1]!;
      if (upper === "M") { ox = cx; oy = cy; }
      out.push({ x: cx, y: cy });
    }
  }
  return out;
}

function boxOf(svg: SVGSVGElement): Box {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const keep = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const el of svg.querySelectorAll("path")) {
    for (const p of pathPoints(el.getAttribute("d") ?? "")) keep(p.x, p.y);
  }
  for (const el of svg.querySelectorAll("circle")) {
    const cx = Number(el.getAttribute("cx")); const cy = Number(el.getAttribute("cy")); const r = Number(el.getAttribute("r"));
    keep(cx - r, cy - r); keep(cx + r, cy + r);
  }
  for (const el of svg.querySelectorAll("rect")) {
    const x = Number(el.getAttribute("x") ?? 0); const y = Number(el.getAttribute("y") ?? 0);
    keep(x, y);
    keep(x + Number(el.getAttribute("width") ?? 0), y + Number(el.getAttribute("height") ?? 0));
  }
  for (const el of svg.querySelectorAll("ellipse")) {
    const cx = Number(el.getAttribute("cx")); const cy = Number(el.getAttribute("cy"));
    const rx = Number(el.getAttribute("rx")); const ry = Number(el.getAttribute("ry"));
    keep(cx - rx, cy - ry); keep(cx + rx, cy + ry);
  }
  return { minX, maxX, minY, maxY };
}

describe("3D 도구 아이콘 24 그리드 기하 계약", () => {
  it.each(STUDIO_3D_TOOL_ICON_NAMES)("%s 의 모든 좌표가 24 뷰박스 안에 닫힌다", (name) => {
    const box = boxOf(svgOf(<Studio3dToolIcon name={name} />));
    expect(Number.isFinite(box.minX)).toBe(true);
    expect(box.minX, `${name} 최소 x`).toBeGreaterThanOrEqual(MIN);
    expect(box.maxX, `${name} 최대 x`).toBeLessThanOrEqual(MAX);
    expect(box.minY, `${name} 최소 y`).toBeGreaterThanOrEqual(MIN);
    expect(box.maxY, `${name} 최대 y`).toBeLessThanOrEqual(MAX);
  });

  it.each(STUDIO_3D_TOOL_ICON_NAMES)("%s 는 20px로 축소돼도 남는 실루엣을 가진다", (name) => {
    const box = boxOf(svgOf(<Studio3dToolIcon name={name} />));
    expect(box.maxX - box.minX).toBeGreaterThan(4);
    expect(box.maxY - box.minY).toBeGreaterThan(4);
  });

  it.each(STUDIO_3D_TOOL_ICON_NAMES)("%s 는 구조와 액센트 두 계층을 모두 그린다", (name) => {
    const svg = svgOf(<Studio3dToolIcon name={name} />);
    const hasStroke = [...svg.querySelectorAll("path")].some((el) => el.getAttribute("stroke") !== "none");
    expect(hasStroke).toBe(true);
    expect(svg.querySelector('g[fill*="studio-3d-icon-accent"]')).not.toBeNull();
  });
});
