import { ArrowRight, FolderKanban, House } from "lucide-react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 사이트 홈은 로그인해도 그대로 두고, 개인 동선은 이 얇은 스트립으로만 얹는다.
 * 최근 프로젝트 목록 자체는 별도 목적지인 내 홈(/home)이 소유한다.
 */
export function HomePersonalStrip() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const { data, status } = useSession();
  if (status !== "authenticated") return null;
  const name = data.user.name?.trim();
  return (
    <section className="rd-personal" aria-label={bi("내 작업 이어가기", "Continue your work")}>
      <div className="rd-personal-copy">
        <strong>{name ? bi(`${name}님, 다시 오셨네요`, `Welcome back, ${name}`) : bi("다시 오셨네요", "Welcome back")}</strong>
        <p>{bi("내 홈에서 최근 프로젝트를 이어서 작업할 수 있어요.", "Pick up your recent projects from your home.")}</p>
      </div>
      <div className="rd-personal-actions">
        <Link className="rd-personal-primary" href="/home"><House size={16} aria-hidden="true" />{bi("내 홈 열기", "Open my home")}<ArrowRight size={15} aria-hidden="true" /></Link>
        <Link className="rd-personal-secondary" href="/studio"><FolderKanban size={15} aria-hidden="true" />{bi("내 프로젝트", "My projects")}</Link>
      </div>
    </section>
  );
}
