import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioVrmAvatarForge.tsx", import.meta.url),
  "utf8",
);

describe("studio VRM hair transition integration boundary", () => {
  it("separates generated-surface identity from original-hair visibility", () => {
    expect(source).toContain("planStudioVrmHairTransition(");
    expect(source).toContain("const hairGeometryIdentity = hairTransition.identity");
    expect(source).toContain("const objectIdentity = `${hairGeometryIdentity}:${faceDecorationIdentity}`");
    expect(source).toContain("const hideAuthoredHair = shouldHideAuthoredVrmHair(safeState.hair)");
    expect(source).not.toContain("replaceOriginal}:${faceDecorationIdentity}");
  });

  it("commits transition state after layout and disposes replaced GPU resources", () => {
    expect(source).toContain("committedHairRef.current = { ...safeState.hair }");
    expect(source).toContain("return () => disposeAvatarForgeObject(object)");
    expect(source).toContain("<primitive key={objectIdentity} object={object} />");
    expect(source).toContain("return acquireHiddenHair(detectReplaceableHairMeshes(vrm))");
  });
});
