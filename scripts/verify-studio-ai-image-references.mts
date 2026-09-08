/**
 * Public UI regression for document-owned AI image references. No API mock, project injection,
 * generation request, or public publish: a local PNG is uploaded through the shipped asset picker.
 *
 * Run after build: pnpm exec tsx scripts/verify-studio-ai-image-references.mts
 * TOONSPECTRUM_VERIFY_ORIGIN reuses an existing preview; otherwise this owns a Vite preview.
 * TOONSPECTRUM_VERIFY_DIR controls evidence output. Optional TOONSPECTRUM_VERIFY_EXPECTED_SW and
 * TOONSPECTRUM_VERIFY_BUILD_DIR bind external runs to the expected immutable build artifact.
 * An owned static preview may lack Nest; only observed 502s from four optional guest APIs are
 * classified as environment diagnostics. External origins require healthy APIs by default.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { studioLiveRetainedMediaOverlaySupportsElement } from "../apps/web/src/domains/creator/live/studio-live-retained-media-overlay";
import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";

import { collectStudioInAppRuntimeErrors, installStudioInAppFirstRunState, launchStudioInAppBrowser } from "./lib/studio-inapp-sweep-harness.mjs";
import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";
import { findFreePort, spawnVitePreview, stopChildProcess, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

import type { StudioInAppRuntimeError } from "./lib/studio-inapp-sweep-harness.mjs";
import type { StudioAutosavePayload } from "../apps/web/src/domains/creator/studio-autosave";
import type { PageState } from "../apps/web/src/domains/creator/studio-page-state";
import type { ChildProcess } from "node:child_process";
import type { Browser, BrowserContext, Page, Request as BrowserRequest } from "playwright";

type Scenario = "empty" | "ink" | "retained-redo";
type SavedDocument = Omit<StudioAutosavePayload, "pagesList"> & { pagesList: PageState[] };
interface HttpDiagnostic { step: string; at: number; url: string; status: number; method: string; type: string }
interface ConsoleDiagnostic { step: string; at: number; type: string; message: string; url: string }
interface StepResult { id: string; status: "passed" | "failed"; elapsedMs: number; error?: string; screenshot?: string }
interface ScenarioReport {
  scenario: Scenario;
  status: "passed" | "failed";
  steps: StepResult[];
  evidence: Record<string, unknown>;
  http: HttpDiagnostic[];
  console: ConsoleDiagnostic[];
  requestFailures: Array<{ step: string; url: string; error: string; responseStatus: number | null; cancellationScope: "reload" | "cleanup" | null }>;
  environment: unknown[];
  errors: unknown[];
  failure?: string;
}

const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-studio-ai-image-references");
const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim().replace(/\/+$/u, "");
const allowOptionalApi = !externalOrigin || process.env.TOONSPECTRUM_VERIFY_API_OPTIONAL === "1";
const autosaveKey = studioAutosaveKey({});
const guidanceLabel = "favicon-32 참조 지침";

function message(error: unknown): string { return error instanceof Error ? error.stack ?? error.message : String(error); }
function elements(document: SavedDocument | null) { return document?.pagesList.flatMap(page => page.elements) ?? []; }

function optionalApi502(entry: Pick<HttpDiagnostic, "url" | "status">, origin: string): boolean {
  if (!allowOptionalApi || entry.status !== 502) return false;
  const url = new URL(entry.url);
  return url.origin === origin && (
    ["/api/auth/session", "/api/kmas/merge-on-access", "/api/studio-ai/status"].includes(url.pathname)
    || url.pathname.startsWith("/api/analytics/traffic/")
  );
}

function classifyDiagnostics(report: ScenarioReport, origin: string): void {
  const optional = report.http.filter(entry => optionalApi502(entry, origin));
  report.environment.push(...optional);
  report.errors.push(...report.http.filter(entry => entry.status >= 400 && !optionalApi502(entry, origin)));
  for (const entry of report.console.filter(entry => entry.type === "error")) {
    // Browser-generated resource messages occasionally omit their URL. Match only observed
    // optional 502 responses in the same step/time window; every non-optional HTTP error still fails.
    const resource502 = /^Failed to load resource: the server responded with a status of 502\b/u.test(entry.message);
    const matched = resource502 && optional.some(response => response.step === entry.step
      && (entry.url ? response.url === entry.url : Math.abs(response.at - entry.at) < 1000));
    (matched ? report.environment : report.errors).push(entry);
  }
  for (const entry of report.requestFailures) {
    // Only actual navigation/teardown owns these cancellations; a lazy dependency abort during
    // normal editing is a failure. Both classifications remain visible in the raw diagnostics.
    // Chromium can abort an unread body after receiving the optional API's 502 headers. The
    // status below belongs to this exact Request object, never another request with the same URL.
    const optionalResponse = optionalApi502({ url: entry.url, status: entry.responseStatus ?? 0 }, origin);
    const expectedCancellation = (entry.cancellationScope !== null || optionalResponse) && entry.error.includes("ERR_ABORTED");
    (expectedCancellation ? report.environment : report.errors).push(entry);
  }
}

async function runScenario(browser: Browser, origin: string, scenario: Scenario): Promise<ScenarioReport> {
  const directory = join(output, scenario);
  mkdirSync(directory, { recursive: true });
  const report: ScenarioReport = { scenario, status: "failed", steps: [], evidence: {}, http: [], console: [], requestFailures: [], environment: [], errors: [] };
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let currentStep = "boot";
  let runtimeErrors: StudioInAppRuntimeError[] = [];
  let cancellationScope: "reload" | "cleanup" | null = null;
  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
    page = await context.newPage();
    const activePage = page;
    const responseStatuses = new WeakMap<BrowserRequest, number>();
    activePage.setDefaultTimeout(15_000);
    const collector = await collectStudioInAppRuntimeErrors(activePage);
    runtimeErrors = collector.errors;
    activePage.on("response", response => {
      responseStatuses.set(response.request(), response.status());
      report.http.push({ step: currentStep, at: Date.now(), url: response.url(), status: response.status(), method: response.request().method(), type: response.request().resourceType() });
    });
    activePage.on("console", entry => {
      if (["error", "warning"].includes(entry.type())) report.console.push({ step: currentStep, at: Date.now(), type: entry.type(), message: entry.text(), url: entry.location().url });
    });
    activePage.on("requestfailed", request => report.requestFailures.push({ step: currentStep, url: request.url(), error: request.failure()?.errorText ?? "request failed", responseStatus: responseStatuses.get(request) ?? null, cancellationScope }));
    await installStudioInAppFirstRunState(activePage);
    await activePage.goto(`${origin}/studio`, { waitUntil: "domcontentloaded" });
    const viewport = activePage.locator('[data-studio-canvas-viewport="true"]').first();
    await viewport.waitFor({ state: "visible", timeout: 30_000 });
    const redo = activePage.locator('button[data-studio-primary-action="redo"]:visible').first();

    async function read(): Promise<SavedDocument | null> {
      const durable = await readDurableStudioAutosaveDocument(activePage, autosaveKey);
      return durable ? JSON.parse(durable.raw) as SavedDocument : null;
    }
    async function saved(predicate: (document: SavedDocument | null) => boolean, timeoutMs = 15_000): Promise<SavedDocument> {
      const deadline = performance.now() + timeoutMs;
      let document: SavedDocument | null = null;
      while (performance.now() < deadline) {
        document = await read();
        if (document && predicate(document)) return document;
        await activePage.waitForTimeout(30);
      }
      report.evidence.unsettled = { step: currentStep, key: autosaveKey, url: activePage.url(), document };
      throw new Error(`Durable document predicate did not settle within ${timeoutMs}ms`);
    }
    async function check(id: string, run: () => Promise<void>): Promise<void> {
      currentStep = id;
      collector.setStep(id);
      const startedAt = performance.now();
      const step: StepResult = { id, status: "failed", elapsedMs: 0 };
      report.steps.push(step);
      console.log(`[verify-ai-image-references] ${scenario}/${id}`);
      try { await run(); step.status = "passed"; }
      catch (error) { step.error = message(error); throw error; }
      finally {
        step.elapsedMs = performance.now() - startedAt;
        const screenshot = join(directory, `${report.steps.length}-${id}.png`);
        try { await activePage.screenshot({ path: screenshot }); step.screenshot = screenshot; }
        catch (error) { report.errors.push({ step: id, screenshotError: message(error) }); }
      }
    }
    async function menu(group: string, id: string): Promise<void> {
      await activePage.locator(`[data-studio-main-menu-trigger="${group}"]`).click();
      await activePage.locator('[data-studio-main-menu-panel="true"]').locator(`[data-studio-menu-item-id="${id}"]`).click();
    }
    async function scenarioDialog() {
      await menu("ai", "ai-assist");
      await activePage.getByRole("button", { name: /스토리 → 편집 가능한 컷/u }).click();
      const dialog = activePage.getByRole("dialog", { name: "시나리오 자동 생성", exact: true });
      await dialog.waitFor();
      const details = dialog.locator("details").filter({ hasText: "AI 이미지 참조 팩" });
      if (await details.getAttribute("open") === null) await details.locator("summary").click();
      return dialog;
    }
    async function closeScenario(): Promise<void> {
      const dialog = activePage.getByRole("dialog", { name: "시나리오 자동 생성", exact: true });
      if (!await dialog.isVisible()) return;
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    }
    async function draw(offset: number): Promise<number> {
      const box = await viewport.boundingBox();
      assert.ok(box);
      await activePage.mouse.move(box.x + box.width * .22, box.y + box.height * offset);
      await activePage.mouse.down();
      await activePage.mouse.move(box.x + box.width * .6, box.y + box.height * (offset + .02), { steps: 14 });
      await activePage.mouse.up();
      return performance.now();
    }
    async function addReference(): Promise<void> {
      const dialog = await scenarioDialog();
      await dialog.getByRole("combobox", { name: "Style에 추가할 에셋", exact: true }).selectOption({ label: "favicon-32" });
      await dialog.getByRole("button", { name: "Style 참조 추가", exact: true }).click();
      await dialog.getByRole("textbox", { name: guidanceLabel, exact: true }).waitFor();
      await closeScenario();
    }
    async function recover(): Promise<void> {
      await closeScenario();
      cancellationScope = "reload";
      try { await activePage.reload({ waitUntil: "domcontentloaded" }); }
      finally { cancellationScope = null; }
      await viewport.waitFor({ state: "visible", timeout: 30_000 });
      const restore = activePage.getByRole("button", { name: "복구하기", exact: true });
      await restore.waitFor({ state: "visible" });
      await restore.click();
      await restore.waitFor({ state: "hidden" });
    }

    if (scenario !== "empty") await check("prepare-existing-ink", async () => {
      await activePage.locator('[data-studio-rail-tool-id="pen"]').click();
      await draw(.25);
      await saved(document => elements(document).some(element => element.type === "draw"));
      // Establish an existing committed stroke before exercising retained pointerup Undo.
      await activePage.waitForTimeout(2200);
    });
    await check("upload-local-asset", async () => {
      await menu("view", "template");
      const assets = activePage.locator('[data-studio-tool-popover="asset-group"]');
      await assets.waitFor();
      await assets.getByRole("tab", { name: "내 에셋", exact: true }).click();
      await assets.getByRole("button", { name: "보관함 · 마켓", exact: true }).click();
      await assets.getByRole("button", { name: "내 에셋", exact: true }).click();
      await assets.getByLabel("이미지 에셋 업로드", { exact: true }).setInputFiles(resolve("apps/web/public/favicon-32.png"));
      await assets.getByText("favicon-32", { exact: true }).first().waitFor();
      await activePage.keyboard.press("Escape");
      await assets.waitFor({ state: "hidden" });
    });

    if (scenario !== "retained-redo") {
      await check("reference-only-autosave", async () => {
        await addReference();
        const document = await saved(candidate => candidate?.aiImageReferences?.references.length === 1);
        assert.equal(elements(document).length, scenario === "empty" ? 0 : 1);
        report.evidence.beforeRecovery = document;
      });
      await check("recover-reference-after-reload", async () => {
        const before = await read();
        assert.ok(before?.aiImageReferences);
        await recover();
        const dialog = await scenarioDialog();
        report.evidence.afterRecovery = await read();
        await dialog.getByRole("textbox", { name: guidanceLabel, exact: true }).waitFor();
        const after = await read();
        assert.deepEqual(after?.aiImageReferences?.references, before.aiImageReferences.references);
        assert.equal(elements(after).length, elements(before).length);
        await closeScenario();
      });
    } else {
      await check("select-supported-pencil", async () => {
        await activePage.locator('[data-studio-brush-active-pill="true"]').click();
        const catalog = activePage.locator('[data-studio-brush-catalog-session="true"]');
        await catalog.waitFor();
        await catalog.getByRole("tab", { name: "전체", exact: true }).click();
        await catalog.getByRole("searchbox").fill("연필");
        await catalog.locator('[data-studio-brush-select="pencil"]').click();
        await activePage.waitForFunction(() => document.querySelector('[data-studio-brush-active-pill="true"]')?.getAttribute("aria-label")?.includes("연필"));
        await activePage.locator('[role="dialog"][data-studio-brush-floating]').getByRole("button", { name: / 닫기$/u }).click();
      });
      let strokeCycle = 0;
      const guidance = "푸른 색감과 선의 질감만 참고합니다.";
      for (const operation of ["add", "edit", "remove"] as const) await check(`accepted-reference-${operation}-clears-retained-redo`, async () => {
        await closeScenario();
        // A help tooltip may cover the tool rail after dialog focus returns. Dismiss via actual UI.
        await activePage.keyboard.press("Escape");
        await activePage.mouse.move(1, 1);
        await activePage.locator('[data-studio-tool-hint="true"]:visible').waitFor({ state: "hidden" });
        await activePage.locator('[data-studio-rail-tool-id="pen"]').click();
        const previousIds = new Set(elements(await read()).map(element => element.id));
        const pointerup = await draw(.42 + (strokeCycle++ % 3) * .05);
        const receipt = await saved(document => document?.pendingStrokeDurability?.reason === "pointerup"
          && elements(document).some(element => element.type === "draw" && !previousIds.has(element.id)), 1000);
        const stroke = elements(receipt).find(element => element.type === "draw" && !previousIds.has(element.id));
        assert.ok(stroke?.type === "draw");
        assert.equal(studioLiveRetainedMediaOverlaySupportsElement(stroke), true);
        await activePage.keyboard.press("Control+z");
        const undoElapsedMs = performance.now() - pointerup;
        assert.ok(undoElapsedMs < 2000, `retained Undo was too late: ${undoElapsedMs}ms`);
        await activePage.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('button[data-studio-primary-action="redo"]')].some(button => button.getBoundingClientRect().width > 0 && !button.disabled));
        await saved(document => !elements(document).some(element => element.id === stroke.id));
        const dialog = await scenarioDialog();
        assert.equal(await redo.isEnabled(), true, "opening the reference editor must preserve Redo");
        if (operation === "add") {
          await dialog.getByRole("combobox", { name: "Style에 추가할 에셋", exact: true }).selectOption({ label: "favicon-32" });
          assert.equal(await redo.isEnabled(), true, "picker draft must preserve Redo");
          await dialog.getByRole("button", { name: "Style 참조 추가", exact: true }).click();
          await dialog.getByRole("textbox", { name: guidanceLabel, exact: true }).waitFor();
        } else if (operation === "edit") {
          await dialog.getByRole("textbox", { name: guidanceLabel, exact: true }).fill(guidance);
        } else {
          await dialog.getByRole("button", { name: "favicon-32 Style 참조 제거", exact: true }).click();
          await dialog.getByRole("textbox", { name: guidanceLabel, exact: true }).waitFor({ state: "hidden" });
        }
        const persisted = await saved(document => {
          const references = document?.aiImageReferences?.references;
          return operation === "edit" ? references?.some(reference => reference.guidance === guidance) === true
            : references?.length === (operation === "add" ? 1 : 0);
        });
        assert.equal(await redo.isDisabled(), true, "accepted reference mutation left retained Redo enabled");
        await closeScenario();
        await activePage.keyboard.press("Control+Shift+z");
        assert.equal(elements(await read()).some(element => element.id === stroke.id), false, "discarded stroke returned after Redo");
        // The durable reader may still expose the prior snapshot immediately after a shortcut.
        // Open the actual layer UI and prove it rendered the original ink without reviving this row.
        const originalInk = elements(persisted).find(element => element.type === "draw");
        assert.ok(originalInk);
        await activePage.keyboard.press("Escape");
        await activePage.mouse.move(1, 1);
        await activePage.locator('[data-studio-inspector-primary-tab="layers"]').click();
        await activePage.locator('[aria-label="전문 레이어 내비게이터"]').waitFor({ state: "visible" });
        await activePage.locator(`[id="studio-layer-${originalInk.id}"]`).waitFor({ state: "visible" });
        const revivedRows = await activePage.locator(`[id="studio-layer-${stroke.id}"]`).count();
        assert.equal(revivedRows, 0, "discarded stroke returned in the live layer UI after Redo");
        report.evidence[operation] = { strokeId: stroke.id, brush: stroke.brush, paintModel: stroke.paintModel, retainedSupported: true, undoElapsedMs, references: persisted.aiImageReferences, originalInkRow: originalInk.id, revivedRows };
      });
      await check("removed-reference-stays-removed-after-reload", async () => {
        await recover();
        const dialog = await scenarioDialog();
        assert.equal(await dialog.getByRole("textbox", { name: guidanceLabel, exact: true }).count(), 0);
        assert.equal((await read())?.aiImageReferences?.references.length, 0);
        await closeScenario();
      });
    }
    report.status = "passed";
  } catch (error) {
    report.failure = message(error);
  } finally {
    if (page && !page.isClosed()) {
      report.evidence.location = { url: page.url(), expectedKey: autosaveKey };
      report.evidence.storage = await page.evaluate(() => ({
        keyNames: Object.keys(localStorage).filter(key => /autosave|studio.*(work|draft)/u.test(key)),
        bridgeLastError: (window as typeof window & { __studioVerifyDurableAutosaveBridge?: { lastError?: string } }).__studioVerifyDurableAutosaveBridge?.lastError ?? null,
      })).catch(error => ({ error: message(error) }));
      if (report.failure) report.evidence.failureDom = await page.locator("body").innerText().catch(message);
      await page.screenshot({ path: join(directory, "final.png") }).catch(error => report.errors.push({ screenshotError: message(error) }));
    }
    cancellationScope = "cleanup";
    try { await context?.close(); }
    catch (error) { report.errors.push({ cleanupError: message(error) }); report.status = "failed"; }
    report.errors.push(...runtimeErrors.filter(error => error.channel !== "console" && error.channel !== "requestfailed"));
    classifyDiagnostics(report, origin);
    if (report.errors.length > 0) {
      report.status = "failed";
      report.failure ??= "Unexpected browser diagnostics; see report.json";
    }
    writeFileSync(join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

async function main(): Promise<void> {
  mkdirSync(output, { recursive: true });
  let preview: ChildProcess | undefined;
  let browser: Browser | undefined;
  const report: { status: string; origin?: string; artifact?: unknown; scenarios: ScenarioReport[]; errors: string[] } = { status: "failed", scenarios: [], errors: [] };
  try {
    const port = externalOrigin ? undefined : await findFreePort();
    const origin = externalOrigin ?? `http://127.0.0.1:${port}`;
    assert.match(origin, /^https?:\/\/[^/]+$/u);
    report.origin = origin;
    if (port !== undefined) preview = spawnVitePreview({ port, runner: "node-vite-bin", logPath: join(output, "preview.log") });
    await waitForServer(`${origin}/studio`);
    const response = await fetch(`${origin}/sw.js`);
    assert.equal(response.status, 200, "the production service worker artifact is missing");
    const sw = Buffer.from(await response.arrayBuffer());
    const expectedSw = process.env.TOONSPECTRUM_VERIFY_EXPECTED_SW;
    if (expectedSw) assert.ok(sw.toString().includes(expectedSw), "served build ID differs from expected artifact");
    if (process.env.TOONSPECTRUM_VERIFY_BUILD_DIR) assert.deepEqual(sw, readFileSync(join(process.env.TOONSPECTRUM_VERIFY_BUILD_DIR, "sw.js")));
    report.artifact = { swSha256: createHash("sha256").update(sw).digest("hex"), expectedSw, optionalApiEnvironment: allowOptionalApi };
    browser = await launchStudioInAppBrowser();
    for (const scenario of ["empty", "ink", "retained-redo"] as const) report.scenarios.push(await runScenario(browser, origin, scenario));
    const finalSw = Buffer.from(await (await fetch(`${origin}/sw.js`)).arrayBuffer());
    assert.deepEqual(finalSw, sw, "served artifact changed while verifying");
    assert.equal(report.scenarios.filter(scenario => scenario.status === "failed").length, 0, "one or more AI reference scenarios failed");
    report.status = "passed";
  } catch (error) { report.errors.push(message(error)); process.exitCode = 1; }
  finally {
    try { await browser?.close(); }
    catch (error) { report.errors.push(message(error)); report.status = "failed"; process.exitCode = 1; }
    finally {
      try { if (preview) await stopChildProcess(preview); }
      catch (error) { report.errors.push(message(error)); report.status = "failed"; process.exitCode = 1; }
      writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify({ status: report.status, scenarios: report.scenarios.map(scenario => ({ id: scenario.scenario, status: scenario.status, passed: scenario.steps.filter(step => step.status === "passed").length, failure: scenario.failure })), errors: report.errors, output }, null, 2));
    }
  }
}

await main();
