// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStudioImportHandoffsForTests,
  consumeStudioImportHandoff,
  peekStudioImportHandoff,
  registerStudioImportHandoff,
  studioImportHandoffHref,
  studioImportHandoffTargetForFormat,
} from "./studio-import-handoff";

beforeEach(clearStudioImportHandoffsForTests);

describe("Studio import handoff", () => {
  it("maps only formats already owned by the established editor import handlers", () => {
    expect(studioImportHandoffTargetForFormat("json")).toBe("project-json");
    expect(studioImportHandoffTargetForFormat("psd")).toBe("psd");
    expect(studioImportHandoffTargetForFormat("ora")).toBe("interchange");
    expect(studioImportHandoffTargetForFormat("abr")).toBe("brush-pack");
    expect(studioImportHandoffTargetForFormat("png")).toBe("image");
    expect(studioImportHandoffTargetForFormat("glb")).toBeNull();
    expect(studioImportHandoffTargetForFormat("pptx")).toBeNull();
  });

  it("keeps the browser File in memory and consumes it exactly once", () => {
    const file = new File(["{\"pages\":[]}"], "project.json", { type: "application/json" });
    const handoff = registerStudioImportHandoff(file, "json", 1_000);

    expect(studioImportHandoffHref(handoff)).toBe(`/studio/canvas?importHandoff=${handoff.token}`);
    expect(peekStudioImportHandoff(handoff.token, 1_001)?.file).toBe(file);
    expect(consumeStudioImportHandoff(handoff.token, 1_002)?.target).toBe("project-json");
    expect(consumeStudioImportHandoff(handoff.token, 1_003)).toBeNull();
  });

  it("expires abandoned files and rejects formats without a real consumer", () => {
    const image = new File(["pixels"], "reference.png", { type: "image/png" });
    const handoff = registerStudioImportHandoff(image, "png", 5_000);
    expect(peekStudioImportHandoff(handoff.token, handoff.expiresAt)).toBeNull();

    const model = new File(["glTF"], "scene.glb", { type: "model/gltf-binary" });
    expect(() => registerStudioImportHandoff(model, "glb", 5_000))
      .toThrow("no operational handoff");
  });
});
