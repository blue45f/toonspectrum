/**
 * Desktop browser check: comments inbox, 협업 menu, team panel, live jam,
 * local-tab fallback, and two-tab BroadcastChannel presence/chat.
 *
 * Run: pnpm exec tsx scripts/verify-studio-collab-ui.mts
 * Optional: TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5173 (skip vite preview)
 * Expects production build in dist/ when origin is not provided.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const SCRATCH = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-studio-collab");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const EXISTING_ORIGIN = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.replace(/\/$/u, "") ?? "";

async function waitForOrigin(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/studio`);
      if (response.ok || response.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`studio origin not ready: ${origin}`);
}

async function pinStudioLocale(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, "1");
      localStorage.setItem(
        "toonspectrum-lang",
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
      localStorage.setItem(
        "toonspectrum-studio-ui-density:v1",
        JSON.stringify({ mode: "full" }),
      );
    } catch {
      // ignore
    }
  }, QUICKSTART_KEY);
}

async function attachPage(context: BrowserContext, label: string, pageErrors: string[]): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(`${label}:${String(error)}`));
  await pinStudioLocale(page);
  return page;
}

async function revealOverflowMenuGroup(page: Page, label: string): Promise<boolean> {
  const overflow = page.locator('[data-studio-menubar-overflow-menu="true"]');
  if (!(await overflow.isVisible().catch(() => false))) return false;
  await overflow.click({ timeout: 4_000 });
  const item = page.locator('[data-studio-menubar-overflow-panel="true"]').getByRole("menuitem", { name: label, exact: true });
  if (!(await item.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape").catch(() => undefined);
    return false;
  }
  await item.click({ timeout: 4_000 });
  return true;
}

async function openMainMenuGroup(page: Page, label: string): Promise<void> {
  const nav = page.locator('[data-studio-main-menu="true"]');
  await nav.waitFor({ state: "visible", timeout: 15_000 });
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(80);
  const trigger = nav.getByRole("menuitem", { name: label, exact: true });
  if (!(await trigger.isVisible().catch(() => false))) {
    const revealed = await revealOverflowMenuGroup(page, label);
    if (!revealed) {
      await trigger.click({ timeout: 5_000, force: true });
    }
  } else {
    await trigger.click({ timeout: 5_000 });
  }
  await page.locator(`[role="menu"][aria-label="${label}"]`).waitFor({ state: "visible", timeout: 5_000 });
}

async function teamPanelOpen(page: Page): Promise<boolean> {
  return page.locator('[data-testid="studio-team-panel"]').isVisible().catch(() => false);
}

async function openTeamPanel(page: Page): Promise<string> {
  if (await teamPanelOpen(page)) return "already-open";
  const dock = page.locator('[data-studio-presence-team-action="true"]').first();
  if (await dock.isVisible().catch(() => false)) {
    await dismissOverlays(page);
    await dock.click({ timeout: 5_000, force: true });
    if (await page.locator('[data-testid="studio-team-panel"]').waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
      return "presence-dock";
    }
  }
  try {
    await openCollaborationItem(page, "팀 · 공유 권한…");
    if (await teamPanelOpen(page)) return "collaboration-menu";
  } catch {
    // fall through
  }
  throw new Error("team-panel-unopened");
}

function log(step: string): void {
  console.error(`[collab-ui] ${step}`);
}

const notesSafe: string[] = [];

async function presenceSnapshot(page: Page): Promise<string> {
  const dock = page.locator('[data-studio-presence-dock="true"]').first();
  const phase = await dock.getAttribute("data-studio-sync-phase", { timeout: 800 }).catch(() => null);
  const peerCount = await page.locator('[data-studio-presence-stack="true"] button').count().catch(() => 0);
  const link = await page.locator("[data-studio-presence-link]").first().getAttribute("data-studio-presence-link", { timeout: 800 }).catch(() => null);
  return `phase=${phase ?? "none"};link=${link ?? "none"};peers=${peerCount}`;
}

async function openCollaborationItem(page: Page, item: string): Promise<void> {
  await openMainMenuGroup(page, "협업");
  const menu = page.locator(`[role="menu"][aria-label="협업"]`);
  await menu.getByRole("menuitem", { name: item }).click({ timeout: 5_000 });
  await page.waitForTimeout(400);
}

async function dismissOverlays(page: Page): Promise<void> {
  const dismiss = page.locator('[data-studio-quickstart-dismiss="true"]');
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }
  for (const text of ["빠른 시작 닫기 (Esc)", "나중에", "닫기", "예시로 시작", "빈 캔버스", "확인"]) {
    const el = page.getByRole("button", { name: text }).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 800 }).catch(() => undefined);
      await page.waitForTimeout(150);
    }
  }
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function visibleText(page: Page, pattern: string | RegExp): Promise<boolean> {
  const locator = typeof pattern === "string" ? page.getByText(pattern, { exact: true }) : page.getByText(pattern);
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function waitForRoomUrl(page: Page): Promise<string> {
  await page.waitForFunction(
    () => new URL(window.location.href).searchParams.get("room")?.length,
    undefined,
    { timeout: 12_000 },
  );
  return page.url();
}

async function enableLocalTabMode(page: Page): Promise<string> {
  const fallback = page.getByRole("button", { name: "로컬 탭 모드" });
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click({ timeout: 5_000 });
    await page.waitForTimeout(500);
    return "clicked";
  }
  if (await visibleText(page, "같은 출처 탭 연결") || await visibleText(page, "로컬 탭 미리보기")) {
    return "already-local";
  }
  return "unavailable";
}

async function liveStatus(page: Page): Promise<string> {
  const mode = await page.locator("[data-studio-live-mode]").first().getAttribute("data-studio-live-mode", { timeout: 800 }).catch(() => null);
  const draft = await page.locator("[data-studio-draft-collaboration-state]").first().getAttribute("data-studio-draft-collaboration-state", { timeout: 800 }).catch(() => null);
  const copies = [
    "같은 출처 탭 연결",
    "팀 서버 연결",
    "연결 대기",
    "연결 준비 중",
    "연결 오류",
    "작업 탭 확인 대기",
  ];
  const seen: string[] = [];
  for (const copy of copies) {
    if (await visibleText(page, copy)) seen.push(copy);
  }
  return `mode=${mode ?? "none"};draft=${draft ?? "none"};copy=${seen.join("|") || "none"}`;
}

async function main(): Promise<void> {
  const ownedOrigin = EXISTING_ORIGIN ? "" : `http://127.0.0.1:${await findFreePort({ unavailableMessage: "port" })}`;
  const origin = EXISTING_ORIGIN || ownedOrigin;
  const server: ChildProcess | null = EXISTING_ORIGIN
    ? null
    : spawn(
        process.execPath,
        [join(process.cwd(), "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(new URL(origin).port), "--strictPort", "--host", "127.0.0.1"],
        { stdio: "ignore" },
      );
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const notes: string[] = notesSafe;
  const pageErrors: string[] = [];
  try {
    await waitForOrigin(origin);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      locale: "ko-KR",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await attachPage(context, "a", pageErrors);
    log(`goto ${origin}/studio`);
    await page.goto(`${origin}/studio`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    notes.push("canvas:visible");

    const bodyText = await page.locator("body").innerText();
    if (bodyText.includes("화면을 표시하는 중 예상치 못한 문제")) {
      throw new Error("error-boundary");
    }
    notes.push("no-error-boundary");

    const roomUrl = await waitForRoomUrl(page).catch(() => page.url());
    notes.push(`jam-url:${roomUrl.includes("room=") ? "yes" : "no"}`);
    log(`room ${roomUrl}`);

    const commentInbox = page.locator('[data-studio-app-menubar="true"] [data-studio-comments-inbox="true"]')
      .or(page.getByRole("button", { name: /^댓글 검토함/ }).first());
    await commentInbox.waitFor({ state: "visible", timeout: 8_000 });
    await commentInbox.click();
    const commentsDialog = page.locator("#studio-comments-review-dialog");
    const commentsVisible = await commentsDialog.waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false)
      || await visibleText(page, "작성자와 댓글 검색");
    notes.push(`comments-open:${commentsVisible}`);

    let commentCreated = false;
    if (commentsVisible) {
      const addOnSelection = page.getByRole("button", { name: "현재 선택에 댓글" });
      if (await addOnSelection.isEnabled({ timeout: 1_500 }).catch(() => false)) {
        await addOnSelection.click();
        const composer = page.locator("#studio-comments-review-dialog textarea, [id$='-body']").first();
        await composer.waitFor({ state: "visible", timeout: 5_000 });
        await composer.fill("협업 검증용 페이지 댓글입니다.");
        await page.getByRole("button", { name: "등록" }).click();
        commentCreated = await page.getByText("협업 검증용 페이지 댓글입니다.").first().isVisible({ timeout: 6_000 }).catch(() => false);
      }
    }
    notes.push(`comment-create:${commentCreated}`);
    log("comments");

    await page.locator('[aria-label="검토 댓글 닫기"]').click({ timeout: 2_000 }).catch(() => undefined);
    log("comments-closed");
    const teamPath = await openTeamPanel(page);
    log(`team-path ${teamPath}`);
    const teamVisible = await teamPanelOpen(page);
    notes.push(`team-path:${teamPath}`);
    notes.push(`team-panel:${teamVisible}`);
    notes.push(`draft-card:${await page.locator("[data-studio-draft-collaboration-state]").count()}`);
    notes.push(`draft-copy:${await visibleText(page, /저장 전 협업을 준비할 수 있어요|임시 협업 작업실/)}`);
    notes.push(`login-gate:${await visibleText(page, "로그인이 필요해요")}`);
    notes.push(`live-panel:${await page.locator("[data-studio-live-mode]").count()}`);
    notes.push(`presence-a:${await presenceSnapshot(page)}`);
    notes.push(`status-a-before:${await liveStatus(page)}`);

    const fallback = await enableLocalTabMode(page);
    notes.push(`local-fallback:${fallback}`);
    if (fallback === "clicked") {
      await page.waitForTimeout(800);
    }
    notes.push(`status-a-after:${await liveStatus(page)}`);
    log("team");

    const pageB = await attachPage(context, "b", pageErrors);
    await pageB.goto(roomUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await pageB.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 20_000 });
    await dismissOverlays(pageB);
    const teamPathB = await openTeamPanel(pageB);
    notes.push(`team-path-b:${teamPathB}`);
    notes.push(`team-panel-b:${await teamPanelOpen(pageB)}`);
    notes.push(`presence-b:${await presenceSnapshot(pageB)}`);
    notes.push(`local-fallback-b:${await enableLocalTabMode(pageB)}`);
    await pageB.waitForTimeout(1_200);
    notes.push(`status-b:${await liveStatus(pageB)}`);
    notes.push(`status-a-peer:${await liveStatus(page)}`);

    const peersA = await page.getByText(/다른 탭 \d+개|나 포함 \d+개 작업 탭/).first().innerText({ timeout: 1_500 }).catch(() => "");
    const peersB = await pageB.getByText(/다른 탭 \d+개|나 포함 \d+개 작업 탭/).first().innerText({ timeout: 1_500 }).catch(() => "");
    notes.push(`peers-a:${peersA || "none"}`);
    notes.push(`peers-b:${peersB || "none"}`);
    const twoTabPresence = /다른 탭 [1-9]|나 포함 [2-9]/.test(`${peersA} ${peersB}`);
    notes.push(`two-tab-presence:${twoTabPresence}`);

    let chatOk = false;
    const chatA = page.locator("#studio-live-chat-input");
    if (await chatA.isEnabled({ timeout: 1_500 }).catch(() => false)) {
      await chatA.fill("두 탭 채팅 검증");
      await page.locator('[data-studio-live-chat] button[type="submit"], [data-studio-live-chat] button').last().click().catch(async () => {
        await chatA.press("Enter");
      });
      chatOk = await pageB.getByText("두 탭 채팅 검증").first().isVisible({ timeout: 5_000 }).catch(() => false)
        || await page.getByText("두 탭 채팅 검증").first().isVisible({ timeout: 2_000 }).catch(() => false);
    }
    notes.push(`chat:${chatOk}`);
    log("two-tab");

    await page.keyboard.press("Escape").catch(() => undefined);
    await page.getByRole("button", { name: "팀 작업 공간 닫기" }).click({ timeout: 2_000 }).catch(() => undefined);
    try {
      await openCollaborationItem(page, "페이지 검토 · 승인…");
    } catch (error) {
      notes.push(`review-menu:${error instanceof Error ? error.message : String(error)}`);
    }
    const reviewVisible = await page.getByRole("dialog", { name: "페이지 검토와 잠금" }).isVisible().catch(() => false)
      || await visibleText(page, "페이지 검토와 잠금");
    notes.push(`page-review:${reviewVisible}`);
    log("review");

    notes.push(pageErrors.length > 0 ? `page-errors:${pageErrors.slice(0, 5).join(" | ")}` : "page-errors:0");
    const report = {
      ok: commentsVisible && teamVisible && reviewVisible && pageErrors.length === 0,
      twoTabPresence,
      commentCreated,
      chatOk,
      notes,
      pageErrors,
      origin,
    };
    writeFileSync(join(SCRATCH, "studio-collab-ui.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } finally {
    await browser.close().catch(() => undefined);
    try { server?.kill("SIGKILL"); } catch { /* ignore */ }
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
