// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { loadSkiaDocumentImageBitmap } from "../document-image-source";

afterEach(() => {
  vi.unstubAllGlobals();
});

function oversizedPng(): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 9000);
  view.setUint32(20, 1);
  view.setUint32(33, 0);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

function oversizedJpeg(): Uint8Array {
  const bytes = new Uint8Array(23);
  bytes.set([0xff, 0xd8, 0xff, 0xc0]);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 17);
  bytes[6] = 8;
  view.setUint16(7, 1);
  view.setUint16(9, 9000);
  bytes[21] = 0xff; bytes[22] = 0xd9;
  return bytes;
}

async function rejectsBeforeDecode(bytes: Uint8Array): Promise<void> {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
    status: 200,
    headers: { "content-length": String(bytes.byteLength) },
  })));
  const decode = vi.fn();
  vi.stubGlobal("createImageBitmap", decode);
  await expect(loadSkiaDocumentImageBitmap(
    "data:image/test;base64,AA==",
    new AbortController().signal,
  )).rejects.toThrow(/pixel budget/u);
  expect(decode).not.toHaveBeenCalled();
}

it("rejects oversized PNG dimensions before browser decode", async () => {
  await rejectsBeforeDecode(oversizedPng());
});

it("rejects oversized JPEG dimensions before browser decode", async () => {
  await rejectsBeforeDecode(oversizedJpeg());
});
