import { LogIn, UserPlus } from "lucide-react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 현재 소재·검색·프로젝트 화면을 떠나지 않고 일반 인증 절차를 시작한다. */
export function MarketAccountEntryActions({ source }: {
  readonly source: "market-library" | "market-resource-library";
}) {
  const bt = useBilingual("MarketAccountEntryActions");
  return <div className="mt-4 flex flex-wrap justify-center gap-2">
    <button type="button" onClick={() => requestAuthModalOpen({ reason: "protected-action", source, mode: "login" })}
      className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11" })}>
      <LogIn className="size-4" aria-hidden="true" />{bt("로그인하고 계속", "Sign in to continue")}
    </button>
    <button type="button" onClick={() => requestAuthModalOpen({ reason: "protected-action", source, mode: "signup" })}
      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
      <UserPlus className="size-4" aria-hidden="true" />{bt("회원가입", "Create an account")}
    </button>
  </div>;
}
