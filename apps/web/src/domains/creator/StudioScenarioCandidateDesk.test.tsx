// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { scenarioImageInputFingerprint } from "./ai/studio-scenario-candidate-workflow";
import { StudioScenarioCandidateDesk } from "./StudioScenarioCandidateDesk";

import type { ScenarioPreviewItem } from "./studio-scenario-layout";

afterEach(cleanup);

function preview(): ScenarioPreviewItem[] {
  const first: ScenarioPreviewItem = {
    frame: { x: 0, y: 0, width: 800, height: 600 },
    bubbles: [],
    beatType: "setup",
    summary: "첫 컷",
    imagePrompt: "첫 컷 프롬프트",
    dialogue: "",
    aspect: "landscape",
    preferredVariantCount: 2,
  };
  const second: ScenarioPreviewItem = {
    ...first,
    summary: "둘째 컷",
    imagePrompt: "둘째 컷 프롬프트",
  };
  first.imageCandidates = [{
    id: "candidate-1",
    imageDataUrl: "data:image/png;base64,first",
    inputFingerprint: scenarioImageInputFingerprint(first, "refs"),
    createdAt: "2026-09-09T00:00:00.000Z",
  }];
  first.imageDataUrl = first.imageCandidates[0].imageDataUrl;
  first.selectedImageCandidateId = "candidate-1";
  return [first, second];
}

describe("StudioScenarioCandidateDesk", () => {
  it("runs a truthful selected-cut workload request", () => {
    const onGenerate = vi.fn();
    render(
      <StudioScenarioCandidateDesk
        items={preview()}
        referenceSignature="refs"
        busy={false}
        imageGenerationReady
        onGenerate={onGenerate}
        onSelectCandidate={vi.fn()}
        onApproveCandidate={vi.fn()}
      />,
    );

    expect(screen.getByText("1컷 × 2개 = 상대 작업량 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 컷 후보 8개 생성" }));

    expect(onGenerate).toHaveBeenCalledWith({ indexes: [0, 1], variants: 4 });
  });

  it("selects and approves a current candidate", () => {
    const onSelectCandidate = vi.fn();
    const onApproveCandidate = vi.fn();
    render(
      <StudioScenarioCandidateDesk
        items={preview()}
        referenceSignature="refs"
        busy={false}
        imageGenerationReady
        onGenerate={vi.fn()}
        onSelectCandidate={onSelectCandidate}
        onApproveCandidate={onApproveCandidate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1번 컷 후보 1 사용" }));
    fireEvent.click(screen.getByRole("button", { name: "이 후보 승인" }));

    expect(onSelectCandidate).toHaveBeenCalledWith(0, "candidate-1");
    expect(onApproveCandidate).toHaveBeenCalledWith(0, "candidate-1");
  });
});
