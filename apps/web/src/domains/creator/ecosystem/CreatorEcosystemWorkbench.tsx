import { ArrowRight, CheckCircle2, Download, Languages, LockKeyhole, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { completeUserAiText } from "@/shared/ai/user-ai-transport";
import { useUserAi } from "@/shared/ai/user-ai-store";

import { createOriginalSample, ORIGINAL_CONTENT_CREDIT, SAMPLE_WORKS, type ProcessStage } from "./ecosystem-content";
import { BETA_PACKAGE_SCHEMA, PROCESS_PACKAGE_SCHEMA, type TranslationDraft } from "./ecosystem-record";
import { downloadEcosystemJson, renderEcosystemPreview } from "./ecosystem-preview";
import { applyApprovedTranslations, applyWorldChange, dialogueRows, pageFingerprint, translationState, validateAiTranslations, worldImpacts } from "./ecosystem-workflow";

const STAGES: readonly ProcessStage[] = ["storyboard", "ink", "color", "final"];
const STAGE_LABELS: Record<ProcessStage, string> = { storyboard: "콘티", ink: "선화", color: "채색", final: "완성" };
const CONTROL = "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

function samplePage(sampleId: string, stage: ProcessStage = "final") {
  let sequence = 0;
  return createOriginalSample(sampleId, 800, stage, () => `${sampleId}-${stage}-${sequence++}`);
}

function parseAiArray(value: string): unknown {
  const start = value.indexOf("[");
  const end = value.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("AI 응답에서 JSON 배열을 찾지 못했습니다.");
  return JSON.parse(value.slice(start, end + 1)) as unknown;
}

export function CreatorEcosystemWorkbench() {
  const ai = useUserAi();
  const textAiReady = Boolean(ai.configuration.assignments.text);
  const [sampleId, setSampleId] = useState(SAMPLE_WORKS[0]!.id);
  const [pages, setPages] = useState(() => [samplePage(SAMPLE_WORKS[0]!.id)]);
  const [locale, setLocale] = useState("en");
  const [drafts, setDrafts] = useState<TranslationDraft[]>([]);
  const [released, setReleased] = useState<string[]>([]);
  const [worldEntity, setWorldEntity] = useState("");
  const [worldColor, setWorldColor] = useState("#335577");
  const [rightsAcknowledged, setRightsAcknowledged] = useState(false);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("예제 사본은 브라우저 메모리에서만 변경됩니다.");
  const [error, setError] = useState("");
  const page = pages[0]!;
  const rows = useMemo(() => dialogueRows(pages), [pages]);
  const impacts = useMemo(() => worldImpacts(pages, released), [pages, released]);
  const choices = useMemo(() => Array.from(new Map(impacts.map(item => [`${item.entity}:${item.value}`, item])).values()), [impacts]);

  useEffect(() => {
    try { setPreview(renderEcosystemPreview(page)); }
    catch { setPreview(""); }
  }, [page]);

  useEffect(() => {
    if (!choices.length) return;
    if (!choices.some(item => item.entity === worldEntity)) setWorldEntity(choices[0]!.entity);
  }, [choices, worldEntity]);

  const resetSample = (nextId: string) => {
    setSampleId(nextId);
    setPages([samplePage(nextId)]);
    setDrafts([]);
    setReleased([]);
    setNotice("새 예제 사본을 열었습니다. 이전 메모리 변경은 저장하지 않았습니다.");
    setError("");
  };

  const patchDraft = (row: (typeof rows)[number], patch: Partial<TranslationDraft>) => {
    setDrafts(current => {
      const previous = current.find(item => item.elementId === row.elementId && item.locale === locale);
      const next: TranslationDraft = {
        id: previous?.id ?? crypto.randomUUID(), pageId: row.pageId, elementId: row.elementId,
        source: row.source, locale, text: previous?.text ?? "", approved: previous?.approved ?? false,
        updatedAt: new Date().toISOString(), ...patch,
      };
      return [...current.filter(item => !(item.elementId === row.elementId && item.locale === locale)), next];
    });
  };

  const runAiTranslation = async () => {
    if (busy) return;
    setBusy(true); setError("");
    const controller = new AbortController();
    try {
      const selected = rows.slice(0, 20);
      const request = selected.map(row => ({ id: row.elementId, text: row.source }));
      const content = await completeUserAiText(
        "Translate webtoon dialogue. Return only a JSON array of {id,text}. Preserve names and tone. Never add IDs.",
        `Target locale: ${locale}\nDialogue:\n${JSON.stringify(request)}`,
        controller.signal,
      );
      const translations = validateAiTranslations(parseAiArray(content), selected);
      const now = new Date().toISOString();
      setDrafts(current => [
        ...current.filter(item => item.locale !== locale || !translations.some(value => value.elementId === item.elementId)),
        ...translations.map(value => {
          const row = selected.find(item => item.elementId === value.elementId)!;
          return { id: crypto.randomUUID(), pageId: row.pageId, elementId: row.elementId,
            source: row.source, locale, text: value.text, approved: false, updatedAt: now } satisfies TranslationDraft;
        }),
      ]);
      setNotice(`${translations.length}개 번역 초안을 받았습니다. 승인 전에는 원고에 적용하지 않습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "번역 초안을 만들지 못했습니다.");
    } finally { setBusy(false); }
  };
  const applyTranslations = () => {
    const next = applyApprovedTranslations(pages, drafts, locale);
    if (next === pages) { setNotice("원문과 일치하고 승인된 번역이 없습니다."); return; }
    setPages([...next]);
    setNotice(`${locale} 승인본을 원고 사본에 한 번의 변경으로 적용했습니다.`);
  };

  const applyWorld = () => {
    const selected = choices.find(item => item.entity === worldEntity);
    if (!selected) return;
    try {
      const next = applyWorldChange(pages, released, selected.entity, selected.value, worldColor, [page.id]);
      if (next === pages) { setNotice("공개·승인 잠금 또는 동일 값 때문에 변경하지 않았습니다."); return; }
      setPages([...next]);
      setNotice("선택한 설정 사용 위치에만 변경했습니다. 잠긴 원고는 유지했습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "설정 변경을 적용하지 못했습니다."); }
  };

  const exportBeta = () => {
    if (!rightsAcknowledged || !preview) { setError("공개 권한 확인과 미리보기가 필요합니다."); return; }
    const packageId = crypto.randomUUID();
    const pack = BETA_PACKAGE_SCHEMA.parse({
      kind: "toonstudio-beta", version: 1, id: packageId, documentId: `sample:${sampleId}`,
      title: page.name ?? "예제 작품", createdAt: new Date().toISOString(), rightsAcknowledged: true,
      pages: [{ id: page.id, image: preview, fingerprint: pageFingerprint(page),
        panels: page.elements.filter(element => element.type === "frame").map((element, index) => ({ id: element.id, label: `${index + 1}컷` })),
        dialogue: rows.map(row => row.source) }],
    });
    downloadEcosystemJson(`${sampleId}-beta-review.json`, pack);
    setNotice("베타 검토 패키지를 만들었습니다. 원본 편집 데이터와 API 키는 포함하지 않았습니다.");
  };

  const exportProcess = () => {
    if (!rightsAcknowledged) { setError("제작 과정 공개 권한을 확인하세요."); return; }
    const now = new Date().toISOString();
    const checkpoints = STAGES.map(stage => {
      const stagePage = samplePage(sampleId, stage);
      return { id: `${sampleId}-${stage}`, pageId: stagePage.id, label: STAGE_LABELS[stage],
        preview: renderEcosystemPreview(stagePage), fingerprint: pageFingerprint(stagePage), createdAt: now };
    });
    const pack = PROCESS_PACKAGE_SCHEMA.parse({ kind: "toonstudio-process", version: 1,
      title: `${page.name ?? "예제 작품"} 제작 과정`, credit: ORIGINAL_CONTENT_CREDIT,
      rightsAcknowledged: true, checkpoints, sampleId });
    downloadEcosystemJson(`${sampleId}-process-showcase.json`, pack);
    setNotice("콘티·선화·채색·완성 제작 과정 패키지를 만들었습니다.");
  };
  return <section className="mt-12 rounded-3xl border border-line bg-panel/50 p-5 sm:p-7" aria-labelledby="ecosystem-workbench-heading">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-black text-accent">LIVE WORKBENCH</p>
        <h2 id="ecosystem-workbench-heading" className="mt-1 text-2xl font-black text-fg">설명에서 끝나지 않는 제작 워크플로</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">예제 사본에서 번역 승인, 설정 영향 변경, 베타 독자 패키지와 제작 과정 공개 파일을 실제로 만들어 보세요.</p></div>
      <label className="min-w-64 text-sm font-bold text-fg-2">작업할 예제
        <select className={`${CONTROL} mt-1`} value={sampleId} onChange={event => resetSample(event.target.value)}>
          {SAMPLE_WORKS.map(work => <option key={work.id} value={work.id}>{work.genre} · {work.title}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        {preview ? <img src={preview} alt={`${page.name ?? "예제 작품"} 현재 원고 미리보기`} className="max-h-[34rem] w-full rounded-2xl border border-line bg-card object-contain" /> : <div className="grid min-h-64 place-items-center rounded-2xl border border-line bg-card text-sm text-fg-3">미리보기를 만들 수 없습니다.</div>}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <Link to={`/studio/canvas?sample=${encodeURIComponent(sampleId)}&tutorial=bubble`} className={`${BUTTON} bg-accent text-on-accent`}>편집기에서 안내 실습 <WandSparkles size={15} /></Link>
          <Link to="/studio/ecosystem/viewer" className={BUTTON}>검토·과정 패키지 열기 <ArrowRight size={15} /></Link>
        </div>
        <p className="text-xs leading-5 text-fg-3">{page.note}</p>
      </aside>
      <div className="min-w-0 space-y-6">
        {error ? <p role="alert" className="rounded-xl border border-bad/35 bg-bad/10 p-3 text-sm text-bad">{error}</p> : null}
        <p role="status" className="rounded-xl border border-line bg-card p-3 text-sm text-fg-2">{notice}</p>
        <section className="rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="flex items-center gap-2 text-lg font-black text-fg"><Languages size={18} className="text-accent" /> 언어별 원고</h3>
              <p className="mt-1 text-xs text-fg-3">원문이 바뀌면 초안을 오래된 상태로 표시하고 승인된 항목만 적용합니다.</p></div>
            <div className="flex flex-wrap gap-2"><input className={`${CONTROL} w-24`} value={locale} maxLength={20} aria-label="번역 대상 로케일" onChange={event => setLocale(event.target.value.trim())} />
              <button type="button" className={BUTTON} disabled={busy || !textAiReady} onClick={() => void runAiTranslation()}><WandSparkles size={15} /> 사용자 키로 초안</button>
              <button type="button" className={BUTTON} onClick={applyTranslations}><CheckCircle2 size={15} /> 승인본 적용</button></div>
          </div>
          {!textAiReady ? <p className="mt-3 text-xs text-fg-3">AI 초안은 <Link className="text-accent" to="/settings/ai">통합 AI 설정</Link>에서 사용자 텍스트 키를 연결한 경우에만 활성화됩니다.</p> : null}
          <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {rows.map(row => {
              const draft = drafts.find(item => item.elementId === row.elementId && item.locale === locale);
              const state = translationState(row, draft);
              return <article key={row.elementId} className="grid gap-2 rounded-xl border border-line bg-panel/60 p-3 sm:grid-cols-2">
                <div><span className="text-[0.65rem] font-black uppercase tracking-wide text-accent">{state}</span><p className="mt-1 text-sm leading-6 text-fg">{row.source}</p></div>
                <div><textarea className={CONTROL} rows={2} value={draft?.text ?? ""} placeholder={`${locale} 번역문`} onChange={event => patchDraft(row, { text: event.target.value, approved: false })} />
                  <label className="mt-1 flex min-h-11 items-center gap-2 text-xs font-bold text-fg-2"><input type="checkbox" checked={draft?.approved ?? false} disabled={!draft?.text.trim()} onChange={event => patchDraft(row, { approved: event.target.checked })} /> 검토·승인</label></div>
              </article>;
            })}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-2 text-lg font-black text-fg"><LockKeyhole size={18} className="text-accent" /> 설정 변경 영향</h3>
          <p className="mt-1 text-xs text-fg-3">캐릭터 의상·소품처럼 이름이 붙은 설정의 사용 위치를 찾아 선택한 페이지에만 반영합니다.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <select className={CONTROL} value={worldEntity} onChange={event => setWorldEntity(event.target.value)}>
              {choices.map(item => <option key={`${item.entity}:${item.value}`} value={item.entity}>{item.entity} · {item.value}</option>)}
            </select>
            <input className={CONTROL} type="color" value={worldColor} aria-label="변경할 설정 색상" onChange={event => setWorldColor(event.target.value)} />
            <button type="button" className={BUTTON} onClick={applyWorld}>선택 위치에 적용</button>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={released.includes(page.id)} onChange={event => setReleased(event.target.checked ? [page.id] : [])} /> 이 페이지를 공개 완료로 잠그기</label>
          <p className="mt-2 text-xs text-fg-3">현재 영향 위치 {impacts.length}개 · 변경 가능 {impacts.filter(item => !item.locked).length}개 · 잠금 {impacts.filter(item => item.locked).length}개</p>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <h3 className="text-lg font-black text-fg">베타 독자 검토와 제작 과정 공개</h3>
          <p className="mt-1 text-xs leading-5 text-fg-3">편집 원본 대신 축소 미리보기·변경 확인값·질문만 전달합니다. 확인값은 변경 감지용이며 서명이나 권한 증명이 아닙니다.</p>
          <label className="mt-3 flex min-h-11 items-start gap-2 text-sm leading-6 text-fg-2"><input className="mt-1.5" type="checkbox" checked={rightsAcknowledged} onChange={event => setRightsAcknowledged(event.target.checked)} /> 이 예제 또는 내가 권리를 가진 작품만 검토·쇼케이스 패키지로 내보냅니다.</label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BUTTON} disabled={!rightsAcknowledged || !preview} onClick={exportBeta}><Download size={15} /> 베타 검토 패키지</button>
            <button type="button" className={BUTTON} disabled={!rightsAcknowledged} onClick={exportProcess}><Download size={15} /> 4단계 제작 과정</button>
            <Link to="/studio/ecosystem/viewer" className={BUTTON}>패키지 검토·감상 열기</Link>
          </div>
        </section>
      </div>
    </div>
  </section>;
}
