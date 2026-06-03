import { Languages } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// KO/EN 전역 토글. App 레이아웃에서 고정 배치(동시 리팩터 중인 헤더/푸터를 건드리지 않기 위해).
export function LanguageSwitcher({ className }: { className?: string }) {
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const opts: { id: Lang; label: string }[] = [
    { id: "ko", label: "KO" },
    { id: "en", label: "EN" },
  ];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-panel/90 p-0.5 shadow-lg shadow-black/30 backdrop-blur",
        className
      )}
      role="group"
      aria-label="언어 선택 / Language"
    >
      <Languages size={13} className="ml-1.5 text-fg-3" aria-hidden />
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          className={cn(
            "rounded-full px-2 py-1 text-xs font-semibold transition-colors",
            lang === o.id ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
