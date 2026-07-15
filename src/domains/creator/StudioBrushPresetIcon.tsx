/**
 * StudioBrushPresetIcon — Lucide glyph for a built-in brush preset id.
 * Keeps icon choice out of pure modules (studio-brush-icons.ts holds keys only).
 */
import {
  ALargeSmall,
  Brush,
  CircleDot,
  Droplets,
  Flame,
  Gem,
  Grid3x3,
  Highlighter,
  Paintbrush,
  Pen,
  PenLine,
  Pencil,
  Sparkles,
  SprayCan,
  Star,
  Sun,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { studioBrushIconId, type StudioBrushIconId } from "./studio-brush-icons";

import { cn } from "@/lib/utils";

const ICON_MAP: Record<StudioBrushIconId, LucideIcon> = {
  pen: Pen,
  "pen-line": PenLine,
  pencil: Pencil,
  highlighter: Highlighter,
  brush: Brush,
  paintbrush: Paintbrush,
  "spray-can": SprayCan,
  droplets: Droplets,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  "circle-dot": CircleDot,
  waves: Waves,
  flame: Flame,
  wind: Wind,
  "grid-3x3": Grid3x3,
  gem: Gem,
  "a-large-small": ALargeSmall,
  default: Pen,
};

export interface StudioBrushPresetIconProps {
  brushId: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible name; defaults to decorative (aria-hidden). */
  title?: string;
}

export function StudioBrushPresetIcon({
  brushId,
  size = 14,
  strokeWidth = 1.75,
  className,
  title,
}: StudioBrushPresetIconProps): React.ReactElement {
  const key = studioBrushIconId(brushId);
  const Icon = ICON_MAP[key] ?? Pen;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", className)}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-studio-brush-icon={key}
      data-studio-brush-icon-for={brushId}
    />
  );
}
