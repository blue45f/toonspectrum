/**
 * Reference-driven color harmonization panel.
 * User-facing language follows ToonStudio's task vocabulary rather than competitor labels.
 */

import {
  Check,
  Eye,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  applyStudioReferenceImageColorMatch,
  type StudioAdvancedColorRgbaImage,
} from "./studio-advanced-color-filter-kernels";
import {
  COLOR_MATCH_PRESETS,
  createSyntheticReferenceRgba,
} from "./studio-color-match-presets";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioColorMatchPanelProps {
  readonly sourceImage?: StudioAdvancedColorRgbaImage | null;
  readonly onApply?: (matchedImage: StudioAdvancedColorRgbaImage) => void;
  readonly onApplyDataUrl?: (dataUrl: string) => void;
  readonly className?: string;
}

export function StudioColorMatchPanel({
  sourceImage = null,
  onApply,
  onApplyDataUrl,
  className,
}: StudioColorMatchPanelProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("warm-sunset");
  const [customRefImage, setCustomRefImage] =
    useState<StudioAdvancedColorRgbaImage | null>(null);
  const [customRefName, setCustomRefName] = useState<string | null>(null);

  const [strengthPercent, setStrengthPercent] = useState<number>(80);
  const [clipSigma, setClipSigma] = useState<number>(2.5);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [showSplitView, setShowSplitView] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active reference image: custom uploaded image or synthetic preset
  const activeReferenceImage = useMemo<StudioAdvancedColorRgbaImage>(() => {
    if (customRefImage) return customRefImage;
    const preset =
      COLOR_MATCH_PRESETS.find((p) => p.id === selectedPresetId) ??
      COLOR_MATCH_PRESETS[0];
    return createSyntheticReferenceRgba(preset.sampleColors, 64);
  }, [customRefImage, selectedPresetId]);

  // Compute matched result
  const matchResult = useMemo<StudioAdvancedColorRgbaImage | null>(() => {
    if (!sourceImage) return null;
    try {
      const outcome = applyStudioReferenceImageColorMatch({
        source: sourceImage,
        reference: activeReferenceImage,
        options: {
          strength: strengthPercent / 100,
          clipSigma,
          minimumStandardDeviation: 1.0,
        },
      });
      return outcome.status === "applied" ? outcome.image : null;
    } catch {
      return null;
    }
  }, [sourceImage, activeReferenceImage, strengthPercent, clipSigma]);

  // Handle custom image file upload
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 128;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          setCustomRefImage(
            Object.freeze({
              width: w,
              height: h,
              data: imgData.data,
            }),
          );
          setCustomRefName(file.name);
        }
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    },
    [],
  );

  const handleApplyCommit = () => {
    if (!matchResult) return;
    if (onApply) {
      onApply(matchResult);
    }
    if (onApplyDataUrl) {
      const canvas = document.createElement("canvas");
      canvas.width = matchResult.width;
      canvas.height = matchResult.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imgData = ctx.createImageData(matchResult.width, matchResult.height);
        imgData.data.set(matchResult.data);
        ctx.putImageData(imgData, 0, 0);
        onApplyDataUrl(canvas.toDataURL("image/png"));
      }
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm",
        className,
      )}
      data-testid="studio-color-match-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-fg-2">
          <Sparkles size={15} className="text-accent" aria-hidden />
          <span>색감 맞추기</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSplitView(!showSplitView)}
          className={buttonClass({
            size: "sm",
            variant: showSplitView ? "solid" : "ghost",
            className: cn(
              "h-6 px-2 text-[11px] gap-1",
              showSplitView ? "border-accent/45 bg-accent-soft text-fg" : "text-fg-3 hover:bg-raised hover:text-fg",
            ),
          })}
          title="원본과 결과를 나눠 비교"
        >
          <Eye size={12} />
          <span>{showSplitView ? "비교 보기" : "한 화면"}</span>
        </button>
      </div>

      {/* Description */}
      <p className="text-[11px] leading-relaxed text-fg-3">
        참고 이미지나 분위기를 기준으로 현재 그림의 색감을 자연스럽게 맞춥니다.
      </p>

      {/* Preset Mood Selector */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-fg-2">참고 색감</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-fg"
          >
            <Upload size={12} />
            <span>사진으로 맞추기</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {customRefName && (
          <div className="flex items-center justify-between rounded-lg border border-accent/35 bg-accent-soft/25 px-2 py-1 text-[11px] text-fg-2">
            <span className="truncate max-w-[200px]">
              사용자 이미지: {customRefName}
            </span>
            <button
              type="button"
              onClick={() => {
                setCustomRefImage(null);
                setCustomRefName(null);
              }}
              className="text-[10px] text-fg-3 hover:text-fg"
            >
              초기화
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {COLOR_MATCH_PRESETS.map((preset) => {
            const isSelected =
              !customRefImage && selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setCustomRefImage(null);
                  setCustomRefName(null);
                  setSelectedPresetId(preset.id);
                }}
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded border text-left transition-colors",
                  isSelected
                    ? "border-accent/55 bg-accent-soft/35 text-fg"
                    : "border-line/70 bg-panel/45 text-fg-2 hover:bg-raised",
                )}
              >
                <div
                  className="size-5 shrink-0 rounded-full border border-line/70 shadow-sm"
                  style={{ background: preset.previewGradient }}
                />
                <div className="flex flex-col truncate">
                  <span className="font-medium text-[11px] truncate">
                    {preset.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Adjustments Controls */}
      <div className="flex flex-col gap-2.5 border-t border-line/60 pt-2">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-fg-3">적용 강도</span>
            <span className="font-semibold tabular-nums text-fg-2">{strengthPercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={strengthPercent}
            aria-label="색감 적용 강도"
            onChange={(e) => setStrengthPercent(Number(e.target.value))}
            className="h-6 w-full cursor-pointer accent-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-fg-3">색 변화 범위</span>
            <span className="font-semibold tabular-nums text-fg-2">{clipSigma.toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={1.0}
            max={4.0}
            step={0.1}
            value={clipSigma}
            aria-label="색 변화 범위"
            onChange={(e) => setClipSigma(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
        </div>

        {showSplitView && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-fg-3">비교 위치</span>
              <span className="font-semibold tabular-nums text-fg-2">{splitPercent}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={splitPercent}
              aria-label="원본 비교 위치"
              onChange={(e) => setSplitPercent(Number(e.target.value))}
              className="h-6 w-full cursor-pointer accent-accent"
            />
          </div>
        )}
      </div>

      {/* Commit Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-2">
        <button
          type="button"
          onClick={() => {
            setStrengthPercent(80);
            setClipSigma(2.5);
            setSplitPercent(50);
          }}
          className={buttonClass({
            size: "sm",
            variant: "ghost",
            className: "h-7 gap-1 px-2 text-[11px] text-fg-3 hover:bg-raised hover:text-fg",
          })}
        >
          <RefreshCw size={11} />
          <span>재설정</span>
        </button>

        <button
          type="button"
          onClick={handleApplyCommit}
          disabled={!matchResult}
          className={buttonClass({
            size: "sm",
            variant: "solid",
            className: cn(
              "h-7 px-3 text-[11px] font-medium gap-1.5",
              matchResult
                ? "bg-accent text-on-accent hover:bg-accent-2"
                : "cursor-not-allowed bg-raised text-fg-3",
            ),
          })}
        >
          <Check size={13} />
          <span>색감 적용</span>
        </button>
      </div>
    </div>
  );
}
