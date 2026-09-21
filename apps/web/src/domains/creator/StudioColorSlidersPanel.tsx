import { StudioColorChannelInput } from "./color/StudioColorChannelInput";
/**
 * StudioColorSlidersPanel.tsx
 *
 * Professional Precision Sliders Panel for Studio Color Picker.
 * Features:
 * - RGB, HSV/HSB, HSL, device CMYK, and CIELAB color space sliders.
 * - Dynamic live-updating gradient slider tracks reflecting current channels.
 * - Exact numerical inputs and slider controls.
 * - High-definition visual tracks and badge labels.
 */

import { useId, useState } from "react";

import { StudioHslCmykSliders } from "./StudioHslCmykSliders";

import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  rgbToHex,
  type HsvColor,
  type RgbColor,
} from "./studio-color-harmony-engine";
import { formatLabString, hexToLab, labToHex, type StudioLabColor } from "./studio-lab-color";

export interface StudioColorSlidersPanelProps {
  readonly value: string;
  readonly onChange: (hex: string) => void;
}

export function StudioColorSlidersPanel({
  value,
  onChange,
}: StudioColorSlidersPanelProps) {
  const [colorSpace, setColorSpace] = useState<"rgb" | "hsv" | "hsl" | "cmyk" | "lab">("rgb");
  const panelId = useId();

  const rgb: RgbColor = hexToRgb(value);
  const normalized = rgbToHex(rgb.r, rgb.g, rgb.b);
  const [hsvDraft, setHsvDraft] = useState(() => ({ hex: normalized, channels: hexToHsv(normalized) }));
  const [labDraft, setLabDraft] = useState(() => ({ hex: normalized, channels: hexToLab(normalized) }));
  const currentHsv = hsvDraft.hex === normalized ? hsvDraft : { hex: normalized, channels: hexToHsv(normalized) };
  const currentLab = labDraft.hex === normalized ? labDraft : { hex: normalized, channels: hexToLab(normalized) };
  if (currentHsv !== hsvDraft) setHsvDraft(currentHsv);
  if (currentLab !== labDraft) setLabDraft(currentLab);
  const hsv: HsvColor = currentHsv.channels;
  const lab: StudioLabColor = currentLab.channels;

  const handleRgbChange = (channel: keyof RgbColor, val: number) => {
    if (!Number.isFinite(val)) return;
    const nextRgb = { ...rgb, [channel]: Math.max(0, Math.min(255, val)) };
    onChange(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
  };

  const handleHsvChange = (channel: keyof HsvColor, val: number) => {
    if (!Number.isFinite(val)) return;
    const max = channel === "h" ? 360 : 100;
    const nextHsv = { ...hsv, [channel]: Math.max(0, Math.min(max, val)) };
    const hex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
    setHsvDraft({ hex, channels: nextHsv });
    onChange(hex);
  };

  const handleLabChange = (channel: keyof StudioLabColor, val: number) => {
    if (!Number.isFinite(val)) return;
    const nextLab = { ...lab };
    if (channel === "l") nextLab.l = Math.max(0, Math.min(100, val));
    if (channel === "a") nextLab.a = Math.max(-128, Math.min(127, val));
    if (channel === "b") nextLab.b = Math.max(-128, Math.min(127, val));
    const hex = labToHex(nextLab.l, nextLab.a, nextLab.b);
    setLabDraft({ hex, channels: nextLab });
    onChange(hex);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Color Space Toggle */}
      <div
        role="tablist"
        aria-label="색상 공간 선택"
        className="flex flex-wrap rounded-xl border border-line/70 bg-raised/50 p-1 backdrop-blur-sm"
      >
        {(["rgb", "hsv", "hsl", "cmyk", "lab"] as const).map((space, index, spaces) => {
          const isActive = colorSpace === space;
          const labels = { rgb: "RGB", hsv: "HSV / HSB", hsl: "HSL", cmyk: "CMYK", lab: "CIELAB" };
          return (
            <button
              key={space}
              type="button"
              role="tab"
              id={`${panelId}-${space}`}
              aria-controls={panelId}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                const next = event.key === "ArrowRight" ? (index + 1) % spaces.length
                  : event.key === "ArrowLeft" ? (index + spaces.length - 1) % spaces.length
                    : event.key === "Home" ? 0 : event.key === "End" ? spaces.length - 1 : null;
                if (next === null) return;
                event.preventDefault(); event.stopPropagation();
                setColorSpace(spaces[next]!);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
              }}
              aria-label={`${labels[space]} 슬라이더`}
              onClick={() => setColorSpace(space)}
              className={`min-h-9 min-w-12 flex-1 rounded-lg px-1 py-1 text-xs pointer-coarse:min-h-11 font-medium uppercase transition-all ${
                isActive
                  ? "bg-card text-accent font-semibold shadow-sm border border-accent/40"
                  : "text-fg-3 hover:text-fg-1"
              }`}
            >
              {labels[space]}
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${colorSpace}`}>
      {(colorSpace === "hsl" || colorSpace === "cmyk") && (
        <StudioHslCmykSliders key={colorSpace} mode={colorSpace} value={value} onChange={onChange} />
      )}
      {/* RGB Mode */}
      {colorSpace === "rgb" && (
        <div className="space-y-2.5">
          {/* Red */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-bad/15 py-0.5 text-center font-mono text-[0.62rem] font-bold text-bad border border-bad/30">
              R
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={rgb.r}
              aria-label="빨강 채널 R"
              onChange={(e) => handleRgbChange("r", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: `linear-gradient(to right, rgb(0, ${rgb.g}, ${rgb.b}), rgb(255, ${rgb.g}, ${rgb.b}))`,
              }}
            />
            <StudioColorChannelInput min={0} max={255} value={rgb.r} label="빨강 수치 입력" onChange={(next) => handleRgbChange("r", next)} />
          </div>

          {/* Green */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-good/15 py-0.5 text-center font-mono text-[0.62rem] font-bold text-good border border-good/30">
              G
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={rgb.g}
              aria-label="초록 채널 G"
              onChange={(e) => handleRgbChange("g", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: `linear-gradient(to right, rgb(${rgb.r}, 0, ${rgb.b}), rgb(${rgb.r}, 255, ${rgb.b}))`,
              }}
            />
            <StudioColorChannelInput min={0} max={255} value={rgb.g} label="초록 수치 입력" onChange={(next) => handleRgbChange("g", next)} />
          </div>

          {/* Blue */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-accent/15 py-0.5 text-center font-mono text-[0.62rem] font-bold text-accent border border-accent/30">
              B
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={rgb.b}
              aria-label="파랑 채널 B"
              onChange={(e) => handleRgbChange("b", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: `linear-gradient(to right, rgb(${rgb.r}, ${rgb.g}, 0), rgb(${rgb.r}, ${rgb.g}, 255))`,
              }}
            />
            <StudioColorChannelInput min={0} max={255} value={rgb.b} label="파랑 수치 입력" onChange={(next) => handleRgbChange("b", next)} />
          </div>
        </div>
      )}

      {/* HSV / HSB Mode */}
      {colorSpace === "hsv" && (
        <div className="space-y-2.5">
          {/* Hue */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-raised py-0.5 text-center font-mono text-[0.62rem] font-bold text-fg-2 border border-line/70">
              H
            </span>
            <input
              type="range"
              min={0}
              max={360}
              value={hsv.h}
              aria-label="색상 H (Hue)"
              onChange={(e) => handleHsvChange("h", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage:
                  "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
              }}
            />
            <StudioColorChannelInput min={0} max={360} step={0.1} value={hsv.h} label="HSV 색상 H 수치 입력" onChange={(next) => handleHsvChange("h", next)} />
          </div>

          {/* Saturation */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-raised py-0.5 text-center font-mono text-[0.62rem] font-bold text-fg-2 border border-line/70">
              S
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={hsv.s}
              aria-label="채도 S (Saturation)"
              onChange={(e) => handleHsvChange("s", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: `linear-gradient(to right, ${hsvToHex(hsv.h, 0, hsv.v)}, ${hsvToHex(hsv.h, 100, hsv.v)})`,
              }}
            />
            <StudioColorChannelInput min={0} max={100} step={0.1} value={hsv.s} label="HSV 채도 S 수치 입력" onChange={(next) => handleHsvChange("s", next)} />
          </div>

          {/* Brightness/Value */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-raised py-0.5 text-center font-mono text-[0.62rem] font-bold text-fg-2 border border-line/70">
              V
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={hsv.v}
              aria-label="명도 V (Value/Brightness)"
              onChange={(e) => handleHsvChange("v", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: `linear-gradient(to right, #000000, ${hsvToHex(hsv.h, hsv.s, 100)})`,
              }}
            />
            <StudioColorChannelInput min={0} max={100} step={0.1} value={hsv.v} label="HSV 명도 V 수치 입력" onChange={(next) => handleHsvChange("v", next)} />
          </div>
        </div>
      )}

      {/* CIELAB Mode */}
      {colorSpace === "lab" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[0.62rem] text-fg-3 px-0.5">
            <span>지각 균일 색공간 (CIELAB)</span>
            <span className="font-mono text-fg-2 font-medium">{formatLabString(lab)}</span>
          </div>

          {/* L* */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-raised py-0.5 text-center font-mono text-[0.60rem] font-bold text-fg-2 border border-line/70">
              L*
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(lab.l)}
              aria-label="CIELAB 명도 L*"
              onChange={(e) => handleLabChange("l", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full accent-accent shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: "linear-gradient(to right, #000000, #ffffff)",
              }}
            />
            <StudioColorChannelInput min={0} max={100} step={0.1} value={Number(lab.l.toFixed(1))} label="CIELAB 명도 L* 수치 입력" onChange={(next) => handleLabChange("l", next)} />
          </div>

          {/* a* */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-raised py-0.5 text-center font-mono text-[0.60rem] font-bold text-fg-2 border border-line/70">
              a*
            </span>
            <input
              type="range"
              min={-128}
              max={127}
              value={Math.round(lab.a)}
              aria-label="CIELAB 적녹 a*"
              onChange={(e) => handleLabChange("a", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full accent-accent shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: "linear-gradient(to right, #00ff00, #808080, #ff00ff)",
              }}
            />
            <StudioColorChannelInput min={-128} max={127} step={0.1} value={Number(lab.a.toFixed(1))} label="CIELAB 적녹 a* 수치 입력" onChange={(next) => handleLabChange("a", next)} />
          </div>

          {/* b* */}
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 rounded bg-raised py-0.5 text-center font-mono text-[0.60rem] font-bold text-fg-2 border border-line/70">
              b*
            </span>
            <input
              type="range"
              min={-128}
              max={127}
              value={Math.round(lab.b)}
              aria-label="CIELAB 황청 b*"
              onChange={(e) => handleLabChange("b", Number(e.target.value))}
              className="h-6 min-w-0 flex-1 pointer-coarse:h-11 cursor-pointer appearance-none rounded-full accent-accent shadow-inner"
              style={{
                backgroundSize: "100% 10px", backgroundPosition: "center", backgroundRepeat: "no-repeat",
                backgroundImage: "linear-gradient(to right, #0000ff, #808080, #ffff00)",
              }}
            />
            <StudioColorChannelInput min={-128} max={127} step={0.1} value={Number(lab.b.toFixed(1))} label="CIELAB 황청 b* 수치 입력" onChange={(next) => handleLabChange("b", next)} />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
