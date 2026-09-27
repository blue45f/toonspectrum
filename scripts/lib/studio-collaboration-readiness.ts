import { errors, type Page } from "playwright";

/** 지연 마운트된 시작 안내를 실제로 닫고, 보이는 dock의 문서 phase를 확인한다. */
export async function waitForStudioCollaborationDocumentLane(
  page: Page,
  readyPhases: ReadonlySet<string>,
  timeoutMs = 30_000,
): Promise<string> {
  const dock = page.locator('[data-studio-presence-dock="true"]').first();
  const welcome = page.locator('[data-studio-cinematic-canvas-welcome="true"]');
  const deadline = Date.now() + timeoutMs;
  let lastPhase: string | null = null;
  let lastTimeout: string | null = null;

  while (Date.now() < deadline) {
    try {
      if (await welcome.isVisible()) {
        // 클릭이 가로막혀도 전체 readiness 제한 시간을 새로 시작하지 않는다.
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await welcome.getByRole("button", { name: "시작 안내 닫기", exact: true }).click({
          timeout: Math.min(1_000, remaining),
        });
      }

      if (!(await welcome.isVisible()) && await dock.isVisible()) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        lastPhase = await dock.getAttribute("data-studio-sync-phase", { timeout: remaining });
        if (
          lastPhase !== null && readyPhases.has(lastPhase)
          && await dock.isVisible() && !(await welcome.isVisible())
          && Date.now() < deadline
        ) return lastPhase;
      }
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      lastTimeout = error.message;
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) await page.waitForTimeout(Math.min(100, remaining));
  }

  throw new Error(
    `협업 문서 준비 시간 ${timeoutMs}ms 초과: 시작 안내 닫기와 dock 표시/phase를 확인하세요. `
    + `url=${page.url()}, phase=${lastPhase ?? "unavailable"}`
    + (lastTimeout ? `, 마지막 UI 대기 오류: ${lastTimeout}` : "")
    + "\n복구 후 pnpm exec tsx scripts/verify-studio-collaboration-sync.mts로 다시 검증하세요.",
  );
}
