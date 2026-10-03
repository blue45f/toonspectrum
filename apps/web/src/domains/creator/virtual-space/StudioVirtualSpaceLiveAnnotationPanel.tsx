import { Crosshair, MessageSquareText, PenTool, Save } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualSpaceP2pBoard, type StudioVirtualSpaceP2pBoardProps } from "./StudioVirtualSpaceP2pBoard";

type AnnotationMode = "pen" | "note";

/**
 * 라이브 주석 패널. 모드 버튼은 실제 보드 도구를 바꾼다(펜=그리기, 메모=메모 놓기).
 * 레이저 포인터는 P2P 임시 채널이 없어 제공하지 않는다(없는 기능을 버튼으로 두지 않는다).
 */
export function StudioVirtualSpaceLiveAnnotationPanel(props: StudioVirtualSpaceP2pBoardProps) {
  const bt = useBilingual("StudioVirtualSpaceLiveAnnotationPanel");
  const [mode, setMode] = useState<AnnotationMode>("pen");
  return <section className="studio-vspace-live-annotation" data-annotation-mode={mode} data-space-interactive="true">
    <header>
      <div><Crosshair size={17} aria-hidden /><h2>{bt("공유 화면 라이브 주석", "Live shared-screen annotation")}</h2></div>
      <p>{bt("현재 회의의 펜·메모는 P2P로 공유합니다. 검수 기록으로 남겨야 할 의견은 고정 검수본에서 별도로 게시하세요.", "Share pen and notes over P2P for this meeting. Publish durable feedback separately against the pinned review snapshot.")}</p>
    </header>
    <div className="studio-vspace-annotation-modes" role="group" aria-label={bt("주석 모드", "Annotation mode")}>
      <button type="button" aria-pressed={mode === "pen"} onClick={() => setMode("pen")}><PenTool size={14} aria-hidden />{bt("펜", "Pen")}</button>
      <button type="button" aria-pressed={mode === "note"} onClick={() => setMode("note")}><MessageSquareText size={14} aria-hidden />{bt("메모", "Note")}</button>
    </div>
    <StudioVirtualSpaceP2pBoard {...props} tool={mode} />
    <p className="studio-vspace-annotation-durable"><Save size={14} aria-hidden />{bt("영구 의견은 검수 패널에서 revision·컷·담당자·기한과 함께 저장됩니다.", "Durable comments are saved in Review with revision, cut, assignee and due date.")}</p>
  </section>;
}
