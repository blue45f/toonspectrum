import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Languages,
  PackagePlus,
  ScanSearch,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";

import { completeAutomaticFreeText } from "../studio-server-ai-client";
import { CreatorEcosystemWorkbench } from "./CreatorEcosystemWorkbench";

import {
  applySafePreflightFixes,
  createBetaReviewPackage,
  detectContinuityIssues,
  EMPTY_CREATOR_ECOSYSTEM_STATE,
  GUIDED_LESSONS,
  loadCreatorEcosystemState,
  parseBetaFeedbackPackage,
  parsePreflightDocument,
  runPreflight,
  SAMPLE_WORKS,
  saveCreatorEcosystemState,
  SCENE_PACKS,
  setDialogueTranslation,
  translationStatus,
  upsertDialogueSource,
  type CreatorEcosystemState,
  type PreflightDocument,
} from "./creator-ecosystem-model";

const INPUT = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:opacity-50";
const CARD = "rounded-2xl border border-line bg-card p-4";

const PREFLIGHT_EXAMPLE = JSON.stringify({
  title: "  새 연재작  ",
  tags: ["로맨스", "학원", "로맨스"],
  pages: [
    { id: "episode-1", minimumTextPx: 15, missingAssets: ["title-font"], rightsBlocked: [], readingOrderComplete: false, approved: false },
    { id: "episode-2", minimumTextPx: 22, missingAssets: [], rightsBlocked: ["unknown-texture"], readingOrderComplete: true, approved: true },
  ],
}, null, 2);

function downloadJson(name: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function readJsonFile(file: File, maximum = 1_500_000): Promise<unknown> {
  if (!file.size || file.size > maximum) throw new Error(`JSON 파일은 ${Math.round(maximum / 1_000)}KB 이하여야 합니다.`);
  return JSON.parse(await file.text()) as unknown;
}

function SectionHeading({ icon: Icon, eyebrow, title, description }: {
  readonly icon: typeof Sparkles;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return <header className="mb-4 flex items-start gap-3">
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden /></span>
    <div><p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-fg">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">{description}</p></div>
  </header>;
}

export function CreatorEcosystemPage() {
  useDocumentTitle("창작 생태계 작업대 · ToonStudio");
  const [state, setState] = useState<CreatorEcosystemState>(() => {
    try { return loadCreatorEcosystemState(globalThis.localStorage); }
    catch { return structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE); }
  });
  const [notice, setNotice] = useState("모든 기록은 이 브라우저에 저장됩니다. AI는 자동 무료 풀을 먼저 사용하고, 무료 한도 또는 요청 제한으로 사용할 수 없을 때만 통합 설정의 개인 무료 연결을 사용합니다.");
  const [preflightSource, setPreflightSource] = useState(PREFLIGHT_EXAMPLE);
  const [preflightDocument, setPreflightDocument] = useState<PreflightDocument | null>(null);
  const [continuityDraft, setContinuityDraft] = useState({ episode: "1", entity: "주인공", field: "의상", value: "교복", transitionReason: "" });
  const [dialogueDraft, setDialogueDraft] = useState({ id: "line-1", source: "내일도 여기서 만날래?", locale: "en", translated: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const [betaTitle, setBetaTitle] = useState("새 연재작 1화");
  const [betaPages, setBetaPages] = useState("도입\n갈등\n반전\n마무리");
  const [processImages, setProcessImages] = useState<Array<{ label: string; dataUrl: string }>>([]);
  const [readerGenre, setReaderGenre] = useState("로맨스");

  useEffect(() => {
    try { saveCreatorEcosystemState(globalThis.localStorage, state); }
    catch (error) { setNotice(error instanceof Error ? error.message : "기록을 저장하지 못했습니다."); }
  }, [state]);

  const continuityIssues = detectContinuityIssues(state.continuityFacts);
  const findings = preflightDocument ? runPreflight(preflightDocument) : [];
  const readerPrompt = `${readerGenre} 작품에서 인상적인 감정 변화를 하나 고르고, 인물 두 명·장소 하나·소품 하나만 사용해 4컷으로 다시 구성해 보세요. 원작의 캐릭터·대사·고유 설정은 복제하지 않습니다.`;

  const togglePack = (id: string) => setState((current) => ({ ...current,
    installedScenePackIds: current.installedScenePackIds.includes(id)
      ? current.installedScenePackIds.filter((item) => item !== id)
      : [...current.installedScenePackIds, id],
  }));
  const toggleLessonStep = (lessonId: string, step: string) => setState((current) => {
    const completed = current.lessonSteps[lessonId] ?? [];
    return { ...current, lessonSteps: { ...current.lessonSteps,
      [lessonId]: completed.includes(step) ? completed.filter((item) => item !== step) : [...completed, step],
    } };
  });

  const runPreflightFromSource = () => {
    try {
      const parsed = parsePreflightDocument(JSON.parse(preflightSource));
      setPreflightDocument(parsed);
      setNotice("로컬 점검을 완료했습니다. 명확한 공백·중복만 자동 수정하고 권리·누락·승인 문제는 차단 상태로 남깁니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "원고 점검 JSON을 확인하세요."); }
  };
  const applySafeFixes = () => {
    if (!preflightDocument) return;
    const fixed = applySafePreflightFixes(preflightDocument);
    setPreflightDocument(fixed);
    setPreflightSource(JSON.stringify(fixed, null, 2));
    setNotice("제목 공백과 중복 태그만 수정했습니다. 창작 의도·권리·승인 상태는 자동 변경하지 않았습니다.");
  };

  const addContinuityFact = () => {
    const episode = Number(continuityDraft.episode);
    if (!Number.isInteger(episode) || episode < 1 || !continuityDraft.entity.trim() || !continuityDraft.field.trim() || !continuityDraft.value.trim()) {
      setNotice("회차와 설정 필드를 확인하세요."); return;
    }
    setState((current) => ({ ...current, continuityFacts: [...current.continuityFacts, {
      id: crypto.randomUUID(), episode, entity: continuityDraft.entity.trim(), field: continuityDraft.field.trim(),
      value: continuityDraft.value.trim(), transitionReason: continuityDraft.transitionReason.trim(),
    }].slice(0, 500) }));
  };

  const saveDialogue = () => {
    if (!/^[A-Za-z0-9._:-]{1,160}$/u.test(dialogueDraft.id) || !dialogueDraft.source.trim()) {
      setNotice("대사 ID와 원문을 확인하세요."); return;
    }
    setState((current) => upsertDialogueSource(current, dialogueDraft.id, dialogueDraft.source));
  };
  const saveTranslation = (approved = false) => {
    if (!dialogueDraft.translated.trim() || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u.test(dialogueDraft.locale)) {
      setNotice("번역 로케일과 번역문을 확인하세요."); return;
    }
    setState((current) => setDialogueTranslation(current, dialogueDraft.id, dialogueDraft.locale, dialogueDraft.translated, approved));
  };
  const suggestTranslation = async () => {
    if (!dialogueDraft.source.trim() || aiBusy) return;
    setAiBusy(true);
    const result = await completeAutomaticFreeText(
      "You are a professional webtoon localizer. Return only the translated dialogue, without quotes or explanation.",
      `Target locale: ${dialogueDraft.locale}\nDialogue: ${dialogueDraft.source}`,
    );
    setAiBusy(false);
    if (!result.ok) { setNotice(result.error); return; }
    setDialogueDraft((current) => ({ ...current, translated: result.data.content }));
    setNotice(`${result.data.provider} / ${result.data.model} 제안을 검토용 초안으로만 불러왔습니다. 승인 전에는 배포 데이터가 되지 않습니다.`);
  };

  const exportBetaPackage = () => {
    try {
      const pack = createBetaReviewPackage(betaTitle, betaPages.split("\n").map((item) => item.trim()).filter(Boolean));
      downloadJson(`toonstudio-beta-${pack.packageId}.json`, pack);
      setNotice("텍스트와 페이지 이름만 포함한 베타 독자 패키지를 만들었습니다. 원고 이미지 공개는 사용자가 별도로 결정합니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "베타 패키지를 만들지 못했습니다."); }
  };
  const importFeedback = async (file: File | undefined) => {
    if (!file) return;
    try {
      const feedback = parseBetaFeedbackPackage(await readJsonFile(file));
      setState((current) => ({ ...current, betaFeedback: [...current.betaFeedback, ...feedback.filter((entry) => !current.betaFeedback.some((item) => item.id === entry.id))].slice(0, 500) }));
      setNotice(`${feedback.length}개의 베타 독자 응답을 가져왔습니다.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "피드백을 가져오지 못했습니다."); }
  };

  const addProcessImages = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, Math.max(0, 4 - processImages.length));
    try {
      const added = await Promise.all(selected.map(async (file, index) => {
        if (!file.type.match(/^image\/(?:png|jpeg|webp)$/u) || file.size > 3_000_000) throw new Error("과정 이미지는 PNG·JPEG·WebP, 장당 3MB 이하여야 합니다.");
        return { label: ["콘티", "선화", "채색", "완성"][processImages.length + index] ?? file.name.slice(0, 80), dataUrl: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽지 못했습니다.")); reader.onerror = () => reject(reader.error ?? new Error("이미지를 읽지 못했습니다.")); reader.readAsDataURL(file);
        }) };
      }));
      setProcessImages((current) => [...current, ...added].slice(0, 4));
    } catch (error) { setNotice(error instanceof Error ? error.message : "과정 이미지를 읽지 못했습니다."); }
  };

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <header className="rounded-3xl border border-line bg-panel/60 p-6 sm:p-8">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "CREATE · REVIEW · SHARE")}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-5xl">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "작품을 끝까지 완성하는 창작 생태계 작업대")}</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "샘플을 고르는 순간부터 장면 구성, 안내형 실습, 원고 검수, 설정 변경 영향, 번역, 베타 독자, 제작 과정 공개까지 한 흐름으로 관리합니다.")}</p>
        <div className="mt-5 flex flex-wrap gap-2"><Link to="/studio/templates" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} bg-accent text-on-accent"), { v0: String(BUTTON) })}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "템플릿에서 시작")}</Link><Link to="/settings/ai" className={BUTTON}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "통합 AI 설정")}</Link><Link to="/learn" className={BUTTON}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "학습실")}</Link></div>
      </header>
      <p className="my-5 rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg-2" role="status">{notice}</p>

      <section className="mt-8"><SectionHeading icon={BookOpen} eyebrow="STARTER STORIES" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "완성형 샘플 작품")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "자체 제작한 이야기 구조와 장면 조합입니다. 원작 복제가 아닌 편집 가능한 연습 출발점으로 사용합니다.")} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{SAMPLE_WORKS.map((work) => <article key={work.id} className={CARD}><span className="text-[0.65rem] font-black text-accent">{work.genre}</span><h3 className="mt-2 font-black text-fg">{work.title}</h3><p className="mt-2 text-xs leading-5 text-fg-3">{work.summary}</p><div className="mt-3 flex flex-wrap gap-1">{work.scenePackIds.map((id) => <span key={id} className="rounded-full bg-raised px-2 py-1 text-[0.62rem] text-fg-2">{SCENE_PACKS.find((pack) => pack.id === id)?.title}</span>)}</div><button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} mt-4 w-full"), { v0: String(BUTTON) })} onClick={() => { setState((current) => ({ ...current, installedScenePackIds: [...new Set([...current.installedScenePackIds, ...work.scenePackIds])] })); setNotice(`${work.title}에 필요한 장면 팩을 작업대에 추가했습니다.`); }}><PackagePlus size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "연습 구성 추가")}</button></article>)}</div>
      </section>

      <section className="mt-10"><SectionHeading icon={PackagePlus} eyebrow="SCENE RECIPES" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "장면·연기·배경 팩")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "낱개 소재 수가 아니라 바로 수정 가능한 장면 목적, 카메라, 포즈, 표정, 소품을 묶어서 제공합니다.")} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SCENE_PACKS.map((pack) => { const installed = state.installedScenePackIds.includes(pack.id); return <article key={pack.id} className={CARD}><h3 className="font-bold text-fg">{pack.title}</h3><ul className="mt-2 space-y-1 text-xs text-fg-3">{pack.includes.map((item) => <li key={item}>· {item}</li>)}</ul><button type="button" aria-pressed={installed} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} mt-4 w-full {v1}"), { v0: String(BUTTON), v1: String(installed ? "border-good/40 bg-good/10 text-good" : "") })} onClick={() => togglePack(pack.id)}>{installed ? <CheckCircle2 size={15} /> : <PackagePlus size={15} />}{installed ? translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "작업대에 추가됨") : translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "작업대에 추가")}</button></article>; })}</div>
      </section>

      <section className="mt-10"><SectionHeading icon={WandSparkles} eyebrow="GUIDED PRACTICE" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "실제 완료를 기준으로 하는 안내형 실습")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "화면을 읽었다고 끝내지 않고 저장·내보내기·재검사까지 체크합니다.")} />
        <div className="grid gap-3 lg:grid-cols-3">{GUIDED_LESSONS.map((lesson) => { const completed = state.lessonSteps[lesson.id] ?? []; return <article key={lesson.id} className={CARD}><h3 className="font-bold text-fg">{lesson.title}</h3><p className="mt-1 text-xs text-fg-3">{completed.length}/{lesson.steps.length} {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "완료")}</p><div className="mt-3 grid gap-1">{lesson.steps.map((step) => <label key={step} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-fg-2 hover:bg-raised"><input type="checkbox" checked={completed.includes(step)} onChange={() => toggleLessonStep(lesson.id, step)} />{step}</label>)}</div></article>; })}</div>
      </section>

      <section className="mt-10"><SectionHeading icon={ScanSearch} eyebrow="FIXABLE PREFLIGHT" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "검수 → 위치 → 안전 수정 → 재검사")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "형식 오류와 편집 제안을 구분합니다. 제목 공백·태그 중복만 자동 수정하고 에셋 누락·권리·승인은 그대로 차단합니다.")} />
        <div className="grid gap-4 lg:grid-cols-2"><div className={CARD}><label className="grid gap-2 text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "원고 점검 JSON")}<textarea className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} min-h-72 font-mono text-xs"), { v0: String(INPUT) })} value={preflightSource} onChange={(event) => setPreflightSource(event.target.value)} /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={BUTTON} onClick={runPreflightFromSource}><ClipboardCheck size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "점검")}</button><button type="button" className={BUTTON} onClick={applySafeFixes} disabled={!preflightDocument}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "안전 수정 적용")}</button><button type="button" className={BUTTON} onClick={() => preflightDocument && downloadJson("toonstudio-preflight-fixed.json", preflightDocument)} disabled={!preflightDocument}><Download size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "수정본")}</button></div></div><div className={CARD}><h3 className="font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "점검 결과")}</h3>{!findings.length ? <p className="mt-3 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "점검을 실행하거나 현재 오류가 없습니다.")}</p> : <ul className="mt-3 grid gap-2">{findings.map((finding, index) => <li key={`${finding.code}-${index}`} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "rounded-lg border p-3 text-xs {v0}"), { v0: String(finding.severity === "error" ? "border-bad/40 bg-bad/10" : "border-warn/40 bg-warn/10") })}><strong>{finding.code}</strong><p className="mt-1">{finding.message}</p><code className="mt-1 block text-fg-3">{finding.path}</code></li>)}</ul>}</div></div>
      </section>

      <section className="mt-10"><SectionHeading icon={Sparkles} eyebrow="STORY CONTINUITY" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "회차별 설정 변경 영향")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "캐릭터·의상·소품·장소 값을 회차 순서로 비교하고, 설명 없는 변경만 경고합니다.")} />
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} grid gap-2"), { v0: String(CARD) })}><input className={INPUT} inputMode="numeric" value={continuityDraft.episode} onChange={(event) => setContinuityDraft((current) => ({ ...current, episode: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "회차")} placeholder={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "회차")} /><input className={INPUT} value={continuityDraft.entity} onChange={(event) => setContinuityDraft((current) => ({ ...current, entity: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "대상")} /><input className={INPUT} value={continuityDraft.field} onChange={(event) => setContinuityDraft((current) => ({ ...current, field: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "설정 필드")} /><input className={INPUT} value={continuityDraft.value} onChange={(event) => setContinuityDraft((current) => ({ ...current, value: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "값")} /><textarea className={INPUT} value={continuityDraft.transitionReason} onChange={(event) => setContinuityDraft((current) => ({ ...current, transitionReason: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "변경 이유")} placeholder={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "변경 이유가 있으면 입력")} /><button type="button" className={BUTTON} onClick={addContinuityFact}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "설정 기록 추가")}</button></div><div className={CARD}><div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="text-fg-3"><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "회차")}</th><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "대상")}</th><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "필드")}</th><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "값")}</th><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "설명")}</th></tr></thead><tbody>{state.continuityFacts.map((fact) => <tr key={fact.id} className="border-t border-line"><td className="py-2">{fact.episode}</td><td>{fact.entity}</td><td>{fact.field}</td><td>{fact.value}</td><td>{fact.transitionReason || "—"}</td></tr>)}</tbody></table></div>{continuityIssues.length ? <ul className="mt-3 grid gap-2">{continuityIssues.map((issue) => <li key={`${issue.previousId}-${issue.currentId}`} className="rounded-lg border border-warn/40 bg-warn/10 p-2 text-xs">{issue.message}</li>)}</ul> : <p className="mt-3 text-xs text-good">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "설명 없는 설정 충돌이 없습니다.")}</p>}</div></div>
      </section>

      <section className="mt-10"><SectionHeading icon={Languages} eyebrow="LOCALIZATION" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "원문·번역·승인·오래된 번역 관리")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "원문이 바뀌면 기존 번역을 자동으로 오래된 상태로 표시합니다. AI는 사용자 키로 초안만 제안하며 승인 전에는 배포 데이터가 아닙니다.")} />
        <div className="grid gap-4 lg:grid-cols-2"><div className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} grid gap-2"), { v0: String(CARD) })}><input className={INPUT} value={dialogueDraft.id} onChange={(event) => setDialogueDraft((current) => ({ ...current, id: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "대사 ID")} /><textarea className={INPUT} value={dialogueDraft.source} onChange={(event) => setDialogueDraft((current) => ({ ...current, source: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "원문")} /><div className="grid grid-cols-[7rem_1fr] gap-2"><input className={INPUT} value={dialogueDraft.locale} onChange={(event) => setDialogueDraft((current) => ({ ...current, locale: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "번역 로케일")} /><textarea className={INPUT} value={dialogueDraft.translated} onChange={(event) => setDialogueDraft((current) => ({ ...current, translated: event.target.value }))} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "번역문")} /></div><div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} onClick={saveDialogue}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "원문 저장")}</button><button type="button" className={BUTTON} onClick={() => void suggestTranslation()} disabled={aiBusy}>{aiBusy ? translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "제안 중…") : translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "내 AI로 번역 초안")}</button><button type="button" className={BUTTON} onClick={() => saveTranslation(false)}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "초안 저장")}</button><button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} border-good/40 text-good"), { v0: String(BUTTON) })} onClick={() => saveTranslation(true)}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "검토 승인")}</button></div></div><div className={CARD}><table className="w-full text-left text-xs"><thead><tr className="text-fg-3"><th>ID</th><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "원문")}</th><th>{dialogueDraft.locale}</th><th>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "상태")}</th></tr></thead><tbody>{state.dialogue.map((row) => { const status = translationStatus(row, dialogueDraft.locale); return <tr key={row.id} className="border-t border-line"><td className="py-2">{row.id}</td><td className="max-w-40 truncate">{row.source}</td><td className="max-w-40 truncate">{row.translations[dialogueDraft.locale]?.text ?? "—"}</td><td className={status === "approved" ? translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "text-good") : status === "stale" ? translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "text-warn") : translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "text-fg-3")}>{status}</td></tr>; })}</tbody></table></div></div>
      </section>

      <section className="mt-10"><SectionHeading icon={Users} eyebrow="BETA READERS" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "제작자 검토와 독자 반응을 분리")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "이해도·가독성·다음 장면 기대를 묻는 가벼운 오프라인 패키지를 내보내고 응답을 다시 가져옵니다.")} />
        <div className="grid gap-4 lg:grid-cols-2"><div className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} grid gap-2"), { v0: String(CARD) })}><input className={INPUT} value={betaTitle} onChange={(event) => setBetaTitle(event.target.value)} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "베타 패키지 작품명")} /><textarea className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} min-h-32"), { v0: String(INPUT) })} value={betaPages} onChange={(event) => setBetaPages(event.target.value)} aria-label={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "페이지 이름 목록")} /><div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} onClick={exportBetaPackage}><Download size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "검토 패키지")}</button><label className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} cursor-pointer"), { v0: String(BUTTON) })}><Upload size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "응답 가져오기")}<input className="sr-only" type="file" accept="application/json" onChange={(event) => void importFeedback(event.target.files?.[0])} /></label></div></div><div className={CARD}><h3 className="font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "누적 응답 ")}{state.betaFeedback.length}</h3>{state.betaFeedback.length ? <ul className="mt-3 grid max-h-56 gap-2 overflow-auto">{state.betaFeedback.map((feedback) => <li key={feedback.id} className="rounded-lg border border-line p-2 text-xs"><strong>{feedback.pageId}</strong> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "· 이해 ")}{feedback.clarity}{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "/5 · 가독성 ")}{feedback.readability}{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "/5 · 기대 ")}{feedback.curiosity}/5<p className="mt-1 text-fg-3">{feedback.comment || translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "의견 없음")}</p></li>)}</ul> : <p className="mt-2 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "아직 가져온 응답이 없습니다.")}</p>}</div></div>
      </section>

      <section className="mt-10"><SectionHeading icon={Upload} eyebrow="PROCESS GALLERY" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "완성 이미지에서 제작 방법으로")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "콘티·선화·채색·완성 단계를 사용자 선택으로 묶어 포트폴리오 패키지로 내보냅니다. 원본 공개 여부는 작가가 결정합니다.")} />
        <div className={CARD}><label className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} cursor-pointer"), { v0: String(BUTTON) })}><Upload size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "과정 이미지 추가")}<input className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void addProcessImages(event.target.files)} /></label><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{processImages.map((image, index) => <figure key={`${image.label}-${index}`} className="overflow-hidden rounded-xl border border-line bg-panel"><img src={image.dataUrl} alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "{v0} 단계"), { v0: String(image.label) })} className="aspect-[3/4] w-full object-cover" /><figcaption className="p-2 text-xs font-bold text-fg">{image.label}</figcaption></figure>)}</div><button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} mt-4"), { v0: String(BUTTON) })} disabled={!processImages.length} onClick={() => downloadJson("toonstudio-process-gallery.json", { kind: "toonstudio-process-gallery", version: 1, exportedAt: new Date().toISOString(), credit: "사용자 제공 이미지", stages: processImages })}><Download size={15} /> {translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "과정 패키지 내보내기")}</button></div>
      </section>

      <section className="mt-10" aria-labelledby="ecosystem-detailed-workbench-heading">
        <h2 id="ecosystem-detailed-workbench-heading" className="sr-only">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "상세 제작 워크벤치")}</h2>
        <CreatorEcosystemWorkbench />
      </section>

      <section className="mb-12 mt-10"><SectionHeading icon={Sparkles} eyebrow="READ → LEARN → CREATE" title={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "감상에서 창작 연습으로 연결")} description={translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "특정 작품을 복제하지 않고 장르에서 관찰한 감정·구도 원리를 자체 장면으로 다시 연습합니다.")} />
        <div className={CARD}><label className="grid max-w-xs gap-1 text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "관심 장르")}<select className={INPUT} value={readerGenre} onChange={(event) => setReaderGenre(event.target.value)}>{["로맨스", "일상", "액션", "미스터리", "판타지", "공포"].map((genre) => <option key={genre}>{genre}</option>)}</select></label><blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm leading-7 text-fg-2">{readerPrompt}</blockquote><div className="mt-4 flex flex-wrap gap-2"><Link to="/explore" className={BUTTON}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "작품 탐색")}</Link><Link to="/learn" className={BUTTON}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "관련 학습")}</Link><Link to="/studio/templates" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "en", "{v0} bg-accent text-on-accent"), { v0: String(BUTTON) })}>{translateCurrentStaticSourceText("domains.creator.ecosystem.CreatorEcosystemPage", "ko", "자체 예제로 제작 시작")}</Link></div></div>
      </section>
    </Container>
  );
}
