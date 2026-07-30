/**
 * Production-preview console contract for both Studio 3D editors.
 *
 * The smoke test covers the complete Canvas lifetime (mount and delayed unmount)
 * and ensures opening the local character editor does not eagerly contact the
 * optional shared-pose API.
 *
 * Run after a production build:
 *   pnpm run build
 *   pnpm run verify:studio-3d-console
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Locator, type Page } from "playwright";

const QUICK_START_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;
const VITE_ERROR_OVERLAY_SELECTOR = [
  "vite-error-overlay",
  ".vite-error-overlay",
  "#vite-error-overlay",
  "[data-vite-error-overlay]",
].join(",");
const EXPECTED_R3F_VERSION = "9.6.1";
const EXPECTED_THREE_VERSION = "0.184.0";
const R3F_CONTEXT_LOSS_DIAGNOSTIC = "THREE.WebGLRenderer: Context Lost.";
const SHARED_POSE_CATALOG_API_PATH = "/api/creator/assets/catalog";
const KTX2_SMOKE_MODEL_NAME = "studio-ktx2-runtime-smoke.glb";
const KTX2_SMOKE_MODEL_LABEL = "studio-ktx2-runtime-smoke";

// Three r184's official 40x40 ETC1S KTX2 example (MIT). The verifier embeds it into a minimal
// self-contained GLB at runtime, so the production smoke exercises admission, the pinned Basis
// Worker/WASM transcoder, GLTFLoader, GPU upload and an actual Canvas frame without network assets.
const KTX2_ETC1S_BASE64 = [
  "q0tUWCAyMLsNChoKAAAAAAEAAAAoAAAAKAAAAAAAAAAAAAAAAQAAAAYAAAABAAAA4AAAACwAAAAMAQAANAAAAEABAAAAAAAADgIA",
  "AAAAAAB/AwAAAAAAAEcAAAAAAAAAAAAAAAAAAABiAwAAAAAAAB0AAAAAAAAAAAAAAAAAAABXAwAAAAAAAAsAAAAAAAAAAAAAAAAA",
  "AABSAwAAAAAAAAUAAAAAAAAAAAAAAAAAAABQAwAAAAAAAAIAAAAAAAAAAAAAAAAAAABOAwAAAAAAAAIAAAAAAAAAAAAAAAAAAAAs",
  "AAAAAAAAAAIAKACjAQIAAwMAAAAAAAAAAAAAAAA/AAAAAAAAAAAA/////zAAAABLVFh3cml0ZXIAa3R4IGNyZWF0ZSB2NC4zLjF+",
  "MSAvIGxpYmt0eCB2NC4zLjB+MQARAEcATgAAAOIAAABSAAAAAAAAAAAAAAAAAAAARwAAAAAAAAAAAAAAAAAAAAAAAAAdAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAIA",
  "AAAAAAAAAAAAAB5ABIEBAIBAYFfmDwwQIJKAAABAQHB2SXmAchEQ4JHAAACAELHeUAcDAYgAAAAAEAhqLNu1NsfYtHSTp3J/U0WP",
  "vYwSIPsfugAGwtwABJgH4gpIw1AUQE9vIk3KgxLURRzukCFqxIc6FtIOXYpgBwvi5qiT6A9cHoKDm+AiDtIpivgLPiz+gIKTHyEC",
  "APwAQwPgIXrwEXA4HHt/RIAGiACRyAIizgE4HP2EPkAHpCNJJ09zVm6lKzf5Jb1aztlud+D7GQbRk+ZLs9HBUJ/ATFUBA8QEIZjB",
  "C4BhmEEAE1Woqh7QZtk8yxRQM5MqBBFpQS1TmKtuFsV4Y3cwjL/xFR7vR5RnH+td9u+OuS4/H1bx3h8C71M4+bKQbKX1ZHJR1P/l",
  "1el4uXk7WjhSN/sJa1MAweMAAQCCom8AhWQeJzMYwRhGMJAVKOXgoqygXP/vRwARAAQAEIRh3aAo0A0RWGs5EAGzd7H3QMYJxiei",
  "0IhGi0RFwhs4ASYCAAAAAACQG0AA8gHy3qGF4QEuYTjZ3nE0bP8GPllu//5Lqne6388gOMYi00HDcP+QIFER2H8Z2lMkgvcuQHWQ",
  "LCvp8ubDLDhx17OZv071GWV3ZrKyXZnEJt9IHqsx0jOHrPtc7ZmCasMv7Mh3dS7JB6XsDRpeoK1x87oqJtwCAAsA",
].join("");

function align4(value: number): number {
  return (value + 3) & ~3;
}

function createKtx2SmokeGlb(): Buffer {
  const ktx2 = Buffer.from(KTX2_ETC1S_BASE64, "base64");
  const positionOffset = 0;
  const normalOffset = 48;
  const uvOffset = 96;
  const indexOffset = 128;
  const ktx2Offset = 140;
  const binaryLength = align4(ktx2Offset + ktx2.byteLength);
  const binary = Buffer.alloc(binaryLength);
  new Float32Array(binary.buffer, binary.byteOffset + positionOffset, 12).set([
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
  ]);
  new Float32Array(binary.buffer, binary.byteOffset + normalOffset, 12).set([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]);
  new Float32Array(binary.buffer, binary.byteOffset + uvOffset, 8).set([
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  new Uint16Array(binary.buffer, binary.byteOffset + indexOffset, 6).set([0, 1, 2, 0, 2, 3]);
  ktx2.copy(binary, ktx2Offset);

  const gltf = {
    asset: { generator: "ToonSpectrum KTX2 production verifier", version: "2.0" },
    extensionsRequired: ["KHR_texture_basisu"],
    extensionsUsed: ["KHR_texture_basisu"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "KTX2 smoke quad" }],
    meshes: [{ primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3,
      material: 0,
    }] }],
    materials: [{
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    }],
    textures: [{ sampler: 0, extensions: { KHR_texture_basisu: { source: 0 } } }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: 4, mimeType: "image/ktx2", name: "Official ETC1S fixture" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR", min: [0], max: [3] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: 48, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: 48, target: 34962 },
      { buffer: 0, byteOffset: uvOffset, byteLength: 32, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: 12, target: 34963 },
      { buffer: 0, byteOffset: ktx2Offset, byteLength: ktx2.byteLength },
    ],
    buffers: [{ byteLength: binaryLength }],
  };
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const paddedJsonLength = align4(json.byteLength);
  const totalLength = 12 + 8 + paddedJsonLength + 8 + binaryLength;
  const glb = Buffer.alloc(totalLength, 0);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(paddedJsonLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  glb.fill(0x20, 20 + json.byteLength, 20 + paddedJsonLength);
  const binaryHeaderOffset = 20 + paddedJsonLength;
  glb.writeUInt32LE(binaryLength, binaryHeaderOffset);
  glb.writeUInt32LE(0x004e4942, binaryHeaderOffset + 4);
  binary.copy(glb, binaryHeaderOffset + 8);
  return glb;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not allocate a preview port"));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok || response.status < 500) return;
    } catch {
      // Preview is still starting.
    }
    await delay(250);
  }
  throw new Error(`preview server did not become ready: ${url}`);
}

function isExpectedStaticPreviewApiMessage(message: string): boolean {
  return OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path));
}

export function isExpectedStaticPreviewSocketIoHandshakeClose(
  message: string,
  studioUrl: string,
): boolean {
  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    previewUrl.protocol !== "http:"
    || previewUrl.hostname !== "127.0.0.1"
    || !previewUrl.port
  ) {
    return false;
  }

  return message === [
    "WebSocket connection to ",
    `'ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket' failed: `,
    "Connection closed before receiving a handshake response",
  ].join("");
}

function isExpectedHeadlessGraphicsDiagnostic(message: string): boolean {
  return /GL Driver Message .*GPU stall due to ReadPixels/u.test(message) ||
    message.startsWith("No available adapters.");
}

function verifyPatchedThreeRuntime(): void {
  const require = createRequire(import.meta.url);
  const readPackageVersion = (entryPoint: string): unknown => {
    const packagePath = join(dirname(require.resolve(entryPoint)), "..", "package.json");
    return (JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown }).version;
  };
  const r3fVersion = readPackageVersion("@react-three/fiber");
  const threeVersion = readPackageVersion("three");
  assertCondition(
    r3fVersion === EXPECTED_R3F_VERSION,
    `unexpected @react-three/fiber version: ${String(r3fVersion)}`,
  );
  assertCondition(
    threeVersion === EXPECTED_THREE_VERSION,
    `unexpected three version: ${String(threeVersion)}`,
  );

  const r3fDistDirectory = dirname(require.resolve("@react-three/fiber"));
  const eventRuntimeFiles = readdirSync(r3fDistDirectory)
    .filter((name) => /^events-.*\.js$/u.test(name));
  assertCondition(eventRuntimeFiles.length === 3, "could not identify all patched R3F event runtimes");
  for (const name of eventRuntimeFiles) {
    const source = readFileSync(join(r3fDistDirectory, name), "utf8");
    assertCondition(source.includes("createLegacyClock"), `${name} is missing the Timer clock adapter`);
    assertCondition(
      source.includes("handlePlannedContextLoss") &&
        source.includes("removeEventListener('webglcontextlost'") &&
        source.includes("forceContextLoss"),
      `${name} is missing the bounded planned-context-loss handler`,
    );
    assertCondition(
      !/new THREE(?:__namespace)?\.Clock\(/u.test(source),
      `${name} still constructs deprecated THREE.Clock`,
    );
  }
}

async function configureStudio(page: Page): Promise<void> {
  await page.addInitScript(({ quickStartKey, mobileHintKey, uiDensityKey }) => {
    try {
      localStorage.setItem(quickStartKey, "1");
      localStorage.setItem(mobileHintKey, "1");
      localStorage.setItem(uiDensityKey, JSON.stringify({ mode: "full" }));
    } catch {
      // The visible UI assertions below remain authoritative if storage is blocked.
    }
  }, {
    quickStartKey: QUICK_START_KEY,
    mobileHintKey: MOBILE_HINT_KEY,
    uiDensityKey: UI_DENSITY_KEY,
  });
}

async function openInsertMenu(page: Page): Promise<Locator> {
  const mainMenu = page.locator('[data-studio-main-menu="true"]');
  await mainMenu.waitFor({ state: "visible", timeout: 20_000 });
  await mainMenu.getByRole("button", { name: "삽입", exact: true }).click();
  const menu = page.locator('[role="menu"][aria-label="삽입"]');
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  return menu;
}

async function closeCanvasDialog(dialog: Locator, page: Page): Promise<void> {
  const close = dialog.locator('button[aria-label="닫기"]');
  await close.waitFor({ state: "visible", timeout: 5_000 });
  await close.click();
  await waitForCanvasDialogTeardown(dialog, page);
}

async function waitForCanvasDialogTeardown(dialog: Locator, page: Page): Promise<void> {
  await dialog.waitFor({ state: "detached", timeout: 5_000 });
  // R3F defers renderer teardown by 500ms. The compatibility patch also removes an unconsumed
  // planned-loss listener after one bounded second, so wait through both lifetimes.
  await page.waitForTimeout(1_650);
}

async function triggerObservableLiveContextLoss(dialog: Locator): Promise<{
  supported: boolean;
  observed: boolean;
}> {
  const canvas = dialog.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 5_000 });
  return canvas.evaluate(async (element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("webgl2") ?? target.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return { supported: false, observed: false };

    const observed = await new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 2_000);
      target.addEventListener("webglcontextlost", (event) => {
        // Preventing the default keeps the browser's restoration path available. The verifier
        // deliberately leaves this test Canvas lost and closes it immediately afterwards.
        event.preventDefault();
        window.clearTimeout(timeout);
        resolve(true);
      }, { once: true });
      extension.loseContext();
    });
    return { supported: true, observed };
  });
}

async function run(page: Page, studioUrl: string): Promise<void> {
  const issues: string[] = [];
  const sharedPoseRequests: string[] = [];
  const pngEncoderWorkers: string[] = [];
  const glbValidationWorkers: string[] = [];
  const ktx2TranscoderWorkers: string[] = [];
  const basisWasmResponses: string[] = [];
  let expectingLiveContextLoss = false;
  let liveContextExplicitlyLost = false;
  let liveContextLossDiagnostics = 0;

  page.on("console", (message) => {
    const type = message.type();
    const location = message.location().url;
    const value = location ? `${message.text()} @ ${location}` : message.text();
    if (type === "log" && value.includes(R3F_CONTEXT_LOSS_DIAGNOSTIC)) {
      if (expectingLiveContextLoss) liveContextLossDiagnostics += 1;
      else issues.push(`unexpected planned-context-loss diagnostic: ${value}`);
    } else if (
      type === "error"
      && !isExpectedStaticPreviewApiMessage(value)
      && !isExpectedStaticPreviewSocketIoHandshakeClose(message.text(), studioUrl)
    ) {
      issues.push(`console.error: ${value}`);
    } else if (
      type === "warning"
      && !isExpectedHeadlessGraphicsDiagnostic(value)
      && !(
        liveContextExplicitlyLost
        && value.includes("WEBGL_lose_context extension not supported")
      )
    ) {
      issues.push(`console.warn: ${value}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${String(error)}`));
  page.on("worker", (worker) => {
    const url = worker.url();
    if (url.includes("studio-bg3d-shot-png.worker")) pngEncoderWorkers.push(url);
    if (url.includes("studio-bg3d-glb-validation.worker")) glbValidationWorkers.push(url);
    if (url.startsWith("blob:")) ktx2TranscoderWorkers.push(url);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === SHARED_POSE_CATALOG_API_PATH && request.method() === "GET") {
      sharedPoseRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.includes("basis_transcoder")
      && url.pathname.endsWith(".wasm")
      && response.ok()
    ) {
      basisWasmResponses.push(response.url());
    }
  });

  await configureStudio(page);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  try {
    await page.locator('[data-studio-editor="true"]').waitFor({ state: "attached", timeout: 20_000 });
  } catch (cause) {
    throw new Error(
      `Studio editor did not mount; diagnostics:\n${issues.join("\n") || "(none)"}`,
      { cause },
    );
  }

  const characterMenu = await openInsertMenu(page);
  await characterMenu.getByRole("menuitem", { name: "3D 캐릭터", exact: true }).click();
  const characterDialog = page.locator('[data-studio-vrm-dialog="true"]');
  await characterDialog.waitFor({ state: "visible", timeout: 25_000 });
  await page.waitForTimeout(1_000);

  assertCondition(
    sharedPoseRequests.length === 0,
    `opening the local character editor eagerly requested the shared-pose API:\n${sharedPoseRequests.join("\n")}`,
  );

  await page.route(
    (url) => url.pathname === SHARED_POSE_CATALOG_API_PATH,
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      // Exercise the component's inline failure path without introducing a browser-level
      // failed-resource diagnostic that would obscure application console assertions.
      body: "{malformed-shared-library-response",
    }),
  );
  await characterDialog.getByRole("tab", { name: "포즈", exact: true }).click();
  await characterDialog.getByText("서버 공유 포즈 라이브러리", { exact: true }).click();
  await characterDialog.getByRole("status").filter({
    hasText: "공유 포즈 서버에 연결하지 못했습니다",
  }).waitFor({ state: "visible", timeout: 15_000 });
  assertCondition(
    sharedPoseRequests.length > 0,
    "expanding the shared-pose library did not issue its explicit lazy request",
  );
  // Exercise the actual VRM render-target readback -> short-lived OffscreenCanvas PNG Worker ->
  // editor insertion path before deliberately losing a separate Canvas context below.
  await characterDialog.getByRole("button", { name: "이 포즈로 추가", exact: true }).click({
    timeout: 30_000,
  });
  await waitForCanvasDialogTeardown(characterDialog, page);
  assertCondition(
    pngEncoderWorkers.length > 0,
    "VRM insertion did not start the shared off-main PNG encoder",
  );

  const liveLossMenu = await openInsertMenu(page);
  await liveLossMenu.getByRole("menuitem", { name: "3D 캐릭터", exact: true }).click();
  const liveLossDialog = page.locator('[data-studio-vrm-dialog="true"]');
  await liveLossDialog.waitFor({ state: "visible", timeout: 25_000 });
  await page.waitForTimeout(1_000);
  const diagnosticsBeforeLiveLoss = liveContextLossDiagnostics;
  expectingLiveContextLoss = true;
  try {
    const liveLoss = await triggerObservableLiveContextLoss(liveLossDialog);
    await page.waitForTimeout(250);
    assertCondition(liveLoss.supported, "WEBGL_lose_context is unavailable in the browser verifier");
    assertCondition(liveLoss.observed, "a live WebGL context loss did not reach the Canvas observer");
    liveContextExplicitlyLost = true;
    assertCondition(
      liveContextLossDiagnostics > diagnosticsBeforeLiveLoss,
      "Three's live context-loss diagnostic was incorrectly suppressed",
    );
  } finally {
    expectingLiveContextLoss = false;
  }
  await closeCanvasDialog(liveLossDialog, page);

  const backgroundMenu = await openInsertMenu(page);
  await backgroundMenu.getByRole("menuitem", { name: "3D 배경", exact: true }).click();
  const backgroundDialog = page.getByTestId("studio-bg3d-dialog");
  await backgroundDialog.waitFor({ state: "visible", timeout: 25_000 });
  await page.waitForTimeout(1_000);

  await backgroundDialog.getByRole("tab", { name: "모델", exact: true }).click();
  const ktxCanvas = backgroundDialog.locator("canvas").first();
  await ktxCanvas.waitFor({ state: "visible", timeout: 5_000 });
  await ktxCanvas.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const canvasBeforeKtx2 = await ktxCanvas.screenshot({ type: "png" });
  const glbValidationWorkersBefore = glbValidationWorkers.length;
  const ktx2TranscoderWorkersBefore = ktx2TranscoderWorkers.length;
  const basisWasmResponsesBefore = basisWasmResponses.length;
  await backgroundDialog.getByLabel("3D 모델 및 연결 파일 선택").setInputFiles({
    name: KTX2_SMOKE_MODEL_NAME,
    mimeType: "model/gltf-binary",
    buffer: createKtx2SmokeGlb(),
  });
  const importedModelButton = backgroundDialog.getByRole("button", {
    name: `${KTX2_SMOKE_MODEL_LABEL} 장면에 추가`,
    exact: true,
  });
  try {
    await importedModelButton.waitFor({ state: "visible", timeout: 90_000 });
  } catch (cause) {
    const dialogText = await backgroundDialog.innerText().catch(() => "(dialog unavailable)");
    throw new Error(
      `the KTX2 model did not enter the verified library:\n${dialogText.slice(-6_000)}`,
      { cause },
    );
  }
  await backgroundDialog.locator(
    'section[aria-labelledby="bg3d-asset-library-title"][aria-busy="false"]',
  ).waitFor({ state: "visible", timeout: 90_000 });

  await backgroundDialog.getByRole("tab", { name: "레이어", exact: true }).click();
  await backgroundDialog.getByText(`${KTX2_SMOKE_MODEL_LABEL} 1`, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await backgroundDialog.getByText("모델 렌더 인스턴스를 준비하는 중입니다.", {
    exact: true,
  }).waitFor({ state: "hidden", timeout: 30_000 });
  assertCondition(
    await backgroundDialog.getByRole("alert").count() === 0,
    "the KTX2 model produced a scene-recovery or render-clone failure",
  );
  assertCondition(
    glbValidationWorkers.length > glbValidationWorkersBefore,
    "the KTX2 model did not run through the off-main GLB validation worker",
  );
  assertCondition(
    ktx2TranscoderWorkers.length > ktx2TranscoderWorkersBefore,
    "the KTX2 model did not start the renderer-specific Basis transcoder worker",
  );
  assertCondition(
    basisWasmResponses.length > basisWasmResponsesBefore,
    "the KTX2 path did not load the pinned Basis transcoder WASM asset",
  );
  await ktxCanvas.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const canvasAfterKtx2 = await ktxCanvas.screenshot({ type: "png" });
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertCondition(
    canvasAfterKtx2.length > pngSignature.length
      && canvasAfterKtx2.subarray(0, pngSignature.length).equals(pngSignature),
    "the KTX2 Canvas did not produce a valid PNG frame",
  );
  assertCondition(
    !canvasAfterKtx2.equals(canvasBeforeKtx2),
    "the verified KTX2 scene placement did not change the rendered Canvas frame",
  );
  const webglStatus = await ktxCanvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return context
      ? { exists: true, contextLost: context.isContextLost(), error: context.getError() }
      : { exists: false, contextLost: true, error: -1 };
  });
  assertCondition(webglStatus.exists, "the KTX2 renderer Canvas has no WebGL context");
  assertCondition(!webglStatus.contextLost, "the KTX2 renderer WebGL context is lost");
  assertCondition(webglStatus.error === 0, `the KTX2 renderer reported WebGL error ${webglStatus.error}`);
  await closeCanvasDialog(backgroundDialog, page);

  const overlayCount = await page.locator(VITE_ERROR_OVERLAY_SELECTOR).count();
  assertCondition(overlayCount === 0, `Vite/framework error overlay is present (${overlayCount})`);
  assertCondition(issues.length === 0, `unexpected 3D browser diagnostics:\n${issues.join("\n")}`);
}

async function main(): Promise<void> {
  verifyPatchedThreeRuntime();
  assertCondition(
    existsSync(join(process.cwd(), "dist", "index.html")),
    'missing dist/index.html; run "pnpm run build" before the browser verifier',
  );

  const port = await findFreePort();
  const rootUrl = `http://127.0.0.1:${port}/`;
  const studioUrl = `${rootUrl}studio`;
  const server: ChildProcess = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stderr?.on("data", (chunk) => {
    const value = String(chunk);
    if (value.includes("ECONNREFUSED") || value.toLowerCase().includes("proxy error")) return;
    process.stderr.write(chunk);
  });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await waitForServer(rootUrl);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    // This verifier intentionally asserts the shipped Korean Studio labels below. Pin the browser
    // locale so a developer machine or CI runner whose default locale is English does not turn a
    // healthy 3D runtime check into a menu-locator failure before either editor is opened.
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width: 1_440, height: 1_000 },
    });
    const page = await context.newPage();
    await run(page, studioUrl);
    await context.close();
    console.log(`[verify-studio-3d-console] PASS ${studioUrl}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (!server.killed) server.kill("SIGTERM");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
