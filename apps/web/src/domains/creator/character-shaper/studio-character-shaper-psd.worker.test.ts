import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isCharacterPsdHeader, isCharacterPsdWorkerResponse } from "./character-shaper-psd-worker-protocol";

import type { CharacterPsdWorkerRequest, CharacterPsdWorkerResponse } from "./character-shaper-psd-worker-protocol";

let receive: (event: MessageEvent<unknown>) => void;
let output: CharacterPsdWorkerResponse[];
beforeEach(async () => {
  vi.resetModules();
  output = [];
  vi.stubGlobal("self", {
    addEventListener: (_type: string, listener: typeof receive) => { receive = listener; },
    postMessage: (value: CharacterPsdWorkerResponse) => { output.push(value); },
  });
  // This imports the real Worker entry and real ag-psd assembly, with no DOM/ImageData initializer.
  await import("./studio-character-shaper-psd.worker");
});
afterEach(() => { vi.unstubAllGlobals(); });
function request(): CharacterPsdWorkerRequest {
  return { version: 1, kind: "assemble", requestId: 42, title: "worker",
    passes: [{ id: "beauty", width: 2, height: 1, rgba: new Uint8ClampedArray([30, 50, 70, 255, 80, 90, 100, 128]) }], skipped: [] };
}
function send(data: unknown) { receive({ data } as MessageEvent<unknown>); }

describe("actual character PSD Worker entry", () => {
  it("assembles one RGB8 PSD without a DOM canvas and ignores additional requests", async () => {
    expect(output).toEqual([{ version: 1, kind: "ready" }]);
    send(request());
    expect(output).toHaveLength(2);
    const result = output[1]!;
    expect(isCharacterPsdWorkerResponse(result)).toBe(true);
    expect(result.kind).toBe("result");
    if (result.kind !== "result") throw new Error("missing PSD");
    expect(result.requestId).toBe(42);
    expect(isCharacterPsdHeader(new Uint8Array(await result.blob.slice(0, 26).arrayBuffer()), 2, 1)).toBe(true);
    expect(result.receipt.layerNames).toContain("미리보기 (Beauty)");
    send(request());
    expect(output).toHaveLength(2);
  });
  it("rejects malformed requests before PSD assembly", () => {
    send({ ...request(), version: 0 });
    expect(output[1]).toMatchObject({ kind: "error", code: "protocol" });
  });
  it("returns a bounded error when no actual layer can be assembled", () => {
    const input = request();
    send({ ...input, passes: [{ ...input.passes[0], id: "mask-skin", rgba: new Uint8ClampedArray(8) }] });
    expect(output[1]).toEqual({ version: 1, kind: "error", requestId: 42, code: "assembly-failed" });
  });
});
