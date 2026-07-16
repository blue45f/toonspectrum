import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(new URL("./StudioBackground3D.tsx", import.meta.url), "utf8");
const vrmSource = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");

function sliceBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Studio 3D viewport Motion Coach integration", () => {
  it("gives every background viewport action an explicit stable semantic ID", () => {
    for (const id of [
      "bg3d:transform:translate",
      "bg3d:transform:rotate",
      "bg3d:transform:scale",
      "bg3d:view:quad",
      "bg3d:history:undo",
      "bg3d:history:redo",
      "bg3d:transform:snap",
      "bg3d:object:ground",
      "bg3d:camera:focus-selection",
      "bg3d:camera:zoom-in",
      "bg3d:camera:zoom-out",
      "bg3d:camera:reset",
      "bg3d:view:line-preview",
    ]) {
      expect(backgroundSource).toContain(`id: "${id}"`);
    }

    expect(backgroundSource).toContain('preview: "object-3d"');
    expect(backgroundSource).toContain('preview: "camera-3d"');
    expect(backgroundSource).toContain('preview: "history"');
  });

  it("replaces native background toolbar titles and explains unavailable actions", () => {
    const toolbar = sliceBetween(
      backgroundSource,
      '<div className="absolute left-2 top-2 z-10 grid grid-cols-3 gap-1.5 sm:left-2.5 sm:top-2.5 sm:flex sm:flex-col">',
      "{!viewportHinted ?"
    );

    expect(toolbar).toContain("<StudioToolHintTarget");
    expect(toolbar).not.toContain("title=");
    expect(toolbar).toContain('unavailableReason={!canUndo ? "되돌릴 3D 장면 변경이 없습니다."');
    expect(toolbar).toContain('unavailableReason={!canRedo ? "다시 적용할 3D 장면 변경이 없습니다."');
    expect(toolbar).toContain("disabled={Boolean(groundSelectionDisabledReason)}");
    expect(toolbar).toContain('disabled={!selectedEntity}');
    expect(toolbar).toContain('"도형 또는 3D 모델을 먼저 선택하세요."');
    expect(backgroundSource).toContain('"선택한 객체의 잠금을 해제하세요."');
  });

  it("keeps both viewport tool groups inside short mobile canvases", () => {
    expect(backgroundSource).toContain(
      'className="absolute left-2 top-2 z-10 grid grid-cols-3 gap-1.5 sm:left-2.5 sm:top-2.5 sm:flex sm:flex-col"'
    );
    expect(backgroundSource).toContain(
      'className="col-span-3 grid grid-cols-3 gap-1 rounded-lg border border-line/70 bg-panel/80 p-1 shadow-sm backdrop-blur sm:flex sm:flex-col"'
    );
    expect(backgroundSource).toContain(
      'className="absolute right-2 top-2 z-10 grid grid-cols-2 gap-1.5 sm:right-2.5 sm:top-2.5 sm:flex sm:flex-col"'
    );
  });

  it("grounds every unlocked member of a mixed multi-selection", () => {
    expect(backgroundSource).toContain(
      "const canGroundSelection = selectedEntities.some((entity) => !isBgObjectTransformBlocked(entity));"
    );
    expect(backgroundSource).toContain("const groundSelectionDisabledReason =");
    expect(backgroundSource).toContain("disabled={Boolean(groundSelectionDisabledReason)}");
    expect(backgroundSource).toContain("unavailableReason={groundSelectionDisabledReason}");
  });

  it("preserves the live snap interval, angle, and axis summary in the coach", () => {
    expect(backgroundSource).toContain(
      "const snapSettingsSummary = studioBg3dSnapSettingsSummary(snapSettings);"
    );
    expect(backgroundSource).toContain("현재 설정: ${snapSettingsSummary}.");
    expect(backgroundSource).toContain("· ${snapSettingsSummary}");
  });

  it("gives the VRM viewport history and camera controls their own coach actions", () => {
    for (const id of [
      "vrm:history:undo",
      "vrm:history:redo",
      "vrm:camera:zoom-in",
      "vrm:camera:zoom-out",
      "vrm:camera:reset",
      "vrm:camera:turntable",
    ]) {
      expect(vrmSource).toContain(`id: "${id}"`);
    }

    const toolbar = sliceBetween(
      vrmSource,
      '<div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1.5">',
      "{!viewportHinted ?"
    );
    expect(toolbar).toContain("VRM_VIEWPORT_HINTS.undo");
    expect(toolbar).toContain("VRM_VIEWPORT_HINTS.turntable");
    expect(toolbar).not.toContain("title=");
    expect(toolbar).toContain('unavailableReason={!canUndo ? "되돌릴 캐릭터 변경이 없습니다."');
    expect(toolbar).toContain('unavailableReason={!canRedo ? "다시 적용할 캐릭터 변경이 없습니다."');
  });
});
