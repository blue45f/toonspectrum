import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LANE_ID_VALUES } from "../bench/report/report-schema";

import {
  findLane,
  LANE_IDS_ORDERED,
  LANE_REGISTRY,
  LANE_STATUS_TABLE_HEADER,
  laneById,
  laneStatusTableMarkdown,
  laneTableDrift,
  parseLaneStatusTable,
} from "./registry";

import type { LaneEnvironment, LaneId } from "./lane";
import type { LaneReasonCode } from "../engine/core/errors";

const SRC_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const README = path.resolve(SRC_ROOT, "..", "README.md");

/** Node(DOM·GPU 없음)에서 browser-verification-required 레인의 probe가 돌려줘야 하는 사유 코드. */
const NODE_UNAVAILABLE_REASON: Partial<Record<LaneId, LaneReasonCode>> = {
  canvas2d: "dom-unavailable",
  "webgl2-instanced": "webgl2-unavailable",
  "webgpu-compute": "webgpu-api-unavailable",
  "webgpu-instanced": "webgpu-api-unavailable",
};

/** 정적·동적 import 지정자(경계 테스트와 같은 규칙). 주석 속 패키지명은 import가 아니다. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null = re.exec(source);
  while (m) {
    const spec = m[1] ?? m[2];
    if (spec) specs.push(spec);
    m = re.exec(source);
  }
  return specs;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("레인 레지스트리", () => {
  it("id가 유일하고 LaneId 어휘 8개를 모두 덮으며 상태·종류 어휘를 지킨다", () => {
    const ids = LANE_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...LANE_ID_VALUES].sort());
    expect(LANE_IDS_ORDERED).toEqual(ids);
    for (const d of LANE_REGISTRY) {
      expect(["implemented", "browser-verification-required", "reserved"]).toContain(d.status);
      expect(["baseline", "candidate", "comparison"]).toContain(d.kind);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.nodeVerification.length).toBeGreaterThan(0);
      expect(d.browserVerification.length).toBeGreaterThan(0);
    }
    expect(laneById("cpu-reference").status).toBe("implemented");
    expect(laneById("platform-baseline").status).toBe("implemented");
    expect(laneById("canvas2d").status).toBe("browser-verification-required");
    expect(laneById("webgpu-compute").status).toBe("browser-verification-required");
    expect(laneById("webgpu-instanced").status).toBe("browser-verification-required");
    expect(laneById("webgl2-instanced").status).toBe("browser-verification-required");
    expect(laneById("wasm-cpu").status).toBe("reserved");
    expect(laneById("wasm-gpu-hybrid").status).toBe("reserved");
    expect(findLane("nope")).toBeNull();
    expect(() => laneById("nope" as "cpu-reference")).toThrow(RangeError);
  });

  it("모든 레인이 빈 환경에서 probe 시 throw 없이 구조화 결과를 돌려준다", async () => {
    const env: LaneEnvironment = { clock: { now: () => 0 } };
    for (const d of LANE_REGISTRY) {
      const lane = d.create();
      expect(lane.id).toBe(d.id);
      expect(lane.status).toBe(d.status);
      expect(lane.kind).toBe(d.kind);
      const report = await lane.probe(env);
      expect(report.laneId).toBe(d.id);
      if (d.status === "reserved") {
        expect(report.status).toBe("unavailable");
        expect(report.reasons).toEqual(["not-implemented"]);
      } else if (d.status === "browser-verification-required") {
        // DOM·GPU가 없는 Node에서는 구조화된 사유 코드로 unavailable이어야 한다(무음 대체 없음).
        expect(report.status).toBe("unavailable");
        expect(report.reasons.length).toBeGreaterThan(0);
        const expected = NODE_UNAVAILABLE_REASON[d.id];
        expect(expected, `${d.id}: NODE_UNAVAILABLE_REASON에 사유 코드를 등록하라`).toBeDefined();
        expect(report.reasons).toContain(expected);
      } else {
        expect(report.status).toBe("supported");
        expect(report.reasons).toEqual([]);
      }
      lane.dispose();
    }
  });

  it("레인 상태 표 마크다운은 파서와 왕복하고 드리프트 0이다", () => {
    const md = laneStatusTableMarkdown();
    expect(md.startsWith(LANE_STATUS_TABLE_HEADER)).toBe(true);
    const rows = parseLaneStatusTable(md);
    expect(rows.length).toBe(LANE_REGISTRY.length);
    expect(laneTableDrift(rows)).toEqual([]);
    const tampered = md.replace("| cpu-reference | baseline | implemented |", "| cpu-reference | baseline | reserved |");
    expect(laneTableDrift(parseLaneStatusTable(tampered))).toEqual(["cpu-reference: 상태 reserved ≠ implemented"]);
    const missing = md.split("\n").filter((l) => !l.startsWith("| wasm-cpu")).join("\n");
    expect(laneTableDrift(parseLaneStatusTable(missing))).toEqual(["wasm-cpu: README 표에 행이 없다"]);
    expect(() => parseLaneStatusTable("| canvas2d | baseline | unknown | a | b |")).toThrow(RangeError);
    expect(parseLaneStatusTable("# 표 없음")).toEqual([]);
  });

  it("README 레인 상태 표가 LANE_REGISTRY와 1:1로 일치한다(단일 원천 드리프트 게이트)", () => {
    const readme = readFileSync(README, "utf8");
    const rows = parseLaneStatusTable(readme);
    expect(
      rows.length,
      `README.md에 레인 상태 표가 없다. lanes/registry.ts의 laneStatusTableMarkdown() 출력을 README에 넣어라:\n${laneStatusTableMarkdown()}`,
    ).toBe(LANE_REGISTRY.length);
    expect(laneTableDrift(rows)).toEqual([]);
  });

  it("서비스 패키지 import는 platform-baseline 레인(과 그 테스트)·registry 교차 검증 테스트에서만 한다", () => {
    const violations: string[] = [];
    const allowedUses: string[] = [];
    for (const full of walk(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, full).split(path.sep).join("/");
      for (const spec of importSpecifiers(readFileSync(full, "utf8"))) {
        if (/^@toonstudio\/studio-(brush-platform|project-model)(\/|$)/.test(spec)) {
          if (/^lanes\/platform-baseline-lane(\.test)?\.ts$/.test(rel)) allowedUses.push(`${rel}: ${spec}`);
          else violations.push(`${rel}: ${spec}`);
        }
        if (/^@toonstudio\/studio-engine-registry(\/|$)/.test(spec)) {
          if (rel === "bench/metrics/render-metrics.test.ts") allowedUses.push(`${rel}: ${spec}`);
          else violations.push(`${rel}: ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
    // 게이트가 살아 있는지: 허용 파일은 실제로 서비스 패키지를 import한다.
    expect(allowedUses).toContain("lanes/platform-baseline-lane.ts: @toonstudio/studio-brush-platform");
    expect(allowedUses).toContain("lanes/platform-baseline-lane.ts: @toonstudio/studio-project-model");
    expect(allowedUses).toContain("bench/metrics/render-metrics.test.ts: @toonstudio/studio-engine-registry");
  });
});
