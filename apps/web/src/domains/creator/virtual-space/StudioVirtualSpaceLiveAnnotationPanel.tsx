import { Crosshair, MessageSquareText, PenTool, Save } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualSpaceP2pBoard, type StudioVirtualSpaceP2pBoardProps } from "./StudioVirtualSpaceP2pBoard";

type AnnotationMode = "laser" | "pen" | "note";

export function StudioVirtualSpaceLiveAnnotationPanel(props: StudioVirtualSpaceP2pBoardProps) {
  const bt = useBilingual("StudioVirtualSpaceLiveAnnotationPanel");
  const [mode, setMode] = useState<AnnotationMode>("pen");
  return <section className="studio-vspace-live-annotation" data-annotation-mode={mode} data-space-interactive="true">
    <header>
      <div><Crosshair size={17} aria-hidden /><h2>{bt("공유 화면 라이브 주석", "Live shared-screen annotation")}</h2></div>
      <p>{bt("현재 회의의 레이저·펜·메모는 P2P로 공유합니다. 검수 기록으로 남겨야 할 의견은 고정 검수본에서 별도로 게시하세요.", "Share laser, pen and notes over P2P for this meeting. Publish durable feedback separately against the pinned review snapshot.")}</p>
    </header>
    <div className="studio-vspace-annotation-modes" role="group" aria-label={bt("주석 모드", "Annotation mode")}>
      <button type="button" aria-pressed={mode === "laser"} onClick={() => setMode("laser")}><Crosshair size={14} aria-hidden />{bt("레이저", "Laser")}</button>
      <button type="button" aria-pressed={mode === "pen"} onClick={() => setMode("pen")}><PenTool size={14} aria-hidden />{bt("펜", "Pen")}</button>
      <button type="button" aria-pressed={mode === "note"} onClick={() => setMode("note")}><MessageSquareText size={14} aria-hidden />{bt("메모", "Note")}</button>
    </div>
    <StudioVirtualSpaceP2pBoard {...props} />
    <p className="studio-vspace-annotation-durable"><Save size={14} aria-hidden />{bt("영구 의견은 검수 패널에서 revision·컷·담당자·기한과 함께 저장됩니다.", "Durable comments are saved in Review with revision, cut, assignee and due date.")}</p>
  </section>;
}
