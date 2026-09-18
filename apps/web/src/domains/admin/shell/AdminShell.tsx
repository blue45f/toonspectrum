import {
  ExternalLink,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { AdminMe } from "../components/admin-client";
import { AdminHeaderStats } from "../components/AdminHeaderStats";
import { AdminQuickPalette } from "../components/AdminQuickPalette";
import { AdminRouteIcon } from "../router/admin-route-icons";
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_ROUTE_BY_ID,
  resolveAdminRoute,
} from "../router/admin-route-manifest";
import { getAdminShellCopy } from "./admin-shell-copy";

import { useI18n, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { usePathname } from "@/compat/navigation";
import Link from "@/compat/router-link";

import "./admin-shell.css";

const SIDEBAR_STORAGE_KEY = "toonspectrum.admin.sidebar.collapsed.v1";

interface AdminShellProps {
  actor: AdminMe;
  userId: string;
  children: ReactNode;
}

function AdminNavigation({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const lang = useI18n((state) => state.lang);
  const copy = getAdminShellCopy(lang);
  const t = useT();

  return (
    <nav
      aria-label={copy.navigation}
      className="flex-1 overflow-y-auto px-2 py-4"
    >
      {ADMIN_NAVIGATION_GROUPS.map((group) => (
        <section
          key={group.id}
          className="mb-5"
          aria-labelledby={`admin-nav-${group.id}`}
        >
          <h2
            id={`admin-nav-${group.id}`}
            className={cn(
              "mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-3",
              collapsed && "sr-only",
            )}
          >
            {copy.groups[group.id]}
          </h2>
          <div className="space-y-1">
            {group.routeIds.map((routeId) => {
              const route = ADMIN_ROUTE_BY_ID[routeId];
              const active = resolveAdminRoute(pathname)?.id === route.id;
              return (
                <Link
                  key={route.id}
                  href={route.path}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? t(route.labelKey) : undefined}
                  title={collapsed ? t(route.labelKey) : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group flex min-h-10 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors",
                    active
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-transparent text-fg-2 hover:border-line hover:bg-raised/60 hover:text-fg",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <AdminRouteIcon
                    icon={route.icon}
                    className={cn(
                      "shrink-0",
                      active
                        ? "text-accent"
                        : "text-fg-3 group-hover:text-fg-2",
                    )}
                  />
                  <span className={cn("truncate", collapsed && "sr-only")}>
                    {t(route.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function AdminBrand({ collapsed }: { collapsed: boolean }) {
  const lang = useI18n((state) => state.lang);
  const copy = getAdminShellCopy(lang);
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-line px-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
        <ShieldCheck size={18} />
      </span>
      <div className={cn("min-w-0", collapsed && "sr-only")}>
        <p className="truncate text-sm font-semibold text-fg">ToonStudio</p>
        <p className="truncate text-[11px] text-fg-3">{copy.workspace}</p>
      </div>
    </div>
  );
}

export function AdminShell({ actor, userId, children }: AdminShellProps) {
  const pathname = usePathname();
  const lang = useI18n((state) => state.lang);
  const copy = getAdminShellCopy(lang);
  const t = useT();
  const route = resolveAdminRoute(pathname) ?? ADMIN_ROUTE_BY_ID.overview;
  const group = ADMIN_NAVIGATION_GROUPS.find((candidate) =>
    candidate.routeIds.includes(route.id),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" &&
        window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // The preference cache must not prevent navigation in storage-restricted contexts.
    }
  };

  const production = import.meta.env.PROD;

  return (
    <div
      className={cn(
        "grid min-h-[100dvh] bg-canvas text-fg",
        collapsed
          ? "lg:grid-cols-[5rem_minmax(0,1fr)]"
          : "lg:grid-cols-[16rem_minmax(0,1fr)]",
      )}
    >
      <aside className="sticky top-0 hidden h-[100dvh] min-h-0 flex-col border-r border-line bg-panel lg:flex">
        <AdminBrand collapsed={collapsed} />
        <AdminNavigation collapsed={collapsed} />
        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-fg-3 transition-colors hover:bg-raised hover:text-fg"
            aria-label={
              collapsed ? copy.expandSidebar : copy.collapseSidebar
            }
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
            {!collapsed ? <span>{copy.collapseSidebar}</span> : null}
          </button>
          <div
            className={cn(
              "mt-1 rounded-xl border border-line bg-card p-3",
              collapsed && "px-1 text-center",
            )}
          >
            <p
              className={cn(
                "truncate text-xs font-semibold text-fg",
                collapsed && "sr-only",
              )}
            >
              {actor.name ?? actor.email ?? actor.id}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-[11px] text-accent",
                collapsed && "sr-only",
              )}
            >
              {actor.role}
            </p>
            {collapsed ? (
              <ShieldCheck className="mx-auto text-accent" size={16} />
            ) : null}
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button
            type="button"
            aria-label={copy.closeNavigation}
            className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[min(20rem,88vw)] flex-col border-r border-line bg-panel shadow-2xl shadow-canvas">
            <div className="flex items-center justify-between border-b border-line pr-3">
              <AdminBrand collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={copy.closeNavigation}
                className="inline-flex size-10 items-center justify-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <AdminNavigation
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-line p-3">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-medium text-fg-2 hover:border-line-strong hover:text-fg"
              >
                {copy.publicSite} <ExternalLink size={14} />
              </Link>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 border-b border-line bg-panel/95 px-4 backdrop-blur-lg sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-fg-2 lg:hidden"
              aria-label={copy.openNavigation}
              aria-expanded={mobileOpen}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[11px] text-fg-3">
                {copy.breadcrumbRoot} /{" "}
                {group ? copy.groups[group.id] : ""}
              </p>
              <h1 className="truncate text-base font-semibold text-fg sm:text-lg">
                {t(route.labelKey)}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "hidden rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] sm:inline-flex",
                production
                  ? "border-bad/35 bg-bad/10 text-bad"
                  : "border-good/35 bg-good/10 text-good",
              )}
            >
              {production ? "PROD" : "DEV"}
            </span>
            <AdminQuickPalette userId={userId} />
            <Link
              href="/"
              aria-label={copy.openPublicSite}
              className="inline-flex size-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-card text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg md:w-auto md:px-3"
              title={copy.openPublicSite}
            >
              <span className="hidden md:inline">{copy.publicSite}</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[100rem] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          <AdminHeaderStats userId={userId} />
          <section aria-label={t(route.labelKey)} className="min-w-0">
            {children}
          </section>
        </div>
      </div>
    </div>
  );
}
