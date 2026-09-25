import { BriefcaseBusiness, LayoutDashboard, UsersRound } from "lucide-react";
import { useLocation } from "react-router-dom";

import {
  TEAM_AREA_DESTINATIONS,
  teamAreaSectionForPath,
  type TeamAreaSection,
} from "./team-area-navigation-model";

import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";

const ICONS: Readonly<Record<TeamAreaSection, typeof LayoutDashboard>> = {
  overview: LayoutDashboard,
  people: UsersRound,
  recruiting: BriefcaseBusiness,
};

export function TeamAreaNavigation({
  className,
  compact = false,
}: {
  readonly className?: string;
  readonly compact?: boolean;
}) {
  const { pathname } = useLocation();
  const active = teamAreaSectionForPath(pathname);

  return (
    <nav
      aria-label="협업 영역"
      className={cn(
        "grid gap-2 rounded-2xl border border-line bg-panel p-2 sm:grid-cols-3",
        compact && "rounded-xl bg-card/55",
        className,
      )}
    >
      {TEAM_AREA_DESTINATIONS.map((item) => {
        const Icon = ICONS[item.id];
        const current = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
              current
                ? "border-accent/45 bg-accent-soft text-fg"
                : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
            )}
          >
            <span className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-fg-2",
              current && "bg-accent text-on-accent",
            )}>
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm">{item.label}</strong>
              {!compact ? (
                <small className="mt-0.5 block text-xs leading-relaxed text-fg-3">
                  {item.description}
                </small>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
