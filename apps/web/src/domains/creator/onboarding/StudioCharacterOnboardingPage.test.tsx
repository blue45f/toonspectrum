// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY } from "../virtual-space/studio-virtual-space-entry-preference";
import { StudioCharacterOnboardingPage } from "./StudioCharacterOnboardingPage";
import { safeCharacterOnboardingDestination } from "./studio-character-onboarding-destination";

function Destination() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => localStorage.clear());

describe("StudioCharacterOnboardingPage", () => {
  it("requires a direct character choice and returns to the requested local destination", () => {
    render(<MemoryRouter initialEntries={["/onboarding/character?next=%2Fstudio%2Fspace"]}><Routes>
      <Route path="/onboarding/character" element={<StudioCharacterOnboardingPage />} />
      <Route path="/studio/space" element={<Destination />} />
    </Routes></MemoryRouter>);

    expect(screen.getByRole("button", { name: "이 캐릭터로 시작" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    expect(screen.getByRole("button", { name: "이 캐릭터로 시작" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));

    expect(screen.getByText("/studio/space")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toMatchObject({
      confirmed: true,
      avatarIndex: 0,
    });
  });

  it("rejects external and protocol-relative return destinations", () => {
    expect(safeCharacterOnboardingDestination("https://example.com/steal")).toBe("/home");
    expect(safeCharacterOnboardingDestination("//example.com/steal")).toBe("/home");
    expect(safeCharacterOnboardingDestination("/studio/space?lobby=1")).toBe("/studio/space?lobby=1");
  });
});
