import { Download, FileUp, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";

import { BETA_FEEDBACK_PACKAGE_SCHEMA, BETA_PACKAGE_SCHEMA, PROCESS_PACKAGE_SCHEMA, type BetaPackage, type ProcessPackage } from "./ecosystem-record";
import { downloadEcosystemJson, readEcosystemJson } from "./ecosystem-preview";

const CONTROL = "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

type LoadedPackage = { kind: "beta"; value: BetaPackage } | { kind: "process"; value: ProcessPackage };

export function CreatorEcosystemViewerPage() {
  useDocumentTitle("검토·제작 과정 패키지 · ToonStudio");
  const [loaded, setLoaded] = useState<LoadedPackage | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [panelId, setPanelId] = useState("");
  const [clarity, setClarity] = useState(3);
  const [readability, setReadability] = useState(3);
  const [curiosity, setCuriosity] = useState(3);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("패키지는 이 브라우저에서만 읽으며 서버에 업로드하지 않습니다.");

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      const raw = await readEcosystemJson(file);
      const beta = BETA_PACKAGE_SCHEMA.safeParse(raw);
      if (beta.success) setLoaded({ kind: "beta", value: beta.data });
      else {
        const process = PROCESS_PACKAGE_SCHEMA.safeParse(raw);
        if (!process.success) throw new Error("지원하는 베타 검토 또는 제작 과정 패키지가 아닙니다.");
        setLoaded({ kind: "process", value: process.data });
      }
      setPageIndex(0); setPanelId(""); setNotice("패키지를 검증해 열었습니다. 편집 원본이나 API 키는 포함되지 않습니다.");
    } catch (cause) { setLoaded(null); setError(cause instanceof Error ? cause.message : "패키지를 읽지 못했습니다."); }
  };
  const exportFeedback = () => {
    if (!loaded || loaded.kind !== "beta") return;
    const page = loaded.value.pages[pageIndex];
    if (!page) return;
    const feedback = {
      id: crypto.randomUUID(), packageId: loaded.value.id, pageId: page.id, panelId: panelId || null,
      clarity, readability, curiosity, comment: comment.trim(), createdAt: new Date().toISOString(),
    };
    const result = BETA_FEEDBACK_PACKAGE_SCHEMA.parse({
      kind: "toonstudio-beta-feedback", version: 1, packageId: loaded.value.id,
      documentId: loaded.value.documentId, feedback: [feedback],
    });
    downloadEcosystemJson(`${loaded.value.id}-feedback.json`, result);
    setNotice("검토 응답 파일을 만들었습니다. 원고 제작자에게 직접 전달하세요.");
  };

  return <Container size="wide" className="py-8 sm:py-12">
    <Link to="/studio/ecosystem" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">← 제작 생태계</Link>
    <header className="mt-3 max-w-3xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">PORTABLE REVIEW</p>
      <h1 className="mt-2 text-3xl font-black text-fg sm:text-5xl">검토와 제작 과정을 파일 하나로 여세요.</h1>
      <p className="mt-3 text-sm leading-7 text-fg-2">로그인이나 공개 링크 없이, 제작자가 보낸 축소 미리보기 패키지를 로컬에서 검토합니다. 파일 자체의 출처와 권리를 별도로 확인하세요.</p></header>
    <section className="mt-8 rounded-2xl border border-line bg-card p-5">
      <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-panel text-sm font-bold text-fg-2 hover:bg-raised">
        <FileUp size={18} aria-hidden /> 검토·제작 과정 JSON 열기
        <input type="file" accept="application/json,.json" className="sr-only" onChange={event => void load(event.target.files?.[0])} />
      </label>
      {error ? <p className="mt-3 text-sm text-bad" role="alert">{error}</p> : null}
      <p className="mt-3 text-sm text-fg-2" role="status">{notice}</p>
    </section>
    {loaded?.kind === "beta" ? <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="rounded-2xl border border-line bg-panel/50 p-4"><h2 className="text-xl font-black text-fg">{loaded.value.title}</h2>
        <div className="mt-3 flex flex-wrap gap-2">{loaded.value.pages.map((page, index) => <button key={page.id} type="button" className={`${BUTTON} ${index === pageIndex ? "border-accent text-accent" : ""}`} onClick={() => { setPageIndex(index); setPanelId(""); }}>{index + 1}페이지</button>)}</div>
        {loaded.value.pages[pageIndex] ? <img className="mt-4 max-h-[70vh] w-full rounded-xl border border-line bg-card object-contain" src={loaded.value.pages[pageIndex]!.image} alt={`${loaded.value.title} ${pageIndex + 1}페이지 검토 미리보기`} /> : null}
      </div>
      <form className="rounded-2xl border border-line bg-card p-5" onSubmit={event => { event.preventDefault(); exportFeedback(); }}>
        <h2 className="flex items-center gap-2 text-lg font-black text-fg"><MessageSquareText size={18} className="text-accent" /> 독자 검토</h2>
        <p className="mt-2 text-xs leading-5 text-fg-3">이해도와 가독성을 묻습니다. 그림 수정 지시나 작가 평가 대신 독자로서 실제로 느낀 점을 적어 주세요.</p>
        <label className="mt-4 block text-sm font-bold text-fg-2">검토 컷
          <select className={`${CONTROL} mt-1`} value={panelId} onChange={event => setPanelId(event.target.value)}><option value="">페이지 전체</option>
            {loaded.value.pages[pageIndex]?.panels.map(panel => <option key={panel.id} value={panel.id}>{panel.label}</option>)}</select></label>
        <Rating label="장면 이해도" value={clarity} onChange={setClarity} />
        <Rating label="글자 가독성" value={readability} onChange={setReadability} />
        <Rating label="다음 장면 기대" value={curiosity} onChange={setCuriosity} />
        <label className="mt-4 block text-sm font-bold text-fg-2">한 줄 의견
          <textarea className={`${CONTROL} mt-1`} rows={4} maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} placeholder="어디에서 멈추거나 다시 읽었는지 적어 주세요." /></label>
        <button type="submit" className={`${BUTTON} mt-4 w-full bg-accent text-on-accent`}><Download size={16} /> 검토 응답 저장</button>
      </form>
    </section> : null}
    {loaded?.kind === "process" ? <section className="mt-8">
      <div className="max-w-3xl"><h2 className="text-2xl font-black text-fg">{loaded.value.title}</h2><p className="mt-2 text-sm leading-6 text-fg-2">{loaded.value.credit}</p></div>
      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {loaded.value.checkpoints.map((checkpoint, index) => <figure key={checkpoint.id} className="rounded-2xl border border-line bg-card p-4">
          <figcaption><span className="text-xs font-black text-accent">{String(index + 1).padStart(2, "0")}</span><h3 className="mt-1 text-lg font-black text-fg">{checkpoint.label}</h3></figcaption>
          <img className="mt-3 max-h-[36rem] w-full rounded-xl border border-line bg-panel object-contain" src={checkpoint.preview} alt={`${loaded.value.title} ${checkpoint.label} 단계`} />
          <p className="mt-3 break-all text-[0.65rem] text-fg-3">변경 확인값 {checkpoint.fingerprint}</p>
        </figure>)}
      </div>
    </section> : null}
  </Container>;
}

function Rating({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="mt-4 block text-sm font-bold text-fg-2">{label} · {value}/5
    <input className="mt-2 w-full accent-[var(--color-accent)]" type="range" min={1} max={5} step={1} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}
