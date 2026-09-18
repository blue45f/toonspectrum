import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ExternalLink, Images, ListChecks, Map, MonitorCog, Pin, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { StudioBrowserWorkspaceTransfer } from "./StudioBrowserWorkspaceTransfer";
import {
  defaultStudioBrowserWorkspace, loadStudioBrowserWorkspace, saveStudioBrowserWorkspace, STUDIO_BROWSER_SURFACES,
  type StudioBrowserOpenSurfaces, type StudioBrowserSurface,
  type StudioBrowserWorkspaceProfile, type StudioCompanionOpenMode,
} from "./studio-companion-browser-workspace";
import { studioCompanionPopupGuidance } from "./studio-companion-popup-guidance";
import { cn } from "@/shared/lib/utils";

export type DedicatedCompanionSurface = StudioBrowserSurface;
export interface StudioCompanionWindowManagerProps {
  disabled: boolean;
  onOpenSurface: (surface: DedicatedCompanionSurface, mode?: StudioCompanionOpenMode) => boolean;
  getOpenSurfaces?: () => StudioBrowserOpenSurfaces;
  onCloseSurface?: (surface: DedicatedCompanionSurface) => boolean;
  editorHref?: string | null;
}
const SURFACES = [
  { surface: "navigator", label: "Navigator", description: "전체 원고와 현재 보이는 영역을 확인합니다.", icon: Map },
  { surface: "review", label: "검수", description: "레이어·작업 기록·댓글을 별도 화면에서 확인합니다.", icon: ListChecks },
  { surface: "reference", label: "레퍼런스", description: "참고 이미지와 색상 피커를 크게 확인합니다.", icon: Images },
] as const;
const CONTROL = "min-h-11 rounded-lg border border-line px-3 text-xs font-medium outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50";

export function StudioCompanionWindowManager({ disabled, onOpenSurface, getOpenSurfaces, onCloseSurface, editorHref = null }: StudioCompanionWindowManagerProps) {
  const id = useId();
  const [saved, setSaved] = useState<{ profile: StudioBrowserWorkspaceProfile; persistent: boolean | null }>(() => ({ profile: defaultStudioBrowserWorkspace(), persistent: null }));
  const revision = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const initialRevision = revision.current;
    void loadStudioBrowserWorkspace().then((loaded) => {
      if (active && revision.current === initialRevision) setSaved(loaded);
    });
    return () => { active = false; mounted.current = false; };
  }, []);
  const [opened, setOpened] = useState<StudioBrowserOpenSurfaces>({});
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const profile = saved.profile;
  const tracksWindows = getOpenSurfaces !== undefined;
  const refresh = useEffectEvent(() => {
    if (!getOpenSurfaces) return;
    const next = getOpenSurfaces();
    setOpened((previous) => STUDIO_BROWSER_SURFACES.every((surface) => previous[surface] === next[surface]) ? previous : next);
  });
  useEffect(() => {
    if (!tracksWindows || disabled) return;
    const check = () => { if (document.visibilityState !== "hidden") refresh(); };
    check();
    const timer = window.setInterval(check, 2_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [disabled, tracksWindows]);
  function changeProfile(next: StudioBrowserWorkspaceProfile) {
    const nextRevision = ++revision.current;
    setSaved((previous) => ({ ...previous, profile: next }));
    void saveStudioBrowserWorkspace(next).then((persistent) => {
      if (mounted.current && revision.current === nextRevision) setSaved({ profile: next, persistent });
    });
  }
  function openSurface(surface: DedicatedCompanionSurface) {
    // Exactly one synchronous window.open per gesture, including restoration.
    const success = profile.openMode === "window" ? onOpenSurface(surface) : onOpenSurface(surface, "tab");
    const label = SURFACES.find((item) => item.surface === surface)?.label ?? surface;
    if (success) setOpened((previous) => ({ ...previous, [surface]: previous[surface] ?? profile.openMode }));
    setNotice({ error: !success, text: success
      ? `${label} ${profile.openMode === "tab" ? "탭" : "창"}을 열거나 앞으로 가져오도록 요청했습니다.`
      : `${studioCompanionPopupGuidance().text} 새 탭 방식으로 바꾸거나 다시 시도해 주세요.` });
  }
  function closeSurface(surface: DedicatedCompanionSurface) {
    const closed = onCloseSurface?.(surface) ?? false;
    if (closed) setOpened((previous) => { const next = { ...previous }; delete next[surface]; return next; });
    setNotice({ error: !closed, text: closed ? "보조 화면을 닫았습니다. 원고는 기본 편집기에 그대로 있습니다."
      : "창을 닫을 수 없습니다. 직접 닫아 주세요. 다른 페이지로 이동한 창은 닫지 않습니다." });
  }
  function togglePin(surface: DedicatedCompanionSurface) {
    changeProfile({ ...profile, pinnedSurfaces: profile.pinnedSurfaces.includes(surface)
      ? profile.pinnedSurfaces.filter((item) => item !== surface) : [...profile.pinnedSurfaces, surface] });
  }
  const nextPinned = profile.pinnedSurfaces.find((surface) => !opened[surface]);
  const remaining = profile.pinnedSurfaces.filter((surface) => !opened[surface]).length;
  return (
    <section aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "en", "{v0}-title"), { v0: String(id) })} className="space-y-3" data-studio-browser-workspace>
      <div className="flex items-start gap-2">
        <MonitorCog className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
        <div className="min-w-0">
          <h2 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "en", "{v0}-title"), { v0: String(id) })} tabIndex={-1} className="text-xs font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "멀티탭 · 멀티 디스플레이")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "작업공간과 세 전용 창을 독립 배치해 최대 4화면으로 확장합니다. 원고와 실행 취소는 기본 편집기가 관리합니다.")}</p>
        </div>
      </div>
      <div role="group" aria-label={translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "보조 화면 열기 방식")} className="grid grid-cols-2 gap-2">
        {(["window", "tab"] as const).map((mode) => <button key={mode} type="button" disabled={disabled}
          aria-pressed={profile.openMode === mode} onClick={() => changeProfile({ ...profile, openMode: mode })}
          className={cn(CONTROL, profile.openMode === mode ? "border-accent bg-accent-soft text-fg" : "bg-card text-fg-3")}>
          {mode === "window" ? translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "분리 창으로 열기") : translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "브라우저 탭으로 열기")}
        </button>)}
      </div>
      <p className="text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "분리 창은 듀얼 모니터에, 탭은 한 화면에서 빠른 전환에 적합합니다. 브라우저가 실제 열기 방식을 결정하며, 이미 열린 화면은 그대로 재사용합니다.")}</p>
      <div data-companion-window-list className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
        {SURFACES.map(({ surface, label, description, icon: Icon }) => (
          <div key={surface} className="min-w-0 rounded-xl border border-line/70 bg-card p-2">
            <button type="button" disabled={disabled}
              aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "{v0} {v1} 열기 또는 앞으로 가져오기"), { v0: String(label), v1: String(profile.openMode === "tab" ? "새 탭" : "전용 창") })}
              onClick={() => openSurface(surface)}
              className="flex min-h-14 w-full items-center gap-2 rounded-lg text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50">
              <Icon className="size-5 shrink-0 text-fg-3" aria-hidden />
              <span className="min-w-0 flex-1"><strong className="block text-xs text-fg-2">{label}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-fg-3">{description}</span></span>
              <ExternalLink className="size-3.5 shrink-0 text-fg-3" aria-hidden />
            </button>
            <div className="mt-2 flex items-center justify-between gap-1 border-t border-line pt-1">
              <span className="text-[0.68rem] text-fg-3">{opened[surface] ? translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "열림 · 다시 누르면 앞으로") : translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "열기 가능")}</span>
              <div className="flex shrink-0 gap-1">
                <button type="button" disabled={disabled} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "{v0} 화면 고정"), { v0: String(label) })} aria-pressed={profile.pinnedSurfaces.includes(surface)}
                  onClick={() => togglePin(surface)} className={cn(CONTROL, "px-2", profile.pinnedSurfaces.includes(surface) && "bg-accent-soft text-accent")}><Pin className="size-3.5" aria-hidden /></button>
                {onCloseSurface ? <button type="button" disabled={disabled || !opened[surface]} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "{v0} 화면 닫기"), { v0: String(label) })}
                  onClick={() => closeSurface(surface)} className={cn(CONTROL, "px-2")}><X className="size-3.5" aria-hidden /></button> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-card/60 p-3">
        <button type="button" disabled={disabled || !nextPinned} className={CONTROL}
          onClick={() => { if (nextPinned) openSurface(nextPinned); }}>
          {translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "고정 화면 차례로 열기")}{remaining > 0 ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", " · {v0}개 남음"), { v0: String(remaining) }) : ""}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-fg-3">
          {profile.pinnedSurfaces.length === 0 ? translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "핀 버튼으로 필요한 화면을 고정하세요. 다음에도 이 구성을 기억합니다.")
            : remaining === 0 ? translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "고정한 화면이 모두 열려 있습니다. 창을 닫으면 다시 복원할 수 있습니다.")
            : translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "한 번 누를 때 한 화면씩 열립니다. 자동 팝업 없이 필요한 화면만 복원합니다.")}
        </p>
        {saved.persistent === false ? <p className="mt-2 text-xs text-warn">{translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "ko", "브라우저 저장이 제한되어 이 창에서만 설정을 유지합니다.")}</p> : null}
      </div>
      {notice ? <p role={notice.error ? translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "en", "alert") : translateCurrentStaticSourceText("domains.creator.StudioCompanionWindowManager", "en", "status")}
        className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed", notice.error ? "border-bad/40 text-bad" : "border-good/35 text-good")}>
        {notice.text}
      </p> : null}
      <StudioBrowserWorkspaceTransfer disabled={disabled} profile={profile} onImport={changeProfile} editorHref={editorHref} />
    </section>
  );
}
export default StudioCompanionWindowManager;
