import { describe, expect, it } from "vitest";

import {
  buildStudioVrmGarmentFitInputSignature,
  createStudioVrmGarmentEvaluationReceipt,
  inspectStudioVrmGarmentFit,
} from "./studio-vrm-garment-fit";
import {
  FALLBACK_WARDROBE_METRICS,
  createWardrobeEquip,
  type WardrobeEquip,
  type WardrobeMetrics,
  type WardrobeState,
} from "./studio-vrm-wardrobe";

const MEASURED_METRICS: WardrobeMetrics = {
  ...FALLBACK_WARDROBE_METRICS,
  source: "raw-rig",
};

function equip(itemId: string, patch: Partial<WardrobeEquip> = {}): WardrobeEquip {
  const base = createWardrobeEquip(itemId);
  if (!base) throw new Error(`missing wardrobe fixture: ${itemId}`);
  return { ...base, ...patch };
}

describe("Studio VRM garment fit runtime", () => {
  it("자동 맞춤은 authored fit을 바꾸지 않고 몸 관통 여유를 화면 셸에 적용한다", () => {
    const wardrobe: WardrobeState = {
      top: equip("shirt", { fit: 0.8, fitMode: "auto" }),
    };
    const report = inspectStudioVrmGarmentFit(wardrobe, MEASURED_METRICS);

    expect(report.status).toBe("ready");
    expect(report.slots.top?.authoredFit).toBe(0.8);
    expect(report.slots.top?.effectiveFit).toBeGreaterThan(0.8);
    expect(report.slots.top?.effectiveFit).toBe(report.slots.top?.suggestedFit);
    expect(report.autoAdjusted).toBe(true);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "auto-adjusted",
      severity: "info",
      slots: ["top"],
    }));
  });

  it("직접 맞춤에서 여유가 부족하면 부위와 권장 fit을 경고한다", () => {
    const report = inspectStudioVrmGarmentFit({
      top: equip("shirt", { fit: 0.8, fitMode: "manual" }),
    }, MEASURED_METRICS);

    const issue = report.issues.find((entry) => entry.code === "body-clearance");
    expect(report.status).toBe("warning");
    expect(issue?.slots).toEqual(["top"]);
    expect(issue?.regions).toEqual(expect.arrayContaining(["torso", "arms"]));
    expect(issue?.estimatedPenetrationM).toBeGreaterThan(0);
    expect(issue?.suggestedFit).toBeGreaterThan(0.8);
  });

  it("겉옷 자동 맞춤은 안쪽 상의보다 바깥 레이어 여유를 확보한다", () => {
    const report = inspectStudioVrmGarmentFit({
      top: equip("shirt", { fit: 1.2, fitMode: "manual" }),
      outer: equip("blazer", { fit: 0.9, fitMode: "auto" }),
    }, MEASURED_METRICS);

    expect(report.slots.outer?.effectiveFit).toBeGreaterThan(0.9);
    expect(report.issues.some((issue) => issue.code === "layer-clearance" && issue.severity === "warning")).toBe(false);
  });

  it("겉옷 직접 맞춤은 상의와의 레이어 관통을 숨기지 않는다", () => {
    const report = inspectStudioVrmGarmentFit({
      top: equip("shirt", { fit: 1.2, fitMode: "manual" }),
      outer: equip("blazer", { fit: 0.9, fitMode: "manual" }),
    }, MEASURED_METRICS);

    expect(report.status).toBe("warning");
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "layer-clearance",
      severity: "warning",
      slots: ["top", "outer"],
    }));
  });

  it("fit을 키우면 같은 의상의 추정 몸 관통량이 단조 감소한다", () => {
    const penetrations = [0.8, 0.9, 1, 1.1].map((fit) => inspectStudioVrmGarmentFit({
      top: equip("shirt", { fit, fitMode: "manual" }),
    }, MEASURED_METRICS).maxEstimatedPenetrationM);

    for (let index = 1; index < penetrations.length; index += 1) {
      expect(penetrations[index]).toBeLessThanOrEqual(penetrations[index - 1]!);
    }
  });

  it("폴백 측정은 결과를 ready로 과장하지 않는다", () => {
    const report = inspectStudioVrmGarmentFit({ top: equip("shirt") }, FALLBACK_WARDROBE_METRICS);
    expect(report.status).toBe("warning");
    expect(report.metricSource).toBe("fallback");
    expect(report.issues[0]?.code).toBe("metric-fallback");
  });

  it("입력 서명은 슬롯 순서와 색·직물 표현 변경에 흔들리지 않고 fit 변경은 감지한다", () => {
    const first: WardrobeState = {
      outer: equip("blazer", { color: "#112233", fabricId: "wool" }),
      top: equip("shirt"),
    };
    const reordered: WardrobeState = {
      top: equip("shirt", { color: "#abcdef", fabricId: "satin" }),
      outer: equip("blazer", { color: "#ffffff", fabricId: "leather" }),
    };
    expect(buildStudioVrmGarmentFitInputSignature(first, MEASURED_METRICS))
      .toBe(buildStudioVrmGarmentFitInputSignature(reordered, MEASURED_METRICS));

    const changed = { ...first, outer: equip("blazer", { fit: 1.1 }) };
    expect(buildStudioVrmGarmentFitInputSignature(changed, MEASURED_METRICS))
      .not.toBe(buildStudioVrmGarmentFitInputSignature(first, MEASURED_METRICS));
  });

  it("평가 영수증은 모델·포즈·세대와 진단을 복제해 고정한다", () => {
    const report = inspectStudioVrmGarmentFit({ top: equip("shirt") }, MEASURED_METRICS);
    const receipt = createStudioVrmGarmentEvaluationReceipt({
      modelId: "sample-vrm",
      poseSignature: "pose:abc",
      generation: 4.9,
      report,
    });

    expect(receipt).toEqual(expect.objectContaining({
      kind: "studio-vrm-garment-evaluation-receipt",
      version: 1,
      solver: "analytic-layer-fit-v1",
      modelId: "sample-vrm",
      poseSignature: "pose:abc",
      generation: 4,
      inputSignature: report.signature,
    }));
    expect(receipt.issues).not.toBe(report.issues);
  });
});
