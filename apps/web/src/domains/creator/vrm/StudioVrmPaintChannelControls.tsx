import {
  STUDIO_VRM_TEXTURE_PAINT_CHANNELS,
  canonicalizeStudioVrmTexturePaintChannel,
  isStudioVrmTexturePaintScalarChannel,
  type StudioVrmTexturePaintChannel,
} from "./studio-vrm-texture-paint-channel";

const LABELS: Readonly<Record<StudioVrmTexturePaintChannel, string>> = {
  baseColor: "색상", roughness: "거칠기", metalness: "금속성", emissive: "발광", opacity: "불투명도",
};

export function StudioVrmPaintChannelControls({ channel, supportedChannels, color, disabled, onChannelChange, onColorChange }: {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly supportedChannels: readonly StudioVrmTexturePaintChannel[];
  readonly color: string;
  readonly disabled: boolean;
  readonly onChannelChange: (channel: StudioVrmTexturePaintChannel) => void;
  readonly onColorChange: (color: string) => void;
}) {
  const scalar = isStudioVrmTexturePaintScalarChannel(channel);
  const value = /^#[0-9a-f]{6}$/iu.test(color) ? parseInt(color.slice(3, 5), 16) : 128;
  return <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
    <label className="flex min-w-0 items-center gap-2 text-xs font-semibold">
      <span>페인트 채널</span>
      <select aria-label="표면 페인트 채널" value={channel} disabled={disabled}
        className="min-h-11 min-w-0 rounded-lg border border-line bg-card px-2 text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        onChange={(event) => {
          const next = canonicalizeStudioVrmTexturePaintChannel(event.currentTarget.value);
          if (next && supportedChannels.includes(next)) onChannelChange(next);
        }}>
        {STUDIO_VRM_TEXTURE_PAINT_CHANNELS.map((entry) => <option key={entry} value={entry} disabled={!supportedChannels.includes(entry)}>
          {LABELS[entry]}{supportedChannels.includes(entry) ? "" : " (재질 미지원)"}
        </option>)}
      </select>
    </label>
    {scalar ? <label className="flex min-w-0 items-center gap-2 text-xs font-semibold">
      <span>{LABELS[channel]} 값</span>
      <input type="range" min={0} max={255} step={1} value={value} disabled={disabled}
        aria-label={`표면 ${LABELS[channel]} 값`} aria-valuetext={`${Math.round(value / 255 * 100)}%`}
        className="h-11 w-24 min-w-0 accent-accent disabled:opacity-50"
        onChange={(event) => {
          const hex = Number(event.currentTarget.value).toString(16).padStart(2, "0");
          onColorChange(`#${hex}${hex}${hex}`);
        }} />
      <output className="w-9 tabular-nums">{Math.round(value / 255 * 100)}%</output>
    </label> : null}
  </div>;
}
