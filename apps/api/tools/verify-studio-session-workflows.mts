import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";
import { studioWorkSessionCommandSchema } from "@toonspectrum/studio-project-model/work-session";
import { Image, encodePng } from "image-js";
import { Pool } from "pg";

import { validatePostgresIntegrationUrl } from "../../../scripts/run-postgres-integration-tests.mjs";

import type { PrivateObjectStoragePort } from "../src/platform/adapters/private-object-storage/private-object-storage.port";

// Never inherits a production connection or tests an arbitrary remote origin.
const connection = process.env.TEST_DATABASE_URL;
assert(connection, "An explicitly prepared disposable TEST_DATABASE_URL is required");
validatePostgresIntegrationUrl(connection, { environment: { NODE_ENV: "test" } });
const databaseUrl = new URL(connection), origin = process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5367";
assert(["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname));
assert(/(?:^|[_-])(?:test|integration)(?:$|[_-])/u.test(databaseUrl.pathname.slice(1)));
assert(new URL(origin).protocol === "http:" && new URL(origin).hostname === "127.0.0.1");
process.env.DATABASE_URL = connection; process.env.NODE_ENV = "test";
process.env.STUDIO_WORK_ASSET_ADMISSION = "enable-immutable-readonly-work-assets-v1";
const out = process.env.STUDIO_SESSION_QA_OUT ?? "/tmp/toon-session-purpose-browser"; await mkdir(out, { recursive: true });
const database = await import("../src/platform/database");
const { StudioProjectGraphRepository } = await import("../src/modules/studio-project-graph/studio-project-graph.repository");
const { StudioWorkSessionRepository } = await import("../src/modules/studio-project-graph/studio-work-session.repository");
const { StudioWorkSessionService } = await import("../src/modules/studio-project-graph/studio-work-session.controller");
const { StudioSessionEvidenceService } = await import("../src/modules/studio-project-graph/studio-session-evidence.controller");
const { DrizzleStudioWorkAssetRepository } = await import("../src/modules/creator/studio-work-asset.repository");
const { StudioWorkAssetService } = await import("../src/modules/creator/studio-work-asset.service");
const { StudioReviewPreviewProducerRepository } = await import("../src/modules/studio-project-graph/studio-review-preview-producer.repository");
const { StudioReviewPreviewProducerService } = await import("../src/modules/studio-project-graph/studio-review-preview-producer.service");
const { studioReviewPreviewDigest } = await import("../src/modules/studio-project-graph/studio-review-preview-producer.contract");
const pool = new Pool({ connectionString: connection, max: 3 });
const users: string[] = [], works: string[] = [], objects = new Map<string, Buffer>();
const storage: PrivateObjectStoragePort = {
  async verifyPrivatePurposeBuckets() { return { ready: true, privatePurposeBuckets: 3 }; },
  async uploadImmutable(input) {
    const hash = createHash("sha256").update(input.bytes).digest("hex");
    const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
      purpose: input.purpose, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`, byteLength: input.bytes.length, contentType: input.contentType };
    objects.set(`${object.purpose}:${object.digest}`, Buffer.from(input.bytes)); return object;
  },
  async createSignedReadUrl({ object, expiresInSeconds }) {
    assert(objects.has(`${object.purpose}:${object.digest}`));
    return { url: `https://preview.invalid/${object.digest.slice(7)}`, expiresAtEpochMs: Date.now() + expiresInSeconds * 1000 };
  },
  async deleteGeneratedObject({ object }) { objects.delete(`${object.purpose}:${object.digest}`); },
};
const graph = new StudioProjectGraphRepository(), sessions = new StudioWorkSessionRepository(), service = new StudioWorkSessionService(sessions);
const evidence = new StudioSessionEvidenceService(sessions);
const assets = new DrizzleStudioWorkAssetRepository(), assetService = new StudioWorkAssetService(assets, storage);
const producer = new StudioReviewPreviewProducerService(new StudioReviewPreviewProducerRepository(graph), assetService);
const token = randomUUID(), allowedActors = new Set<string>();
const server = createServer(async (req, res) => {
  try {
    assert(req.headers["x-session-test-token"] === token, "Not an authorized isolated test client");
    const actor = String(req.headers["x-session-test-actor"] ?? ""); assert(allowedActors.has(actor), "Unknown fixture actor");
    const url = new URL(req.url!, "http://127.0.0.1"), match = url.pathname.match(/^\/api\/creator\/works\/([^/]+)\/work-sessions\/([^/]+)(?:\/(resources|commands|operations|evidence)(?:\/([^/]+))?)?$/u);
    assert(match); const workId = decodeURIComponent(match[1]!), sessionId = decodeURIComponent(match[2]!); assert(works.includes(workId));
    let result: unknown;
    if (req.method === "GET") result = await service.run<unknown>(actor, (user, repo) => match[3] === "resources" ? repo.resources(user, workId, sessionId, Number(url.searchParams.get("offset") ?? "0"))
      : match[3] === "evidence" ? evidence.read(user, workId, sessionId, Number(url.searchParams.get("offset") ?? "0"))
      : match[3] === "operations" ? repo.receipt(user, workId, sessionId, decodeURIComponent(match[4]!)) : repo.current(user, workId, sessionId));
    else {
      assert(req.method === "POST" && match[3] === "commands");
      let raw = ""; for await (const chunk of req) { raw += String(chunk); assert(Buffer.byteLength(raw) <= 256000); }
      const input = studioWorkSessionCommandSchema.parse(JSON.parse(raw)); result = await service.run<unknown>(actor, (user, repo) => repo.command(user, workId, sessionId, input));
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(result));
  } catch (error) {
    const failure = error as { getStatus?: () => number; message?: string };
    res.writeHead(failure.getStatus?.() ?? 400, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ message: failure.message ?? "Rejected" }));
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address(); assert(address && typeof address !== "string"); const endpoint = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch(), results: unknown[] = [];
let failure: unknown = null;
async function fixture() {
  const actor = randomUUID(), guest = randomUUID(), workId = randomUUID(); users.push(actor, guest); works.push(workId); allowedActors.add(actor); allowedActors.add(guest);
  for (const id of [actor, guest]) await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, "Isolated session browser actor"]);
  const doc = { aiProvenance: { version: 1, operations: [{ id: "saved-ai-record", kind: "text", status: "failed", provider: "고정 제공자", model: "고정 모델", transport: "local",
    createdAt: "2026-09-20T00:00:00.000Z", usage: { promptTokens: 0 }, prompt: { sha256: "e".repeat(64), raw: "PRIVATE PROMPT NOT EXPOSED" },
    target: { pageId: "saved-page-1", frameId: "saved-cut-1" } }] }, version: 3, width: 2, pagesList: [{ id: "saved-page-1", canvasH: 1, elements: [{ id: "saved-cut-1", type: "frame", x: 0, y: 0, width: 1, height: 1 }] }] };
  await pool.query('INSERT INTO creator_work (id,"userId",title,doc,revision) VALUES ($1,$2,$3,$4::jsonb,7)', [workId, actor, "Browser-owned test work", JSON.stringify(doc)]);
  await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'commenter','active',$3,now())`, [workId, guest, randomUUID()]);
  const intent = await producer.prepare(actor, { intentId: randomUUID(), workId, sourceServerRevision: 7, sourceContentDigest: studioReviewPreviewDigest(doc), pageCount: 1, title: "Pinned input", deviceId: "browser-test", createdAt: new Date().toISOString() });
  const png = Buffer.from(encodePng(new Image(2, 1, { data: new Uint8Array([15, 70, 30, 255, 30, 40, 80, 255]), colorModel: "RGBA" })));
  const page = await producer.upload(actor, intent, 0, { buffer: png, size: png.length, mimetype: "image/png" });
  const captured = await producer.complete(actor, { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] }); assert(captured.status === "completed");
  const ids = { reading: randomUUID(), material: randomUUID() };
  for (const [key, kind] of [["reading", "reading"], ["material", "material-choice"]] as const) {
    const id = ids[key]; await sessions.create(actor, workId, { operationId: randomUUID(), id, title: "Purpose workflow", purpose: "Save and reopen exact session evidence", kind, input: captured.subject, invitedUserIds: [guest] });
    await sessions.command(guest, workId, id, { action: "join", expectedVersion: 1, operationId: randomUUID() });
    await sessions.command(actor, workId, id, { action: "ready", expectedVersion: 2, operationId: randomUUID() });
    await sessions.command(actor, workId, id, { action: "start", expectedVersion: 3, operationId: randomUUID() });
  }
  return { actor, guest, workId, ids, subject: captured.subject };
}
async function open(actorId: string, workId: string, sessionId: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", serviceWorkers: "block" });
  await context.addInitScript({ content: `window.__STUDIO_PURPOSE_TEST__=${JSON.stringify({ actorId, workId, sessionId })};` });
  await context.route("**/api/creator/works/**/work-sessions/**", async (route) => {
    const request = route.request(), path = new URL(request.url());
    const response = await fetch(endpoint + path.pathname + path.search, { method: request.method(),
      headers: { "content-type": "application/json", "x-session-test-token": token, "x-session-test-actor": actorId }, body: request.method() === "POST" ? request.postData() : undefined });
    await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
  });
  const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/tools/browser-harnesses/work-session-purpose.html");
  await expect(page.locator("[data-session-purpose-workflow]")).toBeVisible({ timeout: 30000 });
  return { context, page, errors };
}
try {
  for (const width of [1440, 390, 320]) {
    const f = await fixture(), reading = await open(f.actor, f.workId, f.ids.reading, width), page = reading.page;
    await page.getByText("새 안건 추가", { exact: true }).click();
    await page.getByRole("combobox", { name: "고정 페이지", exact: true }).selectOption("saved-page-1");
    await page.getByRole("combobox", { name: "고정 컷", exact: true }).selectOption("saved-cut-1");
    await page.getByRole("textbox", { name: "안건 제목", exact: true }).fill("도입 장면 검토");
    await page.getByRole("textbox", { name: "대사·연출 제안", exact: true }).fill("원본과 분리된 대사 수정 제안");
    await page.getByRole("combobox", { name: "진행 담당자", exact: true }).selectOption(f.guest);
    await page.getByRole("button", { name: "고정 원고에 안건 연결", exact: true }).click();
    await expect(page.getByRole("heading", { name: "1. 도입 장면 검토", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "이 안건 진행", exact: true }).click();
    await expect(page.getByText("지금 진행 중", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "이 페이지 직접 보기", exact: true }).click();
    await expect(page.getByLabel("명시적으로 선택한 원본")).toContainText("saved-page-1 saved-cut-1");
    await page.getByRole("button", { name: "제안 내용 편집", exact: true }).click();
    await page.getByRole("textbox", { name: "대사 제안 수정", exact: true }).fill("아직 제출하지 않은 수정안");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "대사 제안 수정", exact: true })).toHaveValue("아직 제출하지 않은 수정안");
    await page.getByRole("button", { name: "현재 제안 저장", exact: true }).click();
    await expect(page.getByText("아직 제출하지 않은 수정안", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "이 안건의 결론", exact: true }).fill("대사는 별도 편집기에서 수정 후 재검토");
    await page.getByRole("button", { name: "결론 확정 기록", exact: true }).click();
    await expect(page.getByText("기록한 결론", { exact: false })).toBeVisible();
    const persisted = await new StudioWorkSessionRepository().current(f.actor, f.workId, f.ids.reading);
    assert.equal(persisted.session.workflow!.agenda[0]!.outcome!.body, "대사는 별도 편집기에서 수정 후 재검토"); assert.equal(persisted.session.readerUserId, f.guest);
    assert.equal((await graph.getReview(f.actor, f.subject.reviewId)).status, "open");
    assert.equal((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [f.workId])).rows[0].revision, 7);
    await page.getByRole("button", { name: /소재 사용 · AI 기록/ }).click();
    await expect(page.getByText("고정 제공자 / 고정 모델", { exact: true })).toBeVisible();
    await expect(page.getByText(/전체 미확인/)).toBeVisible();
    await page.getByRole("button", { name: "대상 고정 페이지 보기", exact: true }).click();
    await expect(page.getByLabel("명시적으로 선택한 원본")).toContainText("saved-page-1");
    await page.getByRole("button", { name: "검토 기록에 인용", exact: true }).click();
    await expect.poll(async () => (await sessions.current(f.actor, f.workId, f.ids.reading)).session.notes.length).toBe(1);
    const citation = (await sessions.current(f.actor, f.workId, f.ids.reading)).session.notes[0]!;
    assert.equal(citation.category, "ai-evidence"); assert(citation.body.includes("saved-ai-record") && citation.body.includes("not an edit or approval"));
    assert(!citation.body.includes("PRIVATE PROMPT"));
    await page.screenshot({ path: `${out}/evidence-${width}.png`, fullPage: true });
    assert.deepEqual(reading.errors, []); await page.screenshot({ path: `${out}/reading-${width}.png`, fullPage: true });
    const axeReading = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze(); assert.deepEqual(axeReading.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) })), []);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await reading.context.close();
    const host = await open(f.actor, f.workId, f.ids.material, width), guest = await open(f.guest, f.workId, f.ids.material, width);
    await guest.page.getByText("소재 후보 제안", { exact: true }).click();
    await guest.page.getByRole("combobox", { name: "이 작품의 등록 파일", exact: true }).locator("option:not([value=''])").first().waitFor({ state: "attached" });
    await guest.page.getByRole("combobox", { name: "이 작품의 등록 파일", exact: true }).selectOption({ index: 1 });
    await guest.page.getByRole("textbox", { name: "후보 이름", exact: true }).fill("공유 배경 후보");
    await guest.page.getByRole("textbox", { name: "제안 근거", exact: true }).fill("시선과 조명 확인");
    await guest.page.getByRole("textbox", { name: "확인한 사용 조건과 미확인 사항", exact: true }).fill("권리 승인은 별도 확인 필요");
    await guest.page.getByRole("button", { name: "후보 등록", exact: true }).click();
    await expect(guest.page.getByRole("article", { name: "공유 배경 후보", exact: true })).toBeVisible();
    await guest.page.getByRole("textbox", { name: "내 투표 근거", exact: true }).fill("대상 컷과 일치");
    await guest.page.getByRole("button", { name: "이 후보에 투표", exact: true }).click();
    await expect(guest.page.getByRole("button", { name: "내 투표 취소", exact: true })).toBeVisible();
    await expect(guest.page.getByRole("button", { name: "선정 검토…", exact: true })).toHaveCount(0);
    await host.page.getByRole("button", { name: "서버 기록 다시 읽기", exact: true }).click();
    await host.page.getByRole("button", { name: "선정 검토…", exact: true }).click();
    await host.page.getByRole("textbox", { name: "선정·보류 근거", exact: true }).fill("논의한 조건을 전제로 선택");
    await host.page.getByRole("button", { name: "근거와 함께 기록", exact: true }).click();
    await expect(host.page.getByRole("heading", { name: "공유 배경 후보 · 선정됨", exact: true })).toBeVisible();
    const saved = await new StudioWorkSessionRepository().current(f.guest, f.workId, f.ids.material);
    assert.equal(saved.session.workflow!.materialDecisions[0]!.votes[0]!.userId, f.guest); assert.equal(saved.session.results.length, 0);
    assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
    const axe = await new AxeBuilder({ page: host.page }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze(); assert.deepEqual(axe.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) })), []);
    assert(await host.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await host.page.screenshot({ path: `${out}/materials-${width}.png`, fullPage: true });
    await Promise.all([host.context.close(), guest.context.close()]);
    results.push({ width, reading: "real database source/agenda/edit/read/turn/outcome", materials: "separate host and guest browsers propose/vote/decide", evidence: "attested pinned AI records and explicit database-persisted citation", persisted: true, pageErrors: 0, accessibilityViolations: 0 });
    console.log(`PASS real repository + PostgreSQL browser ${width}`);
  }
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) {
    await page.screenshot({ path: `${out}/failed-${index}.png`, fullPage: true }).catch(() => {});
    console.error(`Failure page ${index}:`, await page.locator("body").innerText().catch(() => "unavailable"));
  }
  failure = error;
} finally {
  await browser.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  // Cleanup only rows created by this invocation in its explicitly selected disposable database.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const artifacts = 'SELECT artifact.id FROM studio_artifact artifact JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=ANY($1::text[])';
    await client.query(`DELETE FROM studio_review WHERE "artifactId" IN (${artifacts})`, [works]);
    await client.query(`DELETE FROM studio_mutation_receipt WHERE "artifactId" IN (${artifacts})`, [works]);
    await client.query(`DELETE FROM studio_operation WHERE "artifactId" IN (${artifacts})`, [works]);
    await client.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (SELECT id FROM studio_revision WHERE "artifactId" IN (${artifacts}))`, [works]);
    await client.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works]); await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]); await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    failure = failure ? new AggregateError([failure, error], "Browser verification and fixture cleanup failed") : error;
  } finally { client.release(); await Promise.all([pool.end(), database.dbPool.end()]); }
  await writeFile(`${out}/report.json`, JSON.stringify({ results, identity: "explicit fixture users, not production sign-in", storage: "test object-storage port; actual graph/asset/session PostgreSQL repositories", origin }, null, 2));
}

if (failure) throw failure;
