import { useState } from "react";

import {
  cmykToRgb,
  hexToHsl,
  hexToRgb,
  hslToHex,
  rgbToCmyk,
  rgbToHex,
} from "./studio-color-harmony-engine";

type ColorMode = "hsl" | "cmyk";

const CHANNELS = {
  hsl: [
    { name: "색상 H", max: 360 },
    { name: "채도 S", max: 100 },
    { name: "밝기 L", max: 100 },
  ],
  cmyk: [
    { name: "시안 C", max: 100 },
    { name: "마젠타 M", max: 100 },
    { name: "노랑 Y", max: 100 },
    { name: "검정 K", max: 100 },
  ],
} as const;

function channelsFromHex(mode: ColorMode, hex: string): number[] {
  if (mode === "hsl") {
    const { h, s, l } = hexToHsl(hex);
    return [h, s, l];
  }
  const rgb = hexToRgb(hex);
  const { c, m, y, k } = rgbToCmyk(rgb.r, rgb.g, rgb.b);
  return [c, m, y, k];
}

function channelsToHex(mode: ColorMode, channels: readonly number[]): string {
  if (mode === "hsl") return hslToHex(channels[0]!, channels[1]!, channels[2]!);
  const rgb = cmykToRgb(channels[0]!, channels[1]!, channels[2]!, channels[3]!);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/** Keep the chosen hue/ink separation while the parent echoes the edited RGB color. */
export function StudioHslCmykSliders({ mode, value, onChange }: {
  readonly mode: ColorMode;
  readonly value: string;
  readonly onChange: (hex: string) => void;
}) {
  const rgb = hexToRgb(value);
  const normalized = rgbToHex(rgb.r, rgb.g, rgb.b);
  const [draft, setDraft] = useState(() => ({
    hex: normalized, mode, channels: channelsFromHex(mode, normalized),
  }));
  const current = draft.hex === normalized && draft.mode === mode
    ? draft
    : { hex: normalized, mode, channels: channelsFromHex(mode, normalized) };
  // Reset on an external picker/history change; do not revive an old separation later.
  if (current !== draft) setDraft(current);

  const changeChannel = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    const channels = [...current.channels];
    channels[index] = Math.max(0, Math.min(CHANNELS[mode][index]!.max, value));
    const hex = channelsToHex(mode, channels);
    setDraft({ hex, mode, channels });
    onChange(hex);
  };

  return (
    <div className="space-y-2.5">
      {mode === "cmyk" && (
        <p className="text-xs text-fg-3">장치 CMYK 근삿값입니다. 선택한 색은 RGB로 저장되며 인쇄용 ICC 프로필은 적용되지 않습니다.</p>
      )}
      {CHANNELS[mode].map(({ name, max }, index) => {
        const label = `${mode.toUpperCase()} ${name}`;
        const gradient = Array.from({ length: 13 }, (_, stop) => {
          const channels = [...current.channels];
          channels[index] = max * stop / 12;
          return channelsToHex(mode, channels);
        }).join(", ");
        return (
          <div key={name} className="flex min-w-0 items-center gap-2">
            <span className="w-5 shrink-0 text-center font-mono text-xs text-fg-2">{name.at(-1)}</span>
            <input
              type="range" min={0} max={max} step={0.1}
              value={current.channels[index]} aria-label={label}
              onChange={(event) => changeChannel(index, event.currentTarget.valueAsNumber)}
              className="h-2.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
              style={{ background: `linear-gradient(to right, ${gradient})` }}
            />
            <input
              type="number" min={0} max={max} step={0.1}
              value={current.channels[index]} aria-label={`${label} 수치 입력`}
              onChange={(event) => changeChannel(index, event.currentTarget.valueAsNumber)}
              className="h-8 w-16 shrink-0 rounded-lg border border-line bg-card text-center font-mono text-xs text-fg"
            />
          </div>
        );
      })}
    </div>
  );
}
