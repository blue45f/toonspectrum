import { expect, test } from "@playwright/test";

import { fixtureRoom, fixtureMessage } from "../apps/web/src/domains/collaboration/hiring/creator-meeting.test-fixtures";
import { installBetaEventDismissal } from "../scripts/lib/public-page-event-gate.mjs";

import type { Page } from "@playwright/test";

async function prepare(page: Page, ended = false) {
  const user = { id: "guest", name: "지원자", email: "guest@example.com", image: null, role: "creator" };
  await installBetaEventDismissal(page);
  const onboarding = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "나에게 맞는 작업 환경 만들기", exact: true }) });
  await page.addLocatorHandler(onboarding, async () => {
    await onboarding.locator('button[aria-label="나중에 설정"]').click();
    await expect(onboarding).toBeHidden();
  });
  // Explicit local browser session/API fixtures, not production authentication.
  await page.addInitScript((actor) => sessionStorage.setItem("toonspectrum-auth-session", JSON.stringify({ user: actor })), user);
  let sends = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session")) return route.fulfill({ json: { authenticated: true, user } });
    if (path.endsWith("/me")) return route.fulfill({ json: { profile: { ...user, avatar: null, bio: null, regionSettings: null } } });
    if (path.endsWith("/collaborations/teams")) return route.fulfill({ json: [] });
    if (path.endsWith("/collaborations/rooms")) return route.fulfill({ json: [fixtureRoom, { ...fixtureRoom, id: "room-b", title: "두 번째 면접" }] });
    if (path.endsWith("/messages")) {
      if (route.request().method() === "POST") {
        sends++;
        if (sends === 1) return route.fulfill({ status: 503, json: { message: "합성 전송 오류" } });
        return route.fulfill({ json: { id: "confirmed-message" } });
      }
      return route.fulfill({ json: path.includes("/room-a/") ? [fixtureMessage] : [] });
    }
    if (path.endsWith("/room-a")) return route.fulfill({ json: { ...fixtureRoom, status: ended ? "ended" : fixtureRoom.status } });
    if (path.endsWith("/room-b")) return route.fulfill({ json: { ...fixtureRoom, id: "room-b", title: "두 번째 면접" } });
    return route.fulfill({ json: {} });
  });
  return { sends: () => sends };
}

test("private waiting room preserves a draft through uncertain send and explicit recovery", async ({ page }) => {
  const counter = await prepare(page);
  await page.goto("/collaborate/workspace?room=room-a");
  const room = page.getByRole("region", { name: "면접·회의 대기실", exact: true });
  await expect(room.getByText("대기 안내", { exact: true })).toBeVisible();
  await expect(room.getByRole("button", { name: "회의 종료" })).toHaveCount(0);
  await room.getByRole("textbox", { name: "메시지", exact: true }).fill("면접 질문 초안");
  await room.getByRole("button", { name: "텍스트 보내기" }).click();
  await expect(room.getByRole("alert")).toBeVisible(); expect(counter.sends()).toBe(1);
  await room.getByRole("button", { name: "방 상태 다시 확인" }).click();
  await expect(room.getByRole("textbox", { name: "메시지", exact: true })).toHaveValue("면접 질문 초안");
  expect(counter.sends()).toBe(1);
  await room.getByRole("button", { name: "텍스트 보내기" }).click();
  await expect(room.getByRole("textbox", { name: "메시지", exact: true })).toHaveValue("");
  expect(counter.sends()).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("switching rooms removes the previous private conversation and draft", async ({ page }) => {
  await prepare(page); await page.goto("/collaborate/workspace?room=room-a");
  const room = page.getByRole("region", { name: "면접·회의 대기실", exact: true });
  await room.getByRole("textbox", { name: "메시지", exact: true }).fill("다른 방으로 넘기지 않을 초안");
  await page.getByRole("button", { name: /두 번째 면접/u }).click();
  await expect(room.getByRole("heading", { name: "두 번째 면접" })).toBeVisible();
  await expect(room.getByRole("textbox", { name: "메시지", exact: true })).toHaveValue("");
  await expect(room.getByText("대기 안내", { exact: true })).toHaveCount(0);
});
test("ended room has no device capture or send controls", async ({ page }) => {
  await prepare(page, true); await page.goto("/collaborate/workspace?room=room-a");
  const room = page.getByRole("region", { name: "면접·회의 대기실", exact: true });
  await expect(room.getByRole("heading", { name: fixtureRoom.title })).toBeVisible();
  await expect(room.getByRole("button", { name: "장치 테스트 시작" })).toHaveCount(0);
  await expect(room.getByRole("textbox")).toHaveCount(0);
});
