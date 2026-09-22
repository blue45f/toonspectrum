import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const origin = new URL(process.env.CAMPUS_QA_ORIGIN ?? "http://127.0.0.1:5497");
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Local-only QA origin required");
const output = process.env.CAMPUS_QA_OUTPUT ?? "/tmp/toonstudio-campus-c91e27-qa";
await fs.mkdir(output, { recursive: true });
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const payload = { schemaVersion: 1, resourceKind: "palette", runtime: "studio-palette-v1", definition: { colors: ["#101010", "#fafafa"] } };
const manifest = {
  schemaVersion: 1, packageId: "qa/campus", name: "캠퍼스 검증용 팔레트", description: "로컬 QA 전용 데이터",
  kind: "palette", resourceVersion: "1.0.0", minimumStudioVersion: "1.0.0", tags: ["팔레트"], license: "cc0-1.0",
  attributionText: "", containsAi: false, provenance: { origin: "original", authoredByPublisher: true }, compatibility: { engines: ["canvas2d"] },
  entries: [{ id: "palette/campus", kind: "palette", name: "QA palette", delivery: {
    mode: "portable-json", mediaType: "application/vnd.toonspectrum.palette+json", payload, byteSize: Buffer.byteLength(canonical(payload)), sha256: digest(payload),
  } }],
};
const resource = { ...manifest, id: "11111111-2222-4333-8444-555555555555", manifestHash: digest(manifest), manifestByteSize: Buffer.byteLength(canonical(manifest)),
  publisher: { id: "u1", name: "QA only", avatar: null }, createdAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z", isOwner: false, access: "free" };
const promotion = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", kind: "series", stage: "amateur", genre: "드라마",
  title: "QA 공개 작품 소개", seriesTitle: "QA 공개 작품", description: "공개 갤러리 공간 투영만 검증하는 합성 작품 소개입니다. 실제 사용자 콘텐츠가 아닙니다.",
  readingUrl: "", videoUrl: "", cover: "", tags: ["qa"], contentWarning: "", rightsConfirmed: true,
  author: { id: "qa-author", name: "QA 작가" }, createdAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z",
  version: 1, hidden: false, archived: false, saved: false,
};
const report = { origin: origin.origin, fixture: "anonymous synthetic market and promotion records; all other API calls fail closed", cases: [], interactions: [] };
const browser = await chromium.launch({ headless: true });
async function contextFor(width, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, locale: "ko-KR", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: null });
    if (url.pathname === "/api/creator/marketplace/resources") return route.fulfill({ status: 200, json: { items: [resource], limit: Number(url.searchParams.get("limit")) || 12, nextCursor: null, hasMore: false } });
    if (url.pathname === `/api/creator/marketplace/resources/${resource.id}`) return route.fulfill({ status: 200, json: resource });
    if (url.pathname === "/api/promotions/posts") return route.fulfill({ status: 200, json: { items: [promotion], nextCursor: null, hasMore: false, canModerate: false } });
    return route.fulfill({ status: 503, json: { message: "Local QA: service unavailable" } });
  });
  return context;
}
const paths = process.env.CAMPUS_QA_PATHS?.split(",") ?? ["/market/browse", "/community/promote", "/fortune", "/learn", "/help", "/discover", "/showcase", "/production", "/events", "/studio/new", "/team", "/hub", "/home"];
const widths = (process.env.CAMPUS_QA_WIDTHS ?? "1440,1024,390,320").split(",").map(Number);

async function verifyNestedWorkspaceScrollRestoration() {
  const context = await contextFor(1440);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/market/browse", origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "공간 지도 열기", exact: true }).waitFor({ timeout: 60000 });

    const pane = page.locator(".workspace-task-content");
    await pane.evaluate((element) => {
      element.style.maxHeight = "320px";
      element.style.overflow = "auto";
      element.scrollTop = 250;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForFunction(() => {
      const element = document.querySelector(".workspace-task-content");
      return element instanceof HTMLElement && element.scrollTop === 250;
    });

    const breadcrumb = page.getByRole("navigation", { name: "현재 위치" });
    await breadcrumb.getByRole("link", { name: "둘러보기" }).click();
    await page.waitForURL((url) => url.pathname === "/hub", { timeout: 60000 });
    await pane.waitFor({ state: "detached", timeout: 60000 });

    await page.evaluate(() => history.back());
    await page.waitForURL((url) => url.pathname === "/market/browse", { timeout: 60000 });
    await page.waitForFunction(() => {
      const element = document.querySelector(".workspace-task-content");
      return element instanceof HTMLElement && element.scrollTop === 250;
    });
    assert.equal(await pane.evaluate((element) => element.scrollTop), 250);
    assert.deepEqual(errors, []);
    report.interactions.push("Nested workspace scroll restores the exact POP history position after the entire task shell unmounts and remounts");
  } finally {
    await context.close();
  }
}

async function verifyMarketStudioRoundTrip() {
  const context = await contextFor(1440);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const detailPath = `/market/resource/${resource.id}`;
    await page.goto(new URL(detailPath, origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    const installLink = page.getByRole("link", { name: /Studio|스튜디오/u }).filter({ hasText: /팔레트/u }).first();
    await installLink.waitFor({ timeout: 60000 });
    const target = new URL(await installLink.getAttribute("href"), origin);
    assert.equal(target.pathname, "/studio");
    assert.equal(target.searchParams.get("installMarketResource"), resource.id);
    assert.equal(target.searchParams.get("assetMarket"), "community");
    assert.equal(target.searchParams.get("marketReturn"), detailPath);

    await installLink.click();
    await page.locator("[data-studio-market-return]").waitFor({ timeout: 60000 });
    assert.equal(new URL(page.url()).pathname, "/studio/canvas");
    const returnLink = page.getByRole("link", { name: /소재 거리의 원래 리소스로 돌아가기|original marketplace resource/u });
    assert.equal(await returnLink.getAttribute("href"), detailPath);
    await returnLink.click();
    await page.getByRole("heading", { name: resource.name }).first().waitFor({ timeout: 60000 });
    assert.equal(new URL(page.url()).pathname, detailPath);
    assert.deepEqual(errors, []);
    report.interactions.push("Market resource enters the real Studio canvas with a bounded return receipt and returns to the same public resource");
  } finally {
    await context.close();
  }
}

async function verifyMobileMarketReturnNotice() {
  const context = await contextFor(320, 844);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const detailPath = `/market/resource/${resource.id}`;
    await page.goto(new URL(detailPath, origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    const installLink = page.getByRole("link", { name: /Studio|스튜디오/u }).filter({ hasText: /팔레트/u }).first();
    await installLink.waitFor({ timeout: 60000 });
    await installLink.click();

    const notice = page.locator("[data-studio-market-return]");
    await notice.waitFor({ timeout: 60000 });
    const rect = await notice.boundingBox();
    assert.ok(rect, "mobile market return notice must have a layout box");
    assert.ok(rect.x >= -0.5, `mobile return notice starts outside viewport: ${rect.x}`);
    assert.ok(rect.x + rect.width <= 320.5, `mobile return notice overflows viewport: ${rect.x + rect.width}`);
    assert.ok(rect.y >= 0 && rect.y + rect.height <= 844.5, "mobile return notice must remain inside the visual viewport");
    assert.ok(rect.height <= 64, `mobile return notice is too tall: ${rect.height}`);

    const returnLink = page.getByRole("link", { name: /소재 거리의 원래 리소스로 돌아가기|original marketplace resource/u });
    assert.equal(await returnLink.getAttribute("href"), detailPath);
    await returnLink.click();
    await page.getByRole("heading", { name: resource.name }).first().waitFor({ timeout: 60000 });
    assert.equal(new URL(page.url()).pathname, detailPath);
    assert.deepEqual(errors, []);
    report.interactions.push("The 320px Studio marketplace return control stays inside the visual viewport and returns to the exact resource");
  } finally {
    await context.close();
  }
}

async function verifySceneFailureIsolation() {
  const context = await contextFor(1440);
  await context.addInitScript(() => {
    window.__campusFailures = [];
    window.addEventListener("toonspectrum:render-failure", (event) => {
      window.__campusFailures.push({
        surface: event.detail?.surface ?? null,
        message: event.detail?.error?.message ?? null,
        stack: event.detail?.componentStack ?? null,
      });
    });
  });
  await context.route(/CampusRoom(?:-[^/]+)?\.(?:js|tsx)(?:\?.*)?$/u, (route) => route.abort("failed"));
  try {
    const page = await context.newPage();
    await page.goto(new URL("/fortune?content=dream", origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    const input = page.getByRole("textbox", { name: /기억나는 꿈의 장면/ });
    await input.fill("QA scene failure private draft");
    await page.locator("[data-campus-scene-failure]").waitFor({ timeout: 60000 });
    assert.equal(await input.inputValue(), "QA scene failure private draft");
    assert.equal(new URL(page.url()).searchParams.get("content"), "dream");
    await page.getByRole("button", { name: "같은 작업을 업무 보기로 계속" }).click();
    assert.equal(await input.inputValue(), "QA scene failure private draft");
    const failures = await page.evaluate(() => window.__campusFailures);
    assert.deepEqual(failures, [{ surface: "campus-scene", message: "Optional campus scene unavailable", stack: null }]);
    report.interactions.push("Injected scene chunk failure stays inside the optional scene boundary and preserves private domain input");
  } finally {
    await context.close();
  }
}

try {
  for (const width of widths) {
    const context = await contextFor(width, width < 600 ? 844 : 900);
    const page = await context.newPage();
    for (const path of paths) {
      const errors = [];
      const onError = (error) => errors.push(error.message);
      page.on("pageerror", onError);
      await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("button", { name: "공간 지도 열기", exact: true }).waitFor({ timeout: 60000 });
      const spaceButton = page.locator(".campus-modes").getByRole("button", { name: "공간", exact: true });
      if (await spaceButton.count()) {
        await spaceButton.click();
        await page.locator(".campus-room").waitFor({ timeout: 30000 });
      }
      if (path === "/fortune") await page.locator(".fortune-campus-directory h1").waitFor({ timeout: 60000 });
      else if (path === "/market/browse") await page.locator(".market-browse-masthead h1").waitFor({ timeout: 60000 });
      else await page.locator("main h1").first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(500);
      const measurement = await page.evaluate(() => {
        const artwork = document.querySelector(".campus-room-art > img");
        return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          mains: document.querySelectorAll("main").length, district: document.documentElement.dataset.campusDistrict,
          controls: document.querySelectorAll("[data-campus-controls]").length,
          artwork: artwork?.getAttribute("src") ?? null,
          artworkReady: artwork instanceof HTMLImageElement ? artwork.complete && artwork.naturalWidth > 0 : null };
      });
      await page.screenshot({ path: `${output}/${path.replace(/[^a-z0-9]+/gi, "-")}-${width}.png` });
      report.cases.push({ path, width, ...measurement, errors });
      console.log(JSON.stringify(report.cases.at(-1)));
      page.off("pageerror", onError);
      assert.ok(measurement.scrollWidth <= width + 1, `horizontal overflow: ${path} ${width}`);
      assert.equal(measurement.mains, 1, `main landmark: ${path}`);
      if (measurement.artwork) assert.equal(measurement.artworkReady, true, `district artwork: ${path}`);
      assert.deepEqual(errors, [], `runtime errors: ${path}`);
    }
    await context.close();
  }
  const desktopArtwork = new Set(report.cases.filter((item) => item.width === 1440 && item.artwork).map((item) => item.artwork));
  assert.ok(desktopArtwork.size >= 8, `expected district-specific artwork, found ${desktopArtwork.size}`);
  report.interactions.push(`District identity uses ${desktopArtwork.size} distinct verified artwork surfaces`);

  const context = await contextFor(1440);
  const page = await context.newPage();
  const interactionErrors = [];
  page.on("pageerror", (error) => interactionErrors.push(error.message));
  await page.goto(new URL("/market/browse", origin).href);
  await page.locator(".campus-modes").getByRole("button", { name: "공간", exact: true }).click();
  await page.locator(".campus-public-objects").getByRole("link", { name: resource.name }).waitFor();
  report.interactions.push("Synthetic market record appears in the live display projection");
  await page.goto(new URL("/community/promote", origin).href);
  await page.locator(".campus-modes").getByRole("button", { name: "공간", exact: true }).click();
  await page.locator(".campus-public-objects").getByRole("link", { name: promotion.title }).waitFor();
  report.interactions.push("Synthetic public promotion appears in the gallery scene after the existing publication authority returns it");
  await page.goto(new URL("/fortune?content=dream", origin).href);
  const input = page.getByRole("textbox", { name: /기억나는 꿈의 장면/ });
  await input.fill("QA only private dream");
  for (const mode of ["업무", "집중", "공간"]) {
    await page.locator(".campus-modes").getByRole("button", { name: mode, exact: true }).click();
    assert.equal(await input.inputValue(), "QA only private dream");
    assert.equal(new URL(page.url()).searchParams.get("content"), "dream");
  }
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes("QA only private dream")), false);
  report.interactions.push("Private fortune input survives all view modes without URL or storage leakage");
  await page.getByRole("button", { name: "공간 지도 열기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "창작 세계의 공간 지도" });
  assert.equal(await dialog.locator(".campus-place").count(), 9);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  report.interactions.push("Native map dialog opens, lists nine places and closes with Escape");
  await page.screenshot({ path: `${output}/fortune-dream-interaction.png` });
  await page.getByRole("button", { name: "공용 아틀리에 걷기", exact: true }).click();
  const canvas = page.locator(".studio-vspace-phaser-canvas canvas");
  await page.locator('[data-studio-engine-status="ready"]').waitFor({ timeout: 60000 });
  await page.locator("[data-campus-walk-x][data-campus-walk-y]").waitFor();
  const pose = () => page.locator(".campus-room-art").evaluate((element) => ({ x: Number(element.dataset.campusWalkX), y: Number(element.dataset.campusWalkY) }));
  const beforeWalk = await pose();
  await canvas.focus();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(450);
  await page.keyboard.up("ArrowRight");
  const afterWalk = await pose();
  assert.ok(Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.y - beforeWalk.y) > 3, "Arrow input must move the actor, not only focus a canvas");
  await page.screenshot({ path: `${output}/local-phaser-walk.png` });
  await page.getByRole("button", { name: "걷기 멈추기", exact: true }).click();
  assert.equal(await canvas.count(), 0);
  assert.equal(await input.inputValue(), "QA only private dream");
  assert.deepEqual(interactionErrors, [], "Runtime errors during domain and Phaser interactions");
  report.interactions.push("Existing Phaser canvas boots locally; keyboard input measurably moves the actor, stop unmounts the canvas and the domain form is preserved");
  await context.close();
  await verifyNestedWorkspaceScrollRestoration();
  await verifyMarketStudioRoundTrip();
  await verifyMobileMarketReturnNotice();
  await verifySceneFailureIsolation();
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
