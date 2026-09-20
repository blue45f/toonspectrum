import { Brush, HelpCircle, Settings, UserRound } from "lucide-react";
import { useContext, type ReactNode } from "react";
import { WorkspaceAccountContext } from "./workspace-account-context";
import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import type { WorkspaceNavigationContext } from "./workspace-navigation-model";

export function WorkspaceBrand({ href = "/home" }: { readonly href?: string }) {
  return <Link href={href} className="workspace-brand" aria-label="ToonStudio">
    <span className="workspace-brand-mark" aria-hidden="true"><Brush size={20} /></span>
    <strong>ToonStudio<small>VIRTUAL STUDIO</small></strong>
  </Link>;
}

/** Only navigation lives here. Selection, permissions and document state stay with their owners. */
export function WorkspaceSidebar({ activeId, context, children }: {
  readonly activeId?: string;
  readonly context?: WorkspaceNavigationContext;
  readonly children?: ReactNode;
}) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  return <aside className="workspace-sidebar">
    <p className="workspace-sidebar-caption" aria-hidden="true">WORKSPACE</p>
    <WorkspaceNavigation activeId={activeId} context={context} />
    {children}
    <nav className="workspace-support-nav" aria-label={korean ? "도움과 환경 설정" : "Help and preferences"}>
      <Link href="/help"><HelpCircle size={18} aria-hidden="true" /><span>{korean ? "사용 가이드" : "User guide"}</span></Link>
      <Link href="/settings"><Settings size={18} aria-hidden="true" /><span>{korean ? "환경 설정" : "Preferences"}</span></Link>
    </nav>
  </aside>;
}

export function WorkspaceAccountAction() {
  const account = useContext(WorkspaceAccountContext);
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  return account ?? <Link href="/my" aria-label={korean ? "내 프로필" : "My profile"}><UserRound size={20} aria-hidden="true" /></Link>;
}
