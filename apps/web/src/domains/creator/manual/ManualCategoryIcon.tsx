import { BookOpen, Box, Brush, LifeBuoy, MessageSquareText, Rocket, Save, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const MANUAL_CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  start: Rocket,
  drawing: Brush,
  comic: MessageSquareText,
  three: Box,
  "ai-tools": Sparkles,
  output: Save,
  help: LifeBuoy,
};

/** 매뉴얼 분류 아이콘(장식). 알 수 없는 분류는 책 아이콘으로 표시한다. */
export function ManualCategoryIcon({ categoryId, size = 16 }: { readonly categoryId: string; readonly size?: number }) {
  const Icon = MANUAL_CATEGORY_ICONS[categoryId] ?? BookOpen;
  return <Icon size={size} aria-hidden="true" />;
}
