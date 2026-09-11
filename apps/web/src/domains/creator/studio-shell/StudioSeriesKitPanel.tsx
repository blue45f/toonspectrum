import { CheckCircle2, Palette, RotateCcw, Save, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  validateStudioSeriesKit,
  type StudioSeriesKit,
} from "../studio-series-kit";
import {
  createDefaultStudioSeriesKit,
  ensureStudioSeriesKit,
  saveNextStudioSeriesKitVersion,
} from "../studio-series-kit-store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type Locale = "ko" | "en";

function numericValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cloneKit(kit: StudioSeriesKit): StudioSeriesKit {
  return {
    ...kit,
    colors: kit.colors.map((item) => ({ ...item })),
    textStyles: kit.textStyles.map((item) => ({ ...item })),
    balloonStyles: kit.balloonStyles.map((item) => ({ ...item })),
    components: kit.components.map((item) => ({ ...item })),
    exportDefaults: kit.exportDefaults.map((item) => ({ ...item })),
  };
}

/** Edit the one project-wide visual and output contract used by drawing, design and export. */
export function StudioSeriesKitPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const [kit, setKit] = useState<StudioSeriesKit>(() => createDefaultStudioSeriesKit(projectId));
  const [saved, setSaved] = useState<StudioSeriesKit>(() => createDefaultStudioSeriesKit(projectId));
  const [message, setMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const current = ensureStudioSeriesKit(window.localStorage, projectId);
      setKit(cloneKit(current));
      setSaved(current);
      setStorageError(null);
    } catch {
      setStorageError(locale === "ko"
        ? "이 기기에 Series Kit를 저장할 수 없습니다. 변경 전에 프로젝트 사본을 받아 두세요."
        : "Series Kit cannot be stored on this device. Keep a project copy before editing.");
    }
  }, [locale, projectId]);

  const issues = useMemo(() => validateStudioSeriesKit(kit), [kit]);
  const blocking = issues.filter((issue) => issue.severity === "error");
  const changed = JSON.stringify(kit) !== JSON.stringify(saved);

  const updateColor = (id: string, patch: { label?: string; value?: string }) => {
    setKit((current) => ({
      ...current,
      colors: current.colors.map((color) => color.id === id ? { ...color, ...patch } : color),
    }));
    setMessage(null);
  };

  const updateTextStyle = (
    id: string,
    patch: Partial<StudioSeriesKit["textStyles"][number]>,
  ) => {
    setKit((current) => ({
      ...current,
      textStyles: current.textStyles.map((style) => style.id === id ? { ...style, ...patch } : style),
    }));
    setMessage(null);
  };

  const updateBalloon = (
    id: string,
    patch: Partial<StudioSeriesKit["balloonStyles"][number]>,
  ) => {
    setKit((current) => ({
      ...current,
      balloonStyles: current.balloonStyles.map((style) => style.id === id ? { ...style, ...patch } : style),
    }));
    setMessage(null);
  };

  const updateExport = (
    targetId: string,
    patch: Partial<StudioSeriesKit["exportDefaults"][number]>,
  ) => {
    setKit((current) => ({
      ...current,
      exportDefaults: current.exportDefaults.map((item) => item.targetId === targetId
        ? { ...item, ...patch }
        : item),
    }));
    setMessage(null);
  };

  const save = () => {
    if (blocking.length > 0) {
      setMessage(locale === "ko" ? "오류를 먼저 수정해 주세요." : "Fix the blocking issues first.");
      return;
    }
    try {
      const next = saveNextStudioSeriesKitVersion(window.localStorage, saved, {
        name: kit.name,
        colors: kit.colors,
        textStyles: kit.textStyles,
        balloonStyles: kit.balloonStyles,
        components: kit.components,
        exportDefaults: kit.exportDefaults,
      });
      setSaved(next);
      setKit(cloneKit(next));
      setMessage(locale === "ko" ? `버전 ${next.version}으로 저장했습니다.` : `Saved as version ${next.version}.`);
      setStorageError(null);
    } catch {
      setStorageError(locale === "ko"
        ? "Series Kit 저장에 실패했습니다. 변경 내용은 화면에 남아 있습니다."
        : "Series Kit could not be saved. Your edits remain on screen.");
    }
  };

  const restore = () => {
    setKit(cloneKit(saved));
    setMessage(locale === "ko" ? "마지막 저장 상태로 되돌렸습니다." : "Restored the last saved version.");
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="series-kit-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Palette size={14} aria-hidden="true" /> SERIES KIT
          </p>
          <h2 id="series-kit-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "작품 전체의 스타일을 한곳에서" : "One style system for the whole project"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "대사·내레이션·말풍선·표지·홍보물과 출력 기본값을 함께 관리합니다. 저장할 때마다 새 버전이 만들어져 이전 원고가 갑자기 바뀌지 않습니다."
              : "Manage dialogue, narration, balloons, covers, promotion and export defaults together. Every save creates a new version so existing documents do not change unexpectedly."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-panel px-3 text-xs font-bold text-fg-2">
            {locale === "ko" ? `저장된 버전 ${saved.version}` : `Saved version ${saved.version}`}
          </span>
          <button type="button" onClick={restore} disabled={!changed} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            <RotateCcw size={14} aria-hidden="true" />
            {locale === "ko" ? "되돌리기" : "Restore"}
          </button>
          <button type="button" onClick={save} disabled={!changed || blocking.length > 0} className={buttonClass({ size: "sm", className: "gap-1.5" })}>
            <Save size={14} aria-hidden="true" />
            {locale === "ko" ? "새 버전 저장" : "Save new version"}
          </button>
        </div>
      </div>

      {storageError ? <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/20 px-3 py-2 text-xs font-semibold text-danger">{storageError}</p> : null}
      {message ? <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/20 px-3 py-2 text-xs font-semibold text-success">{message}</p> : null}

      <label className="mt-5 block text-xs font-bold text-fg-2" htmlFor="series-kit-name">
        {locale === "ko" ? "스타일 이름" : "Style name"}
      </label>
      <input
        id="series-kit-name"
        value={kit.name}
        onChange={(event) => setKit((current) => ({ ...current, name: event.target.value }))}
        className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      />

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg"><Palette size={16} className="text-accent" aria-hidden="true" />{locale === "ko" ? "작품 색상" : "Project colors"}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {kit.colors.map((color) => (
              <div key={color.id} className="rounded-xl border border-line bg-card p-3">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label={`${color.label} color`}
                    value={color.value.slice(0, 7)}
                    onChange={(event) => updateColor(color.id, { value: event.target.value })}
                    className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1"
                  />
                  <div className="min-w-0 flex-1">
                    <input
                      aria-label={`${color.id} label`}
                      value={color.label}
                      onChange={(event) => updateColor(color.id, { label: event.target.value })}
                      className="w-full border-0 bg-transparent text-sm font-bold text-fg outline-none"
                    />
                    <input
                      aria-label={`${color.label} hex`}
                      value={color.value}
                      onChange={(event) => updateColor(color.id, { value: event.target.value })}
                      className="mt-1 w-full border-0 bg-transparent font-mono text-xs text-fg-3 outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg"><Type size={16} className="text-accent" aria-hidden="true" />{locale === "ko" ? "글자 스타일" : "Text styles"}</h3>
          <div className="mt-4 space-y-3">
            {kit.textStyles.map((style) => (
              <div key={style.id} className="grid gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-[1fr_8rem_7rem]">
                <div>
                  <label className="text-[0.65rem] font-bold text-fg-3">{style.label}</label>
                  <input
                    value={style.fontId}
                    aria-label={`${style.label} font`}
                    onChange={(event) => updateTextStyle(style.id, { fontId: event.target.value })}
                    className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                  />
                </div>
                <label className="text-[0.65rem] font-bold text-fg-3">
                  {locale === "ko" ? "크기" : "Size"}
                  <input
                    type="number"
                    min={8}
                    max={144}
                    value={style.sizePx}
                    onChange={(event) => updateTextStyle(style.id, { sizePx: numericValue(event.target.value, style.sizePx) })}
                    className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                  />
                </label>
                <label className="text-[0.65rem] font-bold text-fg-3">
                  {locale === "ko" ? "굵기" : "Weight"}
                  <input
                    type="number"
                    min={100}
                    max={1000}
                    step={100}
                    value={style.weight}
                    onChange={(event) => updateTextStyle(style.id, { weight: numericValue(event.target.value, style.weight) })}
                    className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="text-sm font-black text-fg">{locale === "ko" ? "말풍선" : "Balloon styles"}</h3>
          <div className="mt-4 space-y-3">
            {kit.balloonStyles.map((style) => (
              <div key={style.id} className="grid gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-3">
                <label className="text-[0.65rem] font-bold text-fg-3">{locale === "ko" ? "안쪽 여백" : "Padding"}<input type="number" min={4} value={style.paddingPx} onChange={(event) => updateBalloon(style.id, { paddingPx: numericValue(event.target.value, style.paddingPx) })} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg" /></label>
                <label className="text-[0.65rem] font-bold text-fg-3">{locale === "ko" ? "선 두께" : "Stroke"}<input type="number" min={0} step={0.5} value={style.strokeWidthPx} onChange={(event) => updateBalloon(style.id, { strokeWidthPx: numericValue(event.target.value, style.strokeWidthPx) })} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg" /></label>
                <label className="text-[0.65rem] font-bold text-fg-3">{locale === "ko" ? "모서리" : "Corner"}<input type="number" min={0} value={style.cornerRadiusPx} onChange={(event) => updateBalloon(style.id, { cornerRadiusPx: numericValue(event.target.value, style.cornerRadiusPx) })} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg" /></label>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="text-sm font-black text-fg">{locale === "ko" ? "출력 기본값" : "Export defaults"}</h3>
          <div className="mt-4 space-y-3">
            {kit.exportDefaults.map((target) => (
              <div key={target.targetId} className="grid gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-3">
                <div><p className="text-xs font-bold text-fg">{target.targetId}</p><p className="mt-1 text-[0.65rem] text-fg-3">{locale === "ko" ? "프로젝트 기본 규칙" : "Project default"}</p></div>
                <label className="text-[0.65rem] font-bold text-fg-3">{locale === "ko" ? "형식" : "Format"}<input value={target.format} onChange={(event) => updateExport(target.targetId, { format: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg" /></label>
                <label className="text-[0.65rem] font-bold text-fg-3">{locale === "ko" ? "색 공간" : "Color space"}<input value={target.colorSpace} onChange={(event) => updateExport(target.targetId, { colorSpace: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg" /></label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={cn(
        "mt-5 rounded-2xl border p-4",
        blocking.length > 0 ? "border-danger/35 bg-danger-soft/15" : "border-success/30 bg-success-soft/15",
      )}>
        <h3 className={cn("flex items-center gap-2 text-sm font-black", blocking.length > 0 ? "text-danger" : "text-success")}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {blocking.length > 0
            ? (locale === "ko" ? `저장 전 오류 ${blocking.length}개` : `${blocking.length} blocking issues`)
            : (locale === "ko" ? "사용할 수 있는 Series Kit입니다" : "Series Kit is ready to use")}
        </h3>
        {issues.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-fg-2">
            {issues.map((issue) => <li key={`${issue.code}:${issue.affectedIds.join(":")}`}>• {issue.message}</li>)}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
