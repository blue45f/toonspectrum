import { Check, Copy, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { TeamWorkspacePage } from "./TeamWorkspacePage";

import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  clearCollaborationOnboarding,
  collaborationOnboardingEmail,
  readCollaborationOnboarding,
  type CollaborationOnboardingContext,
} from "@/shared/lib/collaboration-onboarding";

function safeClipboardWrite(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error("clipboard-unavailable"));
  return navigator.clipboard.writeText(value);
}

function CollaborationOnboardingBanner({
  context,
  onDismiss,
}: {
  readonly context: CollaborationOnboardingContext;
  readonly onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<"email" | "account" | null>(null);
  const email = collaborationOnboardingEmail(context.candidateContact);
  async function copy(kind: "email" | "account", value: string) {
    try {
      await safeClipboardWrite(value);
      setCopied(kind);
      globalThis.setTimeout(() => setCopied(null), 1_800);
    } catch {
      setCopied(null);
    }
  }
  return (
    <section className="mt-4 rounded-2xl border border-good/40 bg-good/10 p-4 text-fg sm:p-5" aria-labelledby="team-onboarding-title">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-good text-canvas"><UserPlus size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-good">합류 확정 · 다음 단계</p>
              <h1 id="team-onboarding-title" className="mt-1 text-lg font-black">{context.candidateName} 님을 팀과 작품에 연결하세요</h1>
            </div>
            <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-panel" aria-label="합류 안내 닫기" onClick={onDismiss}><X size={17} aria-hidden="true" /></button>
          </div>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-fg-2 sm:grid-cols-3">
            <li className="rounded-xl bg-panel/75 p-3"><strong className="block text-fg">1. 팀 선택</strong>기존 팀을 열거나 새 팀을 만드세요.</li>
            <li className="rounded-xl bg-panel/75 p-3"><strong className="block text-fg">2. 구성원 초대</strong>아래 계정 또는 이메일로 초대하세요.</li>
            <li className="rounded-xl bg-panel/75 p-3"><strong className="block text-fg">3. 작품 권한·첫 작업</strong>연결할 작품에서 역할과 첫 작업을 지정하세요.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {email ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void copy("email", email)}>{copied === "email" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}이메일 {copied === "email" ? "복사됨" : "복사"}</button> : null}
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void copy("account", context.candidateUserId)}>{copied === "account" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}계정 ID {copied === "account" ? "복사됨" : "복사"}</button>
          </div>
          {!email ? <p className="mt-3 text-xs leading-6 text-fg-3">지원자가 이메일 대신 연락 링크를 사용했습니다. 계정 ID로 작품 팀 초대를 보내거나 연락처에서 이메일을 확인하세요.</p> : null}
        </div>
      </div>
    </section>
  );
}

export function TeamPeoplePage() {
  const [params, setParams] = useSearchParams();
  const requestedApplicationId = params.get("onboard");
  const [onboarding, setOnboarding] = useState<CollaborationOnboardingContext | null>(null);
  useEffect(() => {
    if (!requestedApplicationId) { setOnboarding(null); return; }
    try {
      const context = readCollaborationOnboarding(sessionStorage);
      setOnboarding(context?.applicationId === requestedApplicationId ? context : null);
    } catch {
      setOnboarding(null);
    }
  }, [requestedApplicationId]);
  const navigationKey = useMemo(() => params.toString(), [params]);
  function dismissOnboarding() {
    try { clearCollaborationOnboarding(sessionStorage); } catch { /* storage may be blocked */ }
    setOnboarding(null);
    const next = new URLSearchParams(params);
    next.delete("onboard");
    setParams(next, { replace: true });
  }
  return (
    <>
      <div className="bg-canvas px-4 pt-6 text-fg" key={navigationKey}>
        <div className="mx-auto max-w-6xl">
          <TeamAreaNavigation />
          {onboarding ? <CollaborationOnboardingBanner context={onboarding} onDismiss={dismissOnboarding} /> : null}
        </div>
      </div>
      <TeamWorkspacePage />
    </>
  );
}
