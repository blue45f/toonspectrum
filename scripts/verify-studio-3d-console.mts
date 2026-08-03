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

import {
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
  STUDIO_BG3D_NORMAL_PROFILE,
  STUDIO_BG3D_STABLE_ID_PROFILE,
} from "../src/domains/creator/studio-bg3d-artifact-capture-v2";
import {
  resolveStudioBg3dCaptureFrame,
  resolveStudioBg3dCaptureFrameCameraSettings,
} from "../src/domains/creator/studio-bg3d-capture-frame-geometry";
import { STUDIO_BG3D_LT_RENDER_WORKER_PROTOCOL_VERSION } from
  "../src/domains/creator/studio-bg3d-lt-render-worker-protocol";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "../src/domains/creator/studio-bg3d-scene-document";

const QUICK_START_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
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
const BABYLON_DIAGNOSTIC_BUTTON_TEST_ID =
  "studio-bg3d-babylon-diagnostic-webgl2";
const BABYLON_DIAGNOSTIC_STATUS_TEST_ID =
  "studio-bg3d-babylon-diagnostic-status";
const BABYLON_RUNTIME_CHUNK_PATH_FRAGMENT =
  "studio-bg3d-babylon-runtime";
const BABYLON_SPECIALIST_CHUNK_PATH_PATTERN =
  /studio-bg3d-babylon-(?:specialist-entry|runtime)/u;
const BABYLON_SPECIALIST_ENTRY_FILE_PATTERN =
  /^studio-bg3d-babylon-specialist-entry-[A-Za-z0-9_-]+\.js$/u;
const THREE_MODULE_FILE_PATTERN =
  /^three\.module-[A-Za-z0-9_-]+\.js$/u;
const THREE_WEBGL_CAPTURE_FILE_PATTERN =
  /^studio-bg3d-three-webgl-capture-[A-Za-z0-9_-]+\.js$/u;
const STUDIO_BG3D_MAGIC_PROOF_ENTRY_FILE_PATTERN =
  /^studio-bg3d-magic-production-proof-[A-Za-z0-9_-]+\.js$/u;
const STUDIO_BG3D_LT_RENDER_WORKER_FILE_PATTERN =
  /^studio-bg3d-lt-render\.worker-[A-Za-z0-9_-]+\.js$/u;
const BABYLON_STABLE_ID_PARITY_WIDTHS = [63, 65] as const;
const BABYLON_STABLE_ID_PARITY_HEIGHT = 64;
const BABYLON_STABLE_ID_ENGINE_INIT_TIMEOUT_MS = 60_000;
const MAGIC_ALIGNMENT_VIEWPORT = Object.freeze({ width: 320, height: 180 });
const MAGIC_ALIGNMENT_SELECTED_NODE_ID = "magic-alignment-asymmetric-box";
const MAGIC_ALIGNMENT_SELECTED_STABLE_ID =
  `obj/${MAGIC_ALIGNMENT_SELECTED_NODE_ID}`;

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

function createBabylonStableIdProofDocumentJson(): string {
  const document = normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    background: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
      mode: "color",
      color: "#f8fafc",
    },
    nodes: [
      {
        id: "babylon-diagnostic-lower",
        name: "Babylon diagnostic lower box",
        kind: "primitive",
        primitiveKind: "box",
        color: "#4f46e5",
        transform: {
          position: [-0.8, -0.9, 0],
          rotation: [0.2, 0.35, 0],
          scale: [0.9, 0.9, 0.9],
        },
        parentId: null,
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
      },
      {
        id: "babylon-diagnostic-upper",
        name: "Babylon diagnostic upper box",
        kind: "primitive",
        primitiveKind: "box",
        color: "#0ea5e9",
        transform: {
          position: [0.8, 1.8, 0],
          rotation: [-0.15, -0.25, 0.1],
          scale: [0.9, 0.9, 0.9],
        },
        parentId: null,
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
      },
    ],
  });
  const serialized = serializeStudioBg3dSceneDocument(document);
  assertCondition(serialized, "could not serialize the Babylon stable-ID proof document");
  return serialized;
}

interface MagicLayerAlignmentProofScenario {
  readonly babylonCanonicalDocumentJson: string;
  readonly fit: "exact" | "letterbox" | "pillarbox";
  readonly frame: NonNullable<ReturnType<typeof resolveStudioBg3dCaptureFrame>>;
  readonly height: number;
  readonly id: "exact" | "letterbox" | "pillarbox";
  readonly threeCanonicalDocumentJson: string;
  readonly width: number;
}

function createMagicLayerAlignmentProofScenarios():
  readonly MagicLayerAlignmentProofScenario[] {
  const baseDocument = normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    background: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
      mode: "transparent",
      color: "#ffffff",
      skyPresetId: "blank",
    },
    render: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render,
      shadows: false,
    },
    nodes: [{
      id: MAGIC_ALIGNMENT_SELECTED_NODE_ID,
      name: "Magic alignment asymmetric box",
      kind: "primitive",
      primitiveKind: "box",
      color: "#f97316",
      transform: {
        // An off-centre, non-uniform, three-axis rotation makes X/Y mirroring and crop drift
        // visible in both the silhouette centroid and its projected bounding box.
        position: [0.72, 1.12, -0.32],
        rotation: [0.43, -0.61, 0.29],
        scale: [1.74, 0.68, 1.06],
      },
      parentId: null,
      visible: true,
      locked: false,
      castsShadow: false,
      receivesShadow: false,
    }],
  });
  const definitions = [
    { id: "exact", aspectRatio: MAGIC_ALIGNMENT_VIEWPORT.width /
      MAGIC_ALIGNMENT_VIEWPORT.height, expectedFit: "exact" },
    { id: "pillarbox", aspectRatio: 1, expectedFit: "pillarbox" },
    { id: "letterbox", aspectRatio: 4, expectedFit: "letterbox" },
  ] as const;

  return Object.freeze(definitions.map(({ aspectRatio, expectedFit, id }) => {
    const frame = resolveStudioBg3dCaptureFrame({
      viewportWidth: MAGIC_ALIGNMENT_VIEWPORT.width,
      viewportHeight: MAGIC_ALIGNMENT_VIEWPORT.height,
      aspectRatio,
    });
    assertCondition(frame, `could not resolve the ${id} Magic alignment frame`);
    assertCondition(
      frame.fit === expectedFit,
      `unexpected ${id} Magic alignment frame fit: ${frame.fit}`,
    );
    const width = Math.round(frame.width);
    const height = Math.round(frame.height);
    assertCondition(
      Math.abs(width / height - frame.aspectRatio) <= 1e-9,
      `the ${id} Magic alignment frame is not integer-exact`,
    );
    const threeDocument = normalizeStudioBg3dSceneDocument({
      ...baseDocument,
      output: {
        ...baseDocument.output,
        exportAspectRatio: aspectRatio,
      },
    });
    const babylonDocument = normalizeStudioBg3dSceneDocument({
      ...threeDocument,
      camera: resolveStudioBg3dCaptureFrameCameraSettings(
        threeDocument.camera,
        frame,
      ),
    });
    const threeCanonicalDocumentJson =
      serializeStudioBg3dSceneDocument(threeDocument);
    const babylonCanonicalDocumentJson =
      serializeStudioBg3dSceneDocument(babylonDocument);
    assertCondition(
      threeCanonicalDocumentJson && babylonCanonicalDocumentJson,
      `could not serialize the ${id} Magic alignment documents`,
    );
    return Object.freeze({
      babylonCanonicalDocumentJson,
      fit: frame.fit,
      frame,
      height,
      id,
      threeCanonicalDocumentJson,
      width,
    });
  }));
}

function findProductionAssetFile(pattern: RegExp, label: string): string {
  const assetsDirectory = join(process.cwd(), "dist", "assets");
  const entries = readdirSync(assetsDirectory).filter((name) => pattern.test(name));
  assertCondition(entries.length === 1, `expected one ${label}, found ${entries.length}`);
  return entries[0]!;
}

function findBabylonSpecialistEntryFile(): string {
  return findProductionAssetFile(
    BABYLON_SPECIALIST_ENTRY_FILE_PATTERN,
    "Babylon specialist entry",
  );
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
  const babylonSpecialistRequests: string[] = [];
  const babylonRuntimeResponses: string[] = [];
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
    if (BABYLON_SPECIALIST_CHUNK_PATH_PATTERN.test(url.pathname)) {
      babylonSpecialistRequests.push(request.url());
    }
    if (url.pathname === SHARED_POSE_CATALOG_API_PATH && request.method() === "GET") {
      sharedPoseRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.includes(BABYLON_RUNTIME_CHUNK_PATH_FRAGMENT)
      && response.ok()
    ) {
      babylonRuntimeResponses.push(response.url());
    }
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
  await page.waitForTimeout(500);
  assertCondition(
    babylonSpecialistRequests.length === 0,
    `opening /studio eagerly requested Babylon specialist code:\n${babylonSpecialistRequests.join("\n")}`,
  );

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
  const backgroundMenuItem = backgroundMenu.getByRole("menuitem", {
    name: "3D 배경",
    exact: true,
  });
  await backgroundMenuItem.hover();
  await page.waitForTimeout(350);
  await backgroundMenuItem.focus();
  await page.waitForTimeout(350);
  assertCondition(
    babylonSpecialistRequests.length === 0,
    "hover/focus BG3D preload must not request Babylon specialist code",
  );
  await backgroundMenuItem.click();
  const backgroundDialog = page.getByTestId("studio-bg3d-dialog");
  await backgroundDialog.waitFor({ state: "visible", timeout: 25_000 });
  await page.waitForTimeout(1_000);
  assertCondition(
    babylonSpecialistRequests.length === 0,
    "opening the BG3D dialog must not request Babylon specialist code",
  );

  await backgroundDialog.getByRole("tab", { name: "보기", exact: true }).click();
  await page.waitForTimeout(300);
  assertCondition(
    babylonSpecialistRequests.length === 0,
    "opening the BG3D view tools must not request Babylon specialist code",
  );
  const babylonDiagnosticButton = backgroundDialog.getByTestId(
    BABYLON_DIAGNOSTIC_BUTTON_TEST_ID,
  );
  await babylonDiagnosticButton.waitFor({ state: "visible", timeout: 10_000 });
  await babylonDiagnosticButton.click();
  const babylonDiagnosticStatus = backgroundDialog.getByTestId(
    BABYLON_DIAGNOSTIC_STATUS_TEST_ID,
  );
  try {
    await babylonDiagnosticStatus
      .filter({
        hasText:
          /(?:진단 완료|초기화하지 못했습니다|검증하지 못했습니다|사용할 수 없어|종료되었습니다)/u,
      })
      .waitFor({ state: "visible", timeout: 45_000 });
    assertCondition(
      (await babylonDiagnosticStatus.innerText()).includes("Babylon WebGL2 진단 완료"),
      `Babylon WebGL2 diagnostic failed: ${await babylonDiagnosticStatus.innerText()}`,
    );
  } catch (cause) {
    const diagnosticText = await babylonDiagnosticStatus.innerText()
      .catch(() => "(status unavailable)");
    throw new Error(
      [
        `Babylon WebGL2 diagnostic did not complete: ${diagnosticText}`,
        `specialist requests: ${babylonSpecialistRequests.join(", ") || "(none)"}`,
        `browser issues: ${issues.join("\n") || "(none)"}`,
      ].join("\n"),
      { cause },
    );
  }
  assertCondition(
    babylonSpecialistRequests.length > 0,
    "the explicit Babylon diagnostic did not request its specialist entry",
  );
  assertCondition(
    babylonRuntimeResponses.length > 0,
    "the explicit Babylon diagnostic did not load a successful Babylon runtime chunk",
  );

  await backgroundDialog.getByRole("tab", { name: "에셋", exact: true }).click();
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

/**
 * Runs the actual minified production specialist on WebGPU and WebGL2 at intentionally
 * row-unaligned widths. Both backends must return compact canonical top-down object/material ID
 * planes with exact pixel parity, and the upper proof object must remain above the lower one.
 */
async function runBabylonStableIdOrientationParityProof(
  page: Page,
  rootUrl: string,
): Promise<void> {
  await page.goto(rootUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const graphicsSupport = await page.evaluate(() => ({
    gpu: "gpu" in navigator && Boolean(navigator.gpu),
    webgl2: Boolean(document.createElement("canvas").getContext("webgl2")),
  }));
  assertCondition(graphicsSupport.gpu, "WebGPU is unavailable for the stable-ID alignment proof");
  assertCondition(graphicsSupport.webgl2, "WebGL2 is unavailable beside the WebGPU proof");

  const entryUrl = new URL(
    `assets/${findBabylonSpecialistEntryFile()}`,
    rootUrl,
  ).href;
  const canonicalDocumentJson = createBabylonStableIdProofDocumentJson();
  const result = await page.evaluate(async ({
    canonicalDocumentJson: documentJson,
    entryUrl: specialistEntryUrl,
    height,
    profiles,
    webGpuEngineInitializationTimeoutMs,
    widths,
  }) => {
    const entry = await import(specialistEntryUrl) as {
      readonly createStudioBg3dBabylonSpecialist?: (options: {
        readonly backend: "webgl2" | "webgpu";
        readonly canvas: HTMLCanvasElement;
        readonly engineInitializationTimeoutMs?: number;
        readonly settings: {
          readonly failIfMajorPerformanceCaveat: boolean;
        };
      }) => {
        readonly dispose: () => void | Promise<void>;
        readonly getState?: () => unknown;
        readonly runIsolated: (job: {
          readonly id: string;
          readonly request: {
            readonly artifacts: readonly {
              readonly kind: string;
              readonly profile: string;
            }[];
            readonly height: number;
            readonly kind: "artifact-capture-v2";
            readonly width: number;
          };
          readonly signal: AbortSignal;
          readonly snapshot: {
            readonly assets: readonly [];
            readonly canonicalDocumentJson: string;
            readonly totalAssetBytes: 0;
          };
        }) => Promise<unknown>;
      };
    };
    if (typeof entry.createStudioBg3dBabylonSpecialist !== "function") {
      throw new Error("production Babylon specialist entry is malformed");
    }

    const emptyAssets = Object.freeze([]) as readonly [];
    const snapshot = Object.freeze({
      assets: emptyAssets,
      canonicalDocumentJson: documentJson,
      totalAssetBytes: 0 as const,
    });

    type CapturedStableIdArtifact = {
      readonly byteLength: number;
      readonly data: Uint32Array;
      readonly height: unknown;
      readonly kind: unknown;
      readonly legend: unknown;
      readonly profile: unknown;
      readonly width: unknown;
    };
    type CapturedRasterArtifact = {
      readonly byteLength: number;
      readonly dataLength: number;
      readonly height: unknown;
      readonly kind: unknown;
      readonly profile: unknown;
      readonly variation: boolean;
      readonly width: unknown;
    };
    type CapturedBundle = {
      readonly artifacts: readonly CapturedStableIdArtifact[];
      readonly height: unknown;
      readonly profile: unknown;
      readonly rasterArtifacts: readonly CapturedRasterArtifact[];
      readonly width: unknown;
    };
    const capturesByBackend: CapturedBundle[][] = [];
    for (const backend of ["webgpu", "webgl2"] as const) {
      const canvas = document.createElement("canvas");
      // Keep both engines at the visible diagnostic's square aspect. Only their offscreen targets
      // use the intentionally row-unaligned 63/65px widths.
      canvas.width = 64;
      canvas.height = 64;
      canvas.style.cssText =
        "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;pointer-events:none";
      document.body.append(canvas);
      const runtime = entry.createStudioBg3dBabylonSpecialist!({
        backend,
        canvas,
        engineInitializationTimeoutMs: backend === "webgpu"
          ? webGpuEngineInitializationTimeoutMs
          : undefined,
        // This is a conformance proof, not a production quality-policy admission check. Keep the
        // same software/headless allowance as the visible diagnostic so CI can exercise packing.
        settings: { failIfMajorPerformanceCaveat: false },
      });
      const summaries = [];
      try {
        for (const width of widths) {
          const controller = new AbortController();
          let raw: unknown;
          try {
            raw = await runtime.runIsolated({
              id: `${backend}-stable-id-orientation-parity-${width}x${height}`,
              request: {
                artifacts: [
                  { kind: "beauty", profile: profiles.beauty },
                  { kind: "depth", profile: profiles.depth },
                  { kind: "normal", profile: profiles.normal },
                  { kind: "object-id", profile: profiles.stableId },
                  { kind: "material-id", profile: profiles.stableId },
                ],
                height,
                kind: "artifact-capture-v2",
                width,
              },
              signal: controller.signal,
              snapshot,
            });
          } catch (cause) {
            const seen = new Set<unknown>();
            const errorChain: string[] = [];
            let current: unknown = cause;
            for (let depth = 0; depth < 8 && current !== undefined; depth += 1) {
              if (seen.has(current)) {
                errorChain.push("[circular cause]");
                break;
              }
              seen.add(current);
              if (typeof current !== "object" || current === null) {
                errorChain.push(String(current));
                break;
              }
              const record = current as {
                readonly cause?: unknown;
                readonly code?: unknown;
                readonly message?: unknown;
                readonly name?: unknown;
              };
              const name = typeof record.name === "string" ? record.name : "Error";
              const code = typeof record.code === "string" ? `[${record.code}]` : "";
              const message = typeof record.message === "string"
                ? record.message
                : Object.prototype.toString.call(current);
              errorChain.push(`${name}${code}: ${message}`);
              if (!("cause" in record)) break;
              current = record.cause;
            }
            const runtimeState = typeof runtime.getState === "function"
              ? runtime.getState()
              : null;
            throw new Error(
              `${backend} ${width}x${height} stable-ID parity capture failed: ` +
                `${errorChain.join(" <- ")}; runtimeState=${JSON.stringify(runtimeState)}`,
              { cause },
            );
          }
          if (
            typeof raw !== "object" ||
            raw === null ||
            (raw as { readonly kind?: unknown }).kind !==
              "studio-bg3d-artifact-capture" ||
            !Array.isArray((raw as { readonly artifacts?: unknown }).artifacts)
          ) {
            throw new Error(`unexpected ${backend} ${width}x${height} stable-ID envelope`);
          }
          const capture = raw as {
            readonly artifacts: readonly {
              readonly data: unknown;
              readonly height: unknown;
              readonly kind: unknown;
              readonly legend: unknown;
              readonly profile: unknown;
              readonly width: unknown;
            }[];
            readonly height: unknown;
            readonly profile: unknown;
            readonly width: unknown;
          };
          const idArtifacts = capture.artifacts.filter((artifact) =>
            artifact.kind === "object-id" || artifact.kind === "material-id"
          );
          const beauty = capture.artifacts.find((artifact) => artifact.kind === "beauty");
          const depth = capture.artifacts.find((artifact) => artifact.kind === "depth");
          const normal = capture.artifacts.find((artifact) => artifact.kind === "normal");
          if (
            !(beauty?.data instanceof Uint8Array) ||
            !(depth?.data instanceof Float32Array) ||
            !(normal?.data instanceof Uint8Array)
          ) {
            throw new Error(
              `unexpected ${backend} ${width}x${height} beauty/depth/normal data`,
            );
          }
          let beautyReferencePixel = -1;
          let beautyVariation = false;
          for (let pixel = 0; pixel < beauty.data.length / 4; pixel += 1) {
            if (beauty.data[pixel * 4 + 3]! > 0) {
              beautyReferencePixel = pixel;
              break;
            }
          }
          if (beautyReferencePixel >= 0) {
            const referenceOffset = beautyReferencePixel * 4;
            for (
              let pixel = beautyReferencePixel + 1;
              pixel < beauty.data.length / 4;
              pixel += 1
            ) {
              const offset = pixel * 4;
              if (beauty.data[offset + 3]! <= 0) continue;
              const difference =
                Math.abs(beauty.data[offset]! - beauty.data[referenceOffset]!) +
                Math.abs(beauty.data[offset + 1]! - beauty.data[referenceOffset + 1]!) +
                Math.abs(beauty.data[offset + 2]! - beauty.data[referenceOffset + 2]!);
              if (difference >= 12) {
                beautyVariation = true;
                break;
              }
            }
          }
          let minimumDepth = 1;
          let maximumDepth = 0;
          let depthValuesValid = true;
          for (const value of depth.data) {
            if (!Number.isFinite(value) || value < 0 || value > 1) {
              depthValuesValid = false;
              break;
            }
            minimumDepth = Math.min(minimumDepth, value);
            maximumDepth = Math.max(maximumDepth, value);
          }
          const depthVariation =
            depthValuesValid &&
            minimumDepth < 0.999 &&
            maximumDepth >= 0.999 &&
            maximumDepth - minimumDepth >= 0.01;
          let minimumNormalRed = 255;
          let maximumNormalRed = 0;
          let minimumNormalGreen = 255;
          let maximumNormalGreen = 0;
          let normalGeometryPixels = 0;
          if (normal.data.length === depth.data.length * 2) {
            for (let pixel = 0; pixel < depth.data.length; pixel += 1) {
              if (depth.data[pixel]! >= 0.999) continue;
              normalGeometryPixels += 1;
              const offset = pixel * 2;
              minimumNormalRed = Math.min(minimumNormalRed, normal.data[offset]!);
              maximumNormalRed = Math.max(maximumNormalRed, normal.data[offset]!);
              minimumNormalGreen = Math.min(
                minimumNormalGreen,
                normal.data[offset + 1]!,
              );
              maximumNormalGreen = Math.max(
                maximumNormalGreen,
                normal.data[offset + 1]!,
              );
            }
          }
          const normalVariation =
            normalGeometryPixels > 0 &&
            Math.max(
              maximumNormalRed - minimumNormalRed,
              maximumNormalGreen - minimumNormalGreen,
            ) >= 8;
          summaries.push({
            artifacts: idArtifacts.map((artifact) => {
              if (!(artifact.data instanceof Uint32Array)) {
                throw new Error(
                  `unexpected ${backend} ${width}x${height} stable-ID data`,
                );
              }
              return {
                byteLength: artifact.data.byteLength,
                data: Uint32Array.from(artifact.data),
                height: artifact.height,
                kind: artifact.kind,
                legend: artifact.legend,
                profile: artifact.profile,
                width: artifact.width,
              };
            }),
            height: capture.height,
            profile: capture.profile,
            rasterArtifacts: [
              {
                byteLength: beauty.data.byteLength,
                dataLength: beauty.data.length,
                height: beauty.height,
                kind: beauty.kind,
                profile: beauty.profile,
                variation: beautyVariation,
                width: beauty.width,
              },
              {
                byteLength: depth.data.byteLength,
                dataLength: depth.data.length,
                height: depth.height,
                kind: depth.kind,
                profile: depth.profile,
                variation: depthVariation,
                width: depth.width,
              },
              {
                byteLength: normal.data.byteLength,
                dataLength: normal.data.length,
                height: normal.height,
                kind: normal.kind,
                profile: normal.profile,
                variation: normalVariation,
                width: normal.width,
              },
            ],
            width: capture.width,
          });
        }
      } finally {
        await runtime.dispose();
        canvas.remove();
      }
      capturesByBackend.push(summaries);
    }

    const webGpuCaptures = capturesByBackend[0]!;
    const webGlCaptures = capturesByBackend[1]!;
    return webGpuCaptures.map((capture, captureIndex) => {
      const webGlCapture = webGlCaptures[captureIndex];
      if (!webGlCapture || webGlCapture.artifacts.length !== capture.artifacts.length) {
        throw new Error(`missing WebGL2 oracle for ${String(capture.width)}px capture`);
      }
      if (webGlCapture.rasterArtifacts.length !== capture.rasterArtifacts.length) {
        throw new Error(
          `missing WebGL2 beauty/depth/normal oracle for ${String(capture.width)}px capture`,
        );
      }
      if (capture.artifacts.length !== 2) {
        throw new Error(`missing WebGPU stable-ID artifacts for ${String(capture.width)}px`);
      }
      const objectData = capture.artifacts[0]!.data;
      const materialData = capture.artifacts[1]!.data;
      if (
        objectData.length !== materialData.length ||
        objectData.some((value, index) => value !== materialData[index])
      ) {
        throw new Error(
          `WebGPU object/material masks diverged for ${String(capture.width)}px`,
        );
      }

      return {
        artifacts: capture.artifacts.map((artifact, artifactIndex) => {
          const oracle = webGlCapture.artifacts[artifactIndex];
          if (
            !oracle ||
            oracle.kind !== artifact.kind ||
            oracle.data.length !== artifact.data.length
          ) {
            throw new Error(
              `invalid WebGL2 ${String(artifact.kind)} oracle for ` +
                `${String(capture.width)}px`,
            );
          }
          let parityDifferencePixels = 0;
          let flipXDifferencePixels = 0;
          let flipYDifferencePixels = 0;
          let rotate180DifferencePixels = 0;
          const rasterWidth = widths[captureIndex]!;
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < rasterWidth; x += 1) {
              const pixel = y * rasterWidth + x;
              const flipXPixel = y * rasterWidth + (rasterWidth - x - 1);
              const flipYPixel = (height - y - 1) * rasterWidth + x;
              const rotate180Pixel =
                (height - y - 1) * rasterWidth + (rasterWidth - x - 1);
              if (artifact.data[pixel] !== oracle.data[pixel]) {
                parityDifferencePixels += 1;
              }
              if (artifact.data[pixel] !== oracle.data[flipXPixel]) {
                flipXDifferencePixels += 1;
              }
              if (artifact.data[pixel] !== oracle.data[flipYPixel]) {
                flipYDifferencePixels += 1;
              }
              if (artifact.data[pixel] !== oracle.data[rotate180Pixel]) {
                rotate180DifferencePixels += 1;
              }
            }
          }
          if (parityDifferencePixels !== 0) {
            throw new Error(
              `WebGPU/WebGL2 ${String(artifact.kind)} spatial parity failed for ` +
                `${String(capture.width)}px: direct=${parityDifferencePixels}, ` +
                `flipX=${flipXDifferencePixels}, flipY=${flipYDifferencePixels}, ` +
              `rotate180=${rotate180DifferencePixels}`,
            );
          }
          const foregroundStats = [...new Set(artifact.data)]
            .filter((id) => id > 0)
            .sort((left, right) => left - right)
            .map((id) => {
              let count = 0;
              let minX: number = rasterWidth;
              let maxX: number = -1;
              let minY: number = height;
              let maxY: number = -1;
              let sumY = 0;
              for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < rasterWidth; x += 1) {
                  if (artifact.data[y * rasterWidth + x] !== id) continue;
                  count += 1;
                  minX = Math.min(minX, x);
                  maxX = Math.max(maxX, x);
                  minY = Math.min(minY, y);
                  maxY = Math.max(maxY, y);
                  sumY += y;
                }
              }
              if (count === 0) {
                throw new Error(
                  `empty ${String(artifact.kind)} foreground ID ${id} for ` +
                    `${String(capture.width)}px`,
                );
              }
              return {
                centroidY: sumY / count,
                count,
                id,
                maxX,
                maxY,
                minX,
                minY,
              };
            });
          return {
            byteLength: artifact.byteLength,
            dataLength: artifact.data.length,
            foregroundStats,
            height: artifact.height,
            kind: artifact.kind,
            legend: artifact.legend,
            parityDifferencePixels,
            profile: artifact.profile,
            uniqueIds: [...new Set(artifact.data)].sort((a, b) => a - b),
            width: artifact.width,
          };
        }),
        height: capture.height,
        profile: capture.profile,
        rasterArtifacts: capture.rasterArtifacts.map((artifact, artifactIndex) => {
          const oracle = webGlCapture.rasterArtifacts[artifactIndex];
          if (!oracle || oracle.kind !== artifact.kind) {
            throw new Error(
              `invalid WebGL2 ${String(artifact.kind)} oracle for ` +
                `${String(capture.width)}px`,
            );
          }
          return {
            ...artifact,
            webGlVariation: oracle.variation,
          };
        }),
        width: capture.width,
      };
    });
  }, {
    canonicalDocumentJson,
    entryUrl,
    height: BABYLON_STABLE_ID_PARITY_HEIGHT,
    profiles: {
      beauty: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
      depth: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
      normal: STUDIO_BG3D_NORMAL_PROFILE,
      stableId: STUDIO_BG3D_STABLE_ID_PROFILE,
    },
    webGpuEngineInitializationTimeoutMs: BABYLON_STABLE_ID_ENGINE_INIT_TIMEOUT_MS,
    widths: BABYLON_STABLE_ID_PARITY_WIDTHS,
  });

  for (const [index, width] of BABYLON_STABLE_ID_PARITY_WIDTHS.entries()) {
    const capture = result[index];
    assertCondition(
      capture,
      `missing ${width}px WebGPU/WebGL2 canonical stable-ID parity proof`,
    );
    assertCondition(capture.width === width, `unexpected ${width}px capture width`);
    assertCondition(
      capture.height === BABYLON_STABLE_ID_PARITY_HEIGHT,
      `unexpected ${width}px capture height`,
    );
    assertCondition(
      capture.profile === "studio-bg3d-multi-artifact-v2",
      `unexpected ${width}px artifact bundle profile`,
    );
    assertCondition(
      capture.rasterArtifacts.length === 3,
      `missing ${width}px beauty/depth/normal artifacts`,
    );
    const expectedRasterArtifacts = [
      {
        bytesPerElement: Uint8Array.BYTES_PER_ELEMENT,
        channels: 4,
        kind: "beauty",
        profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
      },
      {
        bytesPerElement: Float32Array.BYTES_PER_ELEMENT,
        channels: 1,
        kind: "depth",
        profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
      },
      {
        bytesPerElement: Uint8Array.BYTES_PER_ELEMENT,
        channels: 2,
        kind: "normal",
        profile: STUDIO_BG3D_NORMAL_PROFILE,
      },
    ] as const;
    for (const [artifactIndex, expectedArtifact] of expectedRasterArtifacts.entries()) {
      const artifact = capture.rasterArtifacts[artifactIndex];
      const expectedValues =
        width * BABYLON_STABLE_ID_PARITY_HEIGHT * expectedArtifact.channels;
      assertCondition(
        artifact?.kind === expectedArtifact.kind &&
          artifact.profile === expectedArtifact.profile,
        `unexpected ${width}px ${expectedArtifact.kind} artifact`,
      );
      assertCondition(
        artifact.width === width &&
          artifact.height === BABYLON_STABLE_ID_PARITY_HEIGHT,
        `unexpected ${width}px ${expectedArtifact.kind} dimensions`,
      );
      assertCondition(
        artifact.dataLength === expectedValues &&
          artifact.byteLength === expectedValues * expectedArtifact.bytesPerElement,
        `unexpected ${width}px ${expectedArtifact.kind} compact readback length`,
      );
      assertCondition(
        artifact.variation && artifact.webGlVariation,
        `missing ${width}px ${expectedArtifact.kind} variation on WebGPU or WebGL2`,
      );
    }
    assertCondition(capture.artifacts.length === 2, `missing ${width}px stable-ID artifacts`);

    const expected = [
      {
        kind: "object-id",
        legend: [
          {
            label: "Babylon diagnostic lower box",
            stableId: "obj/babylon-diagnostic-lower",
          },
          {
            label: "Babylon diagnostic upper box",
            stableId: "obj/babylon-diagnostic-upper",
          },
        ],
      },
      {
        kind: "material-id",
        legend: [
          {
            label: "Babylon diagnostic lower box · 기본 재질",
            stableId: "mat/babylon-diagnostic-lower/primitive",
          },
          {
            label: "Babylon diagnostic upper box · 기본 재질",
            stableId: "mat/babylon-diagnostic-upper/primitive",
          },
        ],
      },
    ] as const;
    for (const [artifactIndex, expectedArtifact] of expected.entries()) {
      const artifact = capture.artifacts[artifactIndex];
      assertCondition(
        artifact?.kind === expectedArtifact.kind,
        `unexpected ${width}px artifact order`,
      );
      assertCondition(
        artifact.profile === STUDIO_BG3D_STABLE_ID_PROFILE,
        `unexpected ${width}px ${expectedArtifact.kind} profile`,
      );
      assertCondition(
        artifact.width === width &&
          artifact.height === BABYLON_STABLE_ID_PARITY_HEIGHT,
        `unexpected ${width}px ${expectedArtifact.kind} dimensions`,
      );
      const expectedPixels = width * BABYLON_STABLE_ID_PARITY_HEIGHT;
      assertCondition(
        artifact.dataLength === expectedPixels &&
          artifact.byteLength === expectedPixels * Uint32Array.BYTES_PER_ELEMENT,
        `unexpected ${width}px ${expectedArtifact.kind} compact readback length`,
      );
      assertCondition(
        artifact.uniqueIds.length === 3 &&
          artifact.uniqueIds[0] === 0 &&
          artifact.uniqueIds[1] === 1 &&
          artifact.uniqueIds[2] === 2,
        `unexpected ${width}px ${expectedArtifact.kind} IDs: ` +
          JSON.stringify(artifact.uniqueIds),
      );
      const legend = artifact.legend;
      assertCondition(
        Array.isArray(legend),
        `unexpected ${width}px ${expectedArtifact.kind} legend type`,
      );
      assertCondition(
        legend.length === expectedArtifact.legend.length &&
          expectedArtifact.legend.every((entry, legendIndex) =>
            legend[legendIndex]?.id === legendIndex + 1 &&
            legend[legendIndex]?.stableId === entry.stableId &&
            legend[legendIndex]?.label === entry.label
          ),
        `unexpected ${width}px ${expectedArtifact.kind} legend`,
      );
      const lower = artifact.foregroundStats.find((entry) => entry.id === 1);
      const upper = artifact.foregroundStats.find((entry) => entry.id === 2);
      assertCondition(
        lower && upper && upper.centroidY < lower.centroidY,
        `non-canonical ${width}px ${expectedArtifact.kind} row orientation: ` +
          JSON.stringify(artifact.foregroundStats),
      );
    }
  }

  console.log(
    `[verify-studio-3d-console] Babylon WebGPU/WebGL2 canonical top-down ` +
      `stable-ID parity PASS ${BABYLON_STABLE_ID_PARITY_WIDTHS.join("/")}x` +
      `${BABYLON_STABLE_ID_PARITY_HEIGHT}`,
  );
}

/**
 * Exercises the first Magic Layer production boundary end to end. The live Three camera starts at
 * the unadjusted 320x180 viewport state and the shipped capture-frame wrapper applies the crop.
 * Its RGBA result then crosses the shipped LT Worker and exact shipped DOM PNG encoder before the
 * decoded silhouette is compared with Babylon's adjusted-camera object-ID mask.
 */
async function runMagicLayerProductionAlignmentProof(
  page: Page,
  rootUrl: string,
): Promise<void> {
  const graphicsSupport = await page.evaluate(() => ({
    webgl2: Boolean(document.createElement("canvas").getContext("webgl2")),
  }));
  assertCondition(
    graphicsSupport.webgl2,
    "WebGL2 is unavailable for the Magic Layer production alignment proof",
  );
  const assetUrl = (file: string) => new URL(`assets/${file}`, rootUrl).href;
  // `tsx` preserves local helper names with esbuild's `__name` shim, while Playwright serializes
  // only this callback. Install the same verifier-only no-op used by the other browser harnesses.
  await page.evaluate("globalThis.__name ??= (target) => target");
  const result = await page.evaluate(async ({
    babylonEntryUrl,
    beautyProfile,
    expectedStableId,
    ltWorkerProtocolVersion,
    ltWorkerUrl,
    productionProofEntryUrl,
    scenarios,
    stableIdProfile,
    threeCaptureUrl,
    threeModuleUrl,
    viewport,
  }) => {
    type ThreeConstructor = new (...args: never[]) => {
      readonly type?: unknown;
      dispose?: () => void;
    };
    type AlignmentStats = {
      readonly bbox: {
        readonly maxX: number;
        readonly maxY: number;
        readonly minX: number;
        readonly minY: number;
      };
      readonly centroidX: number;
      readonly centroidY: number;
      readonly count: number;
      readonly directionX: number;
      readonly directionY: number;
    };
    type BinaryTransform = "direct" | "flip-x" | "flip-y" | "rotate-180";
    type ProductionLtColorLayer = {
      readonly data: Uint8ClampedArray;
      readonly height: number;
      readonly role: "color";
      readonly width: number;
    };
    type ProductionProofEntry = {
      readonly applyStudioBg3dCaptureFrameViewOffset?: (
        camera: import("three").Camera,
        frame: MagicLayerAlignmentProofScenario["frame"],
        sourceViewport: { readonly height: number; readonly width: number },
      ) => (() => void) | null;
      readonly encodeStudioBg3dLtLayers?: (
        layers: readonly ProductionLtColorLayer[],
      ) => {
        readonly compositePngDataUrl: string;
        readonly layers: readonly {
          readonly height: number;
          readonly pngDataUrl: string;
          readonly role: string;
          readonly width: number;
        }[];
      };
    };

    const threeModule = await import(threeModuleUrl) as Record<string, unknown>;
    const threeCaptureModule = await import(threeCaptureUrl) as Pick<
      typeof import("../src/domains/creator/studio-bg3d-three-webgl-capture"),
      "createStudioBg3dThreeWebglCaptureAdapter"
    >;
    const productionProofEntry =
      await import(productionProofEntryUrl) as ProductionProofEntry;
    const babylonEntry = await import(babylonEntryUrl) as {
      readonly createStudioBg3dBabylonSpecialist?: (options: {
        readonly backend: "webgl2";
        readonly canvas: HTMLCanvasElement;
        readonly settings: {
          readonly failIfMajorPerformanceCaveat: boolean;
        };
      }) => {
        readonly dispose: () => void | Promise<void>;
          readonly runIsolated: (job: {
          readonly id: string;
          readonly request: {
            readonly artifacts: readonly [
              {
                readonly kind: "beauty";
                readonly profile: string;
              },
              {
                readonly kind: "object-id";
                readonly profile: string;
              },
            ];
            readonly height: number;
            readonly kind: "artifact-capture-v2";
            readonly width: number;
          };
          readonly signal: AbortSignal;
          readonly snapshot: {
            readonly assets: readonly [];
            readonly canonicalDocumentJson: string;
            readonly totalAssetBytes: 0;
          };
        }) => Promise<unknown>;
      };
    };
    if (
      typeof threeCaptureModule.createStudioBg3dThreeWebglCaptureAdapter !== "function" ||
      typeof productionProofEntry.applyStudioBg3dCaptureFrameViewOffset !== "function" ||
      typeof productionProofEntry.encodeStudioBg3dLtLayers !== "function" ||
      typeof babylonEntry.createStudioBg3dBabylonSpecialist !== "function"
    ) {
      throw new Error("Magic alignment production entries are malformed");
    }

    function functionSource(value: unknown): string {
      return typeof value === "function"
        ? Function.prototype.toString.call(value)
        : "";
    }
    const rendererCandidate = Object.values(threeModule).find((value) =>
      functionSource(value).includes("this.isWebGLRenderer")
    );
    if (typeof rendererCandidate !== "function") {
      throw new Error("could not identify the production Three WebGLRenderer");
    }
    function findThreeConstructor(
      type: string,
      sourceIdentity: string,
    ): ThreeConstructor {
      for (const value of Object.values(threeModule)) {
        const source = functionSource(value);
        if (
          typeof value !== "function" ||
          source.includes("this.isWebGLRenderer") ||
          !source.includes(sourceIdentity)
        ) {
          continue;
        }
        let instance: InstanceType<ThreeConstructor> | null = null;
        try {
          instance = Reflect.construct(value, []) as InstanceType<ThreeConstructor>;
          if (instance.type === type) {
            instance.dispose?.();
            return value as ThreeConstructor;
          }
        } catch {
          // Most Three exports are functions rather than zero-argument constructors.
        }
        instance?.dispose?.();
      }
      throw new Error(`could not identify the production Three ${type} constructor`);
    }

    const WebGLRenderer = rendererCandidate as typeof import("three").WebGLRenderer;
    const Scene = findThreeConstructor(
      "Scene",
      "this.isScene",
    ) as typeof import("three").Scene;
    const PerspectiveCamera =
      findThreeConstructor(
        "PerspectiveCamera",
        "this.isPerspectiveCamera",
      ) as typeof import("three").PerspectiveCamera;
    const BoxGeometry =
      findThreeConstructor(
        "BoxGeometry",
        "BoxGeometry",
      ) as typeof import("three").BoxGeometry;
    const MeshBasicMaterial =
      findThreeConstructor(
        "MeshBasicMaterial",
        "this.isMeshBasicMaterial",
      ) as typeof import("three").MeshBasicMaterial;
    const Mesh = findThreeConstructor(
      "Mesh",
      "this.isMesh",
    ) as typeof import("three").Mesh;

    function statsForMask(
      mask: Uint8Array,
      width: number,
      height: number,
      label: string,
    ): AlignmentStats {
      let count = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      let sumX = 0;
      let sumY = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (mask[y * width + x] === 0) continue;
          count += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          sumX += x;
          sumY += y;
        }
      }
      if (count === 0) throw new Error(`${label} produced an empty silhouette`);
      const centroidX = sumX / count;
      const centroidY = sumY / count;
      return {
        bbox: { maxX, maxY, minX, minY },
        centroidX,
        centroidY,
        count,
        directionX: centroidX - (width - 1) / 2,
        directionY: centroidY - (height - 1) / 2,
      };
    }
    function transformedIndex(
      x: number,
      y: number,
      width: number,
      height: number,
      transform: BinaryTransform,
    ): number {
      switch (transform) {
        case "direct":
          return y * width + x;
        case "flip-x":
          return y * width + (width - x - 1);
        case "flip-y":
          return (height - y - 1) * width + x;
        case "rotate-180":
          return (height - y - 1) * width + (width - x - 1);
      }
    }
    function intersectionOverUnion(
      left: Uint8Array,
      right: Uint8Array,
      width: number,
      height: number,
      transform: BinaryTransform,
    ): number {
      let intersection = 0;
      let union = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const leftSet = left[y * width + x] !== 0;
          const rightSet =
            right[transformedIndex(x, y, width, height, transform)] !== 0;
          if (leftSet && rightSet) intersection += 1;
          if (leftSet || rightSet) union += 1;
        }
      }
      return union > 0 ? intersection / union : 0;
    }
    function renderLtColorInProductionWorker(
      rgba: Uint8Array | Uint8ClampedArray,
      width: number,
      height: number,
      requestId: number,
    ): Promise<ProductionLtColorLayer> {
      return new Promise((resolve, reject) => {
        const worker = new Worker(ltWorkerUrl, {
          name: `magic-lt-production-${requestId}`,
          type: "module",
        });
        let settled = false;
        let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          if (timeout !== null) globalThis.clearTimeout(timeout);
          worker.terminate();
          callback();
        };
        timeout = globalThis.setTimeout(() => {
          finish(() => reject(new Error("the production LT Worker timed out")));
        }, 30_000);
        worker.addEventListener("error", (event) => {
          finish(() => reject(new Error(
            `the production LT Worker failed: ${event.message || "unknown error"}`,
          )));
        });
        worker.addEventListener("messageerror", () => {
          finish(() => reject(new Error(
            "the production LT Worker response could not be cloned",
          )));
        });
        worker.addEventListener("message", (event: MessageEvent<unknown>) => {
          const message = event.data;
          if (
            typeof message !== "object" ||
            message === null ||
            Reflect.get(message, "version") !== ltWorkerProtocolVersion ||
            Reflect.get(message, "requestId") !== requestId
          ) {
            finish(() => reject(new Error(
              "the production LT Worker returned a foreign envelope",
            )));
            return;
          }
          if (Reflect.get(message, "kind") === "error") {
            finish(() => reject(new Error(
              `the production LT Worker rejected the request: ${String(
                Reflect.get(message, "code"),
              )}`,
            )));
            return;
          }
          const layers = Reflect.get(message, "layers");
          if (
            Reflect.get(message, "kind") !== "result" ||
            Reflect.get(message, "width") !== width ||
            Reflect.get(message, "height") !== height ||
            !Array.isArray(layers) ||
            layers.length !== 1
          ) {
            finish(() => reject(new Error(
              "the production LT Worker result is malformed: " + JSON.stringify({
                height: Reflect.get(message, "height"),
                kind: Reflect.get(message, "kind"),
                layerCount: Array.isArray(layers) ? layers.length : null,
                width: Reflect.get(message, "width"),
              }),
            )));
            return;
          }
          const layer = layers[0] as Record<string, unknown>;
          const dataBuffer = layer?.dataBuffer;
          if (
            layer?.role !== "color" ||
            layer?.width !== width ||
            layer?.height !== height ||
            !(dataBuffer instanceof ArrayBuffer) ||
            dataBuffer.byteLength !== width * height * 4
          ) {
            finish(() => reject(new Error(
              "the production LT Worker did not return one exact color layer",
            )));
            return;
          }
          finish(() => resolve({
            data: new Uint8ClampedArray(dataBuffer),
            height,
            role: "color",
            width,
          }));
        });

        const transferredRgba = new Uint8Array(rgba.byteLength);
        transferredRgba.set(rgba);
        const rgbaBuffer = transferredRgba.buffer;
        worker.postMessage({
          version: ltWorkerProtocolVersion,
          kind: "render",
          requestId,
          input: {
            width,
            height,
            rgbaBuffer,
          },
          settings: {
            line: {
              enabled: false,
              layerType: "raster",
              color: "#000000",
              widthPx: 1,
              strength: 0,
              accuracy: 0.5,
              scaleAwareAccuracy: true,
              exteriorOutlineStrength: 1,
              depthEnabled: false,
              depthStrength: 0,
              depthOutlineOnly: false,
              smoothing: 0,
              textureLineEnabled: false,
              textureLineStrength: 0,
              creaseAngleDegrees: 45,
              hiddenLineRemoval: true,
            },
            tone: {
              mode: "flat",
              type: "color",
              pattern: "dot",
              levels: 4,
              opacity: 1,
              frequency: 60,
              angleDegrees: 45,
            },
          },
        }, [rgbaBuffer]);
      });
    }
    async function decodePngDataUrl(
      dataUrl: string,
      width: number,
      height: number,
      label: string,
    ): Promise<Uint8ClampedArray> {
      if (!dataUrl.startsWith("data:image/png;base64,")) {
        throw new Error(`${label} is not a PNG data URL`);
      }
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener(
          "error",
          () => reject(new Error(`${label} could not be decoded`)),
          { once: true },
        );
        image.src = dataUrl;
      });
      if (image.naturalWidth !== width || image.naturalHeight !== height) {
        throw new Error(
          `${label} decoded as ${image.naturalWidth}x${image.naturalHeight}, ` +
            `expected ${width}x${height}`,
        );
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error(`${label} has no 2D decode context`);
      context.drawImage(image, 0, 0);
      return new Uint8ClampedArray(
        context.getImageData(0, 0, width, height).data,
      );
    }
    function countAlphaDifferences(
      left: Uint8Array | Uint8ClampedArray,
      right: Uint8Array | Uint8ClampedArray,
    ): number {
      if (left.length !== right.length) return Number.POSITIVE_INFINITY;
      let differences = 0;
      for (let index = 3; index < left.length; index += 4) {
        if (left[index] !== right[index]) differences += 1;
      }
      return differences;
    }

    const summaries = [];
    for (const [scenarioIndex, scenario] of scenarios.entries()) {
        const parsed = JSON.parse(scenario.threeCanonicalDocumentJson) as {
          readonly camera: {
            readonly fovDegrees: number;
            readonly nearClip: number;
            readonly position: readonly [number, number, number];
            readonly target: readonly [number, number, number];
            readonly up: readonly [number, number, number];
            readonly zoom: number;
          };
          readonly nodes: readonly [{
            readonly color: string;
            readonly id: string;
            readonly transform: {
              readonly position: readonly [number, number, number];
              readonly rotation: readonly [number, number, number];
              readonly scale: readonly [number, number, number];
            };
          }];
        };
        const node = parsed.nodes[0];
        if (!node || node.id !== expectedStableId.slice(4)) {
          throw new Error(`[${scenario.id}] canonical asymmetric node is missing`);
        }

        const threeCanvas = document.createElement("canvas");
        threeCanvas.width = viewport.width;
        threeCanvas.height = viewport.height;
        threeCanvas.style.cssText =
          "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;pointer-events:none";
        document.body.append(threeCanvas);
        const renderer = new WebGLRenderer({
          alpha: true,
          antialias: true,
          canvas: threeCanvas,
          failIfMajorPerformanceCaveat: false,
          powerPreference: "high-performance",
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
        });
        renderer.setPixelRatio(1);
        renderer.setSize(viewport.width, viewport.height, false);
        const scene = new Scene();
        const camera = new PerspectiveCamera(
          parsed.camera.fovDegrees,
          viewport.width / viewport.height,
          parsed.camera.nearClip,
          200,
        );
        camera.position.set(...parsed.camera.position);
        camera.up.set(...parsed.camera.up);
        camera.zoom = parsed.camera.zoom;
        camera.lookAt(...parsed.camera.target);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const geometry = new BoxGeometry(1, 1, 1);
        const material = new MeshBasicMaterial({ color: node.color });
        const mesh = new Mesh(geometry, material);
        mesh.position.set(...node.transform.position);
        mesh.rotation.set(...node.transform.rotation);
        mesh.scale.set(...node.transform.scale);
        scene.add(mesh);
        scene.updateMatrixWorld(true);

        let threeRgba: Uint8Array | Uint8ClampedArray;
        let releaseCaptureFrameViewOffset: (() => void) | null = null;
        let viewOffsetApplied: boolean;
        try {
          const adapter =
            threeCaptureModule.createStudioBg3dThreeWebglCaptureAdapter({
              camera,
              renderer,
              scene,
            });
          const sourceSize = adapter.getSourceSize();
          if (
            sourceSize.width !== viewport.width ||
            sourceSize.height !== viewport.height
          ) {
            throw new Error(
              `[${scenario.id}] Three source viewport changed: ` +
                `${sourceSize.width}x${sourceSize.height}`,
            );
          }
          releaseCaptureFrameViewOffset =
            productionProofEntry.applyStudioBg3dCaptureFrameViewOffset(
              camera,
              scenario.frame,
              viewport,
            );
          if (!releaseCaptureFrameViewOffset) {
            throw new Error(`[${scenario.id}] shipped capture-frame wrapper rejected the crop`);
          }
          viewOffsetApplied = Boolean(camera.view?.enabled);
          if (
            (scenario.fit === "exact" && viewOffsetApplied) ||
            (scenario.fit !== "exact" && !viewOffsetApplied)
          ) {
            throw new Error(
              `[${scenario.id}] shipped capture-frame wrapper took the wrong path`,
            );
          }
          const capture = await adapter.capture({
            width: scenario.width,
            height: scenario.height,
            background: { alpha: 0, color: "#ffffff" },
            includeDepth: false,
          });
          threeRgba = capture.rgba;
        } finally {
          try {
            releaseCaptureFrameViewOffset?.();
          } finally {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            threeCanvas.remove();
          }
        }
        if (camera.view?.enabled) {
          throw new Error(`[${scenario.id}] shipped capture-frame wrapper did not restore view`);
        }

        let capturedAlphaPixels = 0;
        for (let offset = 0; offset < threeRgba.length; offset += 4) {
          if (threeRgba[offset + 3]! > 0) capturedAlphaPixels += 1;
        }
        if (capturedAlphaPixels === 0) {
          throw new Error(
            `[${scenario.id}] production Three capture is empty before the LT Worker`,
          );
        }

        const ltColorLayer = await renderLtColorInProductionWorker(
          threeRgba,
          scenario.width,
          scenario.height,
          scenarioIndex + 1,
        );
        const encoded = productionProofEntry.encodeStudioBg3dLtLayers([
          ltColorLayer,
        ]);
        const encodedColorLayer = encoded.layers.find((layer) => layer.role === "color");
        if (
          !encodedColorLayer ||
          encoded.layers.length !== 1 ||
          encodedColorLayer.width !== scenario.width ||
          encodedColorLayer.height !== scenario.height
        ) {
          throw new Error(`[${scenario.id}] shipped LT PNG encoder returned malformed layers`);
        }
        const [decodedColorRgba, decodedCompositeRgba] = await Promise.all([
          decodePngDataUrl(
            encodedColorLayer.pngDataUrl,
            scenario.width,
            scenario.height,
            `[${scenario.id}] encoded LT color layer`,
          ),
          decodePngDataUrl(
            encoded.compositePngDataUrl,
            scenario.width,
            scenario.height,
            `[${scenario.id}] encoded LT composite`,
          ),
        ]);
        const workerToPngAlphaDifferences =
          countAlphaDifferences(ltColorLayer.data, decodedColorRgba);
        const layerToCompositeAlphaDifferences =
          countAlphaDifferences(decodedColorRgba, decodedCompositeRgba);
        if (
          workerToPngAlphaDifferences !== 0 ||
          layerToCompositeAlphaDifferences !== 0
        ) {
          throw new Error(
            `[${scenario.id}] shipped LT Worker/PNG alpha changed: ` +
              `worker-to-layer=${workerToPngAlphaDifferences}, ` +
              `layer-to-composite=${layerToCompositeAlphaDifferences}`,
          );
        }
        let visibleColorPixels = 0;
        const threeMask = new Uint8Array(scenario.width * scenario.height);
        for (let pixel = 0; pixel < threeMask.length; pixel += 1) {
          const byteIndex = pixel * 4;
          const alpha = decodedColorRgba[byteIndex + 3]!;
          // Compare the decoded shipped PNG, not adapter readback. Row flip, crop, Worker and
          // encoder regressions consequently change the mask being admitted below.
          threeMask[pixel] = alpha >= 32 ? 1 : 0;
          if (
            alpha >= 32 &&
            (
              decodedColorRgba[byteIndex]! > 8 ||
              decodedColorRgba[byteIndex + 1]! > 8 ||
              decodedColorRgba[byteIndex + 2]! > 8
            )
          ) {
            visibleColorPixels += 1;
          }
        }
        if (visibleColorPixels === 0) {
          throw new Error(`[${scenario.id}] decoded LT color PNG has no visible RGB`);
        }

        const controller = new AbortController();
        // `captureStudioBg3dMagicObjectIds` owns a fresh exact-size canvas/runtime for every
        // backend attempt. Reusing the exact-scenario engine here would retain Babylon projection
        // cache state and would not exercise the product lifetime.
        const babylonCanvas = document.createElement("canvas");
        babylonCanvas.width = scenario.width;
        babylonCanvas.height = scenario.height;
        const babylonRuntime = babylonEntry.createStudioBg3dBabylonSpecialist({
          backend: "webgl2",
          canvas: babylonCanvas,
          settings: { failIfMajorPerformanceCaveat: false },
        });
        let raw: unknown;
        try {
          raw = await babylonRuntime.runIsolated({
            id: `magic-production-alignment-${scenario.id}`,
            request: {
              artifacts: [
                {
                  kind: "beauty",
                  profile: beautyProfile,
                },
                {
                  kind: "object-id",
                  profile: stableIdProfile,
                },
              ],
              height: scenario.height,
              kind: "artifact-capture-v2",
              width: scenario.width,
            },
            signal: controller.signal,
            snapshot: Object.freeze({
              assets: Object.freeze([]) as readonly [],
              canonicalDocumentJson: scenario.babylonCanonicalDocumentJson,
              totalAssetBytes: 0 as const,
            }),
          });
        } catch (cause) {
          throw new Error(`[${scenario.id}] Babylon object-ID capture failed`, { cause });
        } finally {
          await babylonRuntime.dispose();
          babylonCanvas.remove();
        }
        if (
          typeof raw !== "object" ||
          raw === null ||
          (raw as { readonly kind?: unknown }).kind !== "studio-bg3d-artifact-capture"
        ) {
          throw new Error(`[${scenario.id}] unexpected Babylon object-ID envelope`);
        }
        const artifacts = (raw as {
          readonly artifacts?: readonly {
            readonly data?: unknown;
            readonly kind?: unknown;
            readonly legend?: unknown;
          }[];
        }).artifacts;
        const beautyArtifact = artifacts?.find((artifact) => artifact.kind === "beauty");
        const objectArtifact = artifacts?.find((artifact) => artifact.kind === "object-id");
        if (
          !(beautyArtifact?.data instanceof Uint8Array) ||
          beautyArtifact.data.length !== scenario.width * scenario.height * 4 ||
          !(objectArtifact?.data instanceof Uint32Array) ||
          !Array.isArray(objectArtifact.legend) ||
          objectArtifact.data.length !== scenario.width * scenario.height
        ) {
          throw new Error(`[${scenario.id}] malformed Babylon object-ID artifact`);
        }
        const legendEntry = (objectArtifact.legend as readonly {
          readonly id?: unknown;
          readonly stableId?: unknown;
        }[]).find((entry) => entry.stableId === expectedStableId);
        if (!legendEntry || !Number.isSafeInteger(legendEntry.id)) {
          throw new Error(
            `[${scenario.id}] selected stable ID is absent from the Babylon legend`,
          );
        }
        const selectedObjectId = legendEntry.id as number;
        const babylonMask = Uint8Array.from(
          objectArtifact.data,
          (value) => value === selectedObjectId ? 1 : 0,
        );
        const babylonBeautyMask = new Uint8Array(
          scenario.width * scenario.height,
        );
        for (let pixel = 0; pixel < babylonBeautyMask.length; pixel += 1) {
          babylonBeautyMask[pixel] =
            beautyArtifact.data[pixel * 4 + 3]! >= 32 ? 1 : 0;
        }
        const three = statsForMask(
          threeMask,
          scenario.width,
          scenario.height,
          `[${scenario.id}] Three LT color`,
        );
        const babylon = statsForMask(
          babylonMask,
          scenario.width,
          scenario.height,
          `[${scenario.id}] Babylon object-ID`,
        );
        const babylonBeauty = statsForMask(
          babylonBeautyMask,
          scenario.width,
          scenario.height,
          `[${scenario.id}] Babylon beauty alpha`,
        );
        const babylonBeautyIdIou = intersectionOverUnion(
          babylonBeautyMask,
          babylonMask,
          scenario.width,
          scenario.height,
          "direct",
        );
        const iou = {
          direct: intersectionOverUnion(
            threeMask,
            babylonMask,
            scenario.width,
            scenario.height,
            "direct",
          ),
          flipX: intersectionOverUnion(
            threeMask,
            babylonMask,
            scenario.width,
            scenario.height,
            "flip-x",
          ),
          flipY: intersectionOverUnion(
            threeMask,
            babylonMask,
            scenario.width,
            scenario.height,
            "flip-y",
          ),
          rotate180: intersectionOverUnion(
            threeMask,
            babylonMask,
            scenario.width,
            scenario.height,
            "rotate-180",
          ),
        };
        const edgeTolerance = Math.max(
          3,
          Math.ceil(Math.max(scenario.width, scenario.height) * 0.0125),
        );
        const centroidTolerance = edgeTolerance;
        const bboxDelta = {
          maxX: Math.abs(three.bbox.maxX - babylon.bbox.maxX),
          maxY: Math.abs(three.bbox.maxY - babylon.bbox.maxY),
          minX: Math.abs(three.bbox.minX - babylon.bbox.minX),
          minY: Math.abs(three.bbox.minY - babylon.bbox.minY),
        };
        const centroidDelta = {
          x: Math.abs(three.centroidX - babylon.centroidX),
          y: Math.abs(three.centroidY - babylon.centroidY),
        };
        const directionTolerance = Math.max(2, edgeTolerance / 2);
        const directionMatches =
          (
            Math.abs(three.directionX) <= directionTolerance ||
            Math.abs(babylon.directionX) <= directionTolerance ||
            Math.sign(three.directionX) === Math.sign(babylon.directionX)
          ) &&
          (
            Math.abs(three.directionY) <= directionTolerance ||
            Math.abs(babylon.directionY) <= directionTolerance ||
            Math.sign(three.directionY) === Math.sign(babylon.directionY)
          );
        const areaRatio = three.count / babylon.count;
        const pixelCount = scenario.width * scenario.height;
        const coverage = {
          babylon: babylon.count / pixelCount,
          three: three.count / pixelCount,
        };
        const bestMirroredIou = Math.max(iou.flipX, iou.flipY, iou.rotate180);
        const bboxMatches = Object.values(bboxDelta)
          .every((delta) => delta <= edgeTolerance);
        const centroidMatches =
          centroidDelta.x <= centroidTolerance &&
          centroidDelta.y <= centroidTolerance;
        const silhouetteMatches =
          iou.direct >= 0.88 &&
          areaRatio >= 0.85 &&
          areaRatio <= 1.15;
        const nonTrivialSilhouettes =
          coverage.three >= 0.0025 &&
          coverage.three <= 0.8 &&
          coverage.babylon >= 0.0025 &&
          coverage.babylon <= 0.8 &&
          Math.hypot(three.directionX, three.directionY) >= 1 &&
          Math.hypot(babylon.directionX, babylon.directionY) >= 1;
        const orientationIsDiscriminating =
          iou.direct >= bestMirroredIou + 0.01;
        const diagnostics = {
          areaRatio,
          babylon,
          babylonBeauty,
          babylonBeautyIdIou,
          bestMirroredIou,
          bboxDelta,
          centroidDelta,
          coverage,
          edgeTolerance,
          iou,
          three,
          viewOffsetApplied,
          workerToPngAlphaDifferences,
        };
        const passed =
          bboxMatches &&
          centroidMatches &&
          directionMatches &&
          silhouetteMatches &&
          nonTrivialSilhouettes &&
          orientationIsDiscriminating;
        summaries.push({
          areaRatio,
          bboxDelta,
          centroidDelta,
          coverage,
          diagnostics,
          fit: scenario.fit,
          height: scenario.height,
          id: scenario.id,
          iou,
          passed,
          pngBase64Length: encodedColorLayer.pngDataUrl.length,
          viewOffsetApplied,
          width: scenario.width,
          workerToPngAlphaDifferences,
        });
    }
    return summaries;
  }, {
    babylonEntryUrl: assetUrl(findBabylonSpecialistEntryFile()),
    beautyProfile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
    expectedStableId: MAGIC_ALIGNMENT_SELECTED_STABLE_ID,
    ltWorkerProtocolVersion: STUDIO_BG3D_LT_RENDER_WORKER_PROTOCOL_VERSION,
    ltWorkerUrl: assetUrl(findProductionAssetFile(
      STUDIO_BG3D_LT_RENDER_WORKER_FILE_PATTERN,
      "Studio LT render Worker",
    )),
    productionProofEntryUrl: assetUrl(findProductionAssetFile(
      STUDIO_BG3D_MAGIC_PROOF_ENTRY_FILE_PATTERN,
      "Studio Magic production proof entry",
    )),
    scenarios: createMagicLayerAlignmentProofScenarios(),
    stableIdProfile: STUDIO_BG3D_STABLE_ID_PROFILE,
    threeCaptureUrl: assetUrl(findProductionAssetFile(
      THREE_WEBGL_CAPTURE_FILE_PATTERN,
      "Three WebGL capture entry",
    )),
    threeModuleUrl: assetUrl(findProductionAssetFile(
      THREE_MODULE_FILE_PATTERN,
      "Three production module",
    )),
    viewport: MAGIC_ALIGNMENT_VIEWPORT,
  });

  const expectedScenarios = createMagicLayerAlignmentProofScenarios();
  assertCondition(
    result.length === expectedScenarios.length,
    `Magic alignment returned ${result.length}/${expectedScenarios.length} scenarios`,
  );
  for (const [index, expected] of expectedScenarios.entries()) {
    const actual = result[index];
    assertCondition(
      actual &&
        actual.id === expected.id &&
        actual.fit === expected.fit &&
        actual.width === expected.width &&
        actual.height === expected.height,
      `Magic alignment scenario order/dimensions changed at ${expected.id}`,
    );
    console.log(
      `[verify-studio-3d-console] Magic alignment ${actual.id}/${actual.fit} ` +
        `${actual.width}x${actual.height} ${actual.passed ? "PASS" : "FAIL"} ` +
        `IoU=${actual.iou.direct.toFixed(4)} area=${actual.areaRatio.toFixed(4)} ` +
        `coverage=${actual.coverage.three.toFixed(4)}/` +
        `${actual.coverage.babylon.toFixed(4)} ` +
        `bbox=${JSON.stringify(actual.diagnostics.three.bbox)}/` +
        `${JSON.stringify(actual.diagnostics.babylon.bbox)} ` +
        `bboxΔ=${JSON.stringify(actual.bboxDelta)} ` +
        `centroidΔ=(${actual.centroidDelta.x.toFixed(2)},` +
        `${actual.centroidDelta.y.toFixed(2)}) ` +
        `viewOffset=${actual.viewOffsetApplied ? "applied" : "exact/no-op"} ` +
        `worker-to-png-alpha-delta=${actual.workerToPngAlphaDifferences} ` +
        `png=${actual.pngBase64Length}chars`,
    );
  }
  const failed = result.find((scenario) => !scenario.passed);
  assertCondition(
    !failed,
    `[${failed?.id} ${failed?.fit} ${failed?.width}x${failed?.height}] ` +
      `Three LT/Babylon Magic silhouette alignment failed: ` +
      JSON.stringify(failed?.diagnostics),
  );
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
    // Use Playwright's pinned Chromium rather than a machine-global Chrome channel. SwiftShader
    // makes the WebGPU conformance gate reproducible on GPU-less Linux CI and local headless runs.
    const webGpuBrowser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
      ],
    });
    try {
      const webGpuContext = await webGpuBrowser.newContext({
        locale: "ko-KR",
        viewport: { width: 1_440, height: 1_000 },
      });
      const webGpuPage = await webGpuContext.newPage();
      await runBabylonStableIdOrientationParityProof(webGpuPage, rootUrl);
      await runMagicLayerProductionAlignmentProof(webGpuPage, rootUrl);
      await webGpuContext.close();
    } finally {
      await webGpuBrowser.close();
    }
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
