import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioVrmPhotoPoseScanner } from "./StudioVrmPhotoPoseScanner";

const source = readFileSync(new URL("./StudioVrmPhotoPoseScanner.tsx", import.meta.url), "utf8");

describe("StudioVrmPhotoPoseScanner", () => {
  it("renders a local-only still-photo workflow with transform controls", () => {
    const html = renderToStaticMarkup(<StudioVrmPhotoPoseScanner onApply={vi.fn(() => true)} />);
    expect(html).toContain("사진 포즈 스캔");
    expect(html).toContain("서버로 보내지 않고");
    expect(html).toContain("사진 회전");
    expect(html).toContain("좌우 반전");
    expect(html).toContain("전신 포즈");
    expect(html).toContain("image/jpeg,image/png,image/webp");
  });

  it("disables file admission when the poser has no usable character", () => {
    const html = renderToStaticMarkup(<StudioVrmPhotoPoseScanner disabled onApply={() => false} />);
    expect(html).toContain("disabled");
    expect(source).toContain('disabled={disabled}');
    expect(source).toContain('if (applied) setCandidate(null)');
  });

  it("keeps hand inference optional and commits fingers only through explicit apply", () => {
    expect(source).toContain("initPhotoHandLandmarker()");
    expect(source).toContain("disposePhotoHandLandmarker()");
    expect(source).toContain("STUDIO_VRM_PHOTO_HAND_INIT_BUDGET_MS");
    expect(source).toContain("인식한 손가락도 함께 적용");
    expect(source).toContain("손 미검출 · 기존 손 유지");
    expect(source).toContain("fingerEdits: includeFingerEdits ? candidate.hands.fingerEdits : {}");
    expect(source).toContain("detectedHandSides: includeFingerEdits ? candidate.hands.detectedSides : []");
  });

  it("keeps every visible scanner action at least 44px tall", () => {
    expect(source.match(/min-h-11/gu)?.length).toBeGreaterThanOrEqual(5);
    expect(source).toContain('className="h-11 w-full');
  });
});
