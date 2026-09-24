// @vitest-environment jsdom

import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderStudioServiceWorkerUpdatePrompt } from "./studio-service-worker-registration";
import {
  refreshStudioUpdateSafety,
  registerStudioUpdateSafetySource,
  resetStudioUpdateSafetyForTest,
} from "../../domains/creator/studio-update-safety";

afterEach(() => {
  document.getElementById("toonspectrum-sw-update")?.remove();
  resetStudioUpdateSafetyForTest();
  cleanup();
  vi.restoreAllMocks();
});

function promptParts() {
  const host = document.getElementById("toonspectrum-sw-update");
  const root = host?.shadowRoot;
  if (!host || !root) throw new Error("update prompt was not rendered");
  const apply = root.querySelector<HTMLButtonElement>(".apply");
  const dismiss = root.querySelector<HTMLButtonElement>(".dismiss");
  const title = root.querySelector<HTMLElement>(".title");
  const description = root.querySelector<HTMLElement>(".description");
  if (!apply || !dismiss || !title || !description) throw new Error("update prompt is incomplete");
  return { host, apply, dismiss, title, description };
}

describe("service worker update safety prompt", () => {
  it("disables update while Studio reports unsaved work and enables it after durability", async () => {
    let safe = false;
    const remove = registerStudioUpdateSafetySource("editor", () => safe
      ? { safe: true }
      : {
          safe: false,
          reason: "unsaved-work",
          message: "마지막 획이 아직 저장되지 않았습니다.",
        });
    const onApply = vi.fn(async () => undefined);

    renderStudioServiceWorkerUpdatePrompt(onApply);
    const prompt = promptParts();
    expect(prompt.apply.disabled).toBe(true);
    expect(prompt.apply.textContent).toContain("안전 상태 대기 중");
    expect(prompt.description.textContent).toBe("마지막 획이 아직 저장되지 않았습니다.");

    safe = true;
    refreshStudioUpdateSafety();
    expect(prompt.apply.disabled).toBe(false);
    expect(prompt.apply.textContent).toContain("지금 업데이트");

    fireEvent.click(prompt.apply);
    expect(onApply).toHaveBeenCalledOnce();
    remove();
    fireEvent.click(prompt.dismiss);
  });

  it("shows the live sync reason and never invokes apply while blocked", () => {
    registerStudioUpdateSafetySource("sync", () => ({
      safe: false,
      reason: "sync-pending",
      pendingCount: 12,
      message: "서버 승인을 기다리는 변경 12개가 있습니다.",
    }));
    const onApply = vi.fn(async () => undefined);

    renderStudioServiceWorkerUpdatePrompt(onApply);
    const prompt = promptParts();
    expect(prompt.title.textContent).toContain("저장과 동기화가 끝난 뒤");
    expect(prompt.description.textContent).toContain("12개");
    fireEvent.click(prompt.apply);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(prompt.dismiss);
  });
});
