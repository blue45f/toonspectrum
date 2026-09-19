import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import {
  verifyVirtualStudioArtManifest,
  VIRTUAL_STUDIO_PRODUCTION_ART_DIRECTORY,
} from "./verify-virtual-studio-art-manifest.mjs";

const runFile = promisify(execFile);
const configuredOrigin = process.env.STUDIO_QA_BASE_URL?.trim();
assert(configuredOrigin, "STUDIO_QA_BASE_URL is required; never default this QA harness to a possibly unrelated server");
const originUrl = new URL(configuredOrigin);
assert(["127.0.0.1", "localhost"].includes(originUrl.hostname), "Run the QA harness against a local development server only");
assert(["http:", "https:"].includes(originUrl.protocol), "STUDIO_QA_BASE_URL must use HTTP or HTTPS");
assert(!originUrl.username && !originUrl.password, "STUDIO_QA_BASE_URL must not include credentials");
assert(originUrl.pathname === "/" && !originUrl.search && !originUrl.hash, "STUDIO_QA_BASE_URL must be an origin without a path, query, or hash");
const origin = originUrl.origin;

async function attestServerWorktree(url) {
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  assert(Number.isInteger(port) && port > 0 && port <= 65_535, "STUDIO_QA_BASE_URL must use a valid port");
  const { stdout: pidOutput } = await runFile("lsof", [
    "-nP",
    `-iTCP:${port}`,
    "-sTCP:LISTEN",
    "-t",
  ]);
  const pids = [...new Set(pidOutput.split(/\s+/u).filter(Boolean))];
  assert(pids.length > 0, `No listening process owns ${url.origin}`);
  const expectedCwd = await fs.realpath(process.cwd());
  const owners = [];
  for (const pid of pids) {
    const { stdout: cwdOutput } = await runFile("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
    const cwd = cwdOutput.split("\n").find((line) => line.startsWith("n"))?.slice(1);
    if (!cwd) continue;
    owners.push({ pid: Number(pid), cwd: await fs.realpath(cwd) });
  }
  const owner = owners.find((candidate) => candidate.cwd === expectedCwd);
  assert(
    owner,
    `QA server ${url.origin} is not owned by this worktree (${expectedCwd}); observed ${JSON.stringify(owners)}`,
  );
  return { ...owner, origin: url.origin, expectedCwd };
}

const serverOrigin = await attestServerWorktree(originUrl);
const output = path.resolve(".qa/virtual-studio-runtime-acceptance");
await fs.mkdir(output, { recursive: true });
const results = [];
const artIntegrity = await verifyVirtualStudioArtManifest();
const artMetadata = new Map(artIntegrity.assets.map((asset) => [asset.name, asset]));
const productionArtUrl = `${origin}/assets/virtual-studio/production-v2`;
const representativeArtFiles = [
  "master-central-lossless.webp",
  "player-pink-direction-down.png",
  "player-pink-walk-down.webp",
  "player-pink-state-draw.png",
];
const verifyServedArtAsset = async (request, fileName) => {
  const expected = artMetadata.get(fileName);
  assert(expected, `Missing verified manifest metadata for ${fileName}`);
  const response = await request.get(`${productionArtUrl}/${fileName}`);
  assert.equal(response.status(), 200, `${fileName} must be served without an error`);
  const bytes = await response.body();
  assert.equal(bytes.length, expected.bytes, `${fileName} served byte length must match its manifest`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expected.sha256,
    `${fileName} served SHA-256 must match its manifest`,
  );
  return { fileName, bytes: bytes.length, sha256: expected.sha256 };
};
const browser = await chromium.launch({ headless: true });
const fixtureUrl = `${origin}/tools/browser-harnesses/virtual-studio-runtime-acceptance.html`;
const fixtureModule = "/tools/browser-harnesses/virtual-studio-runtime-acceptance.tsx";
const route = `${origin}/studio/p/virtual-demo/space`;
const call = (page, method, ...args) => page.evaluate(async ({ module, method, args }) => {
  const fixture = await import(module);
  return fixture[method](...args);
}, { module: fixtureModule, method, args });
const ready = async (page) => {
  await page.waitForSelector('[data-studio-engine-status="ready"] canvas', { timeout: 30000 });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-studio-phaser-runtime] canvas').count(), 1);
};
const position = (page) => page.locator('[data-studio-phaser-runtime]').evaluate((el) => ({
  x: Number(el.dataset.localX), y: Number(el.dataset.localY), moving: el.dataset.localMoving,
  texture: el.dataset.texture, reaction: el.dataset.reaction,
  peers: JSON.parse(el.dataset.peers ?? "[]"), npcs: JSON.parse(el.dataset.npcs ?? "[]"),
}));
const check = async (name, fn) => {
  const started = Date.now();
  try { const detail = await fn(); results.push({ name, passed: true, ms: Date.now() - started, detail }); console.log(`PASS ${name}`, JSON.stringify(detail ?? {})); }
  catch (error) { results.push({ name, passed: false, ms: Date.now() - started, error: String(error) }); throw error; }
};
const context = await browser.newContext({ viewport: { width: 1312, height: 1199 }, locale: "ko-KR" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let fixture;
try {
  await page.goto(route, { waitUntil: "domcontentloaded" }); await ready(page);
  await check("project: keyboard acceleration and release", async () => {
    await page.locator('[data-studio-phaser-runtime] canvas').focus();
    const start = await position(page);
    await page.keyboard.down("d"); await page.waitForTimeout(350); const moving = await position(page);
    await page.keyboard.up("d"); await page.waitForTimeout(300); const stop = await position(page);
    assert(moving.x > start.x + 20); assert.equal(moving.moving, "true"); assert(stop.x >= moving.x); assert.equal(stop.moving, "false");
    return { start, moving, stop };
  });
  await check("project: typing never loses WASD/E and never moves the player", async () => {
    await page.evaluate(() => { const i = document.createElement("input"); i.id = "qa-chat"; i.style = "position:fixed;left:10px;top:80px;z-index:999999"; document.body.append(i); i.focus(); });
    const start = await position(page);
    await page.locator("#qa-chat").pressSequentially("wasde hello"); await page.waitForTimeout(250);
    assert.equal(await page.locator("#qa-chat").inputValue(), "wasde hello");
    const end = await position(page); assert(Math.hypot(end.x - start.x, end.y - start.y) < 0.1);
    await page.locator("#qa-chat").evaluate((el) => el.remove());
  });
  await check("project: standard gamepad movement", async () => {
    await page.locator('[data-studio-phaser-runtime] canvas').focus();
    const before = await position(page);
    await page.evaluate(() => { const pad = { connected: true, axes: [-1, 0], buttons: Array.from({length: 16}, () => ({ pressed: false, value: 0 })) }; window.qaPad = pad; Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] }); });
    await page.waitForTimeout(350);
    await page.evaluate(() => { window.qaPad.axes[0] = 0; }); await page.waitForTimeout(250);
    const after = await position(page); assert(after.x < before.x - 20);
    await page.evaluate(() => { delete navigator.getGamepads; delete window.qaPad; });
    return { before: before.x, after: after.x, simulatedStandardGamepad: true };
  });
  await check("project: production art integrity, WebGL, layout and screenshots", async () => {
    assert.equal(await page.locator(".vs2-feature").count(), 6);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const webgl = await page.locator('[data-studio-phaser-runtime] canvas').evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    });
    assert.equal(webgl, true, "The real product route must use Phaser WebGL/AUTO, not the lifecycle harness Canvas renderer");
    const servedProductionArt = [];
    for (const fileName of representativeArtFiles) {
      servedProductionArt.push(await verifyServedArtAsset(page.request, fileName));
    }
    await page.screenshot({ path: path.join(output, "project-desktop.png"), fullPage: true });
    assert.deepEqual(errors, []);
    return {
      viewport: "1312x1199",
      renderer: "webgl",
      artwork: {
        manifestAssetCount: artIntegrity.assetCount,
        outputIntegrity: "local SHA-256, byte lengths, and dimensions verified",
        servedProductionArt,
        privateApprovedMasterSourceReverified: false,
      },
    };
  });
  await check("project: large edited world hydrates and retains positions", async () => {
    const layers = [
      { type: "objectgroup", name: "rooms", objects: [{ name: "large-room", x: 0, y: 0, width: 1600, height: 1200, properties: [{ name: "roomId", value: "large-room" }] }] },
      ...["props", "colliders", "interactions", "npcs", "portals"].map((name) => ({ type: "objectgroup", name, objects: [] })),
      { type: "objectgroup", name: "spawns", objects: [{ name: "main", x: 1200, y: 950 }] },
    ];
    await page.route("**/assets/virtual-studio/world/default-world.json", (route) => route.fulfill({ json: { width: 1600, height: 1200, tilewidth: 1, tileheight: 1, layers } }));
    const positionStorageKey = await page.evaluate(async () => {
      const { studioVirtualSpacePositionStorageKey, studioVirtualSpacePositionScope } = await import(
        "/src/domains/creator/virtual-space/studio-virtual-space-session-position.ts"
      );
      return studioVirtualSpacePositionStorageKey(studioVirtualSpacePositionScope("virtual-demo", false));
    });
    await page.addInitScript((key) => sessionStorage.setItem(key, JSON.stringify({ x: 1240, y: 950 })), positionStorageKey);
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(page);
    const before = await position(page); assert(Math.abs(before.x - 1240) < 2); assert(Math.abs(before.y - 950) < 2);
    const picker = page.getByRole("button", { name: /시나 캐릭터 선택/ }); await picker.click(); await page.waitForTimeout(200);
    const after = await position(page); assert(Math.abs(after.x - 1240) < 2); assert(after.texture.includes("silver"));
    await page.unroute("**/assets/virtual-studio/world/default-world.json");
    return { before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y, texture: after.texture } };
  });
  const mobileContext = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, locale: "ko-KR" });
  const mobile = await mobileContext.newPage(); const mobileErrors = [];
  mobile.on("pageerror", (e) => mobileErrors.push(e.message));
  await check("mobile: actual touch pointer joystick and overflow", async () => {
    await mobile.goto(route, { waitUntil: "domcontentloaded" }); await ready(mobile);
    const before = await position(mobile);
    const box = await mobile.locator('[data-studio-virtual-joystick="true"]').boundingBox(); assert(box);
    const client = await mobileContext.newCDPSession(mobile);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - box.height * .4 }] });
    await mobile.waitForTimeout(450);
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await mobile.waitForTimeout(300);
    const after = await position(mobile);
    assert(after.y < before.y - 15, `Native touch joystick did not move upward: ${JSON.stringify({ before, after, box })}`);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(mobileErrors, []);
    await mobile.screenshot({ path: path.join(output, "project-mobile.png"), fullPage: true });
    return { before: before.y, after: after.y, nativeTouchEvents: true };
  });
  await mobileContext.close();
  fixture = await context.newPage(); fixture.on("pageerror", (e) => errors.push(e.message));
  await fixture.goto(fixtureUrl, { waitUntil: "domcontentloaded" }); await ready(fixture);
  const base = (await call(fixture, "state")).world;
  const world = { ...base, id: "acceptance-world", width: 850, height: 798, props: [], colliders: [], interactions: [], portals: [], npcs: [],
    rooms: [{ id: "lounge", x: 0, y: 0, width: 850, height: 798, labelKo: "QA", labelEn: "QA" }], spawns: [{ id: "main", point: { x: 200, y: 250 } }] };
  await check("engine: circle collision and inaccessible NPC patrol", async () => {
    const wall = { x: 300, y: 0, width: 20, height: 798 };
    await call(fixture, "mount", { ...world, colliders: [wall], npcs: [{ id: "worker", skinKey: "silver", point: { x: 160, y: 380 }, roomId: "lounge", behavior: "patrol", patrol: [{ x: 500, y: 380 }] }] }, { x: 240, y: 250 }); await ready(fixture);
    await fixture.locator('[data-studio-phaser-runtime] canvas').focus(); await fixture.keyboard.down("d"); await fixture.waitForTimeout(850); await fixture.keyboard.up("d"); await fixture.waitForTimeout(200);
    const atWall = await position(fixture); assert(atWall.x <= 291.2);
    await call(fixture, "move", { x: 500, y: 250 }); await fixture.waitForTimeout(1300);
    const blocked = await position(fixture); assert(blocked.x <= 291.2); assert(blocked.npcs[0].x < 290);
    return { localX: blocked.x, npcX: blocked.npcs[0].x };
  });
  await check("engine: portal props teleport once without arrival bounce", async () => {
    await call(fixture, "mount", { ...world, props: [{ id: "entry", kind: "portal", x: 250, y: 250, interactionRadius: 24, portal: { targetPoint: { x: 500, y: 250 } } }],
      portals: [{ id: "return", point: { x: 500, y: 250 }, radius: 24, targetPoint: { x: 250, y: 250 } }] }, { x: 200, y: 250 }); await ready(fixture);
    await call(fixture, "move", { x: 260, y: 250 }); await fixture.waitForTimeout(1500);
    const after = await position(fixture); assert(Math.abs(after.x - 500) < 2);
    assert.deepEqual((await call(fixture, "state")).events.filter((e) => e.startsWith("portal:")), ["portal:entry"]);
    await fixture.waitForTimeout(1100); assert.equal((await call(fixture, "state")).events.length, 1);
  });
  await check("engine: contextual interaction and static atlas fallback", async () => {
    await call(fixture, "mount", { ...world, interactions: [{ id: "desk", zoneId: "lounge", point: { x: 210, y: 250 }, radius: 40, labelKo: "책상", labelEn: "Desk", action: "canvas" }] }, { x: 200, y: 250 }); await ready(fixture);
    await fixture.locator('[data-studio-phaser-runtime] canvas').focus(); await fixture.keyboard.press("e"); await fixture.waitForTimeout(120);
    assert((await call(fixture, "state")).events.includes("interact:desk"));
    await call(fixture, "setActivity", "focused"); await fixture.waitForTimeout(150); assert((await position(fixture)).texture.includes("state-draw"));
    await call(fixture, "reactSelf"); await fixture.waitForTimeout(150); assert.equal((await position(fixture)).reaction, "👋");
  });
  await check("engine: native RTCDataChannel presence, avatar, reaction and interpolation", async () => {
    await call(fixture, "mount", world, { x: 200, y: 250 }); await ready(fixture);
    await call(fixture, "connectRtcPeer"); await ready(fixture);
    await fixture.waitForTimeout(400);
    assert.equal((await call(fixture, "state")).snapshot.peers.length, 1);
    await call(fixture, "movePeer", { x: 330, y: 260 }, false); await call(fixture, "reactPeer"); await fixture.waitForTimeout(600);
    const peer = (await position(fixture)).peers[0]; assert(peer); assert(Math.abs(peer.x - 330) < 3); assert(peer.texture.includes("silver")); assert.equal(peer.reaction, "💗");
    const beforePackets = await call(fixture, "state");
    await fixture.evaluate(async (module) => {
      const qa = await import(module);
      for (let i = 0; i < 60; i++) {
        qa.movePeer({ x: 330 + i, y: 260 });
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      qa.movePeer({ x: 389, y: 260 }, false);
    }, fixtureModule);
    await fixture.waitForTimeout(300);
    const afterPackets = await call(fixture, "state");
    const remoteCount = afterPackets.remotePackets - beforePackets.remotePackets;
    const localCount = afterPackets.localPackets - beforePackets.localPackets;
    const packetWindowMs = afterPackets.sampledAt - beforePackets.sampledAt;
    const remoteBudget = Math.ceil(packetWindowMs / afterPackets.presenceIntervalMs) + 2;
    const idleBudget = Math.ceil(packetWindowMs / afterPackets.presenceHeartbeatMs) + 1;
    assert(remoteCount >= 8 && remoteCount <= remoteBudget,
      `Unexpected remote presence packet rate: ${remoteCount} packets in ${packetWindowMs}ms (budget ${remoteBudget})`);
    assert(localCount <= idleBudget, `Idle local peer sent too many packets: ${localCount} in ${packetWindowMs}ms`);
    await call(fixture, "follow"); await fixture.waitForTimeout(1000); assert((await position(fixture)).x > 260);
    return {
      nativeRtc: true,
      peer,
      remotePackets: remoteCount,
      packetWindowMs,
      remotePacketsPerSecond: remoteCount / (packetWindowMs / 1000),
      idleLocalPackets: localCount,
      signaling: "in-page fixture (not production authorization/media)",
    };
  });
  await check("social: native reliable RTC consent, cancellation and disconnect", async () => {
    const waitForSocial = async (predicate, detail) => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const current = await call(fixture, "state");
        if (predicate(current)) return current;
        await fixture.waitForTimeout(50);
      }
      assert.fail(`Social RTC timeout: ${detail}`);
    };
    const connected = await waitForSocial((current) => current.social?.readyPeerIds.length === 1
      && current.remoteSocial?.readyPeerIds.length === 1, "epoch handshake");
    assert.deepEqual(connected.reliableSocialChannel, { ordered: true, maxRetransmits: null, maxPacketLifeTime: null });
    const id = await call(fixture, "requestSocial", "talk");
    assert(id, "RTC talk offer must enqueue successfully");
    const offered = await waitForSocial((current) => current.remoteSocial?.requests.some((request) => request.id === id && request.status === "offered"), "incoming offer");
    assert.deepEqual(offered.acceptedSocial, [], "Offer alone must not start an interaction");
    assert.equal(await call(fixture, "respondPeerSocial", id, "accept"), true);
    const accepted = await waitForSocial((current) => current.acceptedSocial.length === 2, "mutual consent completion");
    assert.deepEqual(new Set(accepted.acceptedSocial.map((event) => event.side)), new Set(["local", "remote"]));
    assert(accepted.acceptedSocial.every((event) => event.id === id && event.action === "talk"));
    assert.equal(await call(fixture, "cancelSocial", id), true);
    await waitForSocial((current) => current.remoteSocial?.requests.some((request) => request.id === id && request.status === "cancelled"), "cancel delivery");
    await fixture.waitForTimeout(1_050);
    const followId = await call(fixture, "requestSocial", "follow");
    assert(followId);
    await waitForSocial((current) => current.remoteSocial?.requests.some((request) => request.id === followId), "follow offer");
    await call(fixture, "disconnectSocialPeer");
    const disconnected = await waitForSocial((current) => current.social?.requests.some((request) => request.id === followId && request.status === "disconnected"), "channel disconnect");
    assert.equal(disconnected.acceptedSocial.length, 2, "Unaccepted follow must not execute");
    return { nativeRtc: true, ordered: true, unlimitedRetransmission: true, consentEvents: accepted.acceptedSocial,
      socialPackets: disconnected.socialPackets, mediaStarted: false, signaling: "in-page fixture; production room authorization is outside this harness" };
  });
  await check("social: native RTC refuses mismatched world content", async () => {
    await call(fixture, "mount", world, { x: 200, y: 250 }); await ready(fixture);
    await call(fixture, "connectRtcPeer", "qa-different-content"); await ready(fixture);
    await fixture.waitForTimeout(400);
    const incompatible = await call(fixture, "state");
    assert.equal(incompatible.snapshot.peers.length, 1, "Spatial RTC is connected while social identity differs");
    assert.deepEqual(incompatible.social.readyPeerIds, []);
    assert.deepEqual(incompatible.remoteSocial.readyPeerIds, []);
    assert.equal(await call(fixture, "requestSocial", "review"), null);
    assert.deepEqual(incompatible.acceptedSocial, []);
    return { nativeRtc: true, worldContentMismatchRejected: true };
  });
  await check("engine: React StrictMode remount never leaves duplicate canvases", async () => {
    for (let i = 0; i < 5; i++) { await call(fixture, "mount", { ...world, version: i + 1 }, { x: 200, y: 250 }); await fixture.waitForTimeout(40); }
    await ready(fixture); await fixture.waitForTimeout(600); assert.equal(await fixture.locator("canvas").count(), 1);
  });
  await check("engine: failed critical asset displays retry and recovers", async () => {
    let requests = 0;
    await fixture.route("**/qa-missing-bg.png", async (route) => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 404, body: "Missing QA asset" });
      return route.fulfill({
        path: path.join(VIRTUAL_STUDIO_PRODUCTION_ART_DIRECTORY, "master-central-lossless.webp"),
        contentType: "image/webp",
      });
    });
    await call(fixture, "mount", { ...world, backgroundUrl: "/qa-missing-bg.png" }, { x: 200, y: 250 });
    await fixture.waitForSelector('[data-studio-engine-status="error"]', { timeout: 30000 });
    await fixture.getByRole("button", { name: /Retry|다시 시도/ }).click(); await ready(fixture);
    assert(requests >= 2); assert.equal(await fixture.locator("canvas").count(), 1);
  });
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  await (fixture ?? page).screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify({ serverOrigin, results, browserErrors: errors, passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length }, null, 2));
  await browser.close();
}
