import { Layers, Music, PencilLine, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { SPATIAL_MAX_LAYERS, type SpatialBook, type SpatialPanel } from "./spatial-book";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const MIN_SECONDS = 2;
const MAX_SECONDS = 60;

const FIELD = "mt-1.5 block min-h-11 w-full rounded-xl border border-line-strong bg-panel px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const LABEL = "block text-xs font-semibold text-fg-2";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={LABEL}>
      {label}
      {children}
    </label>
  );
}

/** 작품 정보·자막·깊이 레이어·음악 편집. 편집하면 열린 AR/VR 세션을 닫고 화면을 다시 구성한다. */
export function SpatialReaderEditPanel({
  book,
  panel,
  index,
  scale,
  onBookTitle,
  onPanel,
  onScale,
  onAddLayer,
  onRemoveLayer,
  onAudio,
}: {
  book: SpatialBook;
  panel: SpatialPanel;
  index: number;
  scale: number;
  onBookTitle: (title: string) => void;
  onPanel: (update: Partial<SpatialPanel>) => void;
  onScale: (scale: number) => void;
  onAddLayer: (file: File) => void;
  onRemoveLayer: (layerIndex: number) => void;
  onAudio: (file: File) => void;
}) {
  const bt = useBilingual("StudioSpatialReader");
  return (
    <details className="group rounded-3xl border border-line bg-card/60 p-4 sm:p-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <PencilLine size={16} aria-hidden className="text-accent" />
        {bt("작품 정보 · 자막 · 깊이 레이어 편집", "Edit details, captions and depth layers")}
        <span className="ml-auto text-xs font-normal text-fg-3 group-open:hidden">{bt("펼치기", "Expand")}</span>
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-fg-2">
        {bt(
          "깊이 레이어는 따로 준비한 투명 PNG를 사용합니다. 자동으로 추론한 3D라고 표시하지 않아요. 편집하면 열린 AR/VR 세션을 종료하고 화면을 다시 구성합니다.",
          "Depth layers use transparent PNGs you prepare; they are never labeled as inferred 3D. Editing closes any open AR/VR session and rebuilds the view.",
        )}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <Field label={bt("작품 제목", "Work title")}>
            <input className={FIELD} value={book.title} maxLength={160} onChange={(event) => onBookTitle(event.target.value)} />
          </Field>
          <Field label={formatI18nTemplate(bt("{n}번째 컷 제목", "Panel {n} title"), { n: index + 1 })}>
            <input className={FIELD} value={panel.title} maxLength={120} onChange={(event) => onPanel({ title: event.target.value })} />
          </Field>
          <Field label={bt("대사 / 자막", "Dialogue / caption")}>
            <textarea className={FIELD} rows={3} value={panel.caption} maxLength={2000} onChange={(event) => onPanel({ caption: event.target.value })} />
          </Field>
          <Field label={bt("화면 설명 · 스크린리더용", "Image description · for screen readers")}>
            <textarea className={FIELD} rows={2} value={panel.alt} maxLength={2000} onChange={(event) => onPanel({ alt: event.target.value })} />
          </Field>
        </div>
        <div className="grid content-start gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={bt("컷 감상 시간(초)", "Seconds per panel")}>
              <input
                className={FIELD}
                type="number"
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                value={panel.seconds}
                onChange={(event) => onPanel({ seconds: Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Number(event.target.value) || 6)) })}
              />
            </Field>
            <Field label={formatI18nTemplate(bt("AR 크기 {pct}%", "AR size {pct}%"), { pct: Math.round(scale * 100) })}>
              <input
                className="mt-3 block w-full accent-[var(--color-accent)]"
                type="range"
                min={0.25}
                max={1.5}
                step={0.05}
                value={scale}
                onChange={(event) => onScale(Number(event.target.value))}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-line bg-panel/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Layers size={14} aria-hidden className="text-accent" />
              {formatI18nTemplate(bt("앞 레이어 {count} / {max}", "Front layers {count} / {max}"), { count: panel.layers.length, max: SPATIAL_MAX_LAYERS })}
            </p>
            {panel.layers.map((layer, layerIndex) => (
              <div key={`${panel.id}-layer-${layerIndex}`} className="mt-2 flex flex-wrap items-end gap-2">
                <Field label={formatI18nTemplate(bt("레이어 {n} 깊이", "Layer {n} depth"), { n: layerIndex + 1 })}>
                  <input
                    className="mt-3 block w-48 accent-[var(--color-accent)]"
                    type="range"
                    min={0.02}
                    max={0.6}
                    step={0.02}
                    value={layer.depth}
                    onChange={(event) => onPanel({
                      layers: panel.layers.map((item, j) => (j === layerIndex ? { ...item, depth: Number(event.target.value) } : item)),
                    })}
                  />
                </Field>
                <button type="button" onClick={() => onRemoveLayer(layerIndex)} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}>
                  <Trash2 size={13} aria-hidden />
                  {bt("레이어 제거", "Remove layer")}
                </button>
              </div>
            ))}
            <label className="mt-3 block text-xs text-fg-2">
              {bt("현재 컷에 앞 레이어 PNG 추가", "Add a front-layer PNG to this panel")}
              <input
                className="mt-1.5 block w-full text-xs file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-line-strong file:bg-raised file:px-3 file:text-fg"
                type="file"
                accept="image/png"
                disabled={panel.layers.length >= SPATIAL_MAX_LAYERS}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onAddLayer(file);
                }}
              />
            </label>
          </div>

          <label className="block rounded-2xl border border-line bg-panel/50 p-3 text-xs text-fg-2">
            <span className="flex items-center gap-1.5 font-semibold text-fg">
              <Music size={14} aria-hidden className="text-accent" />
              {bt("음악 / 내레이션 내장 · 10MB 이하", "Embed music / narration · up to 10MB")}
            </span>
            <input
              className="mt-2 block w-full text-xs file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-line-strong file:bg-raised file:px-3 file:text-fg"
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onAudio(file);
              }}
            />
          </label>
        </div>
      </div>
    </details>
  );
}
