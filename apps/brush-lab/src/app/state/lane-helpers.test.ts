import { describe, expect, it } from "vitest";

import { supportedReport, unavailableReport } from "../../lanes/lane";

import { capabilityBadge, findDescriptor, laneAvailability, REASON_LABELS } from "./lane-helpers";

import type { LaneReasonCode } from "../../engine/core/errors";
import type { BrushEngineLane, LaneDescriptor } from "../../lanes/lane";

const ALL_REASONS: LaneReasonCode[] = [
  "webgpu-api-unavailable",
  "adapter-unavailable",
  "device-request-failed",
  "feature-missing",
  "limit-exceeded",
  "dom-unavailable",
  "webgl2-unavailable",
  "wasm-artifact-missing",
  "wasm-integrity-mismatch",
  "wgsl-compile-error",
  "device-lost",
  "not-implemented",
];

function descriptor(partial: Partial<LaneDescriptor>): LaneDescriptor {
  return {
    id: "cpu-reference",
    label: "CPU 참조",
    kind: "baseline",
    status: "implemented",
    nodeVerification: "",
    browserVerification: "",
    create: () => {
      throw new Error("테스트에서 레인을 만들지 않는다");
    },
    ...partial,
  };
}

describe("lane-helpers", () => {
  it("모든 사유 코드에 한글 설명이 있다", () => {
    for (const code of ALL_REASONS) {
      expect(REASON_LABELS[code].length).toBeGreaterThan(0);
    }
  });

  it("reserved·unavailable 레인은 사유와 함께 비활성이고 supported는 활성이다", () => {
    expect(laneAvailability(descriptor({ status: "reserved" }), null)).toEqual({
      enabled: false,
      reason: "예약(미구현)",
    });
    const un = laneAvailability(
      descriptor({ id: "webgpu-compute" }),
      unavailableReport("webgpu-compute", ["webgpu-api-unavailable"]),
    );
    expect(un.enabled).toBe(false);
    expect(un.reason).toContain("webgpu-api-unavailable");
    expect(laneAvailability(descriptor({}), supportedReport("cpu-reference"))).toEqual({
      enabled: true,
      reason: null,
    });
    // probe 전(null)은 선택 가능(실행 시 probe 결과로 다시 판정)
    expect(laneAvailability(descriptor({}), null).enabled).toBe(true);
  });

  it("배지는 어댑터·softwareRenderer 여부를 드러낸다", () => {
    expect(capabilityBadge(null)).toBe("probe 대기");
    expect(capabilityBadge(supportedReport("cpu-reference"))).toContain("adapter 없음(CPU)");
    expect(capabilityBadge(unavailableReport("canvas2d", ["dom-unavailable"]))).toContain("dom-unavailable");
    const sw = {
      ...supportedReport("webgpu-compute"),
      adapterInfo: { vendor: "google", architecture: "swiftshader", device: "", description: "" },
      softwareRenderer: true,
    };
    const badge = capabilityBadge(sw);
    expect(badge).toContain("google/swiftshader");
    expect(badge).toContain("softwareRenderer");
  });

  it("findDescriptor는 없는 id에 null을 돌려준다", () => {
    const registry = [descriptor({})];
    expect(findDescriptor(registry, "cpu-reference")?.label).toBe("CPU 참조");
    expect(findDescriptor(registry, "wasm-cpu")).toBeNull();
    const lane: BrushEngineLane | null = null;
    expect(lane).toBeNull();
  });
});
