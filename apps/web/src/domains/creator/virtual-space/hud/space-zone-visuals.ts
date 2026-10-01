import {
  Brush,
  Coffee,
  DoorOpen,
  Footprints,
  Gamepad2,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Palmtree,
  Sparkles,
  Theater,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { StudioVirtualCampusZoneIcon, StudioVirtualCampusZoneTone } from "../studio-virtual-space-campus-world";

export const SPACE_ZONE_ICONS: Readonly<Record<StudioVirtualCampusZoneIcon, LucideIcon>> = Object.freeze({
  lobby: DoorOpen,
  studio: Brush,
  cowork: UsersRound,
  cafe: Coffee,
  talk: MessageCircle,
  plaza: Sparkles,
  event: Theater,
  game: Gamepad2,
  terrace: Palmtree,
  gallery: ImageIcon,
  commons: Footprints,
});

/** 캠퍼스 바닥 재질 톤을 테마 토큰 색에 대응한다. 테마를 바꿔도 대비가 유지된다. */
export const SPACE_ZONE_TONE_TOKENS: Readonly<Record<StudioVirtualCampusZoneTone, string>> = Object.freeze({
  marble: "var(--color-cool)",
  wood: "var(--color-warn)",
  oak: "var(--color-good)",
  cafe: "var(--color-warn)",
  carpet: "var(--color-bad)",
  stone: "var(--color-accent-2)",
  stage: "var(--color-accent)",
  mosaic: "var(--color-accent-2)",
  sand: "var(--color-warn)",
  lavender: "var(--color-accent)",
  grass: "var(--color-good)",
});

export const SPACE_ZONE_FALLBACK_ICON: LucideIcon = MapPin;
export const SPACE_ZONE_FALLBACK_TONE = "var(--color-accent)";
