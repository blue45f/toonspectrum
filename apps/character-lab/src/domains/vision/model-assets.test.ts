import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MEDIAPIPE_MODELS } from "../../contracts";

import { HAND_LANDMARKER_MODEL, VISION_MODEL_SPECS, createFetchModelPort, fetchModelAsset, isModelSpecPinned, verifyModelBytes, withDeadline } from "./model-assets";

import type { ModelBytesPort } from "./model-assets";

const sha256 = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");

function portOf(bytes: Uint8Array | null, status = 404): ModelBytesPort {
  return { fetchBytes: async () => (bytes ? { ok: true, bytes } : { ok: false, status, message: `${status} Not Found` }) };
}

describe("vision/model-assets", () => {
  it("계약 모델 표: 임베더는 고정, 포즈·손은 미고정(베타)", () => {
    expect(isModelSpecPinned(VISION_MODEL_SPECS.imageEmbedder)).toBe(true);
    expect(isModelSpecPinned(VISION_MODEL_SPECS.poseLandmarker)).toBe(false);
    expect(isModelSpecPinned(VISION_MODEL_SPECS.handLandmarker)).toBe(false);
    expect(VISION_MODEL_SPECS.imageEmbedder.url).toBe(MEDIAPIPE_MODELS.imageEmbedder.url);
    expect(HAND_LANDMARKER_MODEL.url).toMatch(/hand_landmarker\.task$/u);
    expect(HAND_LANDMARKER_MODEL.license).toBe("Apache-2.0");
  });

  it("고정 모델은 크기·SHA가 모두 맞아야 통과한다", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = await sha256(bytes);
    const spec = { key: "imageEmbedder" as const, url: "u", bytes: 4, sha256: digest, license: "Apache-2.0" };
    const ok = verifyModelBytes(spec, bytes, digest, 1);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.model.pinned).toBe(true);
      expect(ok.model.observedSha256).toBe(digest);
    }
    const sizeMismatch = verifyModelBytes({ ...spec, bytes: 5 }, bytes, digest, 1);
    expect(sizeMismatch.ok === false && sizeMismatch.failure.code).toBe("vision-model-bytes-mismatch");
    const shaMismatch = verifyModelBytes({ ...spec, sha256: "0".repeat(64) }, bytes, digest, 1);
    expect(shaMismatch.ok === false && shaMismatch.failure.code).toBe("vision-model-sha-mismatch");
    expect(shaMismatch.ok === false && shaMismatch.failure.reasonKo).toMatch(/SHA-256/u);
    const empty = verifyModelBytes(spec, new Uint8Array(0), "", 1);
    expect(empty.ok === false && empty.failure.code).toBe("vision-model-empty");
  });

  it("미고정 모델은 관측 SHA를 기록하고 pinned=false로 통과한다", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const result = await fetchModelAsset(portOf(bytes), VISION_MODEL_SPECS.poseLandmarker, { sha256, now: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.pinned).toBe(false);
      expect(result.model.observedSha256).toBe(await sha256(bytes));
    }
  });

  it("404·네트워크 실패·시간 초과·SHA 계산 불가는 모두 LabFailure로 돌려준다", async () => {
    const missing = await fetchModelAsset(portOf(null), VISION_MODEL_SPECS.imageEmbedder, { sha256, now: 1 });
    expect(missing.ok === false && missing.failure.code).toBe("vision-model-fetch-failed");
    expect(missing.ok === false && missing.failure.reasonKo).toMatch(/404/u);

    const never: ModelBytesPort = { fetchBytes: () => new Promise(() => undefined) };
    const timeout = await fetchModelAsset(never, VISION_MODEL_SPECS.imageEmbedder, { sha256, now: 1, timeoutMs: 5 });
    expect(timeout.ok === false && timeout.failure.code).toBe("vision-model-timeout");

    const noSha = await fetchModelAsset(portOf(new Uint8Array([1])), VISION_MODEL_SPECS.poseLandmarker, { sha256: async () => Promise.reject(new Error("no subtle")), now: 1 });
    expect(noSha.ok === false && noSha.failure.code).toBe("vision-model-sha-unavailable");

    const thrown: ModelBytesPort = { fetchBytes: async () => Promise.reject(new Error("boom")) };
    const failed = await fetchModelAsset(thrown, VISION_MODEL_SPECS.poseLandmarker, { sha256, now: 1 });
    expect(failed.ok === false && failed.failure.code).toBe("vision-model-fetch-failed");
  });

  it("withDeadline은 제때 끝나면 값을, 늦으면 실패를 낸다", async () => {
    await expect(withDeadline(Promise.resolve(3), 50, () => ({ code: "x", reasonKo: "x", at: 0 }))).resolves.toBe(3);
    await expect(withDeadline(new Promise<number>(() => undefined), 5, () => ({ code: "late", reasonKo: "늦음", at: 0 }))).rejects.toMatchObject({ code: "late" });
    await expect(withDeadline(Promise.reject(new Error("inner")), 50, () => ({ code: "x", reasonKo: "x", at: 0 }))).rejects.toThrow("inner");
  });

  it("fetch 포트는 ok=false 응답과 예외를 구분해 돌려준다", async () => {
    const fetchOk = (async () => new Response(new Uint8Array([7, 7]), { status: 200 })) as unknown as typeof fetch;
    const okPort = createFetchModelPort(fetchOk);
    const ok = await okPort.fetchBytes("u");
    expect(ok.ok && Array.from(ok.bytes)).toEqual([7, 7]);
    const fetch500 = (async () => new Response(null, { status: 500, statusText: "Server Error" })) as unknown as typeof fetch;
    const failed = await createFetchModelPort(fetch500).fetchBytes("u");
    expect(failed.ok === false && failed.status).toBe(500);
    const fetchThrow = (async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch;
    const offline = await createFetchModelPort(fetchThrow).fetchBytes("u");
    expect(offline.ok === false && offline.message).toBe("offline");
  });
});
