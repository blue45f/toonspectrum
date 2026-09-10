import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("./StudioToolBeltCreateModeGroups.tsx", import.meta.url),
  "utf8",
);
const popoverSource = readFileSync(
  new URL("./StudioSceneToolPopoverBody.tsx", import.meta.url),
  "utf8",
);

describe("Studio unified 3D entry", () => {
  it("offers one toolbar entry while retaining specialist tools in the workspace", () => {
    expect(toolbarSource).toContain("3D 스튜디오");
    expect(toolbarSource).toContain("참고 이미지");
    expect(toolbarSource).not.toContain(">3D 캐릭터<");
    expect(toolbarSource).not.toContain(">캐릭터 셰이퍼<");
    expect(toolbarSource).not.toContain(">3D 데생 인형<");
    expect(toolbarSource).not.toContain(">3D 배경<");
    expect(popoverSource).toContain("3D 장면 만들기");
    expect(popoverSource).toContain("캐릭터 제작");
    expect(popoverSource).toContain("포즈·손");
    expect(popoverSource).toContain("인체 참고");
  });
});
