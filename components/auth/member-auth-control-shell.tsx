import { LogIn } from "lucide-react";
import { lazy, Suspense, useState, type ComponentType } from "react";

import { cx } from "@/lib/cx";
import { keepInlineText } from "@/lib/text";

type MemberAuthIslandProps = {
  defaultOpen?: boolean;
};
type MemberAuthIslandModule = { default: ComponentType<MemberAuthIslandProps> };

let memberAuthIslandPromise: Promise<MemberAuthIslandModule> | null = null;

function loadMemberAuthIsland(): Promise<MemberAuthIslandModule> {
  memberAuthIslandPromise ??= import("./member-auth-island").then((mod) => ({ default: mod.MemberAuthIsland }));
  return memberAuthIslandPromise;
}

const MemberAuthIsland = lazy(loadMemberAuthIsland);

function preloadMemberAuthIsland(): void {
  void loadMemberAuthIsland();
}

function MemberAuthFallback({
  className,
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={preloadMemberAuthIsland}
      onFocus={preloadMemberAuthIsland}
      aria-label="회원 로그인"
      className={cx(
        "flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-card px-3 text-sm font-medium text-fg-2 [text-wrap:nowrap] [word-break:keep-all] transition-colors hover:border-line-strong hover:text-fg",
        className
      )}
    >
      <LogIn size={16} className="shrink-0" />
      <span className="hidden min-w-max whitespace-nowrap [text-wrap:nowrap] [word-break:keep-all] xl:inline-block">
        {keepInlineText("회원")}
      </span>
    </button>
  );
}

export function MemberAuthControlShell({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);

  const openAuth = () => {
    setDefaultOpen(true);
    setEnabled(true);
  };

  if (!enabled) {
    return <MemberAuthFallback className={className} onClick={openAuth} />;
  }

  return (
    <Suspense fallback={<MemberAuthFallback className={className} onClick={openAuth} />}>
      <MemberAuthIsland defaultOpen={defaultOpen} />
    </Suspense>
  );
}
