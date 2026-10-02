import { describe, expect, it } from "vitest";

import { DEFAULT_REVOKE_DELAY_MS, sanitizeFileName, saveBytesWith } from "./save-bytes";

import type { SaveBytesPorts } from "./save-bytes";

interface FakePorts extends SaveBytesPorts {
  readonly log: string[];
  readonly scheduled: Array<{ callback: () => void; delayMs: number }>;
}

function fakePorts(options: { failTrigger?: boolean; failUrl?: boolean } = {}): FakePorts {
  const log: string[] = [];
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  return {
    log,
    scheduled,
    createObjectUrl(bytes, mime) {
      if (options.failUrl) throw new Error("no url");
      log.push(`create:${bytes.length}:${mime}`);
      return "blob:fake/1";
    },
    revokeObjectUrl(url) {
      log.push(`revoke:${url}`);
    },
    triggerDownload(url, fileName) {
      if (options.failTrigger) throw new Error("click failed");
      log.push(`click:${url}:${fileName}`);
    },
    schedule(callback, delayMs) {
      scheduled.push({ callback, delayMs });
    },
  };
}

describe("saveBytesWith", () => {
  it("성공 경로: 클릭 후 예약된 revoke가 정확히 한 번 실행된다", () => {
    const ports = fakePorts();
    const result = saveBytesWith(ports, "a.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(result).toEqual({ ok: true, fileName: "a.png", bytes: 3, url: "blob:fake/1" });
    expect(ports.log).toEqual(["create:3:image/png", "click:blob:fake/1:a.png"]);
    expect(ports.scheduled).toHaveLength(1);
    expect(ports.scheduled[0]?.delayMs).toBe(DEFAULT_REVOKE_DELAY_MS);
    ports.scheduled[0]?.callback();
    ports.scheduled[0]?.callback();
    expect(ports.log.filter((entry) => entry.startsWith("revoke:"))).toEqual(["revoke:blob:fake/1"]);
  });

  it("클릭 실패: 즉시 revoke하고 LabFailure를 돌려준다(예약 없음)", () => {
    const ports = fakePorts({ failTrigger: true });
    const result = saveBytesWith(ports, "b.psd", new Uint8Array([9]), "image/vnd.adobe.photoshop", { now: 7, revokeDelayMs: 50 });
    expect(!result.ok && result.failure.code).toBe("save-trigger");
    expect(!result.ok && result.failure.at).toBe(7);
    expect(ports.log).toEqual(["create:1:image/vnd.adobe.photoshop", "revoke:blob:fake/1"]);
    expect(ports.scheduled).toHaveLength(0);
  });

  it("URL 생성 실패·빈 바이트는 revoke 없이 실패한다", () => {
    const noUrl = fakePorts({ failUrl: true });
    expect(saveBytesWith(noUrl, "c.glb", new Uint8Array([1]), "model/gltf-binary").ok).toBe(false);
    expect(noUrl.log).toEqual([]);
    const empty = fakePorts();
    const result = saveBytesWith(empty, "d.json", new Uint8Array(0), "application/json");
    expect(!result.ok && result.failure.code).toBe("save-empty");
    expect(empty.log).toEqual([]);
  });

  it("파일명을 정리한다", () => {
    expect(sanitizeFileName(' a/b\\c:d*e?f"g<h>i|j\u0000 ')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(sanitizeFileName("   ")).toBe("export");
    const ports = fakePorts();
    const result = saveBytesWith(ports, "x/y.png", new Uint8Array([1]), "image/png");
    expect(result.ok && result.fileName).toBe("x_y.png");
  });
});
