import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { collectStudioP2pFailureDiagnostics } from "./lib/studio-p2p-failure-diagnostics.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = "/tools/browser-harnesses/studio-p2p-creative-fixture.tsx";
const out = process.env.P2P_QA_OUTPUT ?? `${root}.qa/p2p-creative`;
const responsePolicy = JSON.parse(
  readFileSync(`${root}config/http-response-headers.json`, "utf8"),
);
const policy = responsePolicy.headers
  .find((rule) => rule.source === "/(.*)").headers
  .find((header) => header.key === "Permissions-Policy").value;
const server = await createServer({ configFile: false, root: `${root}apps/web`, css: { postcss: root },
  resolve: { alias: { "@": `${root}apps/web/src` } }, define: { "process.env": JSON.stringify({ NODE_ENV: "test" }) },
  optimizeDeps: { noDiscovery: true, include: ["react/jsx-dev-runtime", "lucide-react", "react", "react/jsx-runtime", "react/compiler-runtime", "react-dom/client"] },
  cacheDir: `${root}node_modules/.cache/studio-p2p-creative-v1`, logLevel: "warn",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root, realpathSync(`${root}node_modules`)] } } });
await mkdir(out, { recursive: true });
await server.listen(); const address = server.httpServer.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const results = [];
const profiles = [{ name: "chromium-desktop", type: chromium, media: true, mobile: false },
  { name: "chromium-mobile-emulation", type: chromium, media: true, mobile: true },
  { name: "webkit-mobile-emulation", type: webkit, media: true, generatedMedia: true, mobile: true }];
try {
  for (const profile of profiles.filter((p) => !process.env.P2P_QA_PROFILE || p.name.includes(process.env.P2P_QA_PROFILE))) {
    const browser = await profile.type.launch({ headless: true, ...(profile.type === chromium ? { args: [
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    ] } : {}) });
    const row = { profile: profile.name, browserVersion: browser.version(), checks: [], errors: [],
      nativeInAppVerified: false, physicalDevices: false, productionAuth: false, syntheticMedia: profile.media, generatedStreams: Boolean(profile.generatedMedia) };
    const pages = [];
    try {
      for (let i = 0; i < 2; i++) {
        const context = await browser.newContext({ viewport: profile.mobile ? { width: 360, height: 780 } : { width: 1280, height: 960 },
          isMobile: profile.mobile, hasTouch: profile.mobile, locale: "ko-KR", ...(profile.type === chromium ? { permissions: ["camera", "microphone"] } : {}) });
        const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(30000);
        page.on("pageerror", (e) => row.errors.push(String(e)));
        await page.addInitScript(() => {
          window.qaTracks = []; window.qaConnections = []; window.qaCaptureCalls = 0;
          const Native = window.RTCPeerConnection;
          window.RTCPeerConnection = class extends Native { constructor(config) { super(config); window.qaConnections.push(this); } };
          if (navigator.mediaDevices?.getUserMedia) {
            const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              window.qaCaptureCalls++; const stream = await capture(constraints); window.qaTracks.push(...stream.getTracks()); return stream;
            };
          }
        });
        await page.route("**/__creative-qa", (route) => route.fulfill({ contentType: "text/html",
          headers: { "Permissions-Policy": policy }, body: '<!doctype html><html lang="ko"><head><title>P2P creative QA</title></head><body><div id="test-root"></div></body></html>' }));
        await page.goto(`${origin}/__creative-qa`);
      }
      for (let i = 0; i < pages.length; i++) {
        await pages[i].exposeFunction("qaRelay", (packet) => pages[1 - i].evaluate(async ({ path, packet }) => (await import(path)).signal(packet), { path: fixture, packet }));
        if (profile.generatedMedia) await pages[i].evaluate(async (path) => (await import(path)).installGeneratedMedia(), fixture);
        await pages[i].evaluate(async ({ path, index }) => { window.qaFixture = await import(path); await window.qaFixture.mount(index); }, { path: fixture, index: i });
        await pages[i].getByRole("button", { name: "채팅·통화", exact: true }).waitFor();
      }
      await Promise.all(pages.map((p) => p.evaluate(async (path) => (await import(path)).announce(), fixture)));
      await Promise.all(pages.map((p) => p.waitForFunction(() => window.qaFixture.peerCount() === 1)));
      for (const page of pages) {
        await page.getByRole("button", { name: "채팅·통화", exact: true }).click();
        await page.getByRole("button", { name: "동의하고 P2P 채팅 참여", exact: true }).click();
        assert.equal(await page.evaluate(() => window.qaCaptureCalls), 0);
      }
      await Promise.all(pages.map((p) => p.getByText("나 포함 2명 참여", { exact: false }).waitFor()));
      async function chat(text) {
        await pages[0].getByLabel("P2P 메시지", { exact: true }).fill(text);
        await pages[0].getByLabel("P2P 메시지", { exact: true }).press("Enter");
        await pages[1].getByText(text, { exact: true }).waitFor();
        await pages[0].getByText("전송 1/1 · 수신 확인 1/1", { exact: true }).last().waitFor();
      }
      await chat("브라우저 P2P 한글 검증"); row.checks.push("UI consent, zero implicit capture, Korean chat and receipt");
      if (profile.media) {
        for (const page of pages) {
          if (profile.generatedMedia) {
            await page.evaluate(async (path) => (await import(path)).installGeneratedMedia(), fixture);
          }
          await page.getByRole("button", { name: "마이크 켜기", exact: true }).click();
          await page.getByRole("button", { name: "마이크 끄기", exact: true }).waitFor();
          if (profile.generatedMedia) {
            await page.evaluate(async (path) => (await import(path)).installGeneratedMedia(), fixture);
          }
          await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
          await page.getByRole("button", { name: "카메라 끄기", exact: true }).waitFor();
        }
        for (const page of pages) {
          await page.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => v.getAttribute("aria-label")?.startsWith("작가") && v.srcObject?.getVideoTracks().length));
          await page.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => v.getAttribute("aria-label")?.startsWith("작가") && v.getVideoPlaybackQuality().totalVideoFrames > 3)
            || [...document.querySelectorAll("button")].some((b) => b.textContent === "소리·영상 재생"));
          const play = page.getByRole("button", { name: "소리·영상 재생", exact: true });
          for (let i = 0; i < await play.count(); i++) await play.nth(i).click();
          await page.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => v.getAttribute("aria-label")?.startsWith("작가") && v.getVideoPlaybackQuality().totalVideoFrames > 3));
          await page.waitForFunction(async () => {
            const reports = await Promise.all(window.qaConnections.map((pc) => pc.getStats()));
            return reports.some((stats) => [...stats.values()].some((s) => s.type === "inbound-rtp" && s.kind === "audio" && s.bytesReceived > 0));
          });
        }
        row.media = await Promise.all(pages.map((p) => p.evaluate(async () => {
          const reports = await Promise.all(window.qaConnections.map((pc) => pc.getStats()));
          return reports.flatMap((stats) => [...stats.values()].filter((s) => s.type === "inbound-rtp").map((s) => ({ kind: s.kind, bytesReceived: s.bytesReceived, framesDecoded: s.framesDecoded })));
        })));
        assert.ok(row.media.every((r) => r.some((s) => s.kind === "audio" && s.bytesReceived > 0) && r.some((s) => s.kind === "video" && s.framesDecoded > 3)));
        row.checks.push("Real RTP audio received, bidirectional video decoded, default autoplay policy");
      }
      for (const page of pages) await page.locator("summary").filter({ hasText: "함께 그리기·투표" }).click();
      await pages[0].getByLabel("드로잉 챌린지", { exact: true }).selectOption("gesture");
      await pages[0].getByRole("button", { name: "함께 시작", exact: true }).click();
      await pages[1].getByRole("heading", { name: "60초 동세", exact: true }).waitFor();
      await pages[0].getByRole("button", { name: "타이머 일시정지", exact: true }).click();
      await pages[1].getByRole("timer").filter({ hasText: "일시정지" }).waitFor();
      await pages[0].getByRole("button", { name: "투표 시작", exact: true }).click();
      await pages[1].getByRole("button", { name: "A안 · 0표", exact: true }).click();
      await pages[0].getByRole("button", { name: "B안 · 0표", exact: true }).click();
      await pages[0].getByRole("button", { name: "A안 · 1표", exact: true }).waitFor();
      await pages[1].getByRole("button", { name: "B안 · 1표", exact: true }).click();
      await pages[0].getByRole("button", { name: "B안 · 2표", exact: true }).waitFor();
      row.checks.push("Challenge, synchronized pause, real-time poll, vote replacement");
      for (let i = 0; i < pages.length; i++) {
        await pages[i].screenshot({ path: `${out}/${profile.name}-peer-${i}.png` });
        const body = await pages[i].evaluate(async (path) => JSON.stringify((await import(path)).primaryPackets), fixture);
        assert.ok(!body.includes("브라우저 P2P 한글 검증") && !body.includes("어떤 구도가 더 좋을까요?"));
        assert.equal(await pages[i].evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
      row.checks.push("No chat or activity body in primary signaling, no horizontal overflow");
      await pages[0].getByRole("button", { name: "대화 패널 접기", exact: true }).click();
      if (profile.media) assert.equal(await pages[0].evaluate(() => window.qaTracks.some((t) => t.readyState === "live")), true);
      await pages[0].getByRole("button", { name: /P2P 대화 중/ }).click();
      await pages[0].evaluate(async (path) => (await import(path)).terminate(), fixture);
      await pages[0].waitForFunction(() => window.qaTracks.every((t) => t.readyState === "ended"));
      await pages[0].getByRole("button", { name: "동의하고 P2P 채팅 참여", exact: true }).click();
      await Promise.all(pages.map((p) => p.getByText("나 포함 2명 참여", { exact: false }).waitFor()));
      await chat("연결 종료 후 재참여 검증");
      row.checks.push("Collapsed session retained, terminal capture cleanup, same-room rejoin and chat");
      for (const page of pages) {
        await page.getByRole("button", { name: "나가기", exact: true }).click();
        assert.equal(await page.evaluate(() => window.qaTracks.every((t) => t.readyState === "ended")), true);
      }
      assert.equal(row.errors.length, 0, row.errors.join("\n")); row.result = "PASS";
    } catch (error) {
      row.result = "FAIL"; row.failure = String(error?.stack ?? error);
      const diagnostics = await Promise.all(pages.map((page) => page.evaluate(collectStudioP2pFailureDiagnostics)
        .catch(() => ({ capture: { calls: -1, tracks: [], getUserMedia: "" }, directPackets: [], rtc: [] }))));
      row.capture = diagnostics.map((entry) => entry.capture);
      row.directPackets = diagnostics.map((entry) => entry.directPackets);
      row.rtc = diagnostics.map((entry) => entry.rtc);
      for (let i = 0; i < pages.length; i++) {
        // Keep rendered QA evidence private; do not copy chat/activity body text into result JSON.
        await pages[i].screenshot({ path: `${out}/${profile.name}-failure-${i}.png` }).catch(() => undefined);
      }
    } finally {
      for (const page of pages) await page.evaluate(async (path) => (await import(path)).cleanup(), fixture).catch(() => undefined);
      await browser.close(); results.push(row); console.log(JSON.stringify(row, null, 2));
      await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
    }
  }
} finally { await server.close(); }
if (results.some((r) => r.result !== "PASS")) process.exitCode = 1;
