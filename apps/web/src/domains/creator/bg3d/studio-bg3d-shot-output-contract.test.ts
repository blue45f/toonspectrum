import { describe, expect, it, vi } from "vitest";

import { assertStudioBg3dShotPsdCaptureSupported, assertStudioBg3dShotRequestedOutput } from "./studio-bg3d-shot-output-contract";
import { commitStudioBg3dShotBatchDownload } from "./studio-bg3d-shot-batch-download-gate";

const shots = [{ shotId: "first", shotName: "첫 컷" }, { shotId: "second", shotName: "두 번째 컷" }];
const psd = new Blob([new Uint8Array([56, 66, 80, 83])]);

describe("컷 배치 요청 출력 계약", () => {
  it("타일 PSD와 encoder 한계를 계획 단계에서 차단하고 PNG는 크기를 유지한다", () => {
    const planned = [{ shotName: "큰 컷", capture: { width: 4096, height: 4096 } }];
    expect(() => assertStudioBg3dShotPsdCaptureSupported({
      includeLayeredPsd: true, shots: planned, needsTiles: () => true,
    })).toThrow("분리 PNG 패스로 전환");
    expect(() => assertStudioBg3dShotPsdCaptureSupported({
      includeLayeredPsd: false, shots: planned, needsTiles: () => true,
    })).not.toThrow();
    expect(planned[0]?.capture).toEqual({ width: 4096, height: 4096 });
    expect(() => assertStudioBg3dShotPsdCaptureSupported({
      includeLayeredPsd: true,
      shots: [{ shotName: "작은 컷", capture: { width: 640, height: 480 } }],
      needsTiles: () => false,
    })).not.toThrow();
  });

  it.each(["누락", "빈 파일", "중복", "fallback"])("요청 PSD의 %s을 완료로 처리하지 않는다", (failure) => {
    const layeredPsds = [{ shotId: "first", psd }];
    if (failure !== "누락") layeredPsds.push({ shotId: "second", psd: failure === "빈 파일" ? new Blob() : psd });
    if (failure === "중복") layeredPsds.push({ shotId: "second", psd });
    expect(() => assertStudioBg3dShotRequestedOutput({
      includeLayeredPsd: true, shots, layeredPsds,
      psdFallbacks: failure === "fallback" ? [{ shotId: "second" }] : [],
    })).toThrow("두 번째 컷: 요청한 레이어 PSD");
  });

  it("복구된 PNG fallback은 다운로드 기록 전에 중단하고 명시적 PNG 선택 후에만 다운로드한다", async () => {
    const markDownloadRequested = vi.fn(async () => undefined);
    const download = vi.fn();
    const requestedOutput = { includeLayeredPsd: true, shots, layeredPsds: [], psdFallbacks: shots };
    const input = {
      signal: new AbortController().signal, isActive: () => true,
      assertAccess: async () => undefined, markDownloadRequested, download, requestedOutput,
    };
    await expect(commitStudioBg3dShotBatchDownload(input)).rejects.toThrow("다운로드를 중단");
    expect(markDownloadRequested).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    await commitStudioBg3dShotBatchDownload({ ...input, requestedOutput: { ...requestedOutput, includeLayeredPsd: false } });
    expect(markDownloadRequested).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
  });

  it("모든 PSD가 생성된 경우에만 요청 형식의 완료를 허용한다", () => {
    expect(() => assertStudioBg3dShotRequestedOutput({
      includeLayeredPsd: true, shots, layeredPsds: shots.map(({ shotId }) => ({ shotId, psd })), psdFallbacks: [],
    })).not.toThrow();
  });
});
