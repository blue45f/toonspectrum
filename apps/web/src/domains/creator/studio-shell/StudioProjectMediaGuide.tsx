import { Headphones, PlayCircle, Square, Volume2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioProjectSection } from "../studio-project-views";

const COPY: Readonly<Record<StudioProjectSection, readonly [string, string]>> = {
  overview: ["프로젝트 전체 진행, 다음 작업, 독자 반응과 제작 신호를 확인하는 화면입니다.", "Review overall progress, next actions, audience signals and production health."],
  story: ["시놉시스와 웹소설 회차를 정리하고, 장면과 컷 계획으로 변환한 뒤 설정 연속성을 확인합니다.", "Develop synopsis and web-novel chapters, adapt them into scenes and panel plans, then check continuity."],
  production: ["작화·배경·채색·식자·검수 작업을 역할별로 관리하고 필요한 외부 어시스트 인력을 소싱합니다.", "Manage art, background, color, lettering and review work by role, including external assistant sourcing."],
  assets: ["프로젝트에서 사용하는 캐릭터, 배경, 브러시와 권리 정보를 한곳에서 관리합니다.", "Manage project characters, backgrounds, brushes and their rights information."],
  review: ["원고 변경과 피드백을 검토하고 승인할 버전과 수정 요청을 정리합니다.", "Review manuscript changes and feedback, then organize approvals and requested revisions."],
  export: ["공개 전 호환성·연령 등급·권리 상태를 확인하고 배포 패키지와 판권 피치 자료를 준비합니다.", "Check compatibility, audience rating and rights before building release packages and IP pitch material."],
  settings: ["프로젝트 기본값, 팀, 자동화, 연령 정책과 보관 설정을 관리합니다.", "Manage project defaults, team, automation, audience policy and archive settings."],
};

export function StudioProjectMediaGuide({
  section,
}: {
  readonly section: StudioProjectSection;
}) {
  const bt = useBilingual("StudioProjectMediaGuide");
  const [speaking, setSpeaking] = useState(false);
  const message = useMemo(() => bt(...COPY[section]), [bt, section]);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = () => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = document.documentElement.lang?.startsWith("en") ? "en-US" : "ko-KR";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  return (
    <aside className="rounded-2xl border border-line bg-panel/70 p-3 sm:p-4" aria-label={bt("이 페이지 도움말", "Page guide")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Headphones size={18} aria-hidden="true" /></span>
        <p className="min-w-0 flex-1 text-xs leading-5 text-fg-2">{message}</p>
        <div className="flex flex-wrap gap-2">
          {speechSupported ? (
            <button type="button" onClick={speaking ? stop : speak} className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}>
              {speaking ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
              {speaking ? bt("음성 중지", "Stop voice") : bt("음성으로 듣기", "Listen")}
            </button>
          ) : null}
          <Link to="/studio/support#product-tour" className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            <PlayCircle size={14} aria-hidden="true" /> {bt("영상 가이드", "Video guide")}
          </Link>
        </div>
      </div>
    </aside>
  );
}
