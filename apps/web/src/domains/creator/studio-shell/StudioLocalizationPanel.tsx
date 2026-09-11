import {
  CheckCircle2,
  Languages,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createStudioLocalizationUnit,
  evaluateStudioLocalizationQa,
  summarizeStudioLocalization,
  transitionStudioLocalizationUnit,
  type StudioLocalizationStatus,
  type StudioLocalizationUnit,
  type StudioLocalizationUnitKind,
} from "../studio-localization-workflow";
import {
  projectLocalizationDiagnostics,
  readStudioLocalizationProject,
  STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT,
  writeStudioLocalizationProject,
  type StudioLocalizationProjectDocument,
} from "../studio-localization-project-store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

type Locale = "ko" | "en";

interface LayoutDraft {
  sourceRemoved: boolean;
  backgroundRestored: boolean;
  letteringApplied: boolean;
  readingOrderAssigned: boolean;
  fontAvailable: boolean;
  availableWidth: number;
  availableHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  minimumFontSize: number;
  actualFontSize: number;
  lineCount: number;
  maxLineCount: number;
}

const STATUS_LABELS: Readonly<Record<StudioLocalizationStatus, Readonly<Record<Locale, string>>>> = {
  untranslated: { ko: "번역 전", en: "Not translated" },
  "ai-draft": { ko: "초안", en: "Draft" },
  translating: { ko: "번역 중", en: "Translating" },
  "review-required": { ko: "검토 필요", en: "Needs review" },
  approved: { ko: "번역 승인", en: "Translation approved" },
  "layout-check": { ko: "원고 배치 확인", en: "Layout check" },
  complete: { ko: "완료", en: "Complete" },
};

const KIND_LABELS: Readonly<Record<StudioLocalizationUnitKind, Readonly<Record<Locale, string>>>> = {
  dialogue: { ko: "대사", en: "Dialogue" },
  narration: { ko: "내레이션", en: "Narration" },
  sfx: { ko: "효과음", en: "SFX" },
  title: { ko: "제목", en: "Title" },
  caption: { ko: "설명", en: "Caption" },
};

function emptyProject(projectId: string): StudioLocalizationProjectDocument {
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    units: Object.freeze([]),
    updatedAt: new Date(0).toISOString(),
  });
}

function createUnitId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `loc-${crypto.randomUUID()}`;
  }
  return `loc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function statusTone(status: StudioLocalizationStatus): string {
  if (status === "complete") return "border-success/30 bg-success-soft/20 text-success";
  if (status === "review-required" || status === "layout-check") {
    return "border-warning/35 bg-warning-soft/20 text-warning";
  }
  return "border-line bg-panel text-fg-2";
}

function nextActionLabel(status: StudioLocalizationStatus, locale: Locale): string {
  const labels: Record<Locale, Record<StudioLocalizationStatus, string>> = {
    ko: {
      untranslated: "번역 시작",
      "ai-draft": "번역문 저장",
      translating: "검토 요청",
      "review-required": "번역 승인",
      approved: "원고 배치 확인 시작",
      "layout-check": "검사하고 완료",
      complete: "다시 열기",
    },
    en: {
      untranslated: "Start translation",
      "ai-draft": "Save translation",
      translating: "Request review",
      "review-required": "Approve translation",
      approved: "Start layout check",
      "layout-check": "Validate and complete",
      complete: "Reopen",
    },
  };
  return labels[locale][status];
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function layoutDraftFor(unit: StudioLocalizationUnit | null): LayoutDraft {
  return {
    sourceRemoved: unit?.sourceRemoved ?? false,
    backgroundRestored: unit?.backgroundRestored ?? false,
    letteringApplied: unit?.letteringApplied ?? false,
    readingOrderAssigned: unit?.readingOrderAssigned ?? false,
    fontAvailable: unit?.fontAvailable ?? false,
    availableWidth: unit?.balloonFit?.availableWidth ?? 320,
    availableHeight: unit?.balloonFit?.availableHeight ?? 180,
    renderedWidth: unit?.balloonFit?.renderedWidth ?? 320,
    renderedHeight: unit?.balloonFit?.renderedHeight ?? 180,
    minimumFontSize: unit?.balloonFit?.minimumFontSize ?? 14,
    actualFontSize: unit?.balloonFit?.actualFontSize ?? 14,
    lineCount: unit?.balloonFit?.lineCount ?? 1,
    maxLineCount: unit?.balloonFit?.maxLineCount ?? 5,
  };
}

/** Full localization workflow: translate, review, clean, letter and project readiness. */
export function StudioLocalizationPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const [document, setDocument] = useState<StudioLocalizationProjectDocument>(() => emptyProject(projectId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceLocale, setSourceLocale] = useState("ko-KR");
  const [targetLocale, setTargetLocale] = useState("en-US");
  const [kind, setKind] = useState<StudioLocalizationUnitKind>("dialogue");
  const [sourceText, setSourceText] = useState("");
  const [translationDraft, setTranslationDraft] = useState("");
  const [layoutDraft, setLayoutDraft] = useState<LayoutDraft>(() => layoutDraftFor(null));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      try {
        const next = readStudioLocalizationProject(window.localStorage, projectId);
        setDocument(next);
        setSelectedId((current) => current && next.units.some((unit) => unit.id === current)
          ? current
          : next.units[0]?.id ?? null);
        setError(null);
      } catch {
        setError(locale === "ko"
          ? "이 기기에서 현지화 작업을 불러오지 못했습니다."
          : "Localization work could not be loaded on this device.");
      }
    };
    load();
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<StudioLocalizationProjectDocument>).detail;
      if (detail?.projectId === projectId) setDocument(detail);
    };
    window.addEventListener(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT, handleUpdate);
  }, [locale, projectId]);

  const selected = document.units.find((unit) => unit.id === selectedId) ?? null;
  useEffect(() => {
    setTranslationDraft(selected?.translatedText ?? "");
    setLayoutDraft(layoutDraftFor(selected));
  }, [selected?.id, selected?.translatedText, selected?.updatedAt]);

  const summary = useMemo(() => summarizeStudioLocalization(document.units), [document.units]);
  const qa = useMemo(() => selected ? evaluateStudioLocalizationQa(selected) : [], [selected]);

  const persist = (units: readonly StudioLocalizationUnit[], successMessage?: string): boolean => {
    const updatedAt = new Date().toISOString();
    try {
      const next = writeStudioLocalizationProject(window.localStorage, {
        schemaVersion: 1,
        projectId,
        units,
        updatedAt,
      }, window);
      setDocument(next);
      workspace.update((current) => ({
        ...current,
        localization: projectLocalizationDiagnostics(units),
      }));
      setMessage(successMessage ?? null);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : (locale === "ko" ? "현지화 작업을 저장하지 못했습니다." : "Localization work could not be saved."));
      return false;
    }
  };

  const replaceUnit = (nextUnit: StudioLocalizationUnit, successMessage?: string): boolean => {
    return persist(
      document.units.map((unit) => unit.id === nextUnit.id ? nextUnit : unit),
      successMessage,
    );
  };

  const addUnit = () => {
    if (!sourceText.trim()) {
      setError(locale === "ko" ? "원문을 입력해 주세요." : "Enter the source text.");
      return;
    }
    try {
      const unit = createStudioLocalizationUnit({
        id: createUnitId(),
        sourceLocale: sourceLocale.trim(),
        targetLocale: targetLocale.trim(),
        kind,
        sourceText,
        glossary: [],
        sourceRemoved: false,
        backgroundRestored: false,
        letteringApplied: false,
        readingOrderAssigned: false,
        fontAvailable: false,
        updatedAt: new Date().toISOString(),
      });
      if (persist(
        [...document.units, unit],
        locale === "ko" ? "번역할 대사를 추가했습니다." : "Added a localization unit.",
      )) {
        setSelectedId(unit.id);
        setSourceText("");
      }
    } catch {
      setError(locale === "ko"
        ? "언어 코드와 원문을 확인해 주세요. 예: ko-KR → en-US"
        : "Check the locales and source text. Example: ko-KR → en-US");
    }
  };

  const translatedUnit = (unit: StudioLocalizationUnit): StudioLocalizationUnit | null => {
    if (!translationDraft.trim()) {
      setError(locale === "ko" ? "번역문을 입력해 주세요." : "Enter the translated text.");
      return null;
    }
    try {
      let next = unit;
      if (next.status === "untranslated") {
        next = transitionStudioLocalizationUnit(next, {
          type: "start-translation",
          at: new Date().toISOString(),
        });
      }
      if (["ai-draft", "translating", "review-required"].includes(next.status)) {
        next = transitionStudioLocalizationUnit(next, {
          type: "update-translation",
          at: new Date().toISOString(),
          translatedText: translationDraft,
        });
      }
      return next;
    } catch {
      setError(locale === "ko"
        ? "현재 단계에서는 번역문을 수정할 수 없습니다."
        : "Translation cannot be edited at this stage.");
      return null;
    }
  };

  const prepareLayout = (unit: StudioLocalizationUnit): StudioLocalizationUnit => {
    return transitionStudioLocalizationUnit(unit, {
      type: "prepare-layout",
      at: new Date().toISOString(),
      sourceRemoved: unit.kind === "title" ? false : layoutDraft.sourceRemoved,
      backgroundRestored: unit.kind === "title" ? true : layoutDraft.backgroundRestored,
      letteringApplied: layoutDraft.letteringApplied,
      readingOrderAssigned: layoutDraft.readingOrderAssigned,
      fontAvailable: layoutDraft.fontAvailable,
      balloonFit: unit.kind === "dialogue" ? {
        availableWidth: layoutDraft.availableWidth,
        availableHeight: layoutDraft.availableHeight,
        renderedWidth: layoutDraft.renderedWidth,
        renderedHeight: layoutDraft.renderedHeight,
        minimumFontSize: layoutDraft.minimumFontSize,
        actualFontSize: layoutDraft.actualFontSize,
        lineCount: layoutDraft.lineCount,
        maxLineCount: layoutDraft.maxLineCount,
      } : undefined,
    });
  };

  const runNextAction = () => {
    if (!selected) return;
    try {
      const at = new Date().toISOString();
      let next = selected;
      switch (selected.status) {
        case "untranslated": {
          if (translationDraft.trim()) {
            const saved = translatedUnit(selected);
            if (!saved) return;
            next = saved;
          } else {
            next = transitionStudioLocalizationUnit(selected, { type: "start-translation", at });
          }
          break;
        }
        case "ai-draft": {
          const saved = translatedUnit(selected);
          if (!saved) return;
          next = saved;
          break;
        }
        case "translating": {
          const saved = translatedUnit(selected);
          if (!saved) return;
          next = transitionStudioLocalizationUnit(saved, { type: "request-review", at });
          break;
        }
        case "review-required":
          next = transitionStudioLocalizationUnit(selected, {
            type: "approve",
            at,
            reviewerId: "project-owner",
          });
          break;
        case "approved":
          next = prepareLayout(selected);
          break;
        case "layout-check": {
          const prepared = prepareLayout(selected);
          const blocking = evaluateStudioLocalizationQa(prepared).filter(
            (finding) => finding.severity === "error",
          );
          if (blocking.length > 0) {
            replaceUnit(
              prepared,
              locale === "ko" ? "확인한 원고 상태를 저장했습니다." : "Saved the verified layout state.",
            );
            setError(locale === "ko"
              ? `완료하려면 오류 ${blocking.length}개를 해결해 주세요.`
              : `Resolve ${blocking.length} blocking issues before completion.`);
            return;
          }
          next = transitionStudioLocalizationUnit(prepared, { type: "complete", at });
          break;
        }
        case "complete":
          next = transitionStudioLocalizationUnit(selected, { type: "reopen", at });
          break;
      }
      replaceUnit(
        next,
        locale === "ko" ? "현지화 단계를 업데이트했습니다." : "Localization status updated.",
      );
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : (locale === "ko" ? "다음 단계로 이동할 수 없습니다." : "Cannot move to the next step."));
    }
  };

  const removeSelected = () => {
    if (!selected) return;
    const remaining = document.units.filter((unit) => unit.id !== selected.id);
    if (persist(
      remaining,
      locale === "ko" ? "현지화 대사를 삭제했습니다." : "Localization unit removed.",
    )) {
      setSelectedId(remaining[0]?.id ?? null);
    }
  };

  const canEditTranslation = Boolean(
    selected && ["untranslated", "ai-draft", "translating", "review-required"].includes(selected.status),
  );
  const showLayout = Boolean(selected && ["approved", "layout-check", "complete"].includes(selected.status));

  return (
    <section
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="localization-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Languages size={14} aria-hidden="true" /> LOCALIZATION
          </p>
          <h2 id="localization-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "번역부터 레터링 QA까지 한 흐름으로" : "From translation to lettering QA in one flow"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "번역 승인만으로 완료되지 않습니다. 실제 원문 제거·배경 복원·레터링·글꼴·읽기 순서와 말풍선 결과를 확인해야 합니다."
              : "Translation approval is not completion. Verify actual cleanup, restoration, lettering, fonts, reading order and balloon fit."}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <span className="rounded-xl border border-line bg-panel px-3 py-2"><b className="block text-base text-fg">{summary.total}</b>{locale === "ko" ? "전체" : "Total"}</span>
          <span className="rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-success"><b className="block text-base">{summary.completed}</b>{locale === "ko" ? "완료" : "Done"}</span>
          <span className="rounded-xl border border-danger/30 bg-danger-soft/15 px-3 py-2 text-danger"><b className="block text-base">{summary.blocking}</b>{locale === "ko" ? "확인" : "Issues"}</span>
        </div>
      </div>

      {workspace.error || error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/20 px-3 py-2 text-xs font-semibold text-danger">
          {error ?? workspace.error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/20 px-3 py-2 text-xs font-semibold text-success">
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[18rem_1fr]">
        <aside className="rounded-2xl border border-line bg-panel/55 p-3">
          <h3 className="text-sm font-black text-fg">{locale === "ko" ? "대사·문구" : "Lines"}</h3>
          <div className="mt-3 max-h-[30rem] space-y-2 overflow-y-auto">
            {document.units.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-xs leading-5 text-fg-3">
                {locale === "ko" ? "아래에서 첫 원문을 추가하세요." : "Add the first source line below."}
              </p>
            ) : null}
            {document.units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                onClick={() => setSelectedId(unit.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selectedId === unit.id
                    ? "border-accent bg-accent-soft/25"
                    : "border-line bg-card hover:border-accent/35",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <b className="truncate text-xs text-fg">{unit.sourceText}</b>
                  <span className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                    statusTone(unit.status),
                  )}>
                    {STATUS_LABELS[unit.status][locale]}
                  </span>
                </span>
                <span className="mt-1 block truncate text-[0.65rem] text-fg-3">
                  {unit.translatedText || `${unit.sourceLocale} → ${unit.targetLocale}`}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <div className="grid grid-cols-2 gap-2">
              <input aria-label={locale === "ko" ? "원문 언어" : "Source locale"} value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value)} className="min-h-10 rounded-lg border border-line bg-card px-2 text-xs text-fg" />
              <input aria-label={locale === "ko" ? "번역 언어" : "Target locale"} value={targetLocale} onChange={(event) => setTargetLocale(event.target.value)} className="min-h-10 rounded-lg border border-line bg-card px-2 text-xs text-fg" />
            </div>
            <select aria-label={locale === "ko" ? "문구 종류" : "Unit kind"} value={kind} onChange={(event) => setKind(event.target.value as StudioLocalizationUnitKind)} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-card px-2 text-xs text-fg">
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label[locale]}</option>)}
            </select>
            <textarea aria-label={locale === "ko" ? "새 원문" : "New source text"} value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-xs leading-5 text-fg" placeholder={locale === "ko" ? "번역할 대사나 문구" : "Source dialogue or text"} />
            <button type="button" onClick={addUnit} className={buttonClass({ size: "sm", className: "mt-2 w-full gap-1.5" })}>
              <Plus size={14} aria-hidden="true" />{locale === "ko" ? "추가" : "Add"}
            </button>
          </div>
        </aside>

        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          {!selected ? (
            <div className="grid min-h-64 place-items-center text-sm text-fg-3">
              {locale === "ko" ? "대사를 선택하거나 새로 추가하세요." : "Select or add a line."}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-accent">
                    {KIND_LABELS[selected.kind][locale]} · {selected.sourceLocale} → {selected.targetLocale}
                  </p>
                  <h3 className="mt-1 text-lg font-black text-fg">{selected.sourceText}</h3>
                </div>
                <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", statusTone(selected.status))}>
                  {STATUS_LABELS[selected.status][locale]}
                </span>
              </div>

              <label className="mt-5 block text-xs font-bold text-fg-2" htmlFor="localization-translation">
                {locale === "ko" ? "번역문" : "Translation"}
              </label>
              <textarea
                id="localization-translation"
                value={translationDraft}
                disabled={!canEditTranslation}
                onChange={(event) => {
                  setTranslationDraft(event.target.value);
                  setError(null);
                }}
                rows={5}
                className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg disabled:opacity-60"
              />

              {showLayout ? (
                <fieldset className="mt-5 rounded-2xl border border-line bg-card p-4">
                  <legend className="px-1 text-sm font-black text-fg">
                    {locale === "ko" ? "실제 원고 처리 결과" : "Verified artwork results"}
                  </legend>
                  <p className="mt-1 text-xs leading-5 text-fg-3">
                    {locale === "ko"
                      ? "실제 편집기나 현지화 처리기가 완료한 항목만 선택하세요. 체크 자체는 이미지 처리를 수행하지 않습니다."
                      : "Select only work completed by the editor or localization processor. These checks do not alter artwork."}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {([
                      ["sourceRemoved", locale === "ko" ? "원문 제거 완료" : "Source removed"],
                      ["backgroundRestored", locale === "ko" ? "배경 복원 확인" : "Background restored"],
                      ["letteringApplied", locale === "ko" ? "번역문 레터링 완료" : "Lettering applied"],
                      ["readingOrderAssigned", locale === "ko" ? "읽기 순서 지정" : "Reading order assigned"],
                      ["fontAvailable", locale === "ko" ? "대상 언어 글꼴 확인" : "Target font available"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2">
                        <input
                          type="checkbox"
                          checked={layoutDraft[key]}
                          disabled={selected.status === "complete" || (selected.kind === "title" && key === "sourceRemoved")}
                          onChange={(event) => setLayoutDraft((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {selected.kind === "dialogue" ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {([
                        ["availableWidth", locale === "ko" ? "말풍선 폭" : "Balloon width"],
                        ["availableHeight", locale === "ko" ? "말풍선 높이" : "Balloon height"],
                        ["renderedWidth", locale === "ko" ? "글자 사용 폭" : "Text width"],
                        ["renderedHeight", locale === "ko" ? "글자 사용 높이" : "Text height"],
                        ["minimumFontSize", locale === "ko" ? "최소 글자" : "Minimum font"],
                        ["actualFontSize", locale === "ko" ? "실제 글자" : "Actual font"],
                        ["lineCount", locale === "ko" ? "줄 수" : "Line count"],
                        ["maxLineCount", locale === "ko" ? "허용 줄 수" : "Maximum lines"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="text-[0.65rem] font-bold text-fg-3">
                          {label}
                          <input
                            type="number"
                            min={1}
                            value={layoutDraft[key]}
                            disabled={selected.status === "complete"}
                            onChange={(event) => setLayoutDraft((current) => ({
                              ...current,
                              [key]: numberValue(event.target.value, current[key]),
                            }))}
                            className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </fieldset>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {["ai-draft", "translating", "review-required"].includes(selected.status) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = translatedUnit(selected);
                      if (next) replaceUnit(next, locale === "ko" ? "번역문을 저장했습니다." : "Translation saved.");
                    }}
                    className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
                  >
                    <Save size={14} aria-hidden="true" />
                    {locale === "ko" ? "번역문 저장" : "Save translation"}
                  </button>
                ) : null}
                <button type="button" onClick={runNextAction} className={buttonClass({ size: "sm", className: "gap-1.5" })}>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  {nextActionLabel(selected.status, locale)}
                </button>
                {["review-required", "approved", "layout-check"].includes(selected.status) ? (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        replaceUnit(
                          transitionStudioLocalizationUnit(selected, {
                            type: "request-changes",
                            at: new Date().toISOString(),
                          }),
                          locale === "ko" ? "번역 수정 단계로 되돌렸습니다." : "Returned to translation edits.",
                        );
                      } catch {
                        setError(locale === "ko"
                          ? "현재 단계에서는 수정 요청을 만들 수 없습니다."
                          : "Changes cannot be requested at this stage.");
                      }
                    }}
                    className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {locale === "ko" ? "수정 요청" : "Request changes"}
                  </button>
                ) : null}
                <button type="button" onClick={removeSelected} className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5 text-danger" })}>
                  <Trash2 size={14} aria-hidden="true" />
                  {locale === "ko" ? "삭제" : "Remove"}
                </button>
              </div>

              <div className={cn(
                "mt-5 rounded-2xl border p-4",
                qa.some((item) => item.severity === "error")
                  ? "border-danger/35 bg-danger-soft/15"
                  : "border-success/30 bg-success-soft/15",
              )}>
                <h4 className="text-sm font-black text-fg">{locale === "ko" ? "현재 QA" : "Current QA"}</h4>
                {qa.length === 0 ? (
                  <p className="mt-2 text-xs font-semibold text-success">
                    {locale === "ko" ? "차단 문제가 없습니다." : "No blocking issues."}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">
                    {qa.map((finding) => (
                      <li key={finding.code}>• {locale === "ko" ? finding.messageKo : finding.messageEn}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
