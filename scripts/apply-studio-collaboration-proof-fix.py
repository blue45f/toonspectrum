from pathlib import Path

TARGET = Path("scripts/verify-studio-collaboration-sync.mts")
source = TARGET.read_text(encoding="utf-8")

helper_marker = "\nasync function waitForDocumentLane(\n"
if source.count(helper_marker) != 1:
    raise SystemExit("waitForDocumentLane insertion marker changed")

helper = r'''

/**
 * A production verification keeps the authenticated server-backed lane. A static Vite preview has
 * no Nest realtime-ticket endpoint, so its truthful browser contract is the user-visible
 * same-origin fallback. Switching through the real recovery UI keeps this proof end-to-end while
 * avoiding a false failure caused by an intentionally absent preview backend.
 */
async function ensureLocalPreviewTransport(page: Page, label: string): Promise<void> {
  if (EXISTING_ORIGIN) return;

  const liveMode = page.locator("[data-studio-live-mode]").first();
  if (
    await liveMode
      .getAttribute("data-studio-live-mode", { timeout: 800 })
      .catch(() => null) === "local"
  ) return;

  const presenceDock = page.locator('[data-studio-presence-dock="true"]').first();
  await presenceDock.waitFor({ state: "visible", timeout: 20_000 });

  const fallback = page.getByRole("button", { name: "로컬 탭 모드", exact: true }).first();
  if (!await fallback.isVisible().catch(() => false)) {
    const teamAction = page.locator('[data-studio-presence-team-action="true"]').first();
    if (await teamAction.isVisible().catch(() => false)) {
      await teamAction.click({ force: true });
    } else {
      await presenceDock.click({ force: true });
    }
  }

  await fallback.waitFor({ state: "visible", timeout: 20_000 });
  await fallback.click();
  await page.waitForFunction(
    () => document
      .querySelector<HTMLElement>("[data-studio-live-mode]")
      ?.dataset.studioLiveMode === "local",
    undefined,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "팀 작업 공간 닫기" }).first()
    .click({ timeout: 1_500 })
    .catch(() => undefined);
  log(`${label} uses the explicit same-origin collaboration fallback`);
}
'''
source = source.replace(helper_marker, f"{helper}{helper_marker}", 1)

replacements = {
    "  const roomUrl = await waitForRoomUrl(pageA);\n  const phaseA = await waitForDocumentLane(pageA, attachedA.diagnostics);":
        "  const roomUrl = await waitForRoomUrl(pageA);\n  await ensureLocalPreviewTransport(pageA, \"A\");\n  const phaseA = await waitForDocumentLane(pageA, attachedA.diagnostics);",
    "  await dismissOverlays(pageB);\n  const phaseB = await waitForDocumentLane(pageB, attachedB.diagnostics);":
        "  await dismissOverlays(pageB);\n  await ensureLocalPreviewTransport(pageB, \"B\");\n  const phaseB = await waitForDocumentLane(pageB, attachedB.diagnostics);",
    "  await dismissOverlays(pageC);\n  const phaseC = await waitForDocumentLane(pageC, attachedC.diagnostics);":
        "  await dismissOverlays(pageC);\n  await ensureLocalPreviewTransport(pageC, \"C\");\n  const phaseC = await waitForDocumentLane(pageC, attachedC.diagnostics);",
}
for before, after in replacements.items():
    if source.count(before) != 1:
        raise SystemExit(f"collaboration proof marker changed: {before[:80]!r}")
    source = source.replace(before, after, 1)

TARGET.write_text(source, encoding="utf-8")
