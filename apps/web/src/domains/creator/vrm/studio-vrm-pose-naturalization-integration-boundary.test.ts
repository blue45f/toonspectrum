import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readStudioVrmPoserImplementationSource } from "./studio-vrm-poser-implementation-source";

const poserSource = readStudioVrmPoserImplementationSource();
const panelSource = readFileSync(new URL("./StudioVrmPoserPanelBodyB.tsx", import.meta.url), "utf8");

function handlerBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(brace, index + 1);
    }
  }
  throw new Error(`unclosed handler body for ${signature}`);
}

describe("studio VRM pose naturalization integration boundary", () => {
  it("bakes the rendered pose and commits the lock-aware result to full-state history", () => {
    const body = handlerBody(poserSource, "function handleNaturalizePose()");
    expect(poserSource).toContain('from "./studio-vrm-pose-naturalization"');
    expect(body).toContain("bakeStudioVrmRuntimePose(currentVrm");
    expect(body).toContain("naturalizeStudioVrmPose({");
    expect(body).toContain("bones: stripFingerBones(baked.bones)");
    expect(body).toContain("lockedBones: lockedPoseBones");
    expect(body).toContain("currentFingerEdits: fingerEdits");
    expect(body).not.toContain("incomingFingerEdits");
    expect(body).toContain("createStudioVrmPoseApplyPlan({");
    expect(body).toContain("commitStudioVrmFullStateHistoryTransaction(");
    expect(body).toContain('setActivePoseId("manual-pose")');
    expect(body).toContain("setCustomBones(plan.bones)");
    expect(body).toContain("setFingerEdits(plan.fingerEdits)");
    expect(body).toContain("applyPoserVisualState(currentVrm");
  });

  it("exposes an explicit disabled-while-live action in the pose panel", () => {
    expect(panelSource).toContain("onClick={handleNaturalizePose}");
    expect(panelSource).toContain("포즈 자연스럽게");
    expect(panelSource).toContain("webcamActive || idleAnimation || isCapturing");
    expect(panelSource).toContain("현재 보이는 자세를 유지하면서");
  });
});
