/** Public-UI layer comp regression: capture, locks, atomic undo and real OPFS reload. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";

import {
  collectStudioInAppRuntimeErrors,
  installStudioInAppFirstRunState,
  launchStudioInAppBrowser,
} from "./lib/studio-inapp-sweep-harness.mjs";
import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";

import type { StudioLayerComp } from "../apps/web/src/domains/creator/layer/studio-layer-comps";
import type { PageState } from "../apps/web/src/domains/creator/studio-page-state";

const baseUrl = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "http://127.0.0.1:5227";
const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? "/tmp/toonspectrum-studio-layer-comps";
mkdirSync(output, { recursive: true });
const browser = await launchStudioInAppBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const collector = await collectStudioInAppRuntimeErrors(page);
const evidence: Record<string, unknown> = {};
const rendererObservations: unknown[] = [];
const autosaveDiagnostics: Array<{ at: string; message: string }> = [];
const diagnoseAutosave = process.env.TOONSPECTRUM_VERIFY_AUTOSAVE_DIAGNOSTICS === "1";
if (diagnoseAutosave) {
  // Existing product logging only; no document, history, or collaboration state is changed.
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __studioGroupsDebug?: boolean }).__studioGroupsDebug = true;
  });
  page.on("console", message => {
    if (message.text().includes("[as-probe]")) autosaveDiagnostics.push({ at: new Date().toISOString(), message: message.text() });
  });
}
const cases: Array<{ name: string; status: "passed" | "failed"; error?: string }> = [];
const comps = page.getByTestId("studio-layer-comps-panel");
let inkId = "";
let folderName = "";

interface SavedDocument { currentPageId?: string; pagesList: PageState[] }

async function savedPage(
  predicate: (state: PageState) => boolean = () => true,
  timeoutMs = diagnoseAutosave ? 55_000 : 20_000,
): Promise<PageState> {
  let latest: PageState | undefined;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const durable = await readDurableStudioAutosaveDocument(page, studioAutosaveKey({}));
    if (durable) {
      const doc = JSON.parse(durable.raw) as SavedDocument;
      latest = doc.pagesList.find(candidate => candidate.id === doc.currentPageId) ?? doc.pagesList[0];
      if (latest && predicate(latest)) return latest;
    }
    await page.waitForTimeout(250);
  }
  await recordWriterLeases("unsettled");
  evidence.unsettledDocument = { url: page.url(), key: studioAutosaveKey({}), page: latest && {
    id: latest.id, groups: latest.groups, layerComps: latest.layerComps,
    elements: latest.elements.map(element => ({ id: element.id, type: element.type, groupId: element.groupId,
      opacity: element.opacity, blendMode: element.blendMode, hidden: element.hidden, locked: element.locked })),
  } };
  throw new Error(`OPFS state did not settle: ${JSON.stringify(evidence.unsettledDocument)}`);
}

async function recordWriterLeases(stage: string): Promise<void> {
  if (!diagnoseAutosave) return;
  evidence[`writerLeases:${stage}`] = await page.evaluate(async () => {
    type DirectoryWithEntries = FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    const pending = [{ directory: await navigator.storage.getDirectory(), prefix: "" }];
    const leases: Array<{ path: string; ownerId: string; expiresAt: number; remainingMs: number }> = [];
    while (pending.length > 0) {
      const current = pending.pop()!;
      for await (const [name, handle] of (current.directory as DirectoryWithEntries).entries()) {
        const path = `${current.prefix}/${name}`;
        if (handle.kind === "directory") pending.push({ directory: handle as FileSystemDirectoryHandle, prefix: path });
        if (handle.kind !== "file" || name !== "writer-lease.bin") continue;
        const bytes = await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer();
        const length = new DataView(bytes).getUint32(8, true);
        const lease = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 16, length))) as { ownerId: string; expiresAt: number };
        leases.push({ path, ownerId: lease.ownerId, expiresAt: lease.expiresAt, remainingMs: lease.expiresAt - Date.now() });
      }
    }
    return { observedAt: Date.now(), leases, locks: await navigator.locks.query() };
  });
}

async function layers(): Promise<void> {
  await page.locator('[data-studio-inspector-primary-tab="layers"]').click();
  await page.locator('[aria-label="전문 레이어 내비게이터"]').waitFor({ state: "visible" });
}

function row() { return page.locator(`[id="studio-layer-${inkId}"]`); }

async function recordRenderer(stage: string): Promise<void> {
  rendererObservations.push({ stage, ...(await page.evaluate(() => ({
    selectedBrush: document.querySelector('[data-studio-brush-active-pill="true"]')?.getAttribute("aria-label") ?? null,
    canvases: [...document.querySelectorAll('[data-studio-canonical-vnext-dry-media="true"]')].map(canvas =>
      Object.fromEntries([...canvas.attributes].filter(attribute => attribute.name.startsWith("data-")).map(attribute => [attribute.name, attribute.value]))),
    unavailable: document.querySelector('[data-studio-canonical-vnext-dry-media-unavailable="true"]')?.textContent ?? null,
  }))) });
}

async function selectInk(): Promise<void> {
  await page.locator('[data-studio-rail-tool-id="select"]').click();
  await layers();
  // The row center contains visibility controls at compact desktop widths. Its leading
  // selection marker is the actual row target, and must not toggle a nested button.
  await row().click({ position: { x: 40, y: 18 } });
  assert.equal(await row().getAttribute("aria-selected"), "true");
  await recordRenderer(`selected-ink-${cases.length}`);
}

async function blend(mode: string): Promise<void> {
  await selectInk();
  await page.locator('[data-studio-inspector-primary-tab="properties"]').click();
  await page.getByLabel(/^혼합 모드 \(Blend\)/u).selectOption(mode);
  await savedPage(state => state.elements.some(element => element.id === inkId && element.blendMode === mode));
}

async function opacity(value: 70 | 100): Promise<void> {
  await layers();
  const slider = row().getByRole("slider", { name: /불투명도/u });
  await slider.press("End");
  if (value === 70) for (let step = 0; step < 3; step += 1) await slider.press("PageDown");
  assert.equal(await slider.getAttribute("aria-valuenow"), String(value));
  await savedPage(state => state.elements.some(element => element.id === inkId && element.opacity === value / 100));
}

async function folderHidden(hidden: boolean, timeoutMs?: number): Promise<void> {
  await layers();
  const label = `${folderName} 그룹 ${hidden ? "숨김" : "표시"}`;
  await page.getByRole("button", { name: label, exact: true }).click();
  await savedPage(state => state.groups?.some(group => group.name === folderName && Boolean(group.hidden) === hidden) === true, timeoutMs);
}

async function capture(name: string): Promise<void> {
  await layers();
  await comps.getByRole("button", { name: "새 콤프", exact: true }).click();
  await comps.getByRole("textbox", { name: "새 콤프 이름" }).fill(name);
  await comps.getByRole("button", { name: "저장", exact: true }).click();
  await savedPage(state => state.layerComps?.some(comp => comp.name === name) === true);
}

function compRow(name: string) {
  return comps.getByRole("button", { name: new RegExp(`^${name}`, "u") }).locator("..");
}

async function apply(name: string): Promise<void> {
  await layers();
  await compRow(name).getByRole("button", { name: "적용", exact: true }).click();
}

function appearance(state: PageState) {
  const element = state.elements.find(element => element.id === inkId);
  assert.ok(element, "the tested ink element must remain in the document");
  return { opacity: element.opacity ?? 1, blend: element.blendMode ?? "source-over",
    locked: Boolean(element.locked), groups: state.groups?.map(group => ({ id: group.id, hidden: Boolean(group.hidden), locked: Boolean(group.locked) })) };
}

async function draw(offset = 0): Promise<number> {
  const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
  const box = await viewport.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * (0.35 + offset));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * (0.5 + offset), { steps: 24 });
  await page.mouse.up();
  return performance.now();
}

async function reloadWithPublicRecovery(): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-studio-canvas-viewport="true"]').first().waitFor({ state: "visible", timeout: 30_000 });
  const restore = page.getByRole("button", { name: "복구하기", exact: true });
  await restore.waitFor({ state: "visible", timeout: 15_000 });
  await restore.click();
  await restore.waitFor({ state: "hidden" });
}

async function check(name: string, run: () => Promise<void>): Promise<void> {
  collector.setStep(name);
  try {
    await run();
    cases.push({ name, status: "passed" });
    console.log(`[layer-comps] ${name}: passed`);
  } catch (error) {
    cases.push({ name, status: "failed", error: error instanceof Error ? error.stack : String(error) });
    throw error;
  } finally {
    await page.screenshot({ path: join(output, `${cases.length}-${name}.png`) });
  }
}

try {
  await installStudioInAppFirstRunState(page);
  await page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-studio-canvas-viewport="true"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-studio-rail-tool-id="pen"]').click();
  await recordRenderer("initial-pen");
  await draw();
  const initial = await savedPage(state => state.elements.some(element => element.type === "draw"));
  inkId = initial.elements.find(element => element.type === "draw")!.id;
  evidence.strokeBrushMetadata = Object.fromEntries(Object.entries(initial.elements.find(element => element.id === inkId)!)
    .filter(([key]) => /brush|engine|mode|catalog|preset|canonical|stamp|media/iu.test(key)));
  await recordRenderer("initial-durable-stroke");

  await check("capture-folder-blend-opacity", async () => {
    await selectInk();
    await page.getByRole("button", { name: "새 레이어 그룹", exact: true }).click();
    const grouped = await savedPage(state => state.elements.some(element => element.id === inkId && element.groupId !== undefined));
    const groupId = grouped.elements.find(element => element.id === inkId)!.groupId;
    folderName = grouped.groups!.find(group => group.id === groupId)!.name;
    await recordRenderer("group-created");
    await blend("multiply");
    await opacity(70);
    await folderHidden(true);
    await capture("QA 저장 상태");
    const captured = (await savedPage()).layerComps!.find(comp => comp.name === "QA 저장 상태")!;
    assert.equal(captured.layerStates[inkId].blendMode, "multiply");
    assert.equal(captured.layerStates[inkId].opacity, 0.7);
    assert.equal(captured.groupStates?.[groupId!]?.visible, false);
    evidence.captured = captured;
  });

  await check("apply-and-single-undo", async () => {
    await folderHidden(false);
    await blend("screen");
    await opacity(100);
    const before = appearance(await savedPage());
    await apply("QA 저장 상태");
    const applied = await savedPage(state => state.elements.some(element => element.id === inkId && element.opacity === 0.7)
      && state.groups?.some(group => group.name === folderName && group.hidden === true) === true);
    assert.equal(appearance(applied).blend, "multiply");
    await page.getByRole("button", { name: "실행취소", exact: true }).click();
    const undone = await savedPage(state => JSON.stringify(appearance(state)) === JSON.stringify(before));
    assert.deepEqual(appearance(undone), before);
    evidence.undo = { before, applied: appearance(applied), afterOneUndo: appearance(undone) };
  });

  for (const kind of ["element", "group"] as const) {
    await check(`reject-${kind}-lock`, async () => {
      await layers();
      const lock = kind === "element"
        ? row().locator('[data-studio-layer-row-action="lock"]')
        : page.getByRole("button", { name: `${folderName} 그룹 잠금`, exact: true });
      await lock.click();
      const locked = await savedPage(state => kind === "element"
        ? state.elements.some(element => element.id === inkId && element.locked)
        : state.groups?.some(group => group.name === folderName && group.locked) === true);
      await apply("QA 저장 상태");
      await page.getByText("이 콤프가 변경하는 레이어나 그룹이 잠겨 있어요. 잠금을 해제한 뒤 적용해 주세요.", { exact: true }).waitFor();
      await page.waitForTimeout(800);
      assert.deepEqual(appearance(await savedPage()), appearance(locked));
      const unlock = kind === "element"
        ? row().locator('[data-studio-layer-row-action="lock"]')
        : page.getByRole("button", { name: `${folderName} 그룹 잠금 해제`, exact: true });
      await unlock.click();
      await savedPage(state => kind === "element"
        ? state.elements.some(element => element.id === inkId && !element.locked)
        : state.groups?.some(group => group.name === folderName && !group.locked) === true);
    });
  }

  for (const update of [false, true]) {
    await check(update ? "immediate-update" : "immediate-capture", async () => {
      const before = new Set((await savedPage()).elements.map(element => element.id));
      await page.locator('[data-studio-rail-tool-id="pen"]').click();
      await layers();
      const name = "QA 즉시 캡처";
      if (!update) {
        await comps.getByRole("button", { name: "새 콤프", exact: true }).click();
        await comps.getByRole("textbox", { name: "새 콤프 이름" }).fill(name);
      }
      const action = update ? compRow(name).getByTitle("현재 레이어 상태로 업데이트")
        : comps.getByRole("button", { name: "저장", exact: true });
      await action.scrollIntoViewIfNeeded();
      const pointerupAt = await draw(update ? 0.15 : 0.07);
      await action.click();
      const elapsed = performance.now() - pointerupAt;
      assert.ok(elapsed < 2000, `capture must hit the retained-stroke boundary, got ${elapsed}ms`);
      await page.waitForTimeout(2500);
      const latest = await savedPage(state => state.elements.some(element => element.type === "draw" && !before.has(element.id)));
      const newIds = latest.elements.filter(element => element.type === "draw" && !before.has(element.id)).map(element => element.id);
      const snapshot: StudioLayerComp = latest.layerComps!.find(comp => comp.name === name)!;
      assert.ok(snapshot, "capture/update must be persisted in OPFS");
      for (const id of newIds) assert.ok(Object.hasOwn(snapshot.layerStates, id), `recent stroke ${id} is missing from the captured comp`);
      evidence[update ? "immediateUpdate" : "immediateCapture"] = { elapsedMs: elapsed, newIds, capturedIds: Object.keys(snapshot.layerStates) };
    });
  }
  await check("restore-after-reload", async () => {
    await apply("QA 저장 상태");
    await savedPage(state => appearance(state).opacity === 0.7 && appearance(state).groups?.[0]?.hidden === true);
    await recordWriterLeases("before-reload");
    await reloadWithPublicRecovery();
    await layers();
    await compRow("QA 저장 상태").waitFor({ state: "visible" });
    await row().waitFor({ state: "visible" });
    assert.equal(await row().getByRole("slider", { name: /불투명도/u }).getAttribute("aria-valuenow"), "70");
    await page.getByRole("button", { name: `${folderName} 그룹 표시`, exact: true }).waitFor();
    await selectInk();
    await page.locator('[data-studio-inspector-primary-tab="properties"]').click();
    assert.equal(await page.getByLabel(/^혼합 모드 \(Blend\)/u).inputValue(), "multiply");
    evidence.reload = appearance(await savedPage());
    await recordWriterLeases("after-recovery");
  });

  await check("edit-after-recovery", async () => {
    const startedAt = performance.now();
    // A hard reload may leave the previous owner's 30s durable lease intact. The editor must
    // retry after its normal expiry without another user edit and without stealing the lease.
    await folderHidden(false, 40_000);
    evidence.afterRecoveryEditElapsedMs = performance.now() - startedAt;
    const durable = await savedPage();
    evidence.afterRecoveryEdit = appearance(durable);
    await recordWriterLeases("after-recovery-edit-persisted");
    await reloadWithPublicRecovery();
    await layers();
    await compRow("QA 저장 상태").waitFor({ state: "visible" });
    await compRow("QA 즉시 캡처").waitFor({ state: "visible" });
    await row().waitFor({ state: "visible" });
    await page.getByRole("button", { name: `${folderName} 그룹 숨김`, exact: true }).waitFor();
    assert.equal(await row().getByRole("slider", { name: /불투명도/u }).getAttribute("aria-valuenow"), "70");
    await selectInk();
    await page.locator('[data-studio-inspector-primary-tab="properties"]').click();
    assert.equal(await page.getByLabel(/^혼합 모드 \(Blend\)/u).inputValue(), "multiply");
    const restored = await savedPage();
    assert.deepEqual(appearance(restored), appearance(durable));
    assert.deepEqual(restored.elements.map(element => element.id), durable.elements.map(element => element.id));
    evidence.afterSecondReload = appearance(restored);
  });
  assert.equal(collector.errors.length, 0, JSON.stringify(collector.errors));
} catch (error) {
  evidence.failure = error instanceof Error ? error.stack : String(error);
  evidence.dom = await page.locator("body").innerText();
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, "report.json"), JSON.stringify({
    kind: "toonspectrum-studio-layer-comps-regression-v1", baseUrl,
    browser: "Chromium desktop launched with SwiftShader flags; no injected project state", cases, evidence, rendererObservations, autosaveDiagnostics, errors: collector.errors,
  }, null, 2));
  await browser.close();
}
