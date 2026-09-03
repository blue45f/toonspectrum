// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioMannequinWorkshopPreview } from "./StudioMannequinWorkshopPreview";
import { describeStudioMannequinWorkshopState } from "./StudioMannequinWorkshopPreview";
import { DEFAULT_SHAPER_SELECTION } from "./studio-shaper-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
} from "./studio-mannequin-model";

const PARAMS = {
  ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
};

describe("StudioMannequinWorkshopPreview", () => {
  it("renders stable metadata for the same preset applied by the runtime planner", () => {
    render(
      <StudioMannequinWorkshopPreview
        params={PARAMS}
        selection={{
          ...DEFAULT_SHAPER_SELECTION,
          body: "body-muscular",
          face: "face-sharp",
          bodypose: "pose-sword",
        }}
        label="판타지 액션 실제 결과 미리보기"
      />,
    );

    const preview = screen.getByRole("img", { name: "판타지 액션 실제 결과 미리보기" });
    expect(preview.getAttribute("data-mannequin-workshop-preview")).toBe("true");
    expect(preview.getAttribute("data-body-preset")).toBe("body-muscular");
    expect(preview.getAttribute("data-face-preset")).toBe("face-sharp");
    expect(preview.getAttribute("data-pose-preset")).toBe("pose-sword");
    expect(preview.querySelectorAll("path").length).toBeGreaterThan(4);
  });

  it("describes only geometry dimensions that the mannequin actually supports", () => {
    const summary = describeStudioMannequinWorkshopState(
      { ...PARAMS, headCount: 3.5, faceWidth: 1.15, eyeScale: 1.25, noseHeight: 0.86 },
      { ...DEFAULT_SHAPER_SELECTION, bodypose: "pose-run" },
    );
    expect(summary).toEqual({
      body: "SD 체형",
      face: "웹툰 계란형",
      eyes: "SD 큰 눈",
      nose: "낮은 코",
      pose: "달리기",
    });
  });
});
