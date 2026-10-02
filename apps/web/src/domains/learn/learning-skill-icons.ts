import { BookOpen, Clapperboard, Layers, Palette, PenTool, Type, type LucideIcon } from "lucide-react";

import type { SkillId } from "./learning-paths";

/** 역량별 아이콘 — 강좌 카드와 역량 지도가 같은 그림으로 같은 역량을 가리키게 한다(아이콘 + 짧은 라벨). */
export const SKILL_ICONS: Readonly<Record<SkillId, LucideIcon>> = {
  story: BookOpen,
  direction: Clapperboard,
  drawing: PenTool,
  color: Palette,
  lettering: Type,
  workflow: Layers,
};
