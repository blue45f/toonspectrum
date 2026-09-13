import { ArrowDown, ArrowUp, GripVertical, Upload } from "lucide-react";
import { useState } from "react";

import { downloadFile } from "../../lab/creative-export";
import { freshSeed } from "../../lab/creative-core";
import { CopyButton, DraftNotice, ExportDrawing, StudioBridge } from "../../lab/LabShared";
import { recordResult, usePlayDraft } from "../../lab/play-storage";
import { SketchPad, StrokePaths } from "../../lab/SketchPad";
import { BOARD_PRESETS, boardSvg, boardText, CAMERA_ANGLES, createBoard, movePanel, validBoard, type ComicPanel, type Storyboard } from "../../lab/storyboard-core";

export default function FourPanel() {
  const { value: board, setValue, saved } = usePlayDraft<Storyboard>("storyboard", createBoard, validBoard);
  const [activeId, setActiveId] = useState(board.panels[0].id); const [message, setMessage] = useState("");
  const [runId, setRunId] = useState(freshSeed); const [completed, setCompleted] = useState(false);
  const activeIndex = Math.max(0, board.panels.findIndex((p) => p.id === activeId)); const active = board.panels[activeIndex];
  const change = (next: Storyboard) => { setValue(next); if (completed) { setCompleted(false); setRunId(freshSeed()); } };
  const updatePanel = (patch: Partial<ComicPanel>) => change({ ...board, panels: board.panels.map((panel) => panel.id === active.id ? { ...panel, ...patch } : panel) });
  const ready = board.panels.every((p) => p.strokes.some((s) => !s.erase) || p.caption.trim());
  return <div className="play-lab-content">
    <div className="play-exercise-heading"><div><span className="play-eyebrow">FOUR-PANEL STUDIO · THINK IN SCENES</span><h2>머릿속 이야기를, 네 개의 컷으로.</h2><p>컷을 선택해 스케치와 대사를 넣으세요. 드래그 또는 이동 버튼으로 순서를 바꿀 수 있습니다.</p></div></div>
    <div className="play-actions" aria-label="콘티 시작 템플릿">{BOARD_PRESETS.map((preset, index) => <button type="button" className="play-chip" key={preset.name} onClick={() => {
      if (!window.confirm("새 템플릿으로 바꾸면 현재 제목·그림·대사가 교체됩니다. 중요한 콘티를 먼저 JSON 파일로 저장하셨나요?")) return;
      const next = createBoard(index); change(next); setActiveId(next.panels[0].id); setMessage("새로운 콘티 템플릿을 적용했습니다.");
    }}>{preset.name}</button>)}</div>
    <label className="play-field"><span>작품 제목</span><input value={board.title} maxLength={80} onChange={(event) => change({ ...board, title: event.target.value })} /></label>
    <div className="play-board-grid">{board.panels.map((panel, index) => <article className="play-panel-card" key={panel.id} data-active={panel.id === active.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", panel.id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = board.panels.findIndex((p) => p.id === event.dataTransfer.getData("text/plain")); change(movePanel(board, from, index)); }}>
      <div className="play-panel-bar"><span><GripVertical size={14} />{String(index + 1).padStart(2, "0")} · {panel.camera}</span><div className="play-actions"><button className="play-icon-button" type="button" aria-label={`${index + 1}컷 앞으로 이동`} disabled={index === 0} onClick={() => change(movePanel(board, index, index - 1))}><ArrowUp size={14} /></button><button className="play-icon-button" type="button" aria-label={`${index + 1}컷 뒤로 이동`} disabled={index === 3} onClick={() => change(movePanel(board, index, index + 1))}><ArrowDown size={14} /></button></div></div>
      <button className="play-panel-select" type="button" aria-label={`${index + 1}컷 편집: ${panel.beat}`} aria-pressed={panel.id === active.id} onClick={() => setActiveId(panel.id)}><svg viewBox="0 0 960 600" aria-hidden="true"><StrokePaths strokes={panel.strokes} />{!panel.strokes.length && <g fill="#b4a28c"><text x="480" y="285" textAnchor="middle" fontSize="70">{String(index + 1).padStart(2, "0")}</text><text x="480" y="365" textAnchor="middle" fontSize="30">이 컷에 장면을 그려 보세요</text></g>}</svg><strong>{panel.beat}</strong><span>{panel.caption || "대사 또는 무성 장면"}</span></button>
    </article>)}</div>
    <section className="play-panel-editor" aria-label={`${activeIndex + 1}컷 편집기`}><div className="play-exercise-heading"><h3>{activeIndex + 1}컷 · {active.beat}</h3><label className="play-inline-field">카메라<select value={active.camera} onChange={(event) => updatePanel({ camera: event.target.value })}>{CAMERA_ANGLES.map((angle) => <option key={angle}>{angle}</option>)}</select></label></div>
      <SketchPad key={active.id} label={`${activeIndex + 1}컷 드로잉 캔버스`} strokes={active.strokes} onChange={(strokes) => updatePanel({ strokes })} />
      <div className="play-panel-fields"><label className="play-field"><span>장면 이름</span><input value={active.beat} maxLength={60} onChange={(event) => updatePanel({ beat: event.target.value })} /></label><label className="play-field"><span>대사 / 내레이션</span><textarea rows={2} maxLength={80} value={active.caption} onChange={(event) => updatePanel({ caption: event.target.value })} placeholder="이 컷의 대사 또는 설명" /></label><label className="play-field"><span>연출 메모</span><textarea rows={2} maxLength={240} value={active.direction} onChange={(event) => updatePanel({ direction: event.target.value })} /></label></div>
    </section>
    <div className="play-actions"><CopyButton text={boardText(board)} label="콘티 텍스트 복사" /><button className="play-button" type="button" onClick={() => downloadFile(JSON.stringify(board, null, 2), "toonstudio-storyboard.json", "application/json")}>수정 가능한 JSON 저장</button>
      <label className="play-button play-file-button"><Upload size={16} />콘티 JSON 열기<input type="file" accept=".json,application/json" aria-label="콘티 JSON 파일 열기" onChange={async (event) => {
        const input = event.currentTarget; const file = input.files?.[0]; input.value = "";
        if (!file) return;
        try {
          if (file.size > 2000000) throw new Error("2MB 이하의 ToonStudio 콘티 JSON 파일을 선택해 주세요.");
          const parsed: unknown = JSON.parse(await file.text());
          if (!validBoard(parsed)) throw new Error("지원하지 않는 콘티 파일입니다. 현재 작업은 변경하지 않았습니다.");
          if (!window.confirm("현재 콘티를 파일의 내용으로 교체할까요? 현재 작업을 먼저 저장해 주세요.")) return;
          change(parsed); setActiveId(parsed.panels[0].id); setMessage("콘티를 복원했습니다.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "파일을 열지 못했습니다. 현재 작업은 유지됩니다."); }
      }} /></label>
      <button className="play-button primary" type="button" disabled={!ready || completed} onClick={() => { setCompleted(true); setMessage(recordResult({ id: runId, game: "four-panel", label: board.title || "4컷 콘티" }) ? "네 컷 완성! 내 창작 기록에 남겼습니다." : "콘티를 완성했습니다. 기록 저장이 차단되어 있으니 파일로 보관해 주세요."); }}>4컷 완성</button>
    </div>
    <ExportDrawing svg={boardSvg(board)} name="toonstudio-storyboard" width={1280} height={1220} />
    <p className="play-note">네 컷 모두에 그림 또는 대사를 넣으면 완성 기록을 남길 수 있어요. 긴 연출 메모는 이미지에서 줄여 표시하며 JSON·텍스트에는 전체를 보관합니다.</p>
    <p className="play-feedback" role="status">{message}</p><DraftNotice saved={saved} /><StudioBridge />
  </div>;
}
