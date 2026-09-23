import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";

const origin = new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5254");
assert(["localhost", "127.0.0.1"].includes(origin.hostname) && origin.pathname === "/" && !origin.username && !origin.password);
const cwd = await fs.realpath(process.cwd());
const run = promisify(execFile);
const { stdout } = await run("lsof", ["-nP", `-iTCP:${origin.port}`, "-sTCP:LISTEN", "-t"]);
let owned = false;
for (const pid of new Set(stdout.trim().split(/\s+/u))) {
  const result = await run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const directory = result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (directory && await fs.realpath(directory) === cwd) owned = true;
}
assert(owned, "Delivery QA server must belong to this worktree");

const output = path.resolve(".qa/review-delivery-release-acceptance");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const pageErrors = [];
const consoleErrors = [];
const requests = [];
const fixed = {
  sourceDigest: "d".repeat(64),
  profileDigest: "e".repeat(64),
  manifestDigest: "f".repeat(64),
  approvalDigest: "b".repeat(64),
};
const state = {
  job: null,
  operations: new Map(),
  events: [],
  ambiguousPrepareCommitted: false,
  ambiguousIssueCommitted: false,
  ambiguousDownloadCommitted: false,
};

function publicJob(job, actor) {
  const manager = actor === "actor";
  const recipient = actor === "other";
  const active = job.state !== "cancelled";
  return {
    ...job,
    currentRecipientBinding: true,
    canIssue: manager && job.state === "prepared",
    canDownload: active && (manager || (recipient && ["issued", "delivered", "accepted"].includes(job.state))),
    canAccept: recipient && job.state === "delivered",
    canCancel: manager && ["prepared", "issued", "delivered"].includes(job.state),
  };
}

function pages(count = 100) {
  return Array.from({ length: count }, (_, ordinal) => ({
    ordinal,
    sha256: ordinal.toString(16).padStart(64, "0"),
    byteLength: 4,
    mediaType: "image/png",
    width: 10,
    height: 10,
    path: `pages/${String(ordinal + 1).padStart(6, "0")}.png`,
  }));
}

function preparedJob(input) {
  const preparedAt = "2026-09-23T01:00:00.000Z";
  const deliveryPages = pages();
  const manifest = {
    contract: "toonstudio.approved-review-delivery/v1",
    jobId: input.id,
    title: input.title,
    preparedAt,
    source: {
      reviewId: input.subject.reviewId,
      revisionId: input.subject.revisionId,
      rootGraphHash: input.subject.rootGraphHash,
      sourceDigest: fixed.sourceDigest,
      approvalDigest: fixed.approvalDigest,
    },
    profile: input.profile,
    rights: {
      contract: input.rights.contract,
      statementVersion: input.rights.statementVersion,
      mode: input.rights.mode,
      rightsGraphDigest: input.rights.rightsGraphDigest,
      confirmed: true,
    },
    pages: deliveryPages,
    totalPageBytes: deliveryPages.reduce((sum, page) => sum + page.byteLength, 0),
    checksum: "SHA-256",
  };
  return {
    contract: "studio-review-delivery-job-v1",
    id: input.id,
    workId: input.subject.workId,
    subject: input.subject,
    title: input.title,
    sourceDigest: fixed.sourceDigest,
    profile: input.profile,
    profileDigest: fixed.profileDigest,
    rights: input.rights,
    manifest,
    manifestDigest: fixed.manifestDigest,
    recipient: { userId: "other", displayName: "수신 팀원" },
    state: "prepared",
    version: 0,
    createdBy: "actor",
    createdAt: preparedAt,
    issuedAt: null,
    deliveredAt: null,
    acceptedAt: null,
    cancelledAt: null,
    archiveSha256: null,
    archiveByteLength: null,
  };
}

function operationReplay(actor, body) {
  const key = `${actor}:${body.operationId}`;
  const existing = state.operations.get(key);
  if (!existing) return null;
  if (existing.request !== JSON.stringify(body)) return { conflict: true };
  return existing;
}

function saveOperation(actor, action, body, response) {
  const key = `${actor}:${body.operationId}`;
  const record = { actor, action, request: JSON.stringify(body), response };
  state.operations.set(key, record);
  state.events.push({ actor, action, operationId: body.operationId });
  return record;
}

async function installRoutes(page, actor, clientId) {
  page.on("pageerror", (error) => pageErrors.push({ clientId, message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ clientId, message: message.text() });
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin || !url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.includes("/review-deliveries")) return route.abort();
    const base = /\/review-deliveries$/u.test(url.pathname);
    const action = base ? (request.method() === "GET" ? "list" : "prepare")
      : url.pathname.endsWith("/issue") ? "issue"
        : url.pathname.endsWith("/download") ? "download"
          : url.pathname.endsWith("/accept") ? "accept"
            : url.pathname.endsWith("/cancel") ? "cancel" : "unknown";
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    requests.push({ actor, clientId, action, method: request.method(), operationId: body?.operationId ?? null });

    if (request.method() === "GET" && base) {
      return route.fulfill({ json: {
        items: state.job ? [publicJob(state.job, actor)] : [],
        recipients: actor === "actor" ? [{ userId: "other", displayName: "수신 팀원" }] : [],
        canPrepare: actor === "actor",
        mode: "free",
      } });
    }

    assert(body && typeof body.operationId === "string");
    const replay = operationReplay(actor, body);
    if (replay?.conflict) return route.fulfill({ status: 409, json: { code: "operation_conflict" } });
    if (replay) {
      if (replay.action === "download") {
        return route.fulfill({ status: 200, contentType: "application/zip", body: Buffer.from("PK\u0003\u0004delivery") });
      }
      return route.fulfill({ json: publicJob(replay.response, actor) });
    }

    if (request.method() === "POST" && base) {
      assert.equal(actor, "actor");
      assert.equal(body.recipientUserId, "other");
      assert.equal(body.rights.mode, "free");
      assert.match(body.rights.rightsGraphDigest, /^[a-f0-9]{64}$/u);
      if (state.job) return route.fulfill({ status: 409, json: { code: "already_prepared" } });
      state.job = preparedJob(body);
      saveOperation(actor, "prepare", body, state.job);
      if (clientId === "owner-primary" && !state.ambiguousPrepareCommitted) {
        state.ambiguousPrepareCommitted = true;
        return route.abort("failed");
      }
      return route.fulfill({ json: publicJob(state.job, actor) });
    }

    assert(state.job);
    assert.equal(body.manifestDigest, fixed.manifestDigest);

    if (action === "issue") {
      assert.equal(actor, "actor");
      if (state.job.state !== "prepared" || body.expectedVersion !== 0) {
        return route.fulfill({ status: 409, json: { code: "studio_review_delivery_conflict" } });
      }
      state.job = { ...state.job, state: "issued", version: 1, issuedAt: "2026-09-23T01:01:00.000Z" };
      saveOperation(actor, "issue", body, state.job);
      if (clientId === "owner-primary" && !state.ambiguousIssueCommitted) {
        state.ambiguousIssueCommitted = true;
        return route.abort("failed");
      }
      return route.fulfill({ json: publicJob(state.job, actor) });
    }

    if (action === "download") {
      assert.equal(actor, "other");
      if (!["issued", "delivered", "accepted"].includes(state.job.state)) {
        return route.fulfill({ status: 409, json: { code: "studio_review_delivery_conflict" } });
      }
      if (state.job.state === "issued") {
        state.job = {
          ...state.job,
          state: "delivered",
          version: 2,
          deliveredAt: "2026-09-23T01:02:00.000Z",
          archiveSha256: "1".repeat(64),
          archiveByteLength: 12,
        };
      }
      saveOperation(actor, "download", body, state.job);
      if (clientId === "recipient" && !state.ambiguousDownloadCommitted) {
        state.ambiguousDownloadCommitted = true;
        return route.abort("failed");
      }
      return route.fulfill({ status: 200, contentType: "application/zip", body: Buffer.from("PK\u0003\u0004delivery") });
    }

    if (action === "accept") {
      assert.equal(actor, "other");
      assert.equal(body.confirmed, true);
      if (state.job.state !== "delivered" || body.expectedVersion !== 2) {
        return route.fulfill({ status: 409, json: { code: "studio_review_delivery_conflict" } });
      }
      state.job = { ...state.job, state: "accepted", version: 3, acceptedAt: "2026-09-23T01:03:00.000Z" };
      saveOperation(actor, "accept", body, state.job);
      return route.fulfill({ json: publicJob(state.job, actor) });
    }

    return route.fulfill({ status: 409, json: { code: "unexpected_action" } });
  });
}

async function openHarness(context, actor, clientId, width) {
  const page = await context.newPage();
  await installRoutes(page, actor, clientId);
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-export.html?actor=${actor}`);
  const panel = page.getByRole("region", { name: "공식 전달과 수신 확인", exact: true });
  await expect(panel).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-fixture-actor", actor);
  results.push({ kind: "opened", clientId, actor, width });
  return { page, panel };
}

async function assertViewport(page, panel, width, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} overflowed at ${width}px`);
  for (const action of await panel.getByRole("button").all()) {
    const box = await action.boundingBox();
    if (box) assert(box.height >= 44, `${label} has a short action at ${width}px`);
  }
  await panel.screenshot({ path: path.join(output, `${label}-${width}.png`) });
}

const primaryContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR", acceptDownloads: true, reducedMotion: "reduce" });
const staleContext = await browser.newContext({ viewport: { width: 820, height: 1000 }, locale: "ko-KR", acceptDownloads: true, reducedMotion: "reduce" });
const recipientContext = await browser.newContext({ viewport: { width: 390, height: 1000 }, locale: "ko-KR", acceptDownloads: true, reducedMotion: "reduce" });
let primary;
let stale;
let recipient;
let maxDomNodes = 0;
let minDomNodes = Number.POSITIVE_INFINITY;
try {
  primary = await openHarness(primaryContext, "actor", "owner-primary", 1440);
  stale = await openHarness(staleContext, "actor", "owner-stale", 820);
  recipient = await openHarness(recipientContext, "other", "recipient", 390);

  const prepare = primary.panel.getByRole("button", { name: "전달 준비", exact: true });
  await expect(prepare).toBeDisabled();
  await primary.panel.getByRole("textbox", { name: "권리·사용 조건 확인 근거", exact: true })
    .fill("이 승인본의 팀 전달 조건과 무료 운영 모드를 확인했습니다.");
  await primary.panel.getByRole("checkbox").check();
  await expect(prepare).toBeEnabled();

  await prepare.click();
  await expect(primary.panel.getByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/u)).toBeVisible();
  assert.equal(state.events.filter((event) => event.action === "prepare").length, 1);
  await prepare.click();
  await expect(primary.panel.getByRole("heading", { name: "수정 검수", exact: true })).toBeVisible();
  const prepareRequests = requests.filter((request) => request.clientId === "owner-primary" && request.action === "prepare");
  assert.equal(new Set(prepareRequests.map((request) => request.operationId)).size, 1, "prepare retry changed operation identity");

  await stale.panel.getByRole("button", { name: "새로 확인", exact: true }).click();
  await expect(stale.panel.getByRole("button", { name: "전달 발행", exact: true })).toBeVisible();
  const primaryIssue = primary.panel.getByRole("button", { name: "전달 발행", exact: true });
  const staleIssue = stale.panel.getByRole("button", { name: "전달 발행", exact: true });
  await primaryIssue.click();
  await expect(primary.panel.getByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/u)).toBeVisible();
  await staleIssue.click();
  await expect(stale.panel.getByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/u)).toBeVisible();
  assert.equal(state.events.filter((event) => event.action === "issue").length, 1);
  await primaryIssue.click();
  await expect(primary.panel.getByText(/전달 발행$/u)).toBeVisible();
  const primaryIssueRequests = requests.filter((request) => request.clientId === "owner-primary" && request.action === "issue");
  assert.equal(new Set(primaryIssueRequests.map((request) => request.operationId)).size, 1, "issue retry changed operation identity");
  assert.notEqual(primaryIssueRequests[0]?.operationId,
    requests.find((request) => request.clientId === "owner-stale" && request.action === "issue")?.operationId,
    "independent tabs unexpectedly shared operation identity");

  await recipient.panel.getByRole("button", { name: "새로 확인", exact: true }).click();
  await expect(recipient.panel.getByRole("button", { name: "검증 ZIP 저장", exact: true })).toBeVisible();
  await recipientContext.setOffline(true);
  await expect(recipient.panel.getByRole("alert")).toContainText("연결이 복구되어");
  await expect(recipient.panel.getByRole("button", { name: "검증 ZIP 저장", exact: true })).toHaveCount(0);
  await recipientContext.setOffline(false);
  await expect(recipient.panel.getByRole("button", { name: "검증 ZIP 저장", exact: true })).toBeVisible();

  const save = recipient.panel.getByRole("button", { name: "검증 ZIP 저장", exact: true });
  await save.click();
  await expect(recipient.panel.getByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/u)).toBeVisible();
  const downloadEvent = recipient.page.waitForEvent("download");
  await save.click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), `toonstudio-approved-delivery-${state.job.id}.zip`);
  const downloadRequests = requests.filter((request) => request.clientId === "recipient" && request.action === "download");
  assert.equal(new Set(downloadRequests.map((request) => request.operationId)).size, 1, "download retry changed operation identity");
  assert.equal(state.events.filter((event) => event.action === "download").length, 1);

  const accept = recipient.panel.getByRole("button", { name: "수신 완료 확인", exact: true });
  await expect(accept).toBeVisible();
  await accept.click();
  await expect(recipient.panel.getByText(/수신 완료$/u)).toBeVisible();
  assert.equal(state.job.state, "accepted");
  assert.equal(state.job.manifest.pages.length, 100);

  await primary.panel.getByRole("button", { name: "새로 확인", exact: true }).click();
  await expect(primary.panel.getByText(/수신 완료$/u)).toBeVisible();
  await assertViewport(primary.page, primary.panel, 1440, "owner-primary");
  await assertViewport(stale.page, stale.panel, 820, "owner-stale");
  await assertViewport(recipient.page, recipient.panel, 390, "recipient");

  const soakMs = Math.max(2_000, Number(process.env.STUDIO_DELIVERY_SOAK_MS ?? 15_000));
  const deadline = Date.now() + soakMs;
  let cycle = 0;
  while (Date.now() < deadline) {
    const offline = cycle % 2 === 0;
    await recipientContext.setOffline(offline);
    if (offline) await expect(recipient.panel.getByRole("alert")).toContainText("연결이 복구되어");
    else await expect(recipient.panel.getByText(/수신 완료$/u)).toBeVisible();
    const nodes = await recipient.page.evaluate(() => document.getElementsByTagName("*").length);
    maxDomNodes = Math.max(maxDomNodes, nodes);
    minDomNodes = Math.min(minDomNodes, nodes);
    cycle += 1;
    await recipient.page.waitForTimeout(250);
  }
  await recipientContext.setOffline(false);
  await expect(recipient.panel.getByText(/수신 완료$/u)).toBeVisible();
  assert(maxDomNodes - minDomNodes < 80, `delivery DOM grew unexpectedly: ${minDomNodes} -> ${maxDomNodes}`);
  results.push({ kind: "soak", durationMs: soakMs, cycles: cycle, minDomNodes, maxDomNodes, status: "passed" });

  for (const width of [320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", acceptDownloads: true, reducedMotion: "reduce" });
    try {
      const view = await openHarness(context, "other", `recipient-${width}`, width);
      await expect(view.panel.getByText(/수신 완료$/u)).toBeVisible();
      await assertViewport(view.page, view.panel, width, "recipient-responsive");
    } finally {
      await context.close();
    }
  }

  assert.deepEqual(pageErrors, []);
  const unexpectedConsoleErrors = consoleErrors.filter(({ message }) => !/net::ERR_FAILED|status of 409 \(Conflict\)/u.test(message));
  assert.deepEqual(unexpectedConsoleErrors, []);
  assert.equal(state.events.filter((event) => event.action === "prepare").length, 1);
  assert.equal(state.events.filter((event) => event.action === "issue").length, 1);
  assert.equal(state.events.filter((event) => event.action === "download").length, 1);
  assert.equal(state.events.filter((event) => event.action === "accept").length, 1);
  results.push({
    kind: "workflow",
    state: state.job.state,
    pageCount: state.job.manifest.pages.length,
    committedOperations: state.events.length,
    requests: requests.length,
    status: "passed",
  });
  console.log(`PASS official delivery release acceptance: ${state.job.state}, ${state.job.manifest.pages.length} pages`);
} finally {
  await Promise.allSettled([primaryContext.close(), staleContext.close(), recipientContext.close()]);
  await browser.close();
  await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    results,
    requests,
    events: state.events,
    pageErrors,
    consoleErrors,
    scope: {
      component: "actual StudioReviewDelivery React component",
      http: "synthetic same-origin API with idempotency/CAS semantics",
      devices: "browser-emulated responsive viewports, not physical devices",
      network: "Playwright offline/online emulation, not carrier or production WAN",
      authStorage: "isolated browser sessions and synthetic API; production auth/object storage are covered by separate PostgreSQL/private-storage integration suites",
    },
  }, null, 2)}\n`);
}
