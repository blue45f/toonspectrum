import { describe, expect, it, vi } from "vitest";

import { Bg3dModelLibraryError } from "../bg3d/bg3d-model-library";
import { StudioBg3dValidationWorkerError } from "../bg3d/studio-bg3d-glb-validation-worker-client";

import { buildStudioLift3dDepthField } from "./studio-lift3d-depth";
import { encodeStudioLift3dGlb } from "./studio-lift3d-glb";
import {
  createStudioLift3dImportItem,
  createStudioLift3dUploadSource,
  saveStudioLift3dToBg3dLibrary,
} from "./studio-lift3d-library-handoff";
import { extractStudioLift3dMask, resampleStudioLift3dImage } from "./studio-lift3d-mask";
import { buildStudioLift3dGeometry } from "./studio-lift3d-mesh";
import { discImage } from "./studio-lift3d.test-fixture";

import type { StudioLift3dGlbFile } from "./studio-lift3d-glb";

function liftedGlb(name = "주인공"): StudioLift3dGlbFile {
  const grid = resampleStudioLift3dImage(discImage(48), 48);
  const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
  const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 1 });
  const built = buildStudioLift3dGeometry(mask, depth, {
    mode: "inflate",
    depthScale: 0.3,
    targetHeight: 1.7,
  });
  if (!built.ok) throw new Error(built.detail);
  const encoded = encodeStudioLift3dGlb(built.value, { name });
  if (!encoded.ok) throw new Error("encode failed");
  return encoded.value;
}

describe("Studio Lift 3D 라이브러리 등록", () => {
  it("파일 시스템을 거치지 않고 업로드 소스를 만든다", async () => {
    const glb = liftedGlb();
    const source = createStudioLift3dUploadSource(glb);

    expect(source.name).toBe(glb.fileName);
    expect(source.type).toBe("model/gltf-binary");
    expect(source.size).toBe(glb.bytes.byteLength);
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(glb.bytes);
  });

  it("소스를 여러 번 읽어도 같은 바이트를 준다", async () => {
    const source = createStudioLift3dUploadSource(liftedGlb());
    const first = new Uint8Array(await source.arrayBuffer());
    const second = new Uint8Array(await source.arrayBuffer());
    expect(first).toEqual(second);
  });

  it("메인 스레드에서 중복 해싱하지 않고 권리만 실어 넘긴다", () => {
    // expectedSha256 은 외부 매니페스트를 든 호출자용이다. 여기서는 방금 만든 메모리 버퍼를
    // 그대로 넘기므로 대조할 제3의 출처가 없고, 라이브러리가 같은 바이트를 어차피 다시 해싱한다.
    const item = createStudioLift3dImportItem(liftedGlb(), "owned");

    expect(item.expectedSha256).toBeUndefined();
    expect(item.rights).toEqual({ status: "owned" });
  });

  it("등록에 성공하면 검증된 레코드를 돌려준다", async () => {
    const glb = liftedGlb();
    const record = { id: "model-1", contentHash: "sha256:abc" };
    const saveVerifiedModel = vi.fn().mockResolvedValue(record);

    const result = await saveStudioLift3dToBg3dLibrary(glb, "owned", {}, { saveVerifiedModel });

    expect(result).toEqual({ ok: true, record });
    const [item] = saveVerifiedModel.mock.calls[0]!;
    expect(item.file.name).toBe(glb.fileName);
    expect(item.rights).toEqual({ status: "owned" });
  });

  it("라이브러리 오류 문장을 그대로 전달한다", async () => {
    const failure = new Bg3dModelLibraryError("file-too-large");
    const result = await saveStudioLift3dToBg3dLibrary(liftedGlb(), "unknown", {}, {
      saveVerifiedModel: vi.fn().mockRejectedValue(failure),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toBe(failure.message);
    expect(result.detail).toContain("100MiB");
  });

  it("취소는 실패가 아니라 취소로 알린다", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    const result = await saveStudioLift3dToBg3dLibrary(liftedGlb(), "unknown", {}, {
      saveVerifiedModel: vi.fn().mockRejectedValue(aborted),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("취소");
  });

  it("라이브러리의 진짜 취소(검증 워커 오류)도 취소로 알아본다", async () => {
    // signal 로 끊으면 오는 것은 AbortError 가 아니라 StudioBg3dValidationWorkerError("aborted") 다.
    // 이름만 보면 놓치고 studio-bg3d-validation-worker:aborted 를 사용자에게 그대로 보여준다.
    const workerAbort = new StudioBg3dValidationWorkerError("aborted");
    const result = await saveStudioLift3dToBg3dLibrary(liftedGlb(), "unknown", {}, {
      saveVerifiedModel: vi.fn().mockRejectedValue(workerAbort),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("취소");
    expect(result.detail).not.toContain("studio-bg3d-validation-worker");
  });
});
