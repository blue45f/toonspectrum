// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { scenarioImageInputFingerprint } from "./ai/studio-scenario-candidate-workflow";
import { StudioScenarioCandidateDesk } from "./StudioScenarioCandidateDesk";

import type { ScenarioPreviewItem } from "./studio-scenario-layout";

afterEach(cleanup);

function basePreview(summary: string, imagePrompt: string): ScenarioPreviewItem {
  return {
    frame: { x: 0, y: 0, width: 800, height: 600 },
    bubbles: [],
    beatType: "setup",
    summary,
    imagePrompt,
    dialogue: "",
    aspect: "landscape",
  };
}

function preview(): ScenarioPreviewItem[] {
  const first = basePreview("첫 컷", "첫 컷 프롬프트");
  first.preferredVariantCount = 2;
  const second = basePreview("둘째 컷", "둘째 컷 프롬프트");
  first.imageCandidates = [{
    id: "candidate-1",
    imageDataUrl: "data:image/png;base64,first",
    inputFingerprint: scenarioImageInputFingerprint(first, "refs"),
    createdAt: "2026-09-09T00:00:00.000Z",
    qualityProfile: "balanced",
    variationStrategy: "directorial",
    variationLabel: "카메라 높이·렌즈",
  }];
  first.imageDataUrl = first.imageCandidates[0].imageDataUrl;
  first.selectedImageCandidateId = "candidate-1";
  return [first, second];
}

describe("StudioScenarioCandidateDesk", () => {
  it("runs a truthful selected-cut workload request with quality and coverage controls", () => {
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
    expect(screen.getByText("승인 0/2 · 승인 필요 1 · 미생성·실패 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    fireEvent.click(screen.getByRole("radio", { name: "최종 작화" }));
    fireEvent.click(screen.getByRole("radio", { name: "커버리지" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 컷 후보 8개 생성" }));

    expect(onGenerate).toHaveBeenCalledWith({
      indexes: [0, 1],
      variants: 4,
      qualityProfile: "final",
      variationStrategy: "coverage",
    });
  });

  it("selects and approves a current candidate while exposing its recipe metadata", () => {
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

    expect(screen.getByText("카메라 높이·렌즈")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1번 컷 후보 1 사용" }));
    fireEvent.click(screen.getByRole("button", { name: "이 후보 승인" }));

    expect(onSelectCandidate).toHaveBeenCalledWith(0, "candidate-1");
    expect(onApproveCandidate).toHaveBeenCalledWith(0, "candidate-1");
  });

  it("offers missing/review filters and blocks an oversized paid batch before dispatch", () => {
    const onGenerate = vi.fn();
    const items = Array.from({ length: 7 }, (_, index) =>
      basePreview(`${index + 1}번 컷`, `${index + 1}번 프롬프트`),
    );
    items[0]!.preferredVariantCount = 4;
    render(
      <StudioScenarioCandidateDesk
        items={items}
        referenceSignature="refs"
        busy={false}
        imageGenerationReady
        onGenerate={onGenerate}
        onSelectCandidate={vi.fn()}
        onApproveCandidate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "미생성·실패" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "승인 필요" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("선택한 요청 28개");
    const generate = screen.getByRole("button", {
      name: "선택 컷 후보 28개 생성",
    }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    fireEvent.click(generate);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
