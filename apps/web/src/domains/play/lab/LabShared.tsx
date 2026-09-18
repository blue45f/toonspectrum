import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { copyText, downloadFile, downloadPng } from "./creative-export";

export function DraftNotice({ saved }: { saved: boolean }) {
  return <p className={`play-note ${saved ? "" : "play-warning"}`} role="status">{saved ? "이 브라우저에 자동 저장됩니다. 다른 기기와 동기화되지 않으므로 중요한 결과는 파일로 보관해 주세요." : "브라우저 저장 공간을 사용할 수 없습니다. 편집은 가능하지만 나가기 전에 파일로 저장해 주세요."}</p>;
}
export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  return <div className="play-copy">
    <button className="play-button" type="button" onClick={async () => setStatus(await copyText(text) ? "copied" : "manual")}>
      {status === "copied" ? <Check size={16} /> : <Copy size={16} />}{status === "copied" ? "복사 완료" : label}
    </button>
    {status === "manual" && <label className="play-note">자동 복사가 차단되었습니다. 아래 내용을 선택해 복사해 주세요.<textarea aria-label="직접 복사할 내용" readOnly value={text} onFocus={(event) => event.currentTarget.select()} /></label>}
  </div>;
}
export function ExportDrawing({ svg, name, width, height, disabled = false }: { svg: string; name: string; width?: number; height?: number; disabled?: boolean }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const png = async () => {
    setBusy(true); setMessage("");
    try { await downloadPng(svg, `${name}.png`, width, height); setMessage("PNG 파일을 만들었습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "PNG 저장 실패. SVG 저장을 사용해 주세요."); }
    finally { setBusy(false); }
  };
  return <div className="play-export">
    <div className="play-actions">
      <button className="play-button primary" type="button" disabled={disabled || busy} onClick={() => void png()}><Download size={16} />{busy ? "PNG 만드는 중…" : "PNG 저장"}</button>
      <button className="play-button" type="button" disabled={disabled} onClick={() => { try { downloadFile(svg, `${name}.svg`, "image/svg+xml;charset=utf-8"); setMessage("SVG 파일을 만들었습니다."); } catch { setMessage("파일 저장을 사용할 수 없습니다. 브라우저 설정을 확인해 주세요."); } }}>SVG 저장</button>
    </div>
    <span role="status" className="play-note">{message}</span>
  </div>;
}
export function StudioBridge() {
  return <aside className="play-studio-bridge"><div><strong>연습에서, 작품으로.</strong><p>결과를 PNG·SVG로 보관하고 전문 작업실에서 다음 컷을 이어가세요.</p></div><Link className="play-button" to="/studio">드로잉 스튜디오 열기 ↗</Link></aside>;
}
