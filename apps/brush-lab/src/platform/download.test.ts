// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBlob, downloadJson, downloadPng } from "./download";

describe("downloadBlob", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it("createObjectURL로 만든 URL을 앵커 클릭 후 revoke한다", () => {
    const create = vi.fn(() => "blob:lab/1");
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const clicks: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}|${this.href}`);
    });
    try {
      downloadBlob("report.json", new Blob(["{}"], { type: "application/json" }), { schedule: (fn) => fn() });
    } finally {
      clickSpy.mockRestore();
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(["report.json|blob:lab/1"]);
    expect(revoke).toHaveBeenCalledWith("blob:lab/1");
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("클릭이 실패해도 revoke는 보장된다", () => {
    URL.createObjectURL = vi.fn(() => "blob:lab/2");
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("click 실패");
    });
    try {
      expect(() => downloadBlob("x.png", new Blob([]), { schedule: (fn) => fn() })).toThrow("click 실패");
    } finally {
      clickSpy.mockRestore();
    }
    expect(revoke).toHaveBeenCalledWith("blob:lab/2");
  });

  it("downloadJson·downloadPng는 MIME 타입이 맞는 Blob을 만든다", () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      if (b instanceof Blob) blobs.push(b);
      return "blob:lab/3";
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    try {
      downloadJson("a.json", "{}", { schedule: (fn) => fn() });
      downloadPng("b.png", new Uint8Array([137, 80, 78, 71]), { schedule: (fn) => fn() });
    } finally {
      clickSpy.mockRestore();
    }
    expect(blobs.map((b) => b.type)).toEqual(["application/json", "image/png"]);
    expect(blobs[1]?.size).toBe(4);
  });
});
