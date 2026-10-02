// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ToastHost } from "./toast-host";

import { useI18n } from "@/shared/lib/i18n";
import { toast, useToastStore } from "@/shared/lib/toast-store";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  for (const { id } of useToastStore.getState().toasts) useToastStore.getState().dismiss(id);
  useI18n.getState().setLang("ko");
});

describe("ToastHost", () => {
  it("토스트가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<ToastHost />);
    expect(container.innerHTML).toBe("");
  });

  it("알림 닫기 버튼 이름을 현재 언어로 알리고, 누르면 토스트를 거둔다", () => {
    render(<ToastHost />);
    act(() => { toast("링크를 복사했어요", { durationMs: 60_000 }); });

    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
    expect(screen.queryByText("링크를 복사했어요")).toBeNull();

    useI18n.getState().setLang("en");
    act(() => { toast("Link copied", { durationMs: 60_000 }); });
    expect(screen.getByRole("button", { name: "Dismiss notification" })).toBeTruthy();
  });

  it("휴대폰에서는 하단 탭 위(5rem)에 가운데로 쌓이고 조작 열과 별개로 눌러 닫을 수 있다", () => {
    render(<ToastHost />);
    act(() => { toast("저장했어요", { durationMs: 60_000 }); });

    const host = screen.getByRole("status");
    expect(host.className).toContain("max-md:bottom-[max(5rem,var(--immersive-dock-clearance,0px))]");
    expect(host.className).toContain("pointer-events-none");
    expect(screen.getByRole("button", { name: "알림 닫기" }).closest(".pointer-events-auto")).not.toBeNull();
  });
});
