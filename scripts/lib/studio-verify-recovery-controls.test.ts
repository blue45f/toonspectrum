// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { installStudioRecoveryObservation } from "./studio-verify-recovery-controls.mjs";

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); document.body.replaceChildren(); });
function evidence() {
  return (globalThis as typeof globalThis & { __studioRecoveryObservation?: { observed: boolean; automatic: boolean } }).__studioRecoveryObservation;
}
describe("passive reload recovery evidence", () => {
  it("does not invent a recovery event for a fresh empty document", async () => {
    cleanup = installStudioRecoveryObservation();
    document.body.append(document.createElement("canvas")); await Promise.resolve();
    expect(evidence()).toEqual({ observed: false, automatic: false });
  });
  it("observes an automatic notice even when it disappears before the next interaction", async () => {
    cleanup = installStudioRecoveryObservation();
    const notice = document.createElement("section");
    notice.dataset.studioRecoveryNotice = ""; notice.dataset.studioAutoResume = "true";
    document.body.append(notice); notice.remove(); await Promise.resolve();
    expect(evidence()).toEqual({ observed: true, automatic: true });
  });
  it("distinguishes a manual notice and clears stale per-document observations", async () => {
    cleanup = installStudioRecoveryObservation();
    const wrapper = document.createElement("div"); wrapper.innerHTML = '<section data-studio-recovery-notice></section>';
    document.body.append(wrapper); await Promise.resolve();
    expect(evidence()).toEqual({ observed: true, automatic: false });
    cleanup(); wrapper.remove(); cleanup = installStudioRecoveryObservation();
    expect(evidence()).toEqual({ observed: false, automatic: false });
  });
});
