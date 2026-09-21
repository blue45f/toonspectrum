import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { evaluateReviewPolicy, reviewPolicyCommandSchema } from "@toonspectrum/studio-project-model";

const origin = process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:4486";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Loopback fixture only");
const output = "artifacts/blueprint-continuation"; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", reducedMotion: "reduce" });
    const pin = { reviewId: "fixture-review", artifactId: "fixture-artifact", revisionId: "fixture-revision", rootGraphHash: "a".repeat(64) };
    let definition = { mode: "parallel", groups: [{ id: "production", label: "제작 검토", reviewerIds: ["fixture-artist"], requiredApprovals: 1 }] };
    let policyVersion = 1, stateVersion = 1, votes = [];
    const commands = [], errors = [], unexpected = [], history = [];
    const snapshot = () => ({ actorId: "fixture-artist", canConfigure: true, eligibleReviewerIds: ["fixture-artist"], policy: {
      pin, definition, policyVersion, stateVersion, configuredBy: "fixture-artist", configuredAt: "2026-09-21T00:00:00.000Z", votes,
      ...evaluateReviewPolicy(definition, votes, ["fixture-artist"]),
    } });
    await context.route("**/api/**", async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === "GET" && path.endsWith("/fixture-review/policy")) return route.fulfill({ json: snapshot() });
      if (request.method() === "GET" && path.endsWith("/fixture-review/policy/history")) return route.fulfill({ json: {
        pin, actorId: "fixture-artist", entries: [...history].reverse(), nextBeforeStateVersion: null,
      } });
      if (request.method() === "POST" && path.endsWith("/fixture-review/policy/commands")) {
        const value = reviewPolicyCommandSchema.parse(request.postDataJSON()); commands.push(value.type);
        assert.deepEqual(value.pin, pin); assert.equal(value.expectedPolicyVersion, policyVersion); assert.equal(value.expectedStateVersion, stateVersion);
        stateVersion++;
        if (value.type === "configure") { definition = value.definition; policyVersion++; votes = []; }
        else votes = [{ groupId: value.groupId, actorId: "fixture-artist", stateVersion, decision: value.decision, note: value.note, decidedAt: new Date().toISOString() }];
        history.push({ id: value.id, policyVersion, stateVersion, actorId: "fixture-artist", createdAt: new Date().toISOString(), command: value });
        return route.fulfill({ json: snapshot() });
      }
      if (request.method() === "POST" && path.endsWith("/fixture-review/decision")) {
        assert.deepEqual(request.postDataJSON(), { status: "approved", policyExpectation: { ...pin, policyVersion, stateVersion } });
        assert.equal(snapshot().policy.satisfied, true); commands.push("final-approval");
        return route.fulfill({ json: { id: pin.reviewId, status: "approved", decidedAt: new Date().toISOString(), decidedBy: "fixture-artist", updatedAt: new Date().toISOString() } });
      }
      unexpected.push(`${request.method()} ${path}`); return route.fulfill({ status: 403, json: { error: "unexpected fixture API" } });
    });
    await context.addInitScript(() => localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 })));
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/tools/browser-harnesses/blueprint-continuation.html`);
      await page.getByRole("heading", { name: "검수 정책·알림·자동화 연속 작업 검증" }).waitFor();
      await page.getByText("그룹별 검수·승인 정책", { exact: true }).click();
      await page.getByRole("button", { name: "그룹 검수 기록 확인" }).click();
      await page.getByRole("region", { name: "제작 검토" }).waitFor();
      await page.getByRole("button", { name: "그룹 정책 설정·변경" }).click();
      await expect(page.getByRole("button", { name: "정책 저장 확정" })).toBeDisabled();
      await page.getByLabel("설정·변경 이유").fill("담당 검수 기준 확인");
      await page.getByRole("checkbox", { name: /이 고정 검수본에만/u }).check();
      await page.getByRole("button", { name: "정책 저장 확정" }).click();
      await expect(page.getByText(/정책 버전 2/u)).toBeVisible();
      await page.getByRole("button", { name: "이 그룹 승인 의견 기록" }).click();
      await expect(page.getByRole("heading", { name: /제작 검토 · 그룹 충족/u })).toBeVisible();
      await expect(page.getByRole("button", { name: "그룹 검토를 확인하고 최종 승인" })).toBeDisabled();
      await page.getByRole("checkbox", { name: /현재 고정본·정책/u }).check();
      await page.getByRole("button", { name: "그룹 검토를 확인하고 최종 승인" }).click();
      await expect(page.locator("[data-review-changes]")).toHaveAttribute("data-review-changes", "1");
      await page.getByText("정책 변경·표결 이력", { exact: true }).click();
      await page.getByRole("button", { name: "최신 정책·표결 이력 확인" }).click();
      await expect(page.getByText("이 페이지 2개 기록", { exact: true })).toBeVisible();
      await expect(page.getByText("담당 검수 기준 확인", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "그룹 승인 의견", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "알림 정책 저장" })).toBeDisabled();
      await page.getByLabel("시간대", { exact: true }).fill("Asia/Seoul");
      await page.getByLabel("묶음 주기").selectOption("weekly");
      await page.getByRole("checkbox", { name: "표시된 담당자의 알림 선호 변경을 확인했습니다." }).check();
      await page.getByRole("button", { name: "알림 정책 저장" }).click();
      await expect(page.locator("[data-command-count]")).toHaveAttribute("data-command-count", "1");
      await page.getByRole("button", { name: "활성 규칙 실행" }).click();
      await expect(page.locator("[data-command-count]")).toHaveAttribute("data-command-count", "1");
      await page.getByRole("checkbox", { name: "표시된 업무와 알림만 저장하는 것을 확인했습니다." }).check();
      await page.getByRole("button", { name: "미리보기 확인 후 적용" }).click();
      await expect(page.locator("[data-command-count]")).toHaveAttribute("data-command-count", "2");
      await expect(page.getByLabel("담당자별 알림 묶음").locator("details").first()).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal overflow");
      assert.deepEqual(commands, ["configure", "vote", "final-approval"]); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      results.push({ width, status: "passed", commands, evidence: "Actual React UI with intercepted HTTP and synthetic aggregate; independent PostgreSQL tests cover server authority" });
      console.log(`PASS blueprint continuation ${width}`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${width}-failed.png`, fullPage: true }).catch(() => undefined);
      results.push({ width, status: "failed", error: String(error), errors, unexpected }); throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ origin, results }, null, 2)); }
