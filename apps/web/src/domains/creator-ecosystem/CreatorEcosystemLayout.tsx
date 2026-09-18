import { BriefcaseBusiness, GraduationCap, LibraryBig, Sparkles } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

import type { ReactNode } from "react";

const NAV_ITEMS = [
  {
    to: "/ecosystem/education",
    label: "성장 · 교육",
    description: "학과·학원·교육·지원사업",
    icon: GraduationCap,
  },
  {
    to: "/ecosystem/collaboration",
    label: "비즈니스 · 협업",
    description: "굿즈·영상·브랜드·IP 제안",
    icon: BriefcaseBusiness,
  },
  {
    to: "/ecosystem/fandom",
    label: "팬덤 · 코스프레",
    description: "코스프레·행사·팬 창작",
    icon: Sparkles,
  },
  {
    to: "/ecosystem/library",
    label: "라이브러리",
    description: "소장·읽음·대여·도서관",
    icon: LibraryBig,
  },
] as const;

export function CreatorEcosystemLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 text-fg sm:px-6 sm:py-12">
      <header className="overflow-hidden rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <p className="eyebrow text-accent">TOONSPECTRUM CREATOR ECOSYSTEM</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">{intro}</p>
      </header>
      <nav
        aria-label="창작자 생태계 메뉴"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {NAV_ITEMS.map(({ to, label, description, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              "group rounded-2xl border p-4 transition-colors",
              isActive
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-panel hover:border-accent/50 hover:bg-raised",
            )}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="mt-3 block text-sm font-bold">{label}</span>
            <span className="mt-1 block text-xs leading-5 text-fg-3">{description}</span>
          </NavLink>
        ))}
      </nav>
      {children}
    </main>
  );
}
