// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketAccountEntryActions } from "./MarketAccountEntryActions";

import { subscribeAuthModalRequests } from "@/domains/auth/public/session/auth-modal-intent";

afterEach(cleanup);

describe("소재 작업을 유지하는 일반 계정 진입", () => {
  it.each(["market-library", "market-resource-library"] as const)("%s에서 인증 모드만 요청하고 이동하지 않는다", (source) => {
    const receive = vi.fn();
    const stop = subscribeAuthModalRequests(receive);
    const before = window.location.href;
    try {
      render(<MarketAccountEntryActions source={source} />);
      fireEvent.click(screen.getByRole("button", { name: "로그인하고 계속" }));
      expect(receive).toHaveBeenLastCalledWith({ reason: "protected-action", source, mode: "login" });
      fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
      expect(receive).toHaveBeenLastCalledWith({ reason: "protected-action", source, mode: "signup" });
      expect(window.location.href).toBe(before);
      expect(receive).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });
});
