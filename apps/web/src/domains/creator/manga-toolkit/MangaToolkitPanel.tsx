import { useMemo, useState } from "react";

import {
  DEFAULT_EFFECT_STROKE,
  DEFAULT_FLASH_OPTIONS,
  createConcentrationLines,
  createFlashPolygon,
  createSpeedLines,
  effectLinesToSvgPath,
  type EffectStrokeParams,
} from "./effect-lines";
import {
  BALLOON_PRESETS,
  balloonBodySvgPath,
  balloonInnerSvgPath,
  balloonIsDashed,
  balloonTailSvgPath,
  createBalloon,
  moveTailTip,
  type BalloonPreset,
  type SpeechBalloon,
} from "./speech-balloon";
import {
  deleteFrame,
  mergeFrames,
  splitFrameToFrames,
  type MangaFrame,
} from "./manga-frame";
import {
  StudioSectionHeader,
  StudioSliderRow,
  studioSegmentChipClass,
} from "../studio-panel-ui";
import { MANGA_TOOLKIT_LABELS as L } from "./manga-toolkit-labels";

import type { ReactElement } from "react";

type ToolkitTab = "frame" | "balloon" | "effect";
type EffectKind = "concentration" | "speed" | "flash";

const TABS: readonly { id: ToolkitTab; label: string }[] = [
  { id: "frame", label: L.tabs.frame },
  { id: "balloon", label: L.tabs.balloon },
  { id: "effect", label: L.tabs.effect },
] as const;

const EFFECT_KINDS: readonly { id: EffectKind; label: string }[] = [
  { id: "concentration", label: L.effect.concentration },
  { id: "speed", label: L.effect.speed },
  { id: "flash", label: L.effect.flash },
] as const;

const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 280;

let frameIdSeq = 0;
function nextFrameId(prefix = "frame"): string {
  frameIdSeq += 1;
  return `${prefix}-${frameIdSeq}`;
}

function FrameTab(): ReactElement {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [gutter, setGutter] = useState(8);
  const [borderWidth, setBorderWidth] = useState(2);
  const [frames, setFrames] = useState<MangaFrame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const baseRect = useMemo(
    () => ({ x: 8, y: 8, w: PREVIEW_WIDTH - 16, h: PREVIEW_HEIGHT - 16 }),
    [],
  );

  const handleSplit = (): void => {
    const next = splitFrameToFrames(
      baseRect,
      rows,
      cols,
      gutter,
      borderWidth,
      (r, c) => nextFrameId(`f${r}x${c}`),
    );
    setFrames(next);
    setSelectedId(null);
  };

  const handleMerge = (): void => {
    if (!selectedId) return;
    const selected = frames.find((f) => f.id === selectedId);
    if (!selected) return;
    // 같은 행의 인접 프레임을 함께 병합
    const neighbors = frames
      .filter(
        (f) =>
          f.id !== selectedId &&
          Math.abs(f.rect.y - selected.rect.y) < 1 &&
          Math.abs(f.rect.h - selected.rect.h) < 1,
      )
      .slice(0, 1);
    const merged = mergeFrames(frames, [selectedId, ...neighbors.map((f) => f.id)]);
    if (!merged) return;
    const removeIds = new Set([selectedId, ...neighbors.map((f) => f.id)]);
    setFrames([...frames.filter((f) => !removeIds.has(f.id)), merged]);
    setSelectedId(merged.id);
  };

  const handleDelete = (): void => {
    if (!selectedId) return;
    setFrames(deleteFrame(frames, selectedId));
    setSelectedId(null);
  };

  return (
    <div>
      <StudioSectionHeader title={L.frame.section} />
      <StudioSliderRow
        label={L.frame.rows}
        min={1}
        max={6}
        step={1}
        value={rows}
        onChange={setRows}
      />
      <StudioSliderRow
        label={L.frame.cols}
        min={1}
        max={6}
        step={1}
        value={cols}
        onChange={setCols}
      />
      <StudioSliderRow
        label={L.frame.gutter}
        min={0}
        max={40}
        step={1}
        value={gutter}
        onChange={setGutter}
      />
      <StudioSliderRow
        label={L.frame.borderWidth}
        min={0}
        max={12}
        step={0.5}
        value={borderWidth}
        onChange={setBorderWidth}
      />
      <div className="mt-2 flex gap-2">
        <button type="button" className={studioSegmentChipClass(false)} onClick={handleSplit}>
          {L.frame.split}
        </button>
        <button
          type="button"
          className={studioSegmentChipClass(false)}
          onClick={handleMerge}
          disabled={!selectedId}
        >
          {L.frame.merge}
        </button>
        <button
          type="button"
          className={studioSegmentChipClass(false)}
          onClick={handleDelete}
          disabled={!selectedId}
        >
          {L.frame.delete}
        </button>
      </div>
      <p className="mt-2 text-xs text-fg-3">
        {L.frame.count}: {frames.length}
      </p>
      <svg
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        role="img"
        aria-label={L.tabs.frame}
        className="mt-2 w-full rounded border border-line bg-canvas"
      >
        {frames.map((frame) => (
          <rect
            key={frame.id}
            x={frame.rect.x}
            y={frame.rect.y}
            width={frame.rect.w}
            height={frame.rect.h}
            fill="none"
            stroke={selectedId === frame.id ? "#38bdf8" : "#111111"}
            strokeWidth={frame.borderWidth}
            onClick={() => setSelectedId(frame.id)}
            style={{ cursor: "pointer" }}
          />
        ))}
        {frames.length === 0 && (
          <text x={PREVIEW_WIDTH / 2} y={PREVIEW_HEIGHT / 2} textAnchor="middle" fill="#94a3b8">
            {L.common.emptyPreview}
          </text>
        )}
      </svg>
    </div>
  );
}

function BalloonTab(): ReactElement {
  const [preset, setPreset] = useState<BalloonPreset>("normal");
  const [text, setText] = useState("대사 예시");
  const [lineWidth, setLineWidth] = useState(2);
  const [tailDragPoint, setTailDragPoint] = useState<{ x: number; y: number } | null>(null);

  const balloon = useMemo<SpeechBalloon>(() => {
    const created = createBalloon(
      "preview",
      preset,
      { x: 60, y: 30, w: 240, h: 140 },
      { text, lineWidth },
    );
    return tailDragPoint ? moveTailTip(created, tailDragPoint) : created;
  }, [preset, text, lineWidth, tailDragPoint]);

  const bodyPath = balloonBodySvgPath(balloon);
  const innerPath = balloonInnerSvgPath(balloon);
  const tailPath = balloonTailSvgPath(balloon);
  const dashed = balloonIsDashed(balloon);

  return (
    <div>
      <StudioSectionHeader title={L.balloon.section} />
      <div className="mb-2">
        <p className="mb-1 text-xs text-fg-3">{L.balloon.preset}</p>
        <div className="flex flex-wrap gap-1.5">
          {BALLOON_PRESETS.map((info) => (
            <button
              key={info.preset}
              type="button"
              className={studioSegmentChipClass(preset === info.preset)}
              onClick={() => setPreset(info.preset)}
              title={info.description}
            >
              {info.name}
            </button>
          ))}
        </div>
      </div>
      <label className="mb-2 block text-xs text-fg-3">
        {L.balloon.text}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={L.balloon.textPlaceholder}
          className="mt-1 w-full rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
        />
      </label>
      <StudioSliderRow
        label={L.balloon.lineWidth}
        min={1}
        max={8}
        step={0.5}
        value={lineWidth}
        onChange={setLineWidth}
      />
      <p className="mt-2 text-xs text-fg-3">{L.balloon.tailTip}</p>
      <StudioSliderRow
        label="X"
        min={0}
        max={PREVIEW_WIDTH}
        step={1}
        value={tailDragPoint?.x ?? balloon.tail?.tip.x ?? PREVIEW_WIDTH / 2}
        onChange={(x) =>
          setTailDragPoint((prev) => ({ x, y: prev?.y ?? balloon.tail?.tip.y ?? 240 }))
        }
      />
      <StudioSliderRow
        label="Y"
        min={0}
        max={PREVIEW_HEIGHT}
        step={1}
        value={tailDragPoint?.y ?? balloon.tail?.tip.y ?? 240}
        onChange={(y) =>
          setTailDragPoint((prev) => ({ x: prev?.x ?? balloon.tail?.tip.x ?? 260, y }))
        }
      />
      <svg
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        role="img"
        aria-label={L.balloon.preview}
        className="mt-2 w-full rounded border border-line bg-canvas"
      >
        {tailPath && (
          <path
            d={tailPath}
            fill={balloon.fillColor}
            stroke={balloon.lineColor}
            strokeWidth={balloon.lineWidth}
            strokeDasharray={dashed ? "6 4" : undefined}
          />
        )}
        <path
          d={bodyPath}
          fill={balloon.fillColor}
          stroke={balloon.lineColor}
          strokeWidth={balloon.lineWidth}
          strokeDasharray={dashed ? "6 4" : undefined}
        />
        {innerPath && (
          <path d={innerPath} fill="none" stroke={balloon.lineColor} strokeWidth={balloon.lineWidth * 0.6} />
        )}
        <text
          x={balloon.body.x + balloon.body.w / 2}
          y={balloon.body.y + balloon.body.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={balloon.textColor}
          fontSize={15}
        >
          {balloon.text}
        </text>
      </svg>
    </div>
  );
}

function EffectTab(): ReactElement {
  const [kind, setKind] = useState<EffectKind>("concentration");
  const [stroke, setStroke] = useState<EffectStrokeParams>({ ...DEFAULT_EFFECT_STROKE });
  const [innerRadius, setInnerRadius] = useState(24);
  const [angleJitter, setAngleJitter] = useState(4);
  const [direction, setDirection] = useState(0);
  const [spacing, setSpacing] = useState(14);
  const [spikes, setSpikes] = useState(DEFAULT_FLASH_OPTIONS.spikes);

  const patch = (p: Partial<EffectStrokeParams>): void => setStroke((s) => ({ ...s, ...p }));

  const svgContent = useMemo(() => {
    const cx = PREVIEW_WIDTH / 2;
    const cy = PREVIEW_HEIGHT / 2;
    if (kind === "concentration") {
      const lines = createConcentrationLines({
        ...stroke,
        cx,
        cy,
        innerRadius,
        angleJitter,
        excludeFrom: 0,
        excludeTo: 0,
      });
      return (
        <path
          d={effectLinesToSvgPath(lines)}
          stroke="#111111"
          strokeWidth={stroke.width}
          strokeLinecap="round"
          opacity={stroke.opacity}
          fill="none"
        />
      );
    }
    if (kind === "speed") {
      const lines = createSpeedLines({
        ...stroke,
        x: 40,
        y: cy,
        direction,
        spacing,
        positionJitter: 4,
      });
      return (
        <path
          d={effectLinesToSvgPath(lines)}
          stroke="#111111"
          strokeWidth={stroke.width}
          strokeLinecap="round"
          opacity={stroke.opacity}
          fill="none"
        />
      );
    }
    const points = createFlashPolygon({
      ...DEFAULT_FLASH_OPTIONS,
      cx,
      cy,
      outerRadius: stroke.length,
      spikes,
      seed: stroke.seed,
    });
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
    return (
      <path
        d={d}
        fill="none"
        stroke="#111111"
        strokeWidth={stroke.width}
        strokeLinejoin="round"
        opacity={stroke.opacity}
      />
    );
  }, [kind, stroke, innerRadius, angleJitter, direction, spacing, spikes]);

  return (
    <div>
      <StudioSectionHeader title={L.effect.section} />
      <div className="mb-2 flex flex-wrap gap-1.5">
        {EFFECT_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={studioSegmentChipClass(kind === k.id)}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <StudioSliderRow
        label={L.effect.count}
        min={4}
        max={80}
        step={1}
        value={stroke.count}
        onChange={(count) => patch({ count })}
      />
      <StudioSliderRow
        label={L.effect.length}
        min={20}
        max={220}
        step={1}
        value={stroke.length}
        onChange={(length) => patch({ length })}
      />
      <StudioSliderRow
        label={L.effect.width}
        min={0.5}
        max={8}
        step={0.5}
        value={stroke.width}
        onChange={(width) => patch({ width })}
      />
      <StudioSliderRow
        label={L.effect.lengthJitter}
        min={0}
        max={1}
        step={0.05}
        value={stroke.lengthJitter}
        onChange={(lengthJitter) => patch({ lengthJitter })}
      />
      <StudioSliderRow
        label={L.effect.opacity}
        min={0.1}
        max={1}
        step={0.05}
        value={stroke.opacity}
        onChange={(opacity) => patch({ opacity })}
      />
      {kind === "concentration" && (
        <>
          <StudioSliderRow
            label={L.effect.innerRadius}
            min={0}
            max={80}
            step={1}
            value={innerRadius}
            onChange={setInnerRadius}
          />
          <StudioSliderRow
            label={L.effect.angleJitter}
            min={0}
            max={30}
            step={1}
            value={angleJitter}
            onChange={setAngleJitter}
          />
        </>
      )}
      {kind === "speed" && (
        <>
          <StudioSliderRow
            label={L.effect.direction}
            min={0}
            max={360}
            step={1}
            value={direction}
            onChange={setDirection}
          />
          <StudioSliderRow
            label={L.effect.spacing}
            min={4}
            max={48}
            step={1}
            value={spacing}
            onChange={setSpacing}
          />
        </>
      )}
      {kind === "flash" && (
        <StudioSliderRow
          label={L.effect.spikes}
          min={3}
          max={24}
          step={1}
          value={spikes}
          onChange={setSpikes}
        />
      )}
      <StudioSliderRow
        label={L.common.seed}
        min={1}
        max={99999}
        step={1}
        value={stroke.seed}
        onChange={(seed) => patch({ seed })}
      />
      <button
        type="button"
        className={`${studioSegmentChipClass(false)} mt-2`}
        onClick={() => patch({ seed: Math.floor(Math.random() * 99999) + 1 })}
      >
        {L.effect.regenerate}
      </button>
      <svg
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        role="img"
        aria-label={L.effect.preview}
        className="mt-2 w-full rounded border border-line bg-canvas"
      >
        {svgContent}
      </svg>
    </div>
  );
}

export function MangaToolkitPanel(): ReactElement {
  const [tab, setTab] = useState<ToolkitTab>("frame");
  return (
    <section aria-label={L.panelTitle} className="p-3">
      <h2 className="text-sm font-semibold text-fg">{L.panelTitle}</h2>
      <p className="mb-2 mt-1 text-xs text-fg-3">{L.pageModeNotice}</p>
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label={L.panelTitle}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={studioSegmentChipClass(tab === t.id)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "frame" && <FrameTab />}
        {tab === "balloon" && <BalloonTab />}
        {tab === "effect" && <EffectTab />}
      </div>
    </section>
  );
}
