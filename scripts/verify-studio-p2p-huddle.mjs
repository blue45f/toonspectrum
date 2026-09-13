import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

// Real Chromium RTC/SCTP/RTP in isolated contexts; synthetic devices, never the user's webcam.
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: false, root: `${root}apps/web`,
  resolve: { alias: { "@": `${root}apps/web/src` } },
  define: { "process.env": JSON.stringify({ NODE_ENV: "test" }) },
  optimizeDeps: { noDiscovery: false, include: ["react", "react/jsx-runtime", "react/compiler-runtime", "react-dom/client"] }, logLevel: "warn",
  // Keep generated dependency bundles outside the source lint boundary.
  cacheDir: `${root}node_modules/.cache/studio-p2p-huddle`, server: { host: "127.0.0.1", port: 0, strictPort: false } });
const deployment = JSON.parse(readFileSync(`${root}vercel.json`, "utf8"));
const permissionsPolicy = deployment.headers.find((rule) => rule.source === "/(.*)").headers
  .find((header) => header.key === "Permissions-Policy").value;
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, args: [
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ] });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ permissions: ["camera", "microphone"] })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of pages) {
    page.setDefaultTimeout(30000);
    await page.route("**/__p2p-fixture", (route) => route.fulfill({ contentType: "text/html", headers: { "Permissions-Policy": permissionsPolicy },
      body: '<!doctype html><html lang="ko"><head><title>P2P QA</title></head><body><div id="test-root"></div></body></html>' }));
    await page.goto(`${origin}/__p2p-fixture`);
  }
  for (let i = 0; i < pages.length; i++) {
    await pages[i].exposeFunction("qaRelay", (message) => pages[1 - i].evaluate((packet) => window.qaSignal(packet), message));
    await pages[i].evaluate(async (index) => {
      const { applyStudioLiveP2pOverlay } = await import("/src/domains/creator/live/studio-live-p2p-overlay-transport.ts");
      const { createStudioLiveEnvelope } = await import("/src/domains/creator/live/studio-live-collaboration-protocol.ts");
      const { StudioP2pHuddleController } = await import("/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts");
      const participant = { sessionId: `00000000-0000-4000-8000-00000000000${index + 1}`, displayName: `작가 ${index + 1}`, role: "editor" };
      const listeners = new Set();
      window.qaPrimaryPackets = [];
      window.qaSignal = (packet) => { for (const listener of listeners) listener(packet); };
      const primary = { mode: "server", ready: true, crdtFanout: "authoritative",
        connect: async () => undefined,
        send: (packet) => { window.qaPrimaryPackets.push(packet); void window.qaRelay(packet); return true; },
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        close: () => { primary.ready = false; listeners.clear(); },
      };
      const transport = applyStudioLiveP2pOverlay(() => primary)({ workId: "browser-p2p", roomName: "browser-p2p", participant });
      await transport.connect();
      window.qaTransport = transport;
      window.qaParticipant = participant;
      window.qaController = new StudioP2pHuddleController(participant, transport.direct);
      window.qaHello = () => transport.send(createStudioLiveEnvelope({ workId: "browser-p2p", sender: participant,
        kind: "presence:hello", payload: { visibility: "active", pageId: "page-1" }, sentAt: Date.now(), sequence: 1 }));
    }, i);
  }
  await Promise.all(pages.map((page) => page.evaluate(() => window.qaHello())));
  await Promise.all(pages.map((page) => page.waitForFunction(() => window.qaTransport.direct.getPeers().length === 1, null, { timeout: 30000 })));
  await Promise.all(pages.map((page) => page.evaluate(() => window.qaController.start())));
  await Promise.all(pages.map((page) => page.waitForFunction(() => window.qaController.snapshot().peers.length === 1)));
  assert.equal(await pages[0].evaluate(() => window.qaController.sendChat("한글 P2P 기밀 검증")), true);
  await pages[1].waitForFunction(() => window.qaController.snapshot().messages.some((m) => m.text === "한글 P2P 기밀 검증"));
  await pages[0].waitForFunction(() => window.qaController.snapshot().messages[0]?.received.length === 1);
  await Promise.all(pages.map((page) => page.evaluate(async () => {
    await window.qaController.setMicrophone(true);
    await window.qaController.setVideo("camera");
  })));
  await Promise.all(pages.map((page) => page.waitForFunction(() => {
    const peer = window.qaController.snapshot().peers[0];
    return peer?.connection === "connected" && peer.stream?.getVideoTracks().length === 1;
  }, null, { timeout: 30000 })));
  const media = [];
  for (const page of pages) {
    await page.evaluate(async () => {
      const video = document.createElement("video"); video.muted = true; video.autoplay = true;
      video.srcObject = window.qaController.snapshot().peers[0].stream;
      document.body.append(video); await video.play();
    });
    await page.waitForFunction(() => document.querySelector("video")?.getVideoPlaybackQuality().totalVideoFrames > 2);
    media.push(await page.evaluate(() => ({ frames: document.querySelector("video").getVideoPlaybackQuality().totalVideoFrames,
      primaryPacketsContainChat: JSON.stringify(window.qaPrimaryPackets).includes("한글 P2P 기밀 검증") })));
  }
  assert.ok(media.every((item) => item.frames > 2 && !item.primaryPacketsContainChat));
  const stopped = await Promise.all(pages.map((page) => page.evaluate(() => {
    const tracks = window.qaController.snapshot().localStream.getTracks();
    window.qaController.close(); window.qaTransport.close();
    return tracks.every((track) => track.readyState === "ended");
  })));
  assert.ok(stopped.every(Boolean));
  console.log(JSON.stringify({ result: "PASS", isolatedBrowserContexts: 2, realRtcDataChannel: true,
    koreanChatReceipt: true, simultaneousBidirectionalCamera: true, media,
    capturesReleasedOnLeave: stopped, crossNatAndPhysicalDevicesTested: false }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
