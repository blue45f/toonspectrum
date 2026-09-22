import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, EyeOff, Map, X } from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";
import { CAMPUS_DISTRICTS, type CampusMode } from "@/shared/lib/spatial-campus/campus-model";
import { WorkspaceContextPanel } from "../workspace/WorkspaceContextPanel";
import { useCampus, type CampusContextValue } from "./campus-context";

export function CampusControls({ compact = false }: { readonly compact?: boolean }) {
  const campus = useCampus();
  if (!campus || (compact && campus.binding.surface !== "native")) return null;
  return <CampusControlsView campus={campus} compact={compact} />;
}
function CampusControlsView({ campus, compact }: { readonly campus: CampusContextValue; readonly compact: boolean }) {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const navigate = useNavigate();
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!campus) return null;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const modes: readonly [CampusMode, string, string][] = [["scene", "공간", "Space"], ["task", "업무", "Task"], ["focus", "집중", "Focus"]];
  return <div className="campus-controls" data-campus-controls={compact ? "compact" : "full"}>
    <button ref={trigger} type="button" className="campus-control" onClick={() => setOpen(true)}
      aria-haspopup="dialog" aria-expanded={open} aria-label={locale === "ko" ? "공간 지도 열기" : "Open campus map"}>
      <Map size={18} aria-hidden="true" /><span>{compact ? (locale === "ko" ? "공간 지도" : "Campus") : campus.district.label[locale]}</span>
    </button>
    {!compact && <><label className="sr-only" htmlFor={id}>{locale === "ko" ? "장소 바로 이동" : "Change place"}</label>
      <select id={id} className="campus-control" value={campus.district.id} onChange={(event) => {
        const destination = CAMPUS_DISTRICTS.find((item) => item.id === event.target.value);
        if (destination) navigate(destination.href);
      }}>{CAMPUS_DISTRICTS.map((item) => <option key={item.id} value={item.id}>{item.label[locale]}</option>)}</select></>}
    {!compact && campus.binding.surface === "room" && <div className="campus-modes" role="group" aria-label={locale === "ko" ? "보기 방식" : "View mode"}>
      {modes.map(([mode, ko, en]) => <button key={mode} type="button" aria-pressed={campus.mode === mode}
        onClick={() => campus.setMode(mode)}>{locale === "ko" ? ko : en}</button>)}
    </div>}
    {!compact && campus.binding.surface === "room" && campus.privacySensitive ? <button
      type="button"
      className="campus-control campus-privacy-toggle"
      aria-pressed={campus.privacyMode}
      aria-label={locale === "ko"
        ? campus.privacyMode ? "개인 화면 보기" : "공개 화면 모드 켜기"
        : campus.privacyMode ? "Show private view" : "Enable presentation privacy"}
      onClick={() => campus.setPrivacyMode(!campus.privacyMode)}
    >
      <EyeOff size={17} aria-hidden="true" />
      <span>{locale === "ko"
        ? campus.privacyMode ? "가림 해제" : "공개 화면"
        : campus.privacyMode ? "Reveal" : "Privacy"}</span>
    </button> : null}
    {!compact && campus.returnHref && <Link className="campus-control" to={campus.returnHref}>
      <ArrowLeft size={16} aria-hidden="true" />{locale === "ko" ? "작업으로 돌아가기" : "Return to work"}
    </Link>}
    <WorkspaceContextPanel open={open} title={locale === "ko" ? "창작 세계의 공간 지도" : "Creative campus map"} onClose={close}>
      <p className="campus-map-description">{locale === "ko" ? "걷지 않아도 원하는 공간과 기능으로 바로 이동할 수 있어요." : "Open any place directly. Walking is optional."}</p>
      <nav className="campus-map" aria-label={locale === "ko" ? "모든 공간" : "All places"}>
        {CAMPUS_DISTRICTS.map((district) => <Link key={district.id} to={district.href}
          className="campus-place" aria-current={campus.district.id === district.id ? "location" : undefined} onClick={close}>
          <strong>{district.label[locale]}</strong><small>{district.description[locale]}</small>
        </Link>)}
      </nav>
      {campus.returnHref && <Link className="campus-control" to={campus.returnHref} onClick={close}>
        <ArrowLeft size={16} aria-hidden="true" />{locale === "ko" ? "원래 원고로 돌아가기" : "Return to manuscript"}
      </Link>}
      <button type="button" className="campus-control" onClick={close}><X size={16} aria-hidden="true" />{locale === "ko" ? "지도 닫기" : "Close map"}</button>
    </WorkspaceContextPanel>
  </div>;
}
