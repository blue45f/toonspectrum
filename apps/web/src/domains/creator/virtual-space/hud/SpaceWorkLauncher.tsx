import { BookOpen, PlayCircle } from "lucide-react";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { SpacePopover } from "./SpacePopover";
import type { SpaceWorkProject } from "./use-space-work-project";

export interface SpaceWorkTriggerProps {
  readonly className: string;
  readonly onClick: () => void;
  readonly "aria-haspopup"?: "dialog";
  readonly "aria-expanded"?: boolean;
  readonly "data-space-exact-resume"?: "true";
  readonly children: ReactNode;
}

/**
 * 도크의 주 버튼 '작업 시작'.
 * 정확한 이어하기 대상이 있으면 한 번에 원고를 열고, 없으면 작업 선택 팝오버를 연다.
 * 버튼 요소는 Page가 render prop으로 그려 주 동작 계약 속성을 유지한다.
 */
export function SpaceWorkLauncher({ project, open, sheet, onOpenChange, trigger, children }: {
  readonly project: SpaceWorkProject;
  readonly open: boolean;
  readonly sheet: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trigger: (props: SpaceWorkTriggerProps) => ReactElement;
  /** 팝오버 안의 작업 선택지. */
  readonly children: ReactNode;
}) {
  const bt = useBilingual("SpaceWorkLauncher");
  const navigate = useNavigate();
  const anchorRef = useRef<HTMLDivElement>(null);
  // 이어하기 검증이 실패하면 팝오버를 열지 않고(기존 계약) 이유만 짧게 알린다.
  const [resumeStale, setResumeStale] = useState(false);
  const { resumeHref, verifyResume } = project;
  const props: SpaceWorkTriggerProps = resumeHref ? {
    className: "space-dock__primary",
    "data-space-exact-resume": "true",
    onClick: () => {
      if (verifyResume(resumeHref)) {
        setResumeStale(false);
        navigate(resumeHref);
      } else {
        setResumeStale(true);
      }
    },
    children: <><PlayCircle size={18} aria-hidden /><span>{bt("원고 이어하기", "Resume manuscript")}</span></>,
  } : {
    className: "space-dock__primary",
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    onClick: () => { setResumeStale(false); onOpenChange(!open); },
    children: <><BookOpen size={18} aria-hidden /><span>{bt("작업 시작", "Start work")}</span></>,
  };
  return <div ref={anchorRef} className="workspace-live-actions space-dock__work space-dock__anchor">
    {trigger(props)}
    {!resumeHref ? <SpacePopover open={open} sheet={sheet} anchorRef={anchorRef} onClose={() => onOpenChange(false)}
      title={bt("무엇부터 할까요?", "What will you work on?")} className="space-popover--work">
      {children}
    </SpacePopover> : null}
    {resumeStale ? <p className="space-dock__resume-note" role="status">{bt(
      "이어할 원고가 바뀌어 목록을 새로 고쳤어요. 다시 골라 주세요.",
      "The manuscript to resume changed, so the list was refreshed. Please pick it again.",
    )}</p> : null}
  </div>;
}
