// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuestEntryButton } from "./guest-entry-button";
import {
  endGuestSession,
  getGuestIdentity,
  GUEST_SESSION_KEY,
} from "@/domains/auth/public/session/guest-session";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  endGuestSession();
});

function renderButton(props?: { next?: string; onDone?: () => void }) {
  render(
    <MemoryRouter>
      <GuestEntryButton {...props} />
    </MemoryRouter>,
  );
}

describe("GuestEntryButton", () => {
  it("renders a bilingual guest entry affordance", () => {
    renderButton();
    const button = screen.getByRole("button", { name: /게스트로 시작하기/ });
    expect(button).toBeTruthy();
  });

  it("starts a guest session on click", () => {
    renderButton();
    expect(getGuestIdentity()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /게스트로 시작하기/ }));
    const guest = getGuestIdentity();
    expect(guest).not.toBeNull();
    expect(guest?.id).toMatch(/^guest_/);
    expect(window.localStorage.getItem(GUEST_SESSION_KEY)).toContain(guest!.id);
  });

  it("calls onDone after starting the guest session", () => {
    const onDone = vi.fn();
    renderButton({ onDone });
    fireEvent.click(screen.getByRole("button", { name: /게스트로 시작하기/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("still starts a guest session when rendered outside a Router", () => {
    render(<GuestEntryButton />);
    expect(getGuestIdentity()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /게스트로 시작하기/ }));
    expect(getGuestIdentity()?.id).toMatch(/^guest_/);
  });
});
