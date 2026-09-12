// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioAssetGovernancePanel } from "./StudioAssetGovernancePanel";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioAssetGovernancePanel", () => {
  it("asks for user intent instead of storage or server terminology", async () => {
    render(<StudioAssetGovernancePanel projectId="project-assets" locale="ko" />);

    expect(screen.getByRole("heading", { name: "어디에 사용할지만 알려 주세요" })).toBeTruthy();
    expect(screen.getByLabelText("사용 목적")).toBeTruthy();
    expect(screen.getByLabelText("함께 쓰는 사람")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/SQLite|OPFS|리비전|서버 잠금/u);

    fireEvent.click(screen.getByLabelText("구매한 계정 연결됨"));
    await waitFor(() => {
      expect(window.localStorage.getItem("toonspectrum:studio-asset-governance:v1:project-assets"))
        .toContain("providerAccountConnected");
    });
  });

  it("recalculates prohibited AI training as a visible blocking condition", async () => {
    render(<StudioAssetGovernancePanel projectId="project-assets" locale="ko" />);

    fireEvent.click(screen.getByText("전문 사용 범위"));
    fireEvent.click(screen.getByLabelText("AI 학습에 사용"));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/사용 범위나 권한을 수정해야 합니다|수정이 필요한 항목/u);
    });
  });
});

describe("governance option accessibility", () => {
  it.each([
    { locale: "ko" as const, name: "구매한 계정 연결됨", description: "구매 내역과 사용 좌석을 확인합니다." },
    { locale: "en" as const, name: "Purchased account connected", description: "Verify purchase history and licensed seats." },
  ])("associates the $locale label and description with its checkbox", ({ locale, name, description }) => {
    render(<StudioAssetGovernancePanel projectId="project-labels" locale={locale} />);

    const checkbox = screen.getByRole("checkbox", { name });
    const label = checkbox.closest("label");
    const descriptionId = checkbox.getAttribute("aria-describedby");
    expect(checkbox.id).not.toBe("");
    expect(label?.htmlFor).toBe(checkbox.id);
    expect(label?.getAttribute("aria-label")).toBe(name);
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(description);

    const ids = screen.getAllByRole("checkbox").map((input) => input.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
