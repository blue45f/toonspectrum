import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
} from "lucide-react";
import { Suspense } from "react";

import { normalizeTextPath, type TextPathConfig } from "./lettering/studio-text-path";
import { BRAND_KIT_FONTS, DEFAULT_BRAND_KIT_FONT } from "./studio-brand-kit";
import {
  StudioCustomFontsPanel,
  StudioTextEffectPanel,
  StudioTextPathPanel,
} from "./studio-page-lazy-ui";
import { StudioCircularTextPanel } from "./text/StudioCircularTextPanel";
import { StudioPresetFontPreload } from "./studio-preset-font-loading";
import { StudioInspectorSection } from "./StudioInspectorSection";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";

import type { BubbleEl, El, TextEl } from "./studio-element-model";

import { cn } from "@/lib/utils";

interface StudioInspectorTypographySectionProps {
  selected: TextEl | BubbleEl;
  patchEl: (id: string, patch: Partial<El>) => void;
}

export function StudioInspectorTypographySection({
  selected,
  patchEl,
}: StudioInspectorTypographySectionProps) {
  return (
    <StudioInspectorSection sectionId="element.typography" loadingLabel="타이포그래피를 여는 중...">
      <div className="mt-2">
        <p className="mb-1 text-[0.66rem] font-medium text-fg-3">글꼴</p>
        <StudioPresetFontPreload />
        <div className="flex flex-wrap gap-1">
          {BRAND_KIT_FONTS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => patchEl(selected.id, { font: f.value } as Partial<El>)}
              style={{ fontFamily: f.value }}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                (selected.font ?? DEFAULT_BRAND_KIT_FONT) === f.value
                  ? "border-accent/60 bg-accent-soft/50 text-fg"
                  : "border-line text-fg-2 hover:bg-raised"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 border-t border-line/30 pt-3">
        <StudioCustomFontsPanel
          canApplyFont
          onApplyFont={(font) => patchEl(selected.id, { font } as Partial<El>)}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
        글자 크기
        <div className="flex items-center gap-1">
          {[-4, 4].map((d) => (
            <button
              key={d}
              type="button"
              aria-label={d < 0 ? "글자 작게" : "글자 크게"}
              onClick={() => {
                const cur = selected.type === "text" ? selected.fontSize : selected.fontSize ?? 24;
                patchEl(selected.id, { fontSize: Math.max(12, Math.min(96, cur + d)) } as Partial<El>);
              }}
              className="grid size-7 place-items-center rounded-md border border-line text-fg-2 hover:bg-raised"
            >
              {d < 0 ? "−" : "+"}
            </button>
          ))}
          <span className="w-7 text-center text-xs tabular-nums text-fg-3">
            {selected.type === "text" ? selected.fontSize : selected.fontSize ?? 24}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-4 border-t border-line/30 pt-2.5">
        <div>
          <p className="mb-1 text-[0.66rem] font-medium text-fg-3">정렬</p>
          <div className="flex gap-0.5 rounded-lg border border-line bg-panel p-0.5">
            {(["left", "center", "right"] as const).map((a) => {
              const active = (selected.align ?? (selected.type === "text" ? "left" : "center")) === a;
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => patchEl(selected.id, { align: a } as Partial<El>)}
                  className={cn(
                    "grid size-7 place-items-center rounded transition-colors cursor-pointer",
                    active ? "bg-accent text-on-accent shadow-sm" : "text-fg-3 hover:bg-raised hover:text-fg-2"
                  )}
                  title={`${a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"} 정렬`}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[0.66rem] font-medium text-fg-3">스타일</p>
          <div className="flex gap-0.5 rounded-lg border border-line bg-panel p-0.5">
            {(() => {
              const fsVal = selected.fontStyle ?? "bold";
              const isBold = fsVal.includes("bold");
              const isItalic = fsVal.includes("italic");
              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      let nextStyle: "normal" | "bold" | "italic" | "bold italic";
                      if (isBold) {
                        nextStyle = isItalic ? "italic" : "normal";
                      } else {
                        nextStyle = isItalic ? "bold italic" : "bold";
                      }
                      patchEl(selected.id, { fontStyle: nextStyle } as Partial<El>);
                    }}
                    className={cn(
                      "grid size-7 place-items-center rounded transition-colors cursor-pointer",
                      isBold ? "bg-accent/20 text-accent font-bold border border-accent/35" : "text-fg-3 hover:bg-raised hover:text-fg-2"
                    )}
                    title="굵게"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let nextStyle: "normal" | "bold" | "italic" | "bold italic";
                      if (isItalic) {
                        nextStyle = isBold ? "bold" : "normal";
                      } else {
                        nextStyle = isBold ? "bold italic" : "italic";
                      }
                      patchEl(selected.id, { fontStyle: nextStyle } as Partial<El>);
                    }}
                    className={cn(
                      "grid size-7 place-items-center rounded transition-colors cursor-pointer",
                      isItalic ? "bg-accent/20 text-accent font-bold border border-accent/35" : "text-fg-3 hover:bg-raised hover:text-fg-2"
                    )}
                    title="기울임꼴"
                  >
                    <Italic size={14} />
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {selected.type === "text" && (
        <div className="mt-2.5 border-t border-line/40 pt-2.5">
          <Suspense fallback={<StudioPanelLoading label="글자 효과 패널을 여는 중..." />}>
            <StudioTextEffectPanel onApply={(patch) => patchEl(selected.id, patch as Partial<El>)} />
          </Suspense>
        </div>
      )}

      {selected.type === "text" && (
        <div className="mt-2.5 border-t border-line/40 pt-2.5">
          <Suspense fallback={<StudioPanelLoading label="곡선 텍스트 패널을 여는 중..." />}>
            <StudioTextPathPanel
              value={normalizeTextPath(selected.textPath)}
              onPatch={(patch: Partial<TextPathConfig>) =>
                patchEl(selected.id, {
                  textPath: normalizeTextPath({ ...normalizeTextPath(selected.textPath), ...patch }),
                } as Partial<El>)
              }
              onApplyPreset={(v: TextPathConfig) => patchEl(selected.id, { textPath: v } as Partial<El>)}
              onReset={() => patchEl(selected.id, { textPath: undefined } as Partial<El>)}
            />
          </Suspense>
        </div>
      )}

      {selected.type === "text" && (
        <div className="mt-2.5 border-t border-line/40 pt-2.5">
          <StudioCircularTextPanel
            text={selected.text}
            enabled={
              selected.textPath?.shape === "circleUp" ||
              selected.textPath?.shape === "circleDown"
            }
            options={{
              centerX: selected.x + selected.width / 2,
              centerY: selected.y + (selected.fontSize || 24),
              radius: Math.max(30, (selected.textPath?.curve ?? 50) * 2),
              startAngleDeg: -90,
              direction:
                selected.textPath?.shape === "circleDown"
                  ? "counter-clockwise"
                  : "clockwise",
              orientation: "outward",
            }}
            onToggleEnabled={(enabled) => {
              if (enabled) {
                patchEl(selected.id, {
                  textPath: { shape: "circleUp", curve: 50 },
                } as Partial<El>);
              } else {
                patchEl(selected.id, {
                  textPath: undefined,
                } as Partial<El>);
              }
            }}
            onOptionsChange={(options) => {
              const shape =
                options.direction === "counter-clockwise"
                  ? "circleDown"
                  : "circleUp";
              patchEl(selected.id, {
                textPath: {
                  shape,
                  curve: Math.round(options.radius / 2),
                },
              } as Partial<El>);
            }}
          />
        </div>
      )}

      {selected.type === "text" && (
        <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
          <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">글자 외곽선 (Border)</p>

          <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
            외곽선 사용
            <input
              type="checkbox"
              checked={!!selected.stroke}
              aria-label="글자 외곽선 사용"
              onChange={(e) => {
                const hasStroke = e.target.checked;
                patchEl(selected.id, {
                  stroke: hasStroke ? (selected.stroke || "#ffffff") : undefined,
                  strokeWidth: hasStroke ? (selected.strokeWidth || 3) : 0,
                } as Partial<El>);
              }}
              className="size-4 accent-accent cursor-pointer"
            />
          </div>

          {!!selected.stroke && (
            <>
              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                외곽선 색상
                <input
                  type="color"
                  value={selected.stroke || "#ffffff"}
                  onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                  className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                외곽선 두께
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={16}
                    step={0.5}
                    value={selected.strokeWidth ?? 3}
                    onChange={(e) => patchEl(selected.id, { strokeWidth: Number(e.target.value) } as Partial<El>)}
                    className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                  />
                  <span className="w-8 text-right text-xs tabular-nums text-fg-3">{(selected.strokeWidth ?? 3).toFixed(1)}px</span>
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {selected.type === "text" && (
        <div className="mt-3 space-y-2">
          <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
            자간
            <span className="flex items-center gap-2">
              <input
                type="range"
                min={-2}
                max={12}
                step={0.5}
                value={selected.letterSpacing ?? 0}
                onChange={(e) => patchEl(selected.id, { letterSpacing: Number(e.target.value) } as Partial<El>)}
                className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
              />
              <span className="w-7 text-right text-xs tabular-nums text-fg-3">{selected.letterSpacing ?? 0}</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
            행간
            <span className="flex items-center gap-2">
              <input
                type="range"
                min={0.8}
                max={2}
                step={0.1}
                value={selected.lineHeight ?? 1}
                onChange={(e) => patchEl(selected.id, { lineHeight: Number(e.target.value) } as Partial<El>)}
                className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
              />
              <span className="w-7 text-right text-xs tabular-nums text-fg-3">{(selected.lineHeight ?? 1).toFixed(1)}</span>
            </span>
          </label>
        </div>
      )}

      {selected.type === "text" && (
        <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
          <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">글자 그림자 (Shadow)</p>

          <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
            그림자 사용
            <input
              type="checkbox"
              checked={!!selected.shadowColor}
              aria-label="글자 그림자 사용"
              onChange={(e) => {
                const hasShadow = e.target.checked;
                patchEl(selected.id, {
                  shadowColor: hasShadow ? (selected.shadowColor || "#000000") : undefined,
                  shadowBlur: hasShadow ? (selected.shadowBlur || 5) : undefined,
                  shadowOffsetX: hasShadow ? (selected.shadowOffsetX || 3) : undefined,
                  shadowOffsetY: hasShadow ? (selected.shadowOffsetY || 3) : undefined,
                  shadowOpacity: hasShadow ? (selected.shadowOpacity || 0.6) : undefined,
                } as Partial<El>);
              }}
              className="size-4 accent-accent cursor-pointer"
            />
          </div>

          {!!selected.shadowColor && (
            <>
              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                그림자 색상
                <input
                  type="color"
                  value={selected.shadowColor || "#000000"}
                  onChange={(e) => patchEl(selected.id, { shadowColor: e.target.value } as Partial<El>)}
                  className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                흐림 정도 (Blur)
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={selected.shadowBlur ?? 5}
                    onChange={(e) => patchEl(selected.id, { shadowBlur: Number(e.target.value) } as Partial<El>)}
                    className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                  />
                  <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowBlur ?? 5}px</span>
                </span>
              </label>

              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                가로 오프셋 (X)
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={1}
                    value={selected.shadowOffsetX ?? 3}
                    onChange={(e) => patchEl(selected.id, { shadowOffsetX: Number(e.target.value) } as Partial<El>)}
                    className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                  />
                  <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowOffsetX ?? 3}px</span>
                </span>
              </label>

              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                세로 오프셋 (Y)
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={1}
                    value={selected.shadowOffsetY ?? 3}
                    onChange={(e) => patchEl(selected.id, { shadowOffsetY: Number(e.target.value) } as Partial<El>)}
                    className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                  />
                  <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowOffsetY ?? 3}px</span>
                </span>
              </label>

              <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                불투명도
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={selected.shadowOpacity ?? 0.6}
                    onChange={(e) => patchEl(selected.id, { shadowOpacity: Number(e.target.value) } as Partial<El>)}
                    className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                  />
                  <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.shadowOpacity ?? 0.6) * 100)}%</span>
                </span>
              </label>
            </>
          )}
        </div>
      )}
    </StudioInspectorSection>
  );
}
