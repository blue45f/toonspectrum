import { Palette } from "lucide-react";

import { useAppearanceDialog } from "@/shared/lib/appearance-dialog-store";
import { useI18n } from "@/shared/lib/i18n";
import type { AppearanceScope } from "@/shared/lib/theme-presets";

export function AppearanceTrigger({ scope = "site", className = "", showLabel = false }: {
  scope?: AppearanceScope;
  className?: string;
  showLabel?: boolean;
}) {
  const open = useAppearanceDialog((state) => state.open);
  const expanded = useAppearanceDialog((state) => state.scope === scope);
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const label = korean ? "디자인 테마" : "Design themes";
  return (
    <button type="button" className={`appearance-trigger ${className}`} aria-label={label}
      title={label} aria-haspopup="dialog" aria-expanded={expanded} onClick={(event) => open(scope, event.currentTarget)}>
      <Palette size={17} aria-hidden />{showLabel && <span>{label}</span>}
    </button>
  );
}
