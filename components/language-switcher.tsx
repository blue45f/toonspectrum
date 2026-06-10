import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const HIDE_AFTER_MS = 4000;

// KO/EN 전역 토글. App 레이아웃에서 고정 배치. 접속 몇 초 뒤 자동으로 사라지고(시야 정리),
// 마우스 오버/포커스 시 다시 나타난다(언어 변경은 계속 가능). 떠난 뒤 다시 몇 초면 숨김.
export function LanguageSwitcher({ className }: { className?: string }) {
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  };
  const reveal = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(true);
  };

  useEffect(() => {
    scheduleHide();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const opts: { id: Lang; label: string }[] = [
    { id: "ko", label: "KO" },
    { id: "en", label: "EN" },
  ];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-panel/90 p-0.5 shadow-lg shadow-[oklch(0.1_0.02_70/0.3)] backdrop-blur",
        "transition-opacity duration-500 ease-out hover:opacity-100 focus-within:opacity-100",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      role="group"
      aria-label="언어 선택 / Language"
      onMouseEnter={reveal}
      onMouseLeave={scheduleHide}
      onFocusCapture={reveal}
      onBlurCapture={scheduleHide}
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
