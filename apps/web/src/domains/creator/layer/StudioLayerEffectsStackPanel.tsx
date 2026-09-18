import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
/**
 * Studio Non-Destructive Layer Effects Stack Panel
 *
 * CLIP STUDIO PAINT Ver.5.1.0 Parity:
 * - Non-destructive multi-effects manager:
 *   - Glow (외곽 / 내부 발광)
 *   - Drop Shadow (그림자 드리우기: 각도, 거리, 번짐, 불투명도, 색상)
 *   - Relief (부조 / 양각·음각 입체 조명: 고도, 방위, 깊이, 강도)
 *   - Border (경계 효과: 반투명 픽셀 고려 부드러운 테두리)
 * - Stack reordering, one-click toggle, and live parameter adjustments.
 */

import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  addLayerEffect,
  createDefaultLayerEffect,
  removeLayerEffect,
  reorderLayerEffect,
  toggleLayerEffect,
  updateLayerEffect,
  type StudioBorderEffectItem,
  type StudioDropShadowEffect,
  type StudioGlowEffect,
  type StudioLayerEffect,
  type StudioLayerEffectsStack,
  type StudioReliefEffect,
} from "./studio-layer-effects-stack";

export interface StudioLayerEffectsStackPanelProps {
  readonly stack: StudioLayerEffectsStack;
  readonly onChange: (nextStack: StudioLayerEffectsStack) => void;
}

export function StudioLayerEffectsStackPanel({
  stack,
  onChange,
}: StudioLayerEffectsStackPanelProps) {
  const [expandedEffectId, setExpandedEffectId] = useState<string | null>(null);

  const handleAddEffect = (kind: StudioLayerEffect["kind"]) => {
    const newEffect = createDefaultLayerEffect(kind);
    const nextStack = addLayerEffect(stack, newEffect);
    onChange(nextStack);
    setExpandedEffectId(newEffect.id);
  };

  const handleToggle = (id: string) => {
    onChange(toggleLayerEffect(stack, id));
  };

  const handleRemove = (id: string) => {
    onChange(removeLayerEffect(stack, id));
    if (expandedEffectId === id) setExpandedEffectId(null);
  };

  const handleMove = (fromIndex: number, toIndex: number) => {
    onChange(reorderLayerEffect(stack, fromIndex, toIndex));
  };

  const handleUpdate = <T extends StudioLayerEffect>(id: string, patch: Partial<T>) => {
    onChange(updateLayerEffect(stack, id, patch));
  };

  return (
    <div
      data-studio-layer-effects-stack-panel
      className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-xs text-fg"
    >
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <span className="font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "레이어 효과 스택 (비파괴)")}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleAddEffect("glow")}
            aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "발광 효과 추가")}
            className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] font-medium text-fg-2 hover:bg-accent-soft hover:text-accent"
          >
            {translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "+ 발광")}</button>
          <button
            type="button"
            onClick={() => handleAddEffect("drop-shadow")}
            aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "그림자 효과 추가")}
            className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] font-medium text-fg-2 hover:bg-accent-soft hover:text-accent"
          >
            {translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "+ 그림자")}</button>
          <button
            type="button"
            onClick={() => handleAddEffect("relief")}
            aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "부조 효과 추가")}
            className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] font-medium text-fg-2 hover:bg-accent-soft hover:text-accent"
          >
            {translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "+ 부조")}</button>
          <button
            type="button"
            onClick={() => handleAddEffect("border")}
            aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "테두리 효과 추가")}
            className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] font-medium text-fg-2 hover:bg-accent-soft hover:text-accent"
          >
            {translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "+ 테두리")}</button>
        </div>
      </div>

      {stack.effects.length === 0 ? (
        <div className="py-4 text-center text-[0.68rem] text-fg-3">
          {translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "적용된 레이어 효과가 없습니다. 위의 버튼으로 효과를 추가하세요.")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {stack.effects.map((effect, index) => {
            const isExpanded = expandedEffectId === effect.id;

            return (
              <div
                key={effect.id}
                className="overflow-hidden rounded-lg border border-line/70 bg-panel/50"
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggle(effect.id)}
                      aria-label={effect.enabled ? translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "효과 끄기") : translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "효과 켜기")}
                      className="text-fg-3 hover:text-fg"
                    >
                      {effect.enabled ? (
                        <Eye className="size-3.5 text-accent" />
                      ) : (
                        <EyeOff className="size-3.5 opacity-60" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedEffectId(isExpanded ? null : effect.id)}
                      className="text-left font-medium text-fg-2 hover:underline"
                    >
                      {effect.kind === "glow" && formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "발광 ({v0})"), { v0: String(effect.type === "outer" ? "외곽" : "내부") })}
                      {effect.kind === "drop-shadow" && translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "드롭 섀도")}
                      {effect.kind === "relief" && translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "부조 (엠보스)")}
                      {effect.kind === "border" && formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "테두리 ({v0}px)"), { v0: String(effect.thickness) })}
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, index - 1)}
                      aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "위로 이동")}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === stack.effects.length - 1}
                      onClick={() => handleMove(index, index + 1)}
                      aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "아래로 이동")}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(effect.id)}
                      aria-label={translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "효과 삭제")}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised hover:text-danger"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-line/50 bg-raised/20 p-2 text-[0.68rem]">
                    {effect.kind === "glow" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "형태")}</span>
                          <select
                            value={effect.type}
                            onChange={(e) =>
                              handleUpdate<StudioGlowEffect>(effect.id, {
                                type: e.target.value as "outer" | "inner",
                              })
                            }
                            className="rounded border border-line bg-card px-1 text-[0.65rem]"
                          >
                            <option value="outer">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "외곽 발광")}</option>
                            <option value="inner">{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "내부 발광")}</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "번짐 (Blur)")}</span>
                          <input
                            type="range"
                            min={1}
                            max={64}
                            value={effect.blur}
                            onChange={(e) =>
                              handleUpdate<StudioGlowEffect>(effect.id, { blur: Number(e.target.value) })
                            }
                            className="w-24 accent-accent"
                          />
                          <span className="w-8 text-right font-mono">{effect.blur}px</span>
                        </div>
                      </div>
                    )}

                    {effect.kind === "drop-shadow" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "거리 / 각도")}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={64}
                              value={effect.distance}
                              onChange={(e) =>
                                handleUpdate<StudioDropShadowEffect>(effect.id, {
                                  distance: Number(e.target.value),
                                })
                              }
                              className="w-12 rounded border border-line bg-card px-1 font-mono text-[0.65rem]"
                            />
                            <span>px</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "흐림 (Blur)")}</span>
                          <input
                            type="range"
                            min={0}
                            max={50}
                            value={effect.blur}
                            onChange={(e) =>
                              handleUpdate<StudioDropShadowEffect>(effect.id, {
                                blur: Number(e.target.value),
                              })
                            }
                            className="w-24 accent-accent"
                          />
                          <span className="w-8 text-right font-mono">{effect.blur}px</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "불투명도")}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(effect.opacity * 100)}
                            onChange={(e) =>
                              handleUpdate<StudioDropShadowEffect>(effect.id, {
                                opacity: Number(e.target.value) / 100,
                              })
                            }
                            className="w-24 accent-accent"
                          />
                          <span className="w-8 text-right font-mono">
                            {Math.round(effect.opacity * 100)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {effect.kind === "relief" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "고도각 (Elevation)")}</span>
                          <input
                            type="range"
                            min={0}
                            max={90}
                            value={effect.elevationDeg}
                            onChange={(e) =>
                              handleUpdate<StudioReliefEffect>(effect.id, {
                                elevationDeg: Number(e.target.value),
                              })
                            }
                            className="w-24 accent-accent"
                          />
                          <span className="w-8 text-right font-mono">{effect.elevationDeg}°</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "깊이 (Depth)")}</span>
                          <input
                            type="range"
                            min={1}
                            max={15}
                            value={effect.depth}
                            onChange={(e) =>
                              handleUpdate<StudioReliefEffect>(effect.id, { depth: Number(e.target.value) })
                            }
                            className="w-24 accent-accent"
                          />
                          <span className="w-8 text-right font-mono">{effect.depth}</span>
                        </div>
                      </div>
                    )}

                    {effect.kind === "border" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "테두리 굵기")}</span>
                          <input
                            type="range"
                            min={1}
                            max={32}
                            value={effect.thickness}
                            onChange={(e) =>
                              handleUpdate<StudioBorderEffectItem>(effect.id, {
                                thickness: Number(e.target.value),
                              })
                            }
                            className="w-24 accent-accent"
                          />
                          <span className="w-8 text-right font-mono">{effect.thickness}px</span>
                        </div>
                        <label className="flex cursor-pointer items-center justify-between gap-2 pt-1">
                          <span>{translateCurrentStaticSourceText("domains.creator.layer.StudioLayerEffectsStackPanel", "ko", "반투명 픽셀 고려 (CSP v5.1)")}</span>
                          <input
                            type="checkbox"
                            checked={effect.respectTransparency}
                            onChange={(e) =>
                              handleUpdate<StudioBorderEffectItem>(effect.id, {
                                respectTransparency: e.target.checked,
                              })
                            }
                            className="rounded accent-accent"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
