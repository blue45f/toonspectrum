import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";

const origin = new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5254");
assert(["localhost", "127.0.0.1"].includes(origin.hostname) && origin.pathname === "/" && !origin.username && !origin.password);
const cwd = await fs.realpath(process.cwd()), run = promisify(execFile);
const { stdout } = await run("lsof", ["-nP", `-iTCP:${origin.port}`, "-sTCP:LISTEN", "-t"]);
let owned = false;
for (const pid of new Set(stdout.trim().split(/\s+/u))) {
  const result = await run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const directory = result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (directory && await fs.realpath(directory) === cwd) owned = true;
}
assert(owned, "Delivery QA server must belong to this worktree");
const output = path.resolve(".qa/review-delivery-workflow"); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }), results = [];
const fixed = { sourceDigest: "d".repeat(64), profileDigest: "e".repeat(64), manifestDigest: "f".repeat(64), approvalDigest: "b".repeat(64) };
function publicJob(job, actor) {
  const manager = actor === "actor", recipient = actor === "other", active = job.state !== "cancelled";
  return { ...job, currentRecipientBinding: true,
    canIssue: manager && job.state === "prepared",
    canDownload: active && (manager || (recipient && ["issued", "delivered", "accepted"].includes(job.state))),
    canAccept: recipient && job.state === "delivered",
    canCancel: manager && ["prepared", "issued", "delivered"].includes(job.state) };
}
function preparedJob(input) {
  const preparedAt = "2026-09-23T01:00:00.000Z";
  const manifest = { contract: "toonstudio.approved-review-delivery/v1", jobId: input.id, title: input.title, preparedAt,
    source: { reviewId: input.subject.reviewId, revisionId: input.subject.revisionId, rootGraphHash: input.subject.rootGraphHash,
      sourceDigest: fixed.sourceDigest, approvalDigest: fixed.approvalDigest }, profile: input.profile,
    rights: { contract: input.rights.contract, statementVersion: input.rights.statementVersion, mode: input.rights.mode,
      rightsGraphDigest: input.rights.rightsGraphDigest, confirmed: true },
    pages: [{ ordinal: 0, sha256: "a".repeat(64), byteLength: 4, mediaType: "image/png", width: 10, height: 10, path: "pages/000001.png" }],
    totalPageBytes: 4, checksum: "SHA-256" };
  return { contract: "studio-review-delivery-job-v1", id: input.id, workId: input.subject.workId, subject: input.subject,
    title: input.title, sourceDigest: fixed.sourceDigest, profile: input.profile, profileDigest: fixed.profileDigest,
    rights: input.rights, manifest, manifestDigest: fixed.manifestDigest,
    recipient: { userId: "other", displayName: "수신 팀원" }, state: "prepared", version: 0,
    createdBy: "actor", createdAt: preparedAt, issuedAt: null, deliveredAt: null, acceptedAt: null, cancelledAt: null,
    archiveSha256: null, archiveByteLength: null };
}
try {
  for (const width of [1440, 820, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", acceptDownloads: true, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [], requests = [];
    let actor = "actor", job = null;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin.origin || !url.pathname.startsWith("/api/")) return route.continue();
      if (!url.pathname.includes("/review-deliveries")) return route.abort();
      requests.push({ actor, method: request.method(), path: url.pathname });
      const base = /\/review-deliveries$/u.test(url.pathname);
      if (request.method() === "GET" && base) return route.fulfill({ json: {
        items: job ? [publicJob(job, actor)] : [], recipients: actor === "actor" ? [{ userId: "other", displayName: "수신 팀원" }] : [],
        canPrepare: actor === "actor", mode: "free",
      } });
      const body = request.postDataJSON();
      if (request.method() === "POST" && base) { assert.equal(actor, "actor"); assert.equal(body.recipientUserId, "other");
        assert.equal(body.rights.mode, "free"); assert.match(body.rights.rightsGraphDigest, /^[a-f0-9]{64}$/u); job = preparedJob(body);
        return route.fulfill({ json: publicJob(job, actor) }); }
      assert(job); assert.equal(body.manifestDigest, fixed.manifestDigest); assert.equal(body.expectedVersion, job.version);
      if (url.pathname.endsWith("/issue")) { assert.equal(actor, "actor"); job = { ...job, state: "issued", version: 1, issuedAt: "2026-09-23T01:01:00.000Z" }; return route.fulfill({ json: publicJob(job, actor) }); }
      if (url.pathname.endsWith("/download")) { assert.equal(actor, "other"); job = { ...job, state: "delivered", version: 2,
        deliveredAt: "2026-09-23T01:02:00.000Z", archiveSha256: "1".repeat(64), archiveByteLength: 10 };
        return route.fulfill({ status: 200, contentType: "application/zip", body: Buffer.from("PK\u0003\u0004delivery") }); }
      if (url.pathname.endsWith("/accept")) { assert.equal(actor, "other"); assert.equal(body.confirmed, true); job = { ...job, state: "accepted", version: 3, acceptedAt: "2026-09-23T01:03:00.000Z" }; return route.fulfill({ json: publicJob(job, actor) }); }
      throw new Error(`Unexpected delivery request: ${request.method()} ${url.pathname}`);
    });
    try {
      await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-export.html`);
      const panel = page.getByRole("region", { name: "공식 전달과 수신 확인", exact: true }); await expect(panel).toBeVisible();
      const prepare = panel.getByRole("button", { name: "전달 준비", exact: true }); await expect(prepare).toBeDisabled();
      const statement = panel.getByRole("textbox", { name: "권리·사용 조건 확인 근거", exact: true });
      await statement.fill("이 승인본의 팀 전달 조건과 무료 운영 모드를 확인했습니다."); await panel.getByRole("checkbox").check(); await expect(prepare).toBeEnabled();
      await prepare.focus(); await page.keyboard.press("Enter"); await expect(panel.getByRole("heading", { name: "승인된 검수본" })).toBeVisible();
      await panel.getByRole("button", { name: "전달 발행", exact: true }).click(); await expect(panel.getByText(/전달 발행$/u)).toBeVisible();
      actor = "other"; await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click();
      const save = panel.getByRole("button", { name: "검증 ZIP 저장", exact: true }); await expect(save).toBeVisible();
      const downloadEvent = page.waitForEvent("download"); await save.click(); const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), `toonstudio-approved-delivery-${job.id}.zip`);
      await expect(panel.getByRole("button", { name: "수신 완료 확인", exact: true })).toBeVisible();
      await panel.getByRole("button", { name: "수신 완료 확인", exact: true }).click(); await expect(panel.getByText(/수신 완료$/u)).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const action of await panel.getByRole("button").all()) { const box = await action.boundingBox(); if (box) assert(box.height >= 44); }
      assert.deepEqual(errors, []); assert(requests.some((item) => item.path.endsWith("/download") && item.actor === "other"));
      await panel.screenshot({ path: path.join(output, `delivery-${width}.png`) });
      results.push({ width, state: job.state, requests: requests.length, status: "passed" });
      console.log(`PASS official delivery ${width}`);
    } finally { await context.close(); }
  }
  await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify({ results,
    scope: "actual delivery component with synthetic same-origin HTTP/session; not production auth, storage or WAN" }, null, 2)}\n`);
} finally { await browser.close(); }
