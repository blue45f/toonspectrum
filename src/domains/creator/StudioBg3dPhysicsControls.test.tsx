import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import background3dSource from "./StudioBackground3D.tsx?raw";
import {
  StudioBg3dPhysicsPanel,
  StudioBg3dPhysicsTransport,
} from "./StudioBg3dPhysicsControls";
import physicsControlsSource from "./StudioBg3dPhysicsControls.tsx?raw";

function renderTransport(phase: "loading" | "paused" | "complete"): string {
  return renderToStaticMarkup(
    <StudioBg3dPhysicsTransport
      phase={phase}
      progress={phase === "complete" ? 1 : 0.5}
      currentSeconds={phase === "complete" ? 4 : 2}
      durationSeconds={4}
      onPause={vi.fn()}
      onResume={vi.fn()}
      onReset={vi.fn()}
      onBake={vi.fn()}
    />,
  );
}

function transportButton(markup: string): string {
  const match = markup.match(
    /<button[^>]*data-testid="bg3d-physics-play-pause"[^>]*>[\s\S]*?<\/button>/u,
  );
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

function sourceSlice(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Studio BG3D physics control quality", () => {
  it("offers an enabled, explicitly labelled replay action after completion", () => {
    const button = transportButton(renderTransport("complete"));

    expect(button).toContain('aria-label="물리 미리보기 처음부터 다시 재생"');
    expect(button).toContain("다시 재생");
    expect(button).not.toMatch(/\sdisabled(?:=""|(?=[ >]))/u);
    expect(background3dSource).toContain(
      'const offset = physicsPhaseRef.current === "complete" ? 0 : physicsPlaybackOffsetRef.current;',
    );
  });

  it("keeps playback unavailable only while results are still loading", () => {
    const loadingButton = transportButton(renderTransport("loading"));
    const pausedButton = transportButton(renderTransport("paused"));

    expect(loadingButton).toMatch(/\sdisabled(?:=""|(?=[ >]))/u);
    expect(pausedButton).not.toMatch(/\sdisabled(?:=""|(?=[ >]))/u);
    expect(pausedButton).toContain('aria-label="물리 미리보기 재생"');
  });

  it("exposes progress without turning frame-rate updates into live announcements", () => {
    const complete = renderTransport("complete");
    const progressbar = complete.match(/<div role="progressbar"[^>]*>/u)?.[0] ?? "";
    const statusOutput = sourceSlice(
      background3dSource,
      'data-testid="bg3d-physics-status"',
      "</output>",
    );

    expect(progressbar).toContain('aria-valuemin="0"');
    expect(progressbar).toContain('aria-valuemax="100"');
    expect(progressbar).toContain('aria-valuenow="100"');
    expect(progressbar).toContain(
      'aria-valuetext="재생 완료 · 4.0초 / 4.0초 · 100퍼센트"',
    );
    expect(statusOutput).toContain("describeStudioBg3dPhysicsStatus(physicsPhase, physicsError)");
    expect(statusOutput).not.toContain("physicsProgress * 100");
    expect(background3dSource).toContain(
      "물리 미리보기 재생이 완료되었습니다. 다시 재생하거나 현재 자세를 적용할 수 있습니다.",
    );
  });

  it("hands focus from the removed start action to the loading transport cancel action", () => {
    const loading = renderTransport("loading");
    const resetButton = loading.match(
      /<button[^>]*data-testid="bg3d-physics-reset"[^>]*>[\s\S]*?<\/button>/u,
    )?.[0] ?? "";

    expect(resetButton).toContain('aria-label="물리 미리보기 계산 취소"');
    expect(background3dSource).toContain("shouldTransferPhysicsFocusRef.current = true;");
    expect(background3dSource).toContain("currentAction.focus({ preventScroll: true });");
    expect(background3dSource).toContain("currentActionRef={physicsTransportActionRef}");
    expect(background3dSource).toContain("startButtonRef={physicsStartButtonRef}");
    expect(physicsControlsSource).toContain(
      'ref={!canControl && phase === "loading" ? currentActionRef : null}',
    );
  });

  it("uses the defined bad token and keeps duration choices touch-sized", () => {
    const markup = renderToStaticMarkup(
      <StudioBg3dPhysicsPanel
        selectedCount={1}
        durationSeconds={4}
        gravityPreset="earth"
        groundEnabled
        phase="error"
        progress={0}
        unavailableReason={null}
        errorMessage="물리 미리보기를 시작할 수 없습니다."
        onDurationChange={vi.fn()}
        onGravityPresetChange={vi.fn()}
        onGroundEnabledChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(markup).toContain("border-bad/40");
    expect(markup).toContain("text-bad");
    expect(physicsControlsSource).not.toContain("danger");
    expect(markup.match(/pointer-coarse:min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("Studio BG3D modal focus contract", () => {
  it("reuses the shared modal owner for initial focus, trapping, Escape, inert, and focus return", () => {
    expect(background3dSource).toContain("useStudioModalSheet({");
    expect(background3dSource).toContain('activeKey: open ? "studio-bg3d" : null');
    expect(background3dSource).toContain("dialogRef: modalDialogRef");
    expect(background3dSource).toContain("rootRef: modalRootRef");
    expect(background3dSource).toContain(
      "resolveReturnFocus: () => resolveStudioBg3dReturnFocus(modalDialogRef.current)",
    );
    expect(background3dSource).toContain(
      "modalRootRef.current = modalDialogRef.current?.ownerDocument.body ?? null;",
    );
    expect(background3dSource).toContain('button.title === "3D 배경 재편집"');
    expect(background3dSource).toContain('normalizedText(button) === "3D 배경"');
    expect(background3dSource).toContain('data-bg3d-initial-focus="true"');
    expect(background3dSource).toContain("ref={modalDialogRef}");
    expect(background3dSource).toContain('aria-modal="true"');
    expect(background3dSource).toContain("tabIndex={-1}");

    const keyboardHandler = sourceSlice(
      background3dSource,
      "// 키보드 단축키:",
      "const onCaptureUpdate =",
    );
    expect(keyboardHandler).not.toContain('e.key === "Escape"');
  });
});

describe("Studio BG3D rig control quality", () => {
  it("keeps new rig, IK, and pose-bake controls touch-sized", () => {
    const start = background3dSource.indexOf("리그 제약");
    const end = background3dSource.indexOf("모델 애니메이션", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const rigControls = background3dSource.slice(start, end);

    expect(rigControls.match(/pointer-coarse:(?:min-h|h)-11/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(9);
    expect(rigControls.match(/touchFriendly/g)?.length ?? 0).toBe(3);
  });

  it("connects every disabled pose-bake action to a concrete visible reason", () => {
    expect(background3dSource).toContain("const selectedRigBakeDisabledReason =");
    expect(background3dSource).toContain(
      'aria-describedby={\n                                selectedRigBakeDisabledReason',
    );
    expect(background3dSource).toContain('id="bg3d-rig-bake-disabled-reason"');
    expect(background3dSource).toContain(
      "물리 미리보기 중에는 포즈로 구울 수 없습니다. 현재 자세를 적용하거나 미리보기를 초기화해 주세요.",
    );
    expect(background3dSource).toContain(
      "모델 리그를 준비하는 중입니다. 준비가 끝나면 포즈로 구울 수 있습니다.",
    );
  });
});
