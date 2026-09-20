import { useLocation } from "react-router-dom";
import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { TOONSTUDIO_PRIMARY_NAVIGATION, siteNavigationText } from "../site-navigation";
import { workspaceNavigationActiveId } from "./workspace-navigation-model";

export function WorkspaceNavigation({ activeId, studioHref, teamHref }: {
  readonly activeId?: string;
  readonly studioHref?: string;
  readonly teamHref?: string;
}) {
  const locale = useI18n((state) => state.lang);
  const { pathname } = useLocation();
  const selected = activeId ?? workspaceNavigationActiveId(pathname);
  return (
    <nav className="workspace-nav" aria-label={locale.startsWith("ko") ? "주 메뉴" : "Main navigation"}>
      {TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => {
        const Icon = item.icon;
        const href = item.id === "workspace-home" ? studioHref ?? item.href
          : item.id === "workspace-team" ? teamHref ?? item.href : item.href;
        return <Link key={item.id} href={href} aria-current={selected === item.id ? "page" : undefined}>
          <Icon size={22} aria-hidden="true" /><span>{siteNavigationText(item.label, locale)}</span>
        </Link>;
      })}
    </nav>
  );
}
