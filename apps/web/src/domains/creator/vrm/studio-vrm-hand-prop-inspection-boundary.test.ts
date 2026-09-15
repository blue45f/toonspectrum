import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const panelBody = readFileSync(new URL("./StudioVrmPoserPanelBodyC.tsx", import.meta.url), "utf8");
const propPanel = readFileSync(new URL("./StudioVrmPropPanel.tsx", import.meta.url), "utf8");

describe("Studio VRM hand and prop close-up integration boundary", () => {
  it("renders one authored control per finger and commits only that finger", () => {
    expect(panelBody).toContain("STUDIO_VRM_FINGER_NAMES.map((finger)");
    expect(panelBody).toContain("readStudioVrmFingerCurlDegrees(fingerEdits, side, finger)");
    expect(panelBody).toContain("updateFingerCurl(side, Number(event.target.value), finger)");
    expect(panelBody).toContain('setActiveCameraId("inspectLeftHand")');
    expect(panelBody).toContain('setActiveCameraId("inspectRightHand")');
  });

  it("routes the selected prop socket to a non-mutating inspection camera", () => {
    expect(panelBody).toContain("resolveStudioVrmPropInspectionPreset(item.bone)");
    expect(propPanel).toContain("readonly onInspect?: (item: PropInstance) => void;");
    expect(propPanel).toContain("onInspect={onInspect ? () => onInspect(item) : undefined}");
    expect(propPanel).toContain("부착부 확대 확인");
  });
});
