import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";

import { safeAuthProfileImageSrc } from "./auth-menu-profile-image";
import { AuthMenuTrigger } from "./auth-menu-trigger";

import { subscribeAuthModalRequests } from "@/compat/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { useSession } from "@/compat/auth-session-store";

type AuthMenuProps = {
  defaultOpen?: boolean;
  defaultMenuOpen?: boolean;
  defaultMode?: "login" | "signup";
};
type AuthMenuModule = { default: ComponentType<AuthMenuProps> };

let authMenuPromise: Promise<AuthMenuModule> | null = null;

function loadAuthMenu(): Promise<AuthMenuModule> {
  authMenuPromise ??= import("./auth-menu").then((mod) => ({
    default: mod.AuthMenu,
  }));
  return authMenuPromise;
}

const AuthMenu = lazy(loadAuthMenu);

function preloadAuthMenu(): void {
  void loadAuthMenu();
}

function AuthMenuFallback({ onClick }: { onClick: () => void }) {
  const { data: session, status } = useSession();
  const t = useT();
  const preloadProps = {
    onClick,
    onMouseEnter: preloadAuthMenu,
    onFocus: preloadAuthMenu,
  };

  if (status === "authenticated") {
    const initial = (session.user.name ?? session.user.email ?? "U")
      .charAt(0)
      .toUpperCase();
    return (
      <AuthMenuTrigger
        {...preloadProps}
        variant="signed-in"
        label={translateCurrentStaticSourceText(
          "domains.auth.components.auth.menu.shell",
          "ko",
          "계정 메뉴"
        )}
        initial={initial}
        imageSrc={safeAuthProfileImageSrc(session.user.image)}
      />
    );
  }

  return (
    <AuthMenuTrigger
      {...preloadProps}
      variant="signed-out"
      label={t("nav.login")}
    />
  );
}

export function AuthMenuShell() {
  const { status } = useSession();
  const [enabled, setEnabled] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [defaultMenuOpen, setDefaultMenuOpen] = useState(false);
  const [defaultMode, setDefaultMode] = useState<"login" | "signup">("login");

  useEffect(
    () =>
      subscribeAuthModalRequests((detail) => {
        if (status === "authenticated") return;
        setDefaultMode(detail.mode ?? "login");
        setDefaultOpen(true);
        setDefaultMenuOpen(false);
        setEnabled(true);
      }),
    [status]
  );

  const openAuth = () => {
    const authenticated = status === "authenticated";
    setDefaultMode("login");
    setDefaultOpen(!authenticated);
    setDefaultMenuOpen(authenticated);
    setEnabled(true);
  };

  if (!enabled) {
    return <AuthMenuFallback onClick={openAuth} />;
  }

  return (
    <Suspense fallback={<AuthMenuFallback onClick={openAuth} />}>
      <AuthMenu
        defaultOpen={defaultOpen}
        defaultMenuOpen={defaultMenuOpen}
        defaultMode={defaultMode}
      />
    </Suspense>
  );
}
