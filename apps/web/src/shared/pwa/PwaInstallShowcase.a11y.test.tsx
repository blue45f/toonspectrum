// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PwaInstallShowcase } from "./PwaInstallShowcase";

afterEach(cleanup);

describe("PwaInstallShowcase 접근성 계약", () => {
  it("탭은 선택된 것만 Tab 순서에 있고 방향키·Home·End로 이동하며 포커스가 따라간다", () => {
    render(<PwaInstallShowcase onClose={() => undefined} onInstalled={() => undefined} page />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    const inTabOrder = tabs.filter((tab) => tab.getAttribute("tabindex") === "0");
    expect(inTabOrder).toHaveLength(1);
    const active = inTabOrder[0]!;
    expect(active.getAttribute("aria-selected")).toBe("true");
    active.focus();

    fireEvent.keyDown(active, { key: "ArrowRight" });
    const next = screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")!;
    expect(next).not.toBe(active);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(next, { key: "End" });
    const all = screen.getAllByRole("tab");
    const last = all[all.length - 1]!;
    expect(last.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Home" });
    const first = screen.getAllByRole("tab")[0]!;
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(first);

    // 패널은 선택된 탭을 가리키고 포커스를 받을 수 있다.
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(first.id);
    expect(panel.getAttribute("tabindex")).toBe("0");
  });

  it("모달에서는 Tab이 다이얼로그 안에서 순환하고 닫으면 트리거로 포커스가 돌아간다", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "설치 안내 열기";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <PwaInstallShowcase onClose={onClose} onInstalled={() => undefined} />,
    );
    const dialog = screen.getByRole("dialog");
    // 초기 포커스는 data-autofocus(닫기 버튼)로 이동한다.
    expect(dialog.contains(document.activeElement)).toBe(true);

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable[focusable.length - 1]!;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
