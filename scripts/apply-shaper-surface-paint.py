#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected exactly one match, found {count}: {old[:120]!r}")
    write(relative, source.replace(old, new, 1))


def replace_exact_count(relative: str, old: str, new: str, expected: int) -> None:
    source = read(relative)
    count = source.count(old)
    if count != expected:
        raise RuntimeError(
            f"{relative}: expected {expected} matches, found {count}: {old[:120]!r}"
        )
    write(relative, source.replace(old, new))


def replace_test(relative: str, title: str, replacement: str) -> None:
    source = read(relative)
    pattern = re.compile(
        rf'^  it\("{re.escape(title)}", \(\) => \{{\n.*?^  \}}\);\n',
        re.MULTILINE | re.DOTALL,
    )
    updated, count = pattern.subn(replacement.rstrip() + "\n", source, count=1)
    if count != 1:
        raise RuntimeError(f"{relative}: could not replace test {title!r}; matches={count}")
    write(relative, updated)


# ── Admit the measured round-tip provider, keeping the legacy brush quarantined. ───────────────

replace_once(
    "src/domains/creator/vrm/StudioVrmPoserTypes.ts",
    '''export const STUDIO_VRM_SURFACE_BRUSH_UNAVAILABLE_REASON =
  "검증·승인된 3D 표면 브러시 엔진이 아직 연결되지 않아 브러시 그리기를 사용할 수 없습니다. 자체 라운드 촉으로 대체하지 않으며, 현재는 ColorDrop과 스포이드를 사용할 수 있습니다.";

export function isStudioVrmTexturePaintBrushProductBlocked(
  tool: StudioVrmTexturePaintPanelSettings["tool"],
): boolean {
  return tool === "surface-brush" || tool === "brush";
}''',
    '''export const STUDIO_VRM_SURFACE_BRUSH_UNAVAILABLE_REASON =
  "검증된 round 촉 기반 3D 표면 브러시입니다. 필압·크기·불투명도·경도는 로컬 UV atlas에 반영되며, stamp/image 촉과 wet/smudge 혼색은 아직 지원하지 않습니다.";

export function isStudioVrmTexturePaintBrushProductBlocked(
  tool: StudioVrmTexturePaintPanelSettings["tool"],
): boolean {
  // The measured round surface provider is admitted; only the legacy stamp-brush state remains.
  return tool === "brush";
}''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmActor.tsx",
    '''    if (isStudioVrmTexturePaintBrushProductBlocked(settings.tool)) return;
  };''',
    '''    if (isStudioVrmTexturePaintBrushProductBlocked(settings.tool)) return;
    if (settings.tool !== "surface-brush") return;

    runtime.clearError();
    const begin = texturePaintSurfaceTool.begin({
      runtime,
      settings: {
        color: settings.color,
        sizeCssPixels: settings.sizeTexels,
        opacity: settings.opacity,
        flow: settings.tuning.flow,
        hardness: settings.tuning.hardness,
        minSize: settings.tuning.minSize,
      },
      sample: studioVrmSurfacePaintPointerSample(
        event,
        "down",
        hit,
        camera,
        gl.domElement.getBoundingClientRect().height,
        texturePaintSurfaceCameraPointRef.current,
      ),
    });
    if (!begin.ok) return;

    texturePaintSurfacePointerIdRef.current = event.pointerId;
    const captureTarget =
      event.currentTarget as unknown as StudioVrmTexturePaintPointerCaptureTarget;
    texturePaintSurfaceCaptureTargetRef.current = captureTarget;
    try {
      captureTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window lifecycle listeners still finish or cancel an admitted stroke without capture.
      texturePaintSurfaceCaptureTargetRef.current = null;
    }
    invalidate();
  };''',
)

# ── Product panel: direct painting, explicit controls, honest capability boundary. ────────────────

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    "  /** Texture-space diameter in texels. */",
    "  /** Surface-brush diameter in CSS pixels (legacy key kept for scene compatibility). */",
)

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    '''              ColorDrop으로 연결 영역을 한 번에 채우고, 스포이드 버튼 또는 Alt+클릭으로 현재
              baseColor 색을 가져옵니다. 결과는 삽입 이미지와 캡처에 바로 반영됩니다.''',
    '''              모델 표면을 따라 직접 그리거나 ColorDrop으로 연결 영역을 채웁니다. 스포이드 버튼
              또는 Alt+클릭으로 baseColor 색을 가져오며, 결과는 삽입 이미지와 캡처에 바로 반영됩니다.''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    '''          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-describedby="vrm-surface-brush-unavailable-reason"
            aria-pressed="false"
            title={surfaceBrushUnavailableReason}
            className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.66rem] font-bold text-fg-3 opacity-55"
          >
            <Paintbrush size={14} aria-hidden />
            표면 브러시
          </button>''',
    '''          <button
            type="button"
            aria-pressed={settings.tool === "surface-brush"}
            title="3D 모델 표면을 따라 직접 그립니다. 필압과 기울기는 로컬 UV 브러시에 반영됩니다."
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              settings.tool === "surface-brush"
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
            onClick={() => onSettingsChange({ tool: "surface-brush" })}
          >
            <Paintbrush size={14} aria-hidden />
            표면 브러시
          </button>''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    '''        <p className="text-[0.64rem] leading-relaxed text-fg-3">
          표면을 한 번 눌러 채웁니다. 계산은 기기 안에서 처리되며 텍스처 경계를 넘어 번지지 않습니다.
        </p>''',
    '''        <p className="text-[0.64rem] leading-relaxed text-fg-3">
          {settings.tool === "surface-brush"
            ? "모델 위를 드래그해 직접 그립니다. 필압은 굵기에 반영되고 한 번의 제스처가 하나의 실행 취소 단계가 됩니다."
            : "표면을 한 번 눌러 채웁니다. 계산은 기기 안에서 처리되며 텍스처 경계를 넘어 번지지 않습니다."}
        </p>''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    '''      <div
        id="vrm-surface-brush-unavailable-reason"
        className="flex items-start gap-2 rounded-lg border border-warn/35 bg-warn/10 px-3 py-2.5 text-[0.64rem] leading-relaxed text-warn"
        role="note"
        data-testid="vrm-surface-brush-capability"
      >
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block font-bold text-fg-2">표면 브러시 준비 중</span>
          {surfaceBrushUnavailableReason}
        </span>
      </div>''',
    '''      <div
        id="vrm-surface-brush-capability-note"
        hidden={settings.tool !== "surface-brush"}
        className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft/35 px-3 py-2.5 text-[0.64rem] leading-relaxed text-fg-2"
        role="note"
        data-testid="vrm-surface-brush-capability"
      >
        <Paintbrush size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0">
          <span className="block font-bold text-fg">직접 그리기 지원 범위</span>
          {surfaceBrushUnavailableReason}
        </span>
      </div>''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    '''        <label htmlFor="vrm-surface-fill-tolerance" className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">''',
    '''        <div
          hidden={settings.tool !== "surface-brush"}
          className="space-y-3"
          data-testid="vrm-surface-brush-controls"
        >
          <label
            htmlFor="vrm-surface-brush-size"
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
          >
            <span className="font-semibold text-fg-2">크기</span>
            <input
              id="vrm-surface-brush-size"
              type="range"
              min="2"
              max="192"
              step="1"
              value={settings.sizeTexels}
              disabled={editingDisabled}
              aria-label="표면 브러시 크기"
              aria-valuetext={`${Math.round(settings.sizeTexels)} px`}
              className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) => onSettingsChange({ sizeTexels: Number(event.target.value) })}
            />
            <output
              htmlFor="vrm-surface-brush-size"
              className="text-right text-[0.68rem] tabular-nums text-fg-3"
            >
              {Math.round(settings.sizeTexels)} px
            </output>
          </label>

          <label
            htmlFor="vrm-surface-brush-opacity"
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
          >
            <span className="font-semibold text-fg-2">불투명도</span>
            <input
              id="vrm-surface-brush-opacity"
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={settings.opacity}
              disabled={editingDisabled}
              aria-label="표면 브러시 불투명도"
              aria-valuetext={`${Math.round(settings.opacity * 100)}%`}
              className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) => onSettingsChange({ opacity: Number(event.target.value) })}
            />
            <output
              htmlFor="vrm-surface-brush-opacity"
              className="text-right text-[0.68rem] tabular-nums text-fg-3"
            >
              {Math.round(settings.opacity * 100)}%
            </output>
          </label>

          <label
            htmlFor="vrm-surface-brush-flow"
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
          >
            <span className="font-semibold text-fg-2">도포량</span>
            <input
              id="vrm-surface-brush-flow"
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={settings.tuning.flow}
              disabled={editingDisabled}
              aria-label="표면 브러시 도포량"
              aria-valuetext={`${Math.round(settings.tuning.flow * 100)}%`}
              className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) =>
                onSettingsChange({ tuning: { flow: Number(event.target.value) } })}
            />
            <output
              htmlFor="vrm-surface-brush-flow"
              className="text-right text-[0.68rem] tabular-nums text-fg-3"
            >
              {Math.round(settings.tuning.flow * 100)}%
            </output>
          </label>

          <label
            htmlFor="vrm-surface-brush-hardness"
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
          >
            <span className="font-semibold text-fg-2">경도</span>
            <input
              id="vrm-surface-brush-hardness"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.tuning.hardness}
              disabled={editingDisabled}
              aria-label="표면 브러시 경도"
              aria-valuetext={`${Math.round(settings.tuning.hardness * 100)}%`}
              className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) =>
                onSettingsChange({ tuning: { hardness: Number(event.target.value) } })}
            />
            <output
              htmlFor="vrm-surface-brush-hardness"
              className="text-right text-[0.68rem] tabular-nums text-fg-3"
            >
              {Math.round(settings.tuning.hardness * 100)}%
            </output>
          </label>

          <label
            htmlFor="vrm-surface-brush-min-size"
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
          >
            <span className="font-semibold text-fg-2">최소 굵기</span>
            <input
              id="vrm-surface-brush-min-size"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.tuning.minSize}
              disabled={editingDisabled}
              aria-label="표면 브러시 최소 굵기"
              aria-valuetext={`${Math.round(settings.tuning.minSize * 100)}%`}
              className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) =>
                onSettingsChange({ tuning: { minSize: Number(event.target.value) } })}
            />
            <output
              htmlFor="vrm-surface-brush-min-size"
              className="text-right text-[0.68rem] tabular-nums text-fg-3"
            >
              {Math.round(settings.tuning.minSize * 100)}%
            </output>
          </label>

          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            현재 제품 경로는 round 촉과 혼색 없음만 지원합니다. 미지원 촉·혼색은 자동 대체하지 않습니다.
          </p>
        </div>

        <div hidden={settings.tool !== "fill"} className="space-y-3">
        <label htmlFor="vrm-surface-fill-tolerance" className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    '''        </fieldset>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">''',
    '''        </fieldset>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">''',
)

# ── Viewport feedback and keyboard workflow. ─────────────────────────────────────────────────────

replace_once(
    "src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
    '''                  cursor: texturePaintInteractionEnabled
                    ? texturePaintEyedropperActive
                      ? "crosshair"
                      : texturePaintSettings.tool === "fill"
                        ? "cell"
                        : undefined
                    : undefined,''',
    '''                  cursor: texturePaintInteractionEnabled
                    ? texturePaintEyedropperActive
                      ? "crosshair"
                      : texturePaintSettings.tool === "fill"
                        ? "cell"
                        : "crosshair"
                    : undefined,''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
    '''                  {texturePaintModeSelected
                    ? "3D 캐릭터 표면 페인트 모드입니다. 캐릭터 회전은 잠겨 있습니다. ColorDrop으로 한 번에 채우고, 스포이드 버튼 또는 Alt+클릭으로 baseColor 색상을 가져오며, 뷰포트 오른쪽의 확대·축소 버튼으로 시점을 조절하세요. 검증된 3D 표면 브러시 엔진이 연결될 때까지 브러시 그리기는 사용할 수 없습니다."
                    : "3D 캐릭터 편집 뷰포트입니다. 포인터로 끌어 캐릭터를 회전하고, 휠·핀치 또는 뷰포트 오른쪽의 확대·축소 버튼으로 시점을 조절하세요."}''',
    '''                  {texturePaintModeSelected
                    ? "3D 캐릭터 표면 페인트 모드입니다. 캐릭터 회전은 잠겨 있습니다. B로 직접 그리기, F로 ColorDrop, I로 스포이드를 선택합니다. 직접 그리기는 검증된 round 촉으로 UV 경계를 안전하게 나누고, 한 번의 제스처를 하나의 실행 취소 단계로 저장합니다."
                    : "3D 캐릭터 편집 뷰포트입니다. 포인터로 끌어 캐릭터를 회전하고, 휠·핀치 또는 뷰포트 오른쪽의 확대·축소 버튼으로 시점을 조절하세요."}''',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
    '                  aria-keyshortcuts="F I"',
    '                  aria-keyshortcuts="B F I"',
)

replace_once(
    "src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
    '''                    } else if (key === "f") {
                      event.preventDefault();
                      setTexturePaintEyedropperActive(false);
                      setTexturePaintSettings((current: StudioVrmTexturePaintPanelSettings) => ({
                        ...current,
                        tool: "fill",
                      }));
                    }''',
    '''                    } else if (key === "b") {
                      event.preventDefault();
                      setTexturePaintEyedropperActive(false);
                      setTexturePaintSettings((current: StudioVrmTexturePaintPanelSettings) => ({
                        ...current,
                        tool: "surface-brush",
                      }));
                    } else if (key === "f") {
                      event.preventDefault();
                      setTexturePaintEyedropperActive(false);
                      setTexturePaintSettings((current: StudioVrmTexturePaintPanelSettings) => ({
                        ...current,
                        tool: "fill",
                      }));
                    }''',
)

# ── Surface-tool status wins while collecting/committing/rejecting. ─────────────────────────────

replace_once(
    "src/domains/creator/vrm/useStudioVrmPoserRuntimeB.ts",
    '''  const texturePaintBrushProductBlocked =
    isStudioVrmTexturePaintBrushProductBlocked(texturePaintSettings.tool);
  const texturePaintStatus = texturePaintDisabledReason
    || texturePaintBudgetErrorStatus
    || (texturePaintBrushProductBlocked ? STUDIO_VRM_SURFACE_BRUSH_UNAVAILABLE_REASON : "")
    || texturePaintSnapshot?.error?.message''',
    '''  const texturePaintBrushProductBlocked =
    isStudioVrmTexturePaintBrushProductBlocked(texturePaintSettings.tool);
  const texturePaintSurfaceStatus =
    texturePaintSettings.tool === "surface-brush"
    && texturePaintSurfaceToolSnapshot
    && texturePaintSurfaceToolSnapshot.status !== "ready"
      ? texturePaintSurfaceToolSnapshot.message
      : "";
  const texturePaintStatus = texturePaintDisabledReason
    || texturePaintBudgetErrorStatus
    || (texturePaintBrushProductBlocked ? STUDIO_VRM_SURFACE_BRUSH_UNAVAILABLE_REASON : "")
    || texturePaintSurfaceStatus
    || texturePaintSnapshot?.error?.message''',
)

replace_once(
    "src/domains/creator/vrm/useStudioVrmPoserRuntimeB.ts",
    '''        : texturePaintSnapshot?.activeTarget
          ? "표면을 한 번 눌러 ColorDrop으로 채우세요. Ctrl/⌘+Z로 이 채우기를 되돌릴 수 있습니다."
          : "뷰포트에서 옷·피부·머리 표면을 누르면 해당 텍스처를 선택합니다.");''',
    '''        : texturePaintSnapshot?.activeTarget
          ? texturePaintSettings.tool === "surface-brush"
            ? "모델 표면을 드래그해 직접 그리세요. Ctrl/⌘+Z로 이 텍스처 획을 되돌릴 수 있습니다."
            : "표면을 한 번 눌러 ColorDrop으로 채우세요. Ctrl/⌘+Z로 이 채우기를 되돌릴 수 있습니다."
          : "뷰포트에서 옷·피부·머리 표면을 누르면 해당 텍스처를 선택합니다.");''',
)

# ── Panel behaviour tests. ───────────────────────────────────────────────────────────────────────

replace_once(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.test.tsx",
    '''const SURFACE_BRUSH_UNAVAILABLE_REASON =
  "검증·승인된 3D 표면 브러시 엔진이 아직 연결되지 않아 브러시 그리기를 사용할 수 없습니다. 자체 라운드 촉으로 대체하지 않으며, 현재는 ColorDrop과 스포이드를 사용할 수 있습니다.";''',
    '''const SURFACE_BRUSH_UNAVAILABLE_REASON =
  "검증된 round 촉 기반 3D 표면 브러시입니다. 필압·크기·불투명도·경도는 로컬 UV atlas에 반영되며, stamp/image 촉과 wet/smudge 혼색은 아직 지원하지 않습니다.";''',
)

replace_test(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.test.tsx",
    "keeps admitted one-shot tools live while the surface brush is explicitly unavailable",
    '''  it("switches between the direct surface brush and ColorDrop", () => {
    const { props, rerender } = renderPanel();
    const surface = screen.getByRole("button", { name: "표면 브러시" });
    const fill = screen.getByRole("button", { name: "ColorDrop" });

    expect(surface.className).toContain("min-h-11");
    expect(fill.className).toContain("min-h-11");
    expect((surface as HTMLButtonElement).disabled).toBe(false);
    expect(surface.getAttribute("aria-pressed")).toBe("false");
    expect(fill.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(surface);
    expect(props.onSettingsChange).toHaveBeenCalledWith({ tool: "surface-brush" });

    rerender(
      <StudioVrmTexturePaintPanel
        {...props}
        settings={{ ...SETTINGS, tool: "surface-brush" }}
      />,
    );
    expect(screen.getByRole("button", { name: "표면 브러시" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "ColorDrop" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByTestId("vrm-surface-brush-controls").hasAttribute("hidden")).toBe(false);
    expect(screen.queryByRole("slider", { name: "ColorDrop 색상 허용치" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ColorDrop" }));
    expect(props.onSettingsChange).toHaveBeenLastCalledWith({ tool: "fill" });
  });''',
)

replace_test(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.test.tsx",
    "fails every unadmitted brush family closed without misleading engine claims",
    '''  it("exposes only the admitted round surface-brush controls", () => {
    const { props } = renderPanel({
      settings: { ...SETTINGS, tool: "surface-brush" },
    });

    const capability = screen.getByTestId("vrm-surface-brush-capability");
    expect(capability.textContent).toContain("직접 그리기 지원 범위");
    expect(capability.textContent).toContain(SURFACE_BRUSH_UNAVAILABLE_REASON);
    for (const label of ["호환", "잉크", "연필", "에어", "수채", "곱하기", "지우개"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }

    fireEvent.change(screen.getByRole("slider", { name: "표면 브러시 크기" }), {
      target: { value: "96" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "표면 브러시 불투명도" }), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "표면 브러시 도포량" }), {
      target: { value: "0.4" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "표면 브러시 경도" }), {
      target: { value: "0.3" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "표면 브러시 최소 굵기" }), {
      target: { value: "0.1" },
    });

    expect(props.onSettingsChange).toHaveBeenNthCalledWith(1, { sizeTexels: 96 });
    expect(props.onSettingsChange).toHaveBeenNthCalledWith(2, { opacity: 0.5 });
    expect(props.onSettingsChange).toHaveBeenNthCalledWith(3, { tuning: { flow: 0.4 } });
    expect(props.onSettingsChange).toHaveBeenNthCalledWith(4, { tuning: { hardness: 0.3 } });
    expect(props.onSettingsChange).toHaveBeenNthCalledWith(5, { tuning: { minSize: 0.1 } });
    expect(screen.queryByRole("slider", { name: "ColorDrop 색상 허용치" })).toBeNull();
  });''',
)

replace_test(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.test.tsx",
    "disables every ColorDrop editing control while texture work is busy",
    '''  it("disables every surface editing control while texture work is busy", () => {
    const { props, rerender } = renderPanel({
      settings: { ...SETTINGS, tool: "fill" },
      strokeActive: true,
    });

    for (const label of ["표면 브러시", "ColorDrop", "연결 영역", "텍스처 전체"]) {
      expect(screen.getByRole("button", { name: label }).matches(":disabled")).toBe(true);
    }
    expect(
      (screen.getByRole("slider", { name: "ColorDrop 색상 허용치" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);

    rerender(
      <StudioVrmTexturePaintPanel
        {...props}
        settings={{ ...SETTINGS, tool: "surface-brush" }}
      />,
    );
    for (const label of [
      "표면 브러시 크기",
      "표면 브러시 불투명도",
      "표면 브러시 도포량",
      "표면 브러시 경도",
      "표면 브러시 최소 굵기",
    ]) {
      expect((screen.getByRole("slider", { name: label }) as HTMLInputElement).disabled).toBe(true);
    }
    expect((screen.getByLabelText("표면 페인트 색상 선택") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText("표면 페인트 HEX 색상") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(props.onSettingsChange).not.toHaveBeenCalled();
  });''',
)

replace_test(
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.test.tsx",
    "does not expose legacy brush, blend, or pressure-style mutations",
    '''  it("does not expose legacy brush-family or blend mutations", () => {
    const { props } = renderPanel();

    for (const label of ["잉크", "연필", "에어", "수채", "일반", "곱하기", "지우개"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    for (const label of [
      "표면 브러시 크기",
      "표면 브러시 불투명도",
      "표면 브러시 도포량",
      "표면 브러시 경도",
      "표면 브러시 최소 굵기",
    ]) {
      expect(screen.queryByRole("slider", { name: label })).toBeNull();
    }
    fireEvent.change(screen.getByLabelText("표면 페인트 색상 선택"), {
      target: { value: "#ff8800" },
    });

    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: "#ff8800" });
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onEyedropperToggle).not.toHaveBeenCalled();
  });''',
)

# ── Source-contract tests: quarantine only legacy brush and require the full direct path. ────────

product_boundary = '''import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioPageCompositionSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";

import { readStudioVrmPoserImplementationSource } from "./studio-vrm-poser-implementation-source";

const poserSource = readStudioVrmPoserImplementationSource();
const pageSource = readStudioPageCompositionSource();
const toolSource = readFileSync(
  new URL("./studio-vrm-surface-paint-tool.ts", import.meta.url),
  "utf8",
);
const adapterSource = readFileSync(
  new URL("./studio-vrm-surface-brush-provider.ts", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("./StudioVrmTexturePaintPanel.tsx", import.meta.url),
  "utf8",
);

function between(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("VRM V12 surface-paint product boundary", () => {
  it("wires the admitted round surface tool into the strict product pointer path", () => {
    const begin = between(
      poserSource,
      "const beginTexturePaint =",
      "const moveTexturePaint =",
    );

    expect(poserSource).toContain('from "./studio-vrm-surface-paint-tool"');
    expect(poserSource).toContain("createStudioVrmSurfacePaintTool({");
    expect(begin).toContain("isStudioVrmTexturePaintBrushProductBlocked(settings.tool)");
    expect(begin).toContain('settings.tool !== "surface-brush"');
    expect(begin).toContain("texturePaintSurfaceTool.begin({");
    expect(begin).not.toContain("runtime.beginStroke({");
    expect(begin).toContain("sizeCssPixels: settings.sizeTexels");
    expect(begin).toContain("flow: settings.tuning.flow");
    expect(begin).toContain('studioVrmSurfacePaintPointerSample(');
    expect(begin).toContain("texturePaintSurfacePointerIdRef.current = event.pointerId");
    expect(begin).toContain("captureTarget.setPointerCapture(event.pointerId)");
    expect(poserSource).toContain("onPointerDown={beginTexturePaint}");
    expect(poserSource).toContain("onPointerMove={moveTexturePaint}");
    expect(poserSource).toContain("onPointerUp={finishTexturePaint}");
    expect(panelSource).toContain('onSettingsChange({ tool: "surface-brush" })');
    expect(panelSource).not.toContain('onSettingsChange({ tool: "brush" })');
    expect(pageSource).not.toContain("studio-vrm-surface-paint-tool");
  });

  it("keeps lifecycle exits abortable and the atlas commit canonical-once", () => {
    for (const reason of [
      "pointer-leave",
      "pointer-cancel",
      "lost-capture",
      "window-blur",
      "device-failure",
      "disabled",
      "tool-change",
      "unmount",
    ]) {
      expect(poserSource).toContain(`"${reason}"`);
    }
    expect(poserSource).toContain('addEventListener("webglcontextlost"');
    expect(toolSource.match(/await this\.executeStroke\(\{/gu)).toHaveLength(1);
    expect(toolSource).toContain("maxOperations: this.maxOperations");
    expect(adapterSource).toContain("commit: true");
    expect(adapterSource).toContain("commitSurfaceBrushSession(this.session");
  });

  it("fails closed without selecting an alternate brush for the same operation", () => {
    expect(toolSource).not.toContain('fallback: "round-tip"');
    expect(toolSource).not.toContain('route: "round-tip-fallback"');
    expect(toolSource).not.toContain("호환 라운드 브러시로 처리합니다");
    expect(toolSource).toContain("automaticAlternateBrushSelectionAllowed: false");
    expect(toolSource).toContain('sourceState: "preserved"');
    expect(toolSource).toContain('lastCommit: "preserved"');
    expect(toolSource).toContain('nextOperation: "select-provider-or-tool"');
    expect(toolSource).toContain('status: "unavailable"');
    expect(toolSource).toContain('status: "rejected"');
  });

  it("preserves pressure and tilt IR while retaining seam-safe measured projection", () => {
    expect(toolSource).toContain("modelRawInput(");
    expect(toolSource).toContain("pressure: sample.pressure");
    expect(toolSource).toContain("tiltXDeg: sample.tiltX");
    expect(toolSource).toContain("tiltYDeg: sample.tiltY");
    expect(toolSource).toContain("brushProgram: built.brushProgram");
    expect(toolSource).toContain("stroke: built.stroke");
    expect(adapterSource).toContain("projection.islandId");
    expect(adapterSource).toContain("seamBefore: true");
    expect(adapterSource).toContain("worldUnitsPerCssPixelBySample");
    expect(poserSource).toContain("studioVrmSurfacePaintWorldUnitsPerCssPixel(");
  });

  it("publishes an honest capability note without interactive readback", () => {
    expect(panelSource).toContain("직접 그리기 지원 범위");
    expect(panelSource).toContain("surfaceBrushUnavailableReason");
    expect(panelSource).toContain('data-testid="vrm-surface-brush-controls"');
    expect(poserSource).toContain("검증된 round 촉 기반 3D 표면 브러시입니다");
    expect(poserSource).toContain("stamp/image 촉과 wet/smudge 혼색은 아직 지원하지 않습니다");
    expect(poserSource).toContain('return tool === "brush"');
    expect(panelSource).not.toContain('onSettingsChange({ tool: "brush" })');
    expect(toolSource).toContain('code: "memory"');
    expect(toolSource).toContain('code: "upload"');
    expect(toolSource).toContain('deviceFailure ? "device-failure" : null');
    expect(`${poserSource}\n${toolSource}\n${adapterSource}`).not.toMatch(
      /\breadPixels\s*\(|\bgetImageData\s*\(/u,
    );
  });
});
'''
write(
    "src/domains/creator/vrm/studio-vrm-surface-paint-product-boundary.test.ts",
    product_boundary,
)

integration_path = "src/domains/creator/vrm/studio-vrm-texture-paint-integration-boundary.test.ts"
replace_once(
    integration_path,
    '''    expect(panelSource).toContain("표면 브러시 준비 중");
    expect(panelSource).not.toContain('onSettingsChange({ tool: "brush" })');''',
    '''    expect(panelSource).toContain("직접 그리기 지원 범위");
    expect(panelSource).toContain('onSettingsChange({ tool: "surface-brush" })');
    expect(panelSource).not.toContain('onSettingsChange({ tool: "brush" })');''',
)

replace_test(
    integration_path,
    "blocks brush pointer ownership before either surface or legacy mutation path",
    '''  it("admits the round surface tool before legacy mutation paths", () => {
    const productGuard = sourceBetween(
      poserSource,
      "function isStudioVrmTexturePaintBrushProductBlocked(",
      "const DEFAULT_STUDIO_VRM_TEXTURE_PAINT_SETTINGS",
    );
    const down = poserSource.indexOf("const beginTexturePaint =");
    const move = poserSource.indexOf("const moveTexturePaint =", down);
    const finish = poserSource.indexOf("const finishTexturePaint =", move);
    const cancel = poserSource.indexOf("const cancelTexturePaint =", finish);
    const primitive = poserSource.indexOf("<primitive", cancel);
    const primitiveEnd = poserSource.indexOf("/>", primitive);
    const begin = poserSource.slice(down, move);
    const moveSource = poserSource.slice(move, finish);
    const primitiveSource = poserSource.slice(primitive, primitiveEnd + 2);

    expect(down).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(down);
    expect(finish).toBeGreaterThan(move);
    expect(cancel).toBeGreaterThan(finish);
    expect(primitive).toBeGreaterThan(cancel);
    expect(primitiveEnd).toBeGreaterThan(primitive);
    expect(productGuard).toContain('return tool === "brush"');
    expect(productGuard).not.toContain('tool === "surface-brush" ||');
    expect(begin).toContain("isStudioVrmTexturePaintBrushProductBlocked(settings.tool)");
    expect(begin).toContain('settings.tool !== "surface-brush"');
    expect(begin).toContain("texturePaintSurfaceTool.begin({");
    expect(begin).not.toContain("runtime.beginStroke({");
    expect(begin).toContain("texturePaintSurfacePointerIdRef.current = event.pointerId");
    expect(begin).toContain("captureTarget.setPointerCapture(event.pointerId)");
    expect(moveSource).toContain("texturePaintSurfaceTool.append(");
    expect(poserSource.slice(finish, cancel)).toContain(
      "finishTexturePaintSurfaceRef.current(event.pointerId)",
    );
    expect(poserSource).toContain(
      'window.addEventListener("pointerup", finishMatchingPointer, { passive: true })',
    );
    expect(poserSource).toContain(
      'window.addEventListener("pointercancel", cancelMatchingPointer, { passive: true })',
    );
    expect(poserSource).toContain(
      'gl.domElement.addEventListener("lostpointercapture", cancelLostPointerCapture)',
    );
    expect(poserSource).toContain('cancelTexturePaintSurface("lost-capture", event.pointerId)');
    expect(poserSource).toContain('window.addEventListener("blur", cancelOnWindowBlur)');
    expect(primitiveSource).toContain("onPointerCancel={cancelTexturePaint}");
    expect(primitiveSource).toContain("onLostPointerCapture={cancelTexturePaint}");
  });''',
)

replace_exact_count(
    integration_path,
    '    expect(begin).not.toContain("texturePaintSurfaceTool.begin({");',
    '    expect(begin).toContain("texturePaintSurfaceTool.begin({");',
    2,
)

replace_test(
    integration_path,
    "keeps idle and eyedropper guidance aligned with the selected tool",
    '''  it("keeps direct-brush, ColorDrop, and eyedropper guidance aligned", () => {
    expect(poserSource).toContain(
      "스포이드가 준비됐습니다. 캐릭터 표면을 한 번 누르면 색상만 가져오고 ColorDrop으로 돌아갑니다.",
    );
    expect(poserSource).toContain(
      "표면을 한 번 눌러 ColorDrop으로 채우세요. Ctrl/⌘+Z로 이 채우기를 되돌릴 수 있습니다.",
    );
    expect(poserSource).toContain(
      "모델 표면을 드래그해 직접 그리세요. Ctrl/⌘+Z로 이 텍스처 획을 되돌릴 수 있습니다.",
    );
    expect(poserSource).toContain("STUDIO_VRM_SURFACE_BRUSH_UNAVAILABLE_REASON");
    expect(poserSource).toContain("texturePaintSurfaceToolSnapshot.message");
  });''',
)

replace_test(
    integration_path,
    "offers an accessible F shortcut that selects ColorDrop without re-enabling a brush",
    '''  it("offers accessible B, F, and I surface-tool shortcuts", () => {
    const keyboard = sourceBetween(
      poserSource,
      'aria-keyshortcuts="B F I"',
      "camera={{",
    );
    const keyNormalization = requiredIndex(
      keyboard,
      "const key = event.key.toLowerCase()",
    );
    const brushShortcut = requiredIndex(
      keyboard,
      'else if (key === "b")',
      keyNormalization,
    );
    const fillShortcut = requiredIndex(
      keyboard,
      'else if (key === "f")',
      brushShortcut,
    );

    expect(keyboard).toContain("!texturePaintInteractionEnabled");
    expect(keyboard).toContain("texturePaintStrokeActive");
    expect(keyboard).toContain("event.metaKey");
    expect(keyboard).toContain("event.ctrlKey");
    expect(keyboard).toContain("event.altKey");
    expect(brushShortcut).toBeGreaterThan(keyNormalization);
    expect(fillShortcut).toBeGreaterThan(brushShortcut);
    expect(keyboard.slice(brushShortcut, fillShortcut)).toContain("event.preventDefault()");
    expect(keyboard.slice(brushShortcut, fillShortcut)).toContain(
      "setTexturePaintEyedropperActive(false)",
    );
    expect(keyboard.slice(brushShortcut, fillShortcut)).toContain(
      'tool: "surface-brush"',
    );
    expect(keyboard.slice(fillShortcut)).toContain('tool: "fill"');
  });''',
)

# The runtime itself is provider-neutral; update its product-boundary fixture to quarantine only the
# old stamp-brush state through the real guard.
runtime_test_path = "src/domains/creator/vrm/studio-vrm-texture-paint-runtime.test.ts"
replace_once(
    runtime_test_path,
    '''  it("leaves texture bytes, dirty uploads, revision, and Undo untouched for blocked product brushes", async () => {''',
    '''  it("leaves texture bytes, dirty uploads, revision, and Undo untouched for the legacy brush", async () => {''',
)

replace_once(
    runtime_test_path,
    '''    const attemptProductBrush = async (tool: "surface-brush" | "brush") => {
      if (tool === "surface-brush" || tool === "brush") return;
      unwrap(await runtime.beginStroke({ pointerId: 91, hit: hit(mesh), style: INK }));
      unwrap(runtime.commitStroke(91));
    };

    await attemptProductBrush("surface-brush");
    await attemptProductBrush("brush");''',
    '''    const attemptProductBrush = async (tool: "surface-brush" | "brush") => {
      if (tool === "brush") return;
      unwrap(await runtime.beginStroke({ pointerId: 91, hit: hit(mesh), style: INK }));
      unwrap(runtime.commitStroke(91));
    };

    await attemptProductBrush("brush");''',
)

# ── Sanity checks before the workflow spends time installing dependencies. ──────────────────────

changed_files = [
    "src/domains/creator/vrm/StudioVrmPoserTypes.ts",
    "src/domains/creator/vrm/StudioVrmActor.tsx",
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx",
    "src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
    "src/domains/creator/vrm/useStudioVrmPoserRuntimeB.ts",
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.test.tsx",
    "src/domains/creator/vrm/studio-vrm-surface-paint-product-boundary.test.ts",
    "src/domains/creator/vrm/studio-vrm-texture-paint-integration-boundary.test.ts",
    "src/domains/creator/vrm/studio-vrm-texture-paint-runtime.test.ts",
]

combined = "\n".join(read(path) for path in changed_files)
for stale in [
    "검증·승인된 3D 표면 브러시 엔진이 아직 연결되지 않아",
    'return tool === "surface-brush" || tool === "brush"',
    'aria-keyshortcuts="F I"',
    "표면 브러시 준비 중",
]:
    if stale in combined:
        raise RuntimeError(f"stale quarantine marker remains: {stale}")

required = {
    "src/domains/creator/vrm/StudioVrmActor.tsx": [
        "texturePaintSurfaceTool.begin({",
        "texturePaintSurfacePointerIdRef.current = event.pointerId",
        "captureTarget.setPointerCapture(event.pointerId)",
    ],
    "src/domains/creator/vrm/StudioVrmTexturePaintPanel.tsx": [
        'onSettingsChange({ tool: "surface-brush" })',
        'data-testid="vrm-surface-brush-controls"',
        "표면 브러시 최소 굵기",
    ],
    "src/domains/creator/vrm/StudioVrmPoserViewport.tsx": [
        'aria-keyshortcuts="B F I"',
        'tool: "surface-brush"',
    ],
}
for path, markers in required.items():
    source = read(path)
    for marker in markers:
        if marker not in source:
            raise RuntimeError(f"{path}: missing required marker {marker!r}")

print("Applied Shaper-inspired direct VRM surface-paint product wiring:")
for path in changed_files:
    print(f" - {path}")
