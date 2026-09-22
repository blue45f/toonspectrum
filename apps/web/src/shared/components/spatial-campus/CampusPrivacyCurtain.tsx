import { Eye, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/shared/lib/i18n";

export function CampusPrivacyCurtain({
  active,
  children,
  onReveal,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly onReveal: () => void;
}) {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  return (
    <div className="campus-privacy-shell" data-campus-privacy={active ? "hidden" : "visible"}>
      <div
        className="campus-private-content"
        aria-hidden={active || undefined}
        inert={active || undefined}
      >
        {children}
      </div>
      {active ? (
        <div
          className="campus-privacy-curtain"
          role="region"
          aria-label={locale === "ko" ? "개인 작업 보호" : "Private-work protection"}
        >
          <ShieldCheck size={28} aria-hidden="true" />
          <strong>{locale === "ko" ? "개인 작업을 가렸습니다" : "Private work is hidden"}</strong>
          <p>{locale === "ko"
            ? "ToonStudio 안의 개인 작업만 가립니다. 전체 화면 공유 중인 다른 앱과 운영체제 알림은 별도로 확인하세요."
            : "This hides private work inside ToonStudio only. Check other apps and operating-system notifications when sharing your full screen."}</p>
          <button type="button" className="campus-control" onClick={onReveal}>
            <Eye size={17} aria-hidden="true" />
            {locale === "ko" ? "가림 해제" : "Reveal private view"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
