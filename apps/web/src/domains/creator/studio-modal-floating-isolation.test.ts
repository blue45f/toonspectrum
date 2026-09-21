// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isolateStudioModalFloatingTargets } from "./studio-modal-floating-isolation";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.reverse()) cleanup(); cleanups.length = 0; document.body.replaceChildren(); });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(modal = true) {
  const root = document.createElement("section"), dialog = document.createElement("div");
  dialog.setAttribute("aria-modal", String(modal)); root.append(dialog); document.body.append(root);
  const notice = document.createElement("aside"); notice.dataset.studioShellFloatingTarget = "offline-readiness";
  notice.innerHTML = '<details open><summary>연결 상태</summary><p>저장 상태는 유지</p></details>';
  document.body.append(notice);
  return { root, dialog, notice };
}
function isolate(root: HTMLElement, dialog: HTMLElement) {
  const cleanup = isolateStudioModalFloatingTargets(root, dialog); cleanups.push(cleanup); return cleanup;
}
describe("external Studio floating notice isolation", () => {
  it("hides only external floating notices without unmounting their content and restores all state", () => {
    const { root, dialog, notice } = fixture(); const details = notice.querySelector("details");
    const restore = isolate(root, dialog);
    expect(notice.hidden).toBe(true); expect(notice.hasAttribute("inert")).toBe(true);
    expect(notice.getAttribute("aria-hidden")).toBe("true"); expect(dialog.hidden).toBe(false);
    restore();
    expect(notice.hidden).toBe(false); expect(notice.hasAttribute("inert")).toBe(false);
    expect(notice.hasAttribute("aria-hidden")).toBe(false);
    expect(notice.querySelector("details")).toBe(details); expect(details?.open).toBe(true);
  });
  it("isolates a warning that mounts asynchronously and restores its current message", async () => {
    const { root, dialog, notice } = fixture(); notice.remove(); const restore = isolate(root, dialog);
    document.body.append(notice); await settle(); expect(notice.hidden).toBe(true);
    notice.querySelector("p")!.textContent = "연결 복구됨"; await settle(); restore();
    expect(notice.hidden).toBe(false); expect(notice.textContent).toContain("연결 복구됨");
  });
  it("preserves pre-existing hidden/inert/accessibility attributes", () => {
    const { root, dialog, notice } = fixture(); notice.setAttribute("hidden", "until-found");
    notice.setAttribute("inert", "existing"); notice.setAttribute("aria-hidden", "false");
    const restore = isolate(root, dialog); restore();
    expect(notice.getAttribute("hidden")).toBe("until-found");
    expect(notice.getAttribute("inert")).toBe("existing"); expect(notice.getAttribute("aria-hidden")).toBe("false");
  });
  it("keeps notices suspended until both nested modal owners release, in either order", () => {
    const { root, dialog, notice } = fixture(); const nested = document.createElement("div");
    nested.setAttribute("aria-modal", "true"); dialog.append(nested);
    const first = isolate(root, dialog), second = isolate(root, nested);
    first(); expect(notice.hidden).toBe(true); second(); expect(notice.hidden).toBe(false);
    first(); second(); expect(notice.hidden).toBe(false);
  });
  it("leaves internal targets, unmarked app content and other modal controls untouched", () => {
    const { root, dialog, notice } = fixture();
    const internal = notice.cloneNode(true) as HTMLElement; dialog.append(internal);
    const other = document.createElement("div"); other.setAttribute("aria-modal", "true");
    const nested = notice.cloneNode(true) as HTMLElement; other.append(nested); document.body.append(other);
    const ordinary = document.createElement("aside"); document.body.append(ordinary);
    isolate(root, dialog);
    expect(internal.hidden).toBe(false); expect(nested.hidden).toBe(false); expect(ordinary.hidden).toBe(false);
  });
  it("releases an existing target moved into the active modal", async () => {
    const { root, dialog, notice } = fixture(); isolate(root, dialog); expect(notice.hidden).toBe(true);
    dialog.append(notice); await settle(); expect(notice.hidden).toBe(false);
  });
  it("does not overwrite newer explicit application state on close", () => {
    const { root, dialog, notice } = fixture(); const restore = isolate(root, dialog);
    notice.setAttribute("hidden", "until-found"); notice.setAttribute("aria-hidden", "false");
    restore(); expect(notice.getAttribute("hidden")).toBe("until-found"); expect(notice.getAttribute("aria-hidden")).toBe("false");
  });
  it("disconnects observers on close so later notices remain actionable", async () => {
    const { root, dialog, notice } = fixture(); const restore = isolate(root, dialog); restore();
    notice.remove(); document.body.append(notice); await settle(); expect(notice.hidden).toBe(false);
  });
});
