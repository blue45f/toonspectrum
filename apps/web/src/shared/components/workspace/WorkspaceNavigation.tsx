import { useLocation } from "react-router-dom";
import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { TOONSTUDIO_PRIMARY_NAVIGATION, siteNavigationText } from "../site-navigation";
import { workspaceNavigationActiveId, workspaceNavigationContext, workspaceNavigationHref, type WorkspaceNavigationContext } from "./workspace-navigation-model";

export function WorkspaceNavigation({ activeId, studioHref, teamHref, context }: {
  readonly activeId?: string;
  readonly context?: WorkspaceNavigationContext;
  readonly studioHref?: string;
  readonly teamHref?: string;
}) {
  const locale = useI18n((state) => state.lang);
  const { pathname, search } = useLocation();
  const navigationContext = context ?? workspaceNavigationContext(pathname, search);
  const selected = activeId ?? workspaceNavigationActiveId(pathname);
  return (
    <nav className="workspace-nav" aria-label={locale.startsWith("ko") ? "주 메뉴" : "Main navigation"}>
      {TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => {
        const Icon = item.icon;
        const href = item.id === "workspace-home" ? studioHref ?? workspaceNavigationHref(item.href, navigationContext)
          : item.id === "workspace-team" ? teamHref ?? workspaceNavigationHref(item.href, navigationContext)
          : workspaceNavigationHref(item.href, navigationContext);
        return <Link key={item.id} href={href} aria-current={selected === item.id ? "page" : undefined}
          data-navigation-entry={item.id} title={siteNavigationText(item.description, locale)}>
          <Icon size={22} strokeWidth={selected === item.id ? 2.35 : 1.9} aria-hidden="true" />
          <span>{siteNavigationText(item.label, locale)}</span>
        </Link>;
      })}
    </nav>
  );
}
