/**
 * Character Shaper — one visual preset card (4:5 preview, name, one-line intent, badge).
 *
 * States follow the design brief §3: default / hover / focus-visible / selected (accent ring +
 * check) / partial (warn badge + reason) / unavailable (dimmed + reason, still focusable,
 * `aria-disabled`). A deliberate hover or keyboard focus may enter a reversible runtime audition;
 * only a click promotes that candidate into document history.
 */
import { Ban, Check, Eye, Image, PencilRuler, TriangleAlert } from "lucide-react";
import { useId, useRef } from "react";

import { useCharacterRuntimeThumbnail } from "../character-platform/thumbnail/character-runtime-thumbnail-store";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { CharacterSlotPreview } from "./character-shaper-preview";
import { characterGridDirectionForKey, describeAvailabilityBadge } from "./character-shaper-ui-model";

import type { CharacterSlotCardProps } from "./character-shaper-ui-contract";
import type { KeyboardEvent } from "react";

import { cn } from "@/shared/lib/utils";

const BADGE_TONE_CLASS = {
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/45 bg-warn/15 text-warn",
  bad: "border-bad/45 bg-bad/15 text-bad",
} as const;

export function CharacterSlotCard({
  entry,
  availability,
  selected,
  previewed = false,
  tabIndex,
  onCommit,
  onHover,
  onFocus,
  onPreviewStart,
  onPreviewEnd,
  onKeyNavigate,
}: CharacterSlotCardProps) {
  const detailId = useId();
  const capturedThumbnail = useCharacterRuntimeThumbnail(entry.id);
  // The recorder captures the committed composite, not an isolated candidate. Only the selected
  // card may truthfully label that image as its own runtime result.
  const runtimeThumbnail = selected ? capturedThumbnail : null;
  const pointerInsideRef = useRef(false);
  const focusedRef = useRef(false);
  const badge = describeAvailabilityBadge(availability);
  const unavailable = availability.status === "unavailable";
  const showBadge = availability.status !== "available";
  const title = badge.detail ? `${entry.label} · ${badge.label} — ${badge.detail}` : `${entry.label} · ${entry.hint}`;

  const startPreview = () => {
    if (!unavailable) onPreviewStart?.(entry);
  };
  const endPreview = () => onPreviewEnd?.(entry.id);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const direction = characterGridDirectionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    onKeyNavigate(direction);
  };

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={unavailable || undefined}
      aria-describedby={badge.detail ? detailId : undefined}
      tabIndex={tabIndex}
      title={title}
      data-character-slot-card={entry.id}
      data-character-slot-card-availability={availability.status}
      data-character-slot-card-selected={selected ? "true" : undefined}
      data-character-slot-card-previewed={previewed ? "true" : undefined}
      data-character-slot-card-runtime-thumbnail={runtimeThumbnail ? "true" : undefined}
      className={cn(
        "group relative flex min-h-11 w-full min-w-0 flex-col overflow-hidden rounded-2xl border text-left",
        "transition-[transform,border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        STUDIO_FOCUS_RING,
        previewed
          ? "border-accent bg-accent-soft/55 shadow-[0_0_0_2px_var(--color-accent)]"
          : selected
            ? "border-accent bg-accent-soft/40 shadow-[0_0_0_1px_var(--color-accent)]"
            : "border-line bg-card hover:border-line-strong hover:bg-raised/70",
        unavailable ? "cursor-not-allowed" : "hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
      )}
      onClick={() => {
        if (unavailable) return;
        onCommit(entry);
      }}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
        onHover(entry.id);
        startPreview();
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        onHover(null);
        if (!focusedRef.current) endPreview();
      }}
      onFocus={() => {
        focusedRef.current = true;
        onFocus(entry.id);
        startPreview();
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (!pointerInsideRef.current) endPreview();
      }}
      onKeyDown={handleKeyDown}
    >
      <span
        className={cn(
          "relative block aspect-[4/5] w-full overflow-hidden bg-canvas/70",
          unavailable && "opacity-45 grayscale-[0.4]",
        )}
      >
        {runtimeThumbnail ? (
          <img
            src={runtimeThumbnail}
            alt=""
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <CharacterSlotPreview spec={entry.preview} selected={selected} className="h-full w-full" title={entry.label} />
        )}
        <span title={runtimeThumbnail ? "현재 선택한 전체 캐릭터 조합의 실제 이미지입니다." : "모양을 설명하는 도해입니다. 실제 적용 결과는 3D 화면에서 확인하세요."}
          className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full border border-line/70 bg-panel/85 px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2 backdrop-blur">
          {runtimeThumbnail ? <Image size={9} aria-hidden /> : <PencilRuler size={9} aria-hidden />}
          {runtimeThumbnail ? "현재 조합 · 실제 3D" : "모양 도해"}
        </span>
        {previewed ? (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full border border-accent/60 bg-panel/90 px-1.5 py-0.5 text-[0.6rem] font-bold text-accent backdrop-blur">
            <Eye size={10} aria-hidden />
            3D 미리보기
          </span>
        ) : showBadge ? (
          <span
            className={cn(
              "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold backdrop-blur",
              BADGE_TONE_CLASS[badge.tone],
            )}
          >
            {unavailable ? <Ban size={10} aria-hidden /> : <TriangleAlert size={10} aria-hidden />}
            {badge.label}
          </span>
        ) : null}
        {previewed ? (
          <span className="absolute bottom-1.5 right-1.5 rounded-full border border-accent/50 bg-panel/90 px-2 py-0.5 text-[0.58rem] font-bold text-accent backdrop-blur">
            클릭해 확정
          </span>
        ) : null}
        {selected ? (
          <span aria-hidden className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow-sm">
            <Check size={14} />
          </span>
        ) : null}
      </span>
      <span className={cn("flex min-w-0 flex-col gap-0.5 px-2.5 py-2", unavailable && "opacity-70")}>
        <span className="break-words text-[0.8rem] font-semibold leading-tight text-fg">{entry.label}</span>
        <span className="line-clamp-1 text-[0.68rem] leading-snug text-fg-3">{entry.hint}</span>
        {badge.detail ? (
          <span
            id={detailId}
            className={cn(
              "mt-1 block break-words text-[0.66rem] leading-snug",
              badge.tone === "bad" ? "text-bad" : "text-warn",
            )}
          >
            {badge.detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}
