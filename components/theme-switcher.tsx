import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// 다크/주간 토글. App 레이아웃에서 언어 스위처 옆 고정 배치.
export function ThemeSwitcher({ className }: { className?: string }) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "주간 모드로 전환" : "야간 모드로 전환"}
      title={isDark ? "주간 모드" : "야간 모드"}
      className={cn(
        "grid size-9 place-items-center rounded-full border border-line bg-panel/90 text-fg-2 shadow-lg shadow-[oklch(0.1_0.02_70/0.3)] backdrop-blur transition-colors hover:text-fg",
        className
      )}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
