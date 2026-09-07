/**
 * Character Shaper — one visual preset card (4:5 preview, name, one-line intent, badge).
 *
 * States follow the design brief §3: default / hover / focus-visible / selected (accent ring +
 * check) / partial (warn badge + reason) / unavailable (dimmed + reason, still focusable,
 * `aria-disabled`). Hover never mutates the scene — it only reports the id for the inspector.
 */
import { Ban, Check, Image, TriangleAlert } from "lucide-react";
import { useId } from "react";

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
  tabIndex,
  onCommit,
  onHover,
  onFocus,
  onKeyNavigate,
}: CharacterSlotCardProps) {
  const detailId = useId();
  const runtimeThumbnail = useCharacterRuntimeThumbnail(entry.id);
  const badge = describeAvailabilityBadge(availability);
  const unavailable = availability.status === "unavailable";
  const showBadge = availability.status !== "available";
  const title = badge.detail ? `${entry.label} · ${badge.label} — ${badge.detail}` : `${entry.label} · ${entry.hint}`;

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
      data-character-slot-card-runtime-thumbnail={runtimeThumbnail ? "true" : undefined}
      className={cn(
        "group relative flex min-h-11 w-full min-w-0 flex-col overflow-hidden rounded-2xl border text-left",
        "transition-[transform,border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        STUDIO_FOCUS_RING,
        selected
          ? "border-accent bg-accent-soft/40 shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-line bg-card hover:border-line-strong hover:bg-raised/70",
        unavailable ? "cursor-not-allowed" : "hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
      )}
      onClick={() => {
        if (unavailable) return;
        onCommit(entry);
      }}
      onPointerEnter={() => onHover(entry.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onFocus(entry.id)}
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
            className="h-full w-full object-cover"
          />
        ) : (
          <CharacterSlotPreview spec={entry.preview} selected={selected} className="h-full w-full" title={entry.label} />
        )}
        {runtimeThumbnail ? (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full border border-line/70 bg-panel/85 px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2 backdrop-blur">
            <Image size={9} aria-hidden />
            실제 모델
          </span>
        ) : null}
        {showBadge ? (
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
