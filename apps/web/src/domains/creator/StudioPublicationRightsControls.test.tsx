// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPublicationRightsControls } from "./StudioPublicationRightsControls";

import { createDefaultCreatorCommunityMetadata } from "@/shared/lib/creator-community-publication-contract";

const base = createDefaultCreatorCommunityMetadata("upload");

afterEach(cleanup);

describe("StudioPublicationRightsControls", () => {
  it("edits provenance, accessibility copy, and rights before publishing", () => {
    const onChange = vi.fn();
    render(
      <StudioPublicationRightsControls
        metadata={base}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "게시 제작 방식" }), {
      target: { value: "agent_assisted" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      provenance: "agent_assisted",
    }));

    fireEvent.change(screen.getByRole("textbox", { name: "작품 대체 텍스트" }), {
      target: { value: "별빛 왕관을 쓴 판타지 소녀" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      altText: "별빛 왕관을 쓴 판타지 소녀",
    }));

    fireEvent.click(screen.getByRole("checkbox", { name: /독자 다운로드 허용/u }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      downloadAllowed: true,
    }));
  });

  it("surfaces blocking public-accessibility issues next to the fields", () => {
    render(
      <StudioPublicationRightsControls
        metadata={{ ...base, provenance: "agent_assisted" }}
        onChange={() => undefined}
        issues={[
          {
            code: "ALT_TEXT_REQUIRED",
            severity: "error",
            message: "작품 대체 텍스트를 입력해 주세요.",
            path: "community.altText",
          },
          {
            code: "ASSISTANCE_DISCLOSURE_REQUIRED",
            severity: "error",
            message: "AI 에이전트 참여 방식을 공개해 주세요.",
            path: "community.attributionText",
          },
        ]}
      />,
    );

    expect(screen.getByRole("list", { name: "접근성 및 권리 확인 사항" })).toBeTruthy();
    expect(screen.getByText("작품 대체 텍스트를 입력해 주세요.")).toBeTruthy();
    expect(screen.getByText("AI 에이전트 참여 방식을 공개해 주세요.")).toBeTruthy();
  });
});
