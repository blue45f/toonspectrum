// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY } from "../virtual-space/studio-virtual-space-entry-preference";
import { StudioCharacterOnboardingPage } from "./StudioCharacterOnboardingPage";
import { safeCharacterOnboardingDestination } from "./studio-character-onboarding-destination";

function Destination() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("StudioCharacterOnboardingPage", () => {
  it("requires a direct character choice and returns to the requested local destination", () => {
    render(<MemoryRouter initialEntries={["/onboarding/character?next=%2Fstudio%2Fspace"]}><Routes>
      <Route path="/onboarding/character" element={<StudioCharacterOnboardingPage />} />
      <Route path="/studio/space" element={<Destination />} />
    </Routes></MemoryRouter>);

    expect(screen.getByRole("button", { name: "이 캐릭터로 시작" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    // 닉네임 기본값이 없으므로 캐릭터 선택만으로는 시작할 수 없다
    expect(screen.getByRole("button", { name: "이 캐릭터로 시작" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("예: 희준 작가"), { target: { value: "희준 작가" } });
    expect(screen.getByRole("button", { name: "이 캐릭터로 시작" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));

    expect(screen.getByText("/studio/space")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toMatchObject({
      confirmed: true,
      avatarIndex: 0,
      nickname: "희준 작가",
    });
  }, 30000);

  it("rejects external and protocol-relative return destinations", () => {
    expect(safeCharacterOnboardingDestination("https://example.com/steal")).toBe("/home");
    expect(safeCharacterOnboardingDestination("//example.com/steal")).toBe("/home");
    expect(safeCharacterOnboardingDestination("/studio/space?lobby=1")).toBe("/studio/space?lobby=1");
  });

  it("저장이 막히면 실패를 알리고, 다시 누르면 안내와 달리 저장 없이 입장시킨다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    render(<MemoryRouter initialEntries={["/onboarding/character?next=%2Fstudio%2Fspace"]}><Routes>
      <Route path="/onboarding/character" element={<StudioCharacterOnboardingPage />} />
      <Route path="/studio/space" element={<Destination />} />
    </Routes></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    fireEvent.change(screen.getByPlaceholderText("예: 희준 작가"), { target: { value: "희준 작가" } });
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));

    // 저장 실패가 안내 없이 삼켜지지 않고, 아직 이동하지 않는다.
    expect(screen.getByRole("status").textContent).toContain("저장하지 못했어요");
    expect(screen.queryByText("/studio/space")).toBeNull();

    // 다시 누르면 진행을 막지 않는다.
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));
    expect(screen.getByText("/studio/space")).toBeTruthy();
  }, 30000);
});
