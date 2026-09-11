import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
} from "../apps/api/src/modules/studio-ai/studio-3d-generation-provider";
import {
  createHyper3dRodinProvider,
} from "../apps/api/src/modules/studio-ai/studio-hyper3d-rodin-provider";

const outputDir = path.resolve(process.env.STUDIO_HYPER3D_LIVE_OUTPUT ?? "artifacts/studio-hyper3d-live");
const apiKey = process.env.HYPER3D_API_KEY?.trim() || process.env.RODIN_API_KEY?.trim();
if (!apiKey) {
  throw new Error("HYPER3D_API_KEY or RODIN_API_KEY is required for the live acceptance gate.");
}

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Uint8Array) return { byteLength: value.byteLength, sha256: sha256(value) };
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (/key|token|url|uri|subscription/iu.test(key)) {
      if (typeof entry === "string") result[`${key}Hash`] = sha256(entry);
      continue;
    }
    result[key] = redact(entry);
  }
  return result;
}

function findIdentity(value: unknown, depth = 0): unknown | undefined {
  if (depth > 8 || !value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).map((key) => key.toLowerCase());
  if (
    keys.some((key) => key === "taskid" || key === "task_id" || key === "uuid") &&
    keys.some((key) => key.includes("subscription") || key.includes("provider") || key.includes("task"))
  ) {
    return value;
  }
  for (const entry of Object.values(object)) {
    const found = findIdentity(entry, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function progressState(value: unknown): string {
  const candidates: string[] = [];
  const visit = (entry: unknown, depth = 0): void => {
    if (depth > 6 || entry === null || entry === undefined) return;
    if (typeof entry === "string") {
      candidates.push(entry.toLowerCase());
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof entry === "object") {
      for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
        if (/state|status|phase|message|error/iu.test(key)) visit(item, depth + 1);
      }
    }
  };
  visit(value);
  return candidates.join(" ");
}

function findModelBinary(value: unknown, depth = 0): { bytes: Uint8Array; mimeType: string; filename: string } | undefined {
  if (depth > 10 || !value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.bytes instanceof Uint8Array) {
    const mimeType = typeof object.mimeType === "string" ? object.mimeType : "application/octet-stream";
    const filename = typeof object.filename === "string" ? object.filename : "generated.glb";
    if (/gltf|model|octet-stream/iu.test(mimeType) || /\.(glb|gltf)$/iu.test(filename)) {
      return { bytes: object.bytes, mimeType, filename };
    }
  }
  for (const entry of Object.values(object)) {
    const found = findModelBinary(entry, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function assertGlb(bytes: Uint8Array): void {
  if (bytes.byteLength < 20) throw new Error("Generated GLB is too small.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Generated model does not have the GLB magic header.");
  if (view.getUint32(4, true) !== 2) throw new Error("Generated GLB is not version 2.");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("Generated GLB declared length does not match bytes.");
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("Generated GLB first chunk is not JSON.");
}

const provider = createHyper3dRodinProvider({
  apiKey,
  retryAttempts: 2,
  timeoutMs: 120_000,
});
const runtime = provider as unknown as {
  submit(request: unknown, signal: AbortSignal): Promise<unknown>;
  poll(job: unknown, signal: AbortSignal): Promise<unknown>;
  download(job: unknown, signal: AbortSignal): Promise<unknown>;
  cancel?(job: unknown): Promise<void>;
};
const abort = new AbortController();
const deadline = setTimeout(() => abort.abort(), 24 * 60_000);
deadline.unref?.();

await mkdir(outputDir, { recursive: true });
const requestId = `toonstudio-live-${Date.now()}`;
const request = {
  schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
  requestId,
  mode: "text-to-3d",
  prompt:
    "A single simple low-poly wooden drawing stool, centered, clean silhouette, no text, no logo, no environment, game-ready blockout.",
  options: {
    tier: "Gen-2.5-Medium",
    meshMode: "Raw",
    targetFaceCount: 500,
    geometryFormat: "GLB",
    material: "None",
    seed: 73,
    symmetry: true,
    generatePreview: false,
  },
};

let identity: unknown;
let submission: unknown;
const progressReceipts: unknown[] = [];
try {
  submission = await runtime.submit(request, abort.signal);
  identity = findIdentity(submission) ?? submission;
  await writeFile(
    path.join(outputDir, "submission.json"),
    JSON.stringify({ requestIdHash: sha256(requestId), submission: redact(submission) }, null, 2) + "\n",
  );

  const startedAt = Date.now();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const progress = await runtime.poll(identity, abort.signal);
    const state = progressState(progress);
    progressReceipts.push({ attempt, elapsedMs: Date.now() - startedAt, state, progress: redact(progress) });
    if (/fail|error|reject|cancel|expired|violation/iu.test(state)) {
      throw new Error(`Hyper3D generation entered a terminal failure state: ${state}`);
    }
    if (/complete|completed|succeed|success|ready|done|finished/iu.test(state)) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 5_000 + attempt * 1_000)));
  }
  const finalState = progressState(progressReceipts.at(-1));
  if (!/complete|completed|succeed|success|ready|done|finished/iu.test(finalState)) {
    throw new Error(`Hyper3D generation did not complete before the bounded poll deadline: ${finalState}`);
  }

  const artifacts = await runtime.download(identity, abort.signal);
  const model = findModelBinary(artifacts);
  if (!model) throw new Error("Hyper3D download response did not include a model binary.");
  assertGlb(model.bytes);
  const glbPath = path.join(outputDir, "generated.glb");
  await writeFile(glbPath, model.bytes);
  await writeFile(
    path.join(outputDir, "receipt.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        provider: "hyper3d-rodin",
        requestIdHash: sha256(requestId),
        promptHash: sha256(request.prompt),
        completedAt: new Date().toISOString(),
        pollCount: progressReceipts.length,
        model: {
          filename: model.filename,
          mimeType: model.mimeType,
          byteLength: model.bytes.byteLength,
          sha256: sha256(model.bytes),
        },
        artifacts: redact(artifacts),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    path.join(outputDir, "progress.json"),
    JSON.stringify(progressReceipts, null, 2) + "\n",
  );
  console.log(`Hyper3D live acceptance generated ${model.bytes.byteLength} bytes at ${glbPath}`);
} catch (error) {
  if (identity && runtime.cancel) {
    try {
      await runtime.cancel(identity);
    } catch {
      // Preserve the primary failure; provider cancellation is best effort.
    }
  }
  await writeFile(
    path.join(outputDir, "failure.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        requestIdHash: sha256(requestId),
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        submission: redact(submission),
        progress: progressReceipts,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  clearTimeout(deadline);
}
