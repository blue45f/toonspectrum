import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readStudioVrmPoserImplementationSource } from "./studio-vrm-poser-implementation-source";

const poserSource = readStudioVrmPoserImplementationSource();
const panelSource = readFileSync(
  new URL("./StudioVrmPoserPanelBodyB.tsx", import.meta.url),
  "utf8",
);

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

describe("studio VRM ground balance integration boundary", () => {
  it("samples the rendered rig and commits floor and balance as one history entry", () => {
    const body = handlerBody(poserSource, "function handleGroundAndBalancePose()");
    expect(poserSource).toContain('from "./studio-vrm-ground-balance"');
    expect(body).toContain("sampleStudioVrmGroundBalance(currentVrm)");
    expect(body).toContain("planStudioVrmGroundBalance(sample, rigFloorHeight)");
    expect(body).toContain("applyStudioVrmGroundBalanceTranslation(");
    expect(body).toContain("before.poseTranslations");
    expect(body).toContain("before.yOffset + balancePlan.floorDeltaM");
    expect(body).toContain("commitStudioVrmFullStateHistoryTransaction(");
    expect(body).toContain('setActivePoseId("grounded-balanced-pose")');
    expect(body).toContain("setCustomYOffset(nextYOffset)");
    expect(body).toContain("setPoseTranslations(nextTranslations)");
    expect(body).toContain("applyPoserVisualState(currentVrm");
  });

  it("exposes a live-motion-safe action in the pose panel", () => {
    expect(panelSource).toContain("onClick={handleGroundAndBalancePose}");
    expect(panelSource).toContain("발 접지·균형 맞춤");
    expect(panelSource).toContain("양발 바닥 높이를 맞추고");
    expect(panelSource).toContain("webcamActive || idleAnimation || isCapturing");
  });
});
