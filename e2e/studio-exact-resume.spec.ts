
import { serializeStudioAutosave, studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";
import {
  STUDIO_EXACT_RESUME_RESTORED_EVENT,
  studioExactResumeStorageKey,
} from "../apps/web/src/domains/creator/studio-exact-resume-context";
import { studioProjectDocumentStorageKey } from "../apps/web/src/domains/creator/studio-project-document-store";
import { STUDIO_PROJECT_LIBRARY_STORAGE_KEY } from "../apps/web/src/domains/creator/studio-project-library-store";
import { readDurableStudioAutosaveDocument, resolveDurableStudioAutosaveModuleUrl, seedDurableStudioAutosaveDocument } from "../scripts/lib/studio-verify-durable-autosave.mjs";

import { expect, test } from "./fixtures/non-studio-test";
import { capturePageEvidence } from "./helpers/capture-page-evidence";

const PROJECT_ID = "exact-resume-project";
const DOCUMENT_ID = "episode-01";
const CREATED_AT = "2026-09-17T08:00:00.000Z";
const UPDATED_AT = "2026-09-17T09:00:00.000Z";

const projectLibrary = {
  schemaVersion: 1,
  projects: [{
    id: PROJECT_ID,
    title: "정확히 이어보는 작품",
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    templateId: null,
    description: "Exact resume browser fixture",
    primaryLocale: "ko-KR",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    lastOpenedAt: UPDATED_AT,
    lastOpenedDocumentId: DOCUMENT_ID,
    thumbnailUrl: null,
  }],
  updatedAt: UPDATED_AT,
};

const projectDocuments = {
  schemaVersion: 1,
  projectId: PROJECT_ID,
  documents: [{
    id: DOCUMENT_ID,
    projectId: PROJECT_ID,
    title: "EP01 원고",
    kind: "webtoon",
    status: "active",
    statusBeforeTrash: null,
    defaultWorkspace: "comic",
    allowedWorkspaces: ["comic", "draw", "image", "localization", "review"],
    width: 720,
    height: 2_400,
    pageCount: 2,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    lastOpenedAt: UPDATED_AT,
  }],
  updatedAt: UPDATED_AT,
};

const resumeContext = {
  schemaVersion: 1,
  projectId: PROJECT_ID,
  documentId: DOCUMENT_ID,
  workspace: "comic",
  pageId: "page-2",
  selectedElementIds: ["panel-page-2"],
  zoom: 1.6,
  scrollLeft: 120,
  scrollTop: 760,
  tool: "select",
  drawMode: "pen",
  focus: "cut:2",
  language: "ko-KR",
  sourceVersion: "draft-7",
  updatedAt: UPDATED_AT,
};

const autosave = serializeStudioAutosave({
  version: 2,
  savedAt: UPDATED_AT,
  currentPageId: "page-1",
  pagesList: [
    {
      id: "page-1",
      canvasH: 2_400,
      elements: [{
        id: "panel-page-1",
        type: "frame",
        x: 40,
        y: 80,
        width: 640,
        height: 700,
        bgColor: "#ffffff",
        stroke: "#111111",
      }],
    },
    {
      id: "page-2",
      canvasH: 2_400,
      elements: [{
        id: "panel-page-2",
        type: "frame",
        x: 70,
        y: 820,
        width: 580,
        height: 760,
        bgColor: "#ffffff",
        stroke: "#111111",
      }],
    },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ payload, restoredEvent }) => {
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
    if (sessionStorage.getItem("exact-resume-fixture-seeded") !== "true") {
      localStorage.clear();
      localStorage.setItem(payload.projectLibraryKey, JSON.stringify(payload.projectLibrary));
      localStorage.setItem(payload.documentsKey, JSON.stringify(payload.projectDocuments));
      localStorage.setItem(payload.resumeKey, JSON.stringify(payload.resumeContext));
      sessionStorage.setItem("exact-resume-fixture-seeded", "true");
    }
    (window as Window & { __studioExactResumeEvents?: unknown[] }).__studioExactResumeEvents = [];
    window.addEventListener(restoredEvent, (event) => {
      (window as Window & { __studioExactResumeEvents?: unknown[] }).__studioExactResumeEvents?.push(
        (event as CustomEvent).detail,
      );
    });
  }, {
    payload: {
      projectLibraryKey: STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
      projectLibrary,
      documentsKey: studioProjectDocumentStorageKey(PROJECT_ID),
      projectDocuments,
      resumeKey: studioExactResumeStorageKey(PROJECT_ID, DOCUMENT_ID),
      resumeContext,
    },
    restoredEvent: STUDIO_EXACT_RESUME_RESTORED_EVENT,
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline fixture" } });
  });
  // Browser storage is compatibility data, not manuscript authority. Prepare the fixture
  // through the shipped OPFS writer and release its lease before mounting this document.
  await page.goto("/studio/draft/exact-resume-primer?workspace=draw", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-studio-canvas-viewport]").first()).toBeVisible({ timeout: 60_000 });
  let moduleUrl: string | null = null;
  await expect.poll(async () => {
    moduleUrl = await resolveDurableStudioAutosaveModuleUrl(page);
    return moduleUrl;
  }).not.toBeNull();
  await page.goto("/studio");
  const key = studioAutosaveKey({ workId: DOCUMENT_ID });
  await seedDurableStudioAutosaveDocument(page, key, autosave, moduleUrl);
  const saved = await readDurableStudioAutosaveDocument(page, key, { moduleUrl });
  expect(saved?.pagesList.map((item) => item.id)).toEqual(["page-1", "page-2"]);
});

test("Local My work resumes the exact document context and keeps it after returning", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("정확히 이어보는 작품")).toBeVisible();
  await expect(page.getByText("최근 위치 기억됨")).toBeVisible();
  await expect(page.getByText("page-2 · 확대 160% · 선택 1개")).toBeVisible();

  const continueLink = page.getByRole("link", { name: "이어서 작업" });
  await expect(continueLink).toHaveAttribute(
    "href",
    `/studio/p/${PROJECT_ID}/d/${DOCUMENT_ID}?focus=cut%3A2&language=ko-KR&resume=latest&version=draft-7&workspace=comic`,
  );
  await continueLink.click();

  await expect(page).toHaveURL(new RegExp(`/studio/p/${PROJECT_ID}/d/${DOCUMENT_ID}\\?`));
  const restore = page.getByRole("button", { name: "이어서 그리기", exact: true });
  let explicitlyRestored = false;
  await expect.poll(async () => {
    // The durable source may hydrate directly. When recovery needs a decision,
    // use the actual action and preserve the pending context until that decision.
    if (!explicitlyRestored && await restore.isVisible()) {
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!),
        studioExactResumeStorageKey(PROJECT_ID, DOCUMENT_ID))).toMatchObject({ pageId: "page-2", zoom: 1.6 });
      await restore.click();
      explicitlyRestored = true;
    }
    return page.evaluate(() => (window as Window & { __studioExactResumeEvents?: unknown[] }).__studioExactResumeEvents?.length ?? 0);
  }).toBeGreaterThan(0);
  await expect(page.getByText(/최근 작업 위치를 복원했어요\. page-2 · 확대 160%/u)).toBeVisible();
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __studioExactResumeEvents?: Array<{ pageId?: string; zoom?: number; selectedElementIds?: string[] }> })
      .__studioExactResumeEvents?.at(-1) ?? null
  ))).toMatchObject({
    pageId: "page-2",
    zoom: 1.6,
    selectedElementIds: ["panel-page-2"],
  });

  await expect.poll(async () => page.evaluate(({ key }) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, { key: studioExactResumeStorageKey(PROJECT_ID, DOCUMENT_ID) })).toMatchObject({
    pageId: "page-2",
    zoom: 1.6,
    selectedElementIds: ["panel-page-2"],
  });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capturePageEvidence(page, testInfo, "studio-exact-resume-editor-mobile");

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("최근 위치 기억됨")).toBeVisible();
  await expect(page.getByText(/page-2 · 확대 160%/u)).toBeVisible();
  await capturePageEvidence(page, testInfo, "studio-exact-resume-library-mobile");
  expect(pageErrors).toEqual([]);
});
