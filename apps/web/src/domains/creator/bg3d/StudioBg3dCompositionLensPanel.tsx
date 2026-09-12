import { useState } from "react";

import { STUDIO_BG3D_CONTROL_BUTTON, studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import { STUDIO_BG3D_COMPOSITION_LENSES } from "./studio-bg3d-lens-composition";
import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";

export function StudioBg3dCompositionLensPanel({ disabled = false }: { readonly disabled?: boolean }) {
  const runtime = useStudioBg3dProSuiteRuntime();
  const [preserveSubjectSize, setPreserveSubjectSize] = useState(true);
  const [compositionError, setCompositionError] = useState<string | null>(null);
  const camera = runtime?.baseCamera;
  const locked = disabled || !runtime || runtime.disabled;
  const orthographic = camera?.projection === "orthographic";

  return (
    <section className="space-y-3" aria-label="장면 구도와 화각">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">장면 구도와 화각</h3>
        {camera && <output className="text-xs tabular-nums text-fg-2" aria-label="현재 화각">{camera.fovDegrees.toFixed(1)}°</output>}
      </div>
      <p className="text-xs leading-relaxed text-fg-2">현재 바라보는 지점을 중심으로 구도를 바꿉니다. 변경은 장면에 저장되며 실행 취소할 수 있습니다.</p>
      {orthographic && <p role="status" className="rounded-lg border border-line p-3 text-xs text-fg-2">평행 투영에서는 화각을 바꾸지 않습니다. 카메라 · 환경에서 원근 투영을 선택하세요.</p>}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-fg-2">
        <input type="checkbox" className="size-4 accent-accent" checked={preserveSubjectSize} disabled={locked || orthographic} onChange={(event) => { setPreserveSubjectSize(event.target.checked); setCompositionError(null); }} />
        피사체 크기를 유지하며 거리 조절
      </label>
      <div className="grid grid-cols-2 gap-2">
        {STUDIO_BG3D_COMPOSITION_LENSES.map((lens) => {
          const selected = !orthographic && camera !== undefined && Math.abs(camera.fovDegrees - lens.fov) < 0.01;
          return (
            <button key={lens.fov} type="button" disabled={locked || !camera || orthographic || !runtime?.onComposeLens} aria-pressed={selected}
              title={lens.description}
              className={cx(STUDIO_BG3D_CONTROL_BUTTON, "flex-col items-start text-left", selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg hover:bg-raised")}
              onClick={() => { if (!locked && runtime?.onComposeLens) setCompositionError(runtime.onComposeLens(lens.fov, preserveSubjectSize)); }}>
              <span>{lens.label} <span className="tabular-nums">{lens.fov}°</span></span>
              <span className="text-[0.68rem] font-normal leading-relaxed text-fg-2">{lens.description}</span>
            </button>
          );
        })}
      </div>
      {compositionError && <p role="alert" className="text-xs leading-relaxed text-warn">{compositionError}</p>}
      <p className="text-[0.68rem] leading-relaxed text-fg-3">크기 유지는 초점 지점 깊이를 기준으로 합니다. 앞뒤에 떨어진 인물과 배경의 크기는 원근에 따라 달라집니다.</p>
      {runtime?.sceneSummary && <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
        <button type="button" className={cx(STUDIO_BG3D_CONTROL_BUTTON, "border-line bg-card text-fg")}
          disabled={locked || !runtime.onSetLineArtPreview} aria-pressed={runtime.sceneSummary.lineArtPreview}
          onClick={() => { if (!locked) runtime.onSetLineArtPreview?.(!runtime.sceneSummary?.lineArtPreview); }}>선화 확인</button>
        <button type="button" className={cx(STUDIO_BG3D_CONTROL_BUTTON, "border-line bg-card text-fg")}
          disabled={locked || !runtime.onSetTransparentBackground} aria-pressed={runtime.sceneSummary.transparentBackground}
          onClick={() => { if (!locked) runtime.onSetTransparentBackground?.(!runtime.sceneSummary?.transparentBackground); }}>투명 배경</button>
      </div>}
      <button type="button" className={cx(STUDIO_BG3D_CONTROL_BUTTON, "w-full border-accent bg-accent text-on-accent")} disabled={locked}
        onClick={() => { if (!locked) runtime?.onCaptureCurrentShot(); }}>이 구도를 컷으로 저장</button>
    </section>
  );
}
