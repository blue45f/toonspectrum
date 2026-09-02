import { Download, Layers, CheckSquare, Square } from "lucide-react";
import React, { useState } from "react";

import {
  WEBTOON_RENDER_PASSES,
  planMultiPassExport,
  type MultiPassExportConfig,
} from "../scene-3d/studio-3d-webtoon-multipass-exporter";

export interface StudioBg3dMultiPassExporterPanelProps {
  readonly onStartMultiPassExport?: (config: MultiPassExportConfig) => void;
}

export function StudioBg3dMultiPassExporterPanel({
  onStartMultiPassExport,
}: StudioBg3dMultiPassExporterPanelProps): React.JSX.Element {
  const [config, setConfig] = useState<MultiPassExportConfig>({
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    transparentBackground: true,
    includeLineArt: true,
    includeFlatColor: true,
    includeShadow: true,
    includeHighlight: true,
    includeDepthMap: false,
    includeObjectIdMask: true,
    format: "png-zip",
  });

  const planned = planMultiPassExport(config);

  const togglePass = (key: keyof MultiPassExportConfig) => {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Layers className="size-4 text-accent" />
          <span>멀티패스 레이어 자동 분리 내보내기</span>
        </div>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.68rem] text-accent font-semibold">
          {planned.totalPasses}개 레이어 / ~{planned.estimatedFileSizeMb}MB
        </span>
      </div>

      {/* Pass Checklist */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.68rem] font-medium text-fg-3">추출할 웹툰 렌더 패스 선택</span>
        <div className="flex flex-col gap-1">
          {WEBTOON_RENDER_PASSES.map((pass) => {
            let isChecked = false;
            let configKey: keyof MultiPassExportConfig = "includeLineArt";

            if (pass.kind === "line-art") {
              isChecked = config.includeLineArt;
              configKey = "includeLineArt";
            } else if (pass.kind === "flat-color") {
              isChecked = config.includeFlatColor;
              configKey = "includeFlatColor";
            } else if (pass.kind === "shadow-ambient") {
              isChecked = config.includeShadow;
              configKey = "includeShadow";
            } else if (pass.kind === "specular-highlight") {
              isChecked = config.includeHighlight;
              configKey = "includeHighlight";
            } else if (pass.kind === "depth-map") {
              isChecked = config.includeDepthMap;
              configKey = "includeDepthMap";
            } else if (pass.kind === "object-id-mask") {
              isChecked = config.includeObjectIdMask;
              configKey = "includeObjectIdMask";
            }

            return (
              <button
                key={pass.kind}
                type="button"
                onClick={() => togglePass(configKey)}
                className={`flex items-start gap-2 rounded-lg border p-2 text-left transition-all ${
                  isChecked
                    ? "border-accent/80 bg-accent/5 text-fg"
                    : "border-line bg-card text-fg-3 opacity-60 hover:opacity-100"
                }`}
              >
                {isChecked ? (
                  <CheckSquare className="size-4 text-accent shrink-0 mt-0.5" />
                ) : (
                  <Square className="size-4 text-fg-3 shrink-0 mt-0.5" />
                )}
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[0.72rem]">{pass.layerName}</span>
                    <span className="rounded bg-raised px-1 py-0.2 font-mono text-[0.6rem] text-fg-2">
                      {pass.blendMode.toUpperCase()}
                    </span>
                  </div>
                  <span className="mt-0.5 text-[0.62rem] text-fg-3">{pass.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution & Format Settings */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.68rem] text-fg-2">내보내기 규격:</span>
          <div className="flex gap-1">
            {[
              { label: "웹툰 FHD (1080p)", w: 1920, h: 1080 },
              { label: "원고 4K (2160p)", w: 3840, h: 2160 },
            ].map((res) => (
              <button
                key={res.label}
                type="button"
                onClick={() => setConfig({ ...config, resolutionWidth: res.w, resolutionHeight: res.h })}
                className={`rounded px-1.5 py-0.5 text-[0.65rem] font-bold ${
                  config.resolutionWidth === res.w
                    ? "bg-accent text-accent-fg"
                    : "border border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[0.68rem] text-fg-2">저장 포맷:</span>
          <div className="flex gap-1">
            {(["png-zip", "psd", "clip-studio-layers"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setConfig({ ...config, format: fmt })}
                className={`rounded px-1.5 py-0.5 font-mono text-[0.65rem] uppercase ${
                  config.format === fmt
                    ? "bg-accent text-accent-fg font-bold"
                    : "border border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {fmt === "png-zip" ? "ZIP(PNG)" : fmt === "psd" ? "PSD" : "CLIP"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onStartMultiPassExport?.(config)}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.72rem] font-bold text-accent-fg shadow-sm transition-all hover:bg-accent/90"
      >
        <Download className="size-3.5" />
        <span>레이어별 패스 렌더링 & 다운로드 시작</span>
      </button>
    </div>
  );
}
