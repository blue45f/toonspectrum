import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { downloadResearchFile } from "./catalog-research-data";
import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { emptyResearchNotebook, parseResearchNotebook, RESEARCH_NOTE_KEY, researchMarkdown, researchPrompts, saveResearchNotebook } from "@/shared/lib/catalog-research";
import type { ResearchNotebook, ResearchSnapshot, ResearchWork } from "@/shared/lib/catalog-research";

function readSaved() {
  try { const raw = localStorage.getItem(RESEARCH_NOTE_KEY); return { raw, note: parseResearchNotebook(raw), error: "" }; }
  catch (error) { return { raw: null, note: emptyResearchNotebook(), error: error instanceof Error ? error.message : "브라우저 저장 공간에 접근할 수 없습니다." }; }
}
const FIELDS = [
  ["question", "조사 질문", "무엇을 알아보기 위해 이 작품들을 골랐나요?"],
  ["observation", "직접 확인한 관찰", "원문에서 직접 확인한 장면과 출처를 적으세요. 작품 내용은 자동 분석하지 않습니다."],
  ["hypothesis", "나의 가설", "관찰에서 추론한 내용입니다. 사실이나 흥행 예측으로 단정하지 마세요."],
  ["experiment", "나만의 5컷 실험", "도입 → 단서 → 선택 → 대가 → 다음 질문. 기존 작품의 대사·장면을 복제하지 않고 설계하세요."],
] as const;
export function CatalogResearchNotebook({ works, snapshot, onRestore }: { works: ResearchWork[]; snapshot: ResearchSnapshot; onRestore: (ids: string[]) => void }) {
  const [saved, setSaved] = useState(readSaved); const [note, setNote] = useState<ResearchNotebook>(saved.note);
  const [feedback, setFeedback] = useState(saved.error); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false);
  const canSave = typeof navigator !== "undefined" && Boolean(navigator.locks);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const draft = (): ResearchNotebook => ({ ...note, selected: works.map((work) => work.id), sourceHash: snapshot.sourceHash, savedAt: new Date().toISOString() });
  async function save() {
    if (!canSave || saved.error || saving) return;
    setSaving(true);
    try {
      const next = draft();
      const raw = await navigator.locks.request(RESEARCH_NOTE_KEY, () => saveResearchNotebook(localStorage, saved.raw, next));
      setSaved({ raw, note: next, error: "" }); setNote(next); setDirty(false); setFeedback("이 브라우저에 기획 노트를 저장했습니다.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "저장하지 못했습니다. 내보내기로 보관하세요."); }
    finally { setSaving(false); }
  }
  function restore() {
    if (dirty && !window.confirm("현재 초안을 저장된 노트로 바꿀까요? 저장하지 않은 내용은 사라집니다.")) return;
    const next = readSaved(); setSaved(next); setNote(next.note); setDirty(false); setFeedback(next.error || "저장된 노트를 불러왔습니다.");
    if (!next.error) onRestore(next.note.selected);
  }
  async function importNote(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 160000) throw new Error("160KB 이하의 ToonStudio 노트 JSON만 가져올 수 있습니다.");
      const next = parseResearchNotebook(await file.text());
      if (dirty && !window.confirm("현재 초안을 가져온 노트로 바꿀까요?")) return;
      setNote(next); setDirty(true); onRestore(next.selected); setFeedback("노트를 가져왔습니다. 저장 버튼을 눌러 이 브라우저에 보관하세요.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "노트 파일을 읽지 못했습니다."); }
  }
  function exportFile(format: "md" | "json") {
    try { downloadResearchFile(`toonstudio-research-note.${format}`, format === "md" ? researchMarkdown(draft(), works, snapshot) : JSON.stringify(draft(), null, 2), format === "md" ? "text/markdown;charset=utf-8" : "application/json"); }
    catch { setFeedback("파일을 내보내지 못했습니다. 일반 브라우저에서 다시 시도하세요."); }
  }
  return <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="research-notebook-title">
    <div><p className="eyebrow text-accent">OBSERVE → QUESTION → CREATE</p><h2 id="research-notebook-title" className="mt-2 text-2xl font-bold">비교에서 나만의 기획으로</h2>
      <p className="mt-3 text-sm leading-7 text-fg-2">노트는 이 브라우저에만 저장되며 공유 링크에 포함되지 않습니다. 변경 후 저장 버튼을 누르세요. 계정 동기화는 하지 않습니다.</p></div>
    {note.sourceHash && note.sourceHash !== snapshot.sourceHash && <p className="text-sm text-fg-2">노트 작성 이후 색인이 달라졌습니다. 비교 작품의 정보와 출처를 다시 확인하세요.</p>}
    <details className="rounded-xl border border-line p-4"><summary className="min-h-8 cursor-pointer font-semibold">선택한 작품에서 출발하는 연출 질문</summary>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-7 text-fg-2">{researchPrompts(works).map((prompt) => <li key={prompt}>{prompt}</li>)}</ol>
      <p className="mt-3 text-xs text-fg-3">장르·태그로 구성한 규칙 기반 질문입니다. AI 작품 분석이나 흥행 예측이 아닙니다.</p></details>
    <div className="grid gap-5 md:grid-cols-2">{FIELDS.map(([key, label, placeholder]) => <label key={key} className="block text-sm font-semibold">{label}
      <textarea className={`${RESOURCE_INPUT} mt-2 min-h-36 font-normal leading-7`} value={note[key]} disabled={saving} maxLength={6000} placeholder={placeholder}
        onChange={(event) => { setNote({ ...note, [key]: event.target.value }); setDirty(true); }} />
      <span className="mt-1 block text-right text-xs font-normal text-fg-3">{note[key].length.toLocaleString("ko-KR")} / 6,000</span></label>)}</div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={`${RESOURCE_BUTTON} bg-accent text-on-accent`} onClick={() => void save()} disabled={!canSave || Boolean(saved.error) || saving}>{saving ? "저장 중…" : "기획 노트 저장"}</button>
      <button type="button" className={RESOURCE_BUTTON} onClick={() => exportFile("md")}>Markdown 내보내기</button>
      <button type="button" className={RESOURCE_BUTTON} onClick={() => exportFile("json")}>노트 JSON 백업</button>
      <button type="button" className={RESOURCE_BUTTON} onClick={restore} disabled={saving}>저장된 노트 다시 불러오기</button>
      <label className={`${RESOURCE_BUTTON} cursor-pointer focus-within:outline-2 focus-within:outline-accent`}>노트 JSON 가져오기<input className="sr-only" type="file" disabled={saving} accept=".json,application/json" onChange={(event) => { void importNote(event.target.files?.[0]); event.target.value = ""; }} /></label>
    </div>
    <p className="text-sm text-fg-2">{dirty ? "저장하지 않은 변경사항이 있습니다." : saved.note.savedAt ? `최근 노트 저장: ${new Date(saved.note.savedAt).toLocaleString("ko-KR")}` : "아직 이 브라우저에 저장된 기획 노트가 없습니다."}</p>
    {!canSave && <p className="text-sm text-fg-2">이 환경은 안전한 동시 저장을 지원하지 않습니다. Markdown·JSON 내보내기를 이용하세요.</p>}
    {feedback && <p role="status" className="rounded-xl border border-line p-4 text-sm leading-7">{feedback}</p>}
    <div className="flex flex-wrap gap-2 border-t border-line pt-5"><Link to="/story-lab" className={RESOURCE_BUTTON}>스토리 연구실로 이동</Link><Link to="/studio" className={RESOURCE_BUTTON}>스튜디오로 이동</Link></div>
    <p className="text-xs leading-6 text-fg-3">노트가 스튜디오에 자동 삽입되지는 않습니다. 저장·내보내기 후 제작을 이어가세요.</p>
  </section>;
}
