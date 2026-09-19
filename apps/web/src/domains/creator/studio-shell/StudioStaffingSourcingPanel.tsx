import { BadgeCheck, Download, Handshake, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_STAFFING_REGIONS,
  STUDIO_STAFFING_ROLES,
  createStudioStaffingBrief,
  rankStudioStaffingPools,
  staffingBriefStorageKey,
  type StudioStaffingBrief,
  type StudioStaffingRegion,
  type StudioStaffingRole,
} from "../studio-staffing";

const FIELD = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const ROLE_COPY: Readonly<Record<StudioStaffingRole, readonly [string, string]>> = {
  "story-assistant": ["스토리 어시스트", "Story assistant"],
  storyboard: ["콘티", "Storyboard"],
  lineart: ["선화", "Line art"],
  background: ["배경", "Background"],
  color: ["채색", "Color"],
  lettering: ["식자", "Lettering"],
  localization: ["번역·현지화", "Localization"],
  "production-assistant": ["제작·업무 보조", "Production assistant"],
};

const REGION_COPY: Readonly<Record<StudioStaffingRegion, readonly [string, string]>> = {
  korea: ["한국", "Korea"],
  "southeast-asia": ["동남아", "Southeast Asia"],
  japan: ["일본", "Japan"],
  global: ["글로벌", "Global"],
};

function loadBrief(projectId: string): StudioStaffingBrief {
  const fallback = createStudioStaffingBrief(projectId);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(staffingBriefStorageKey(projectId));
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<StudioStaffingBrief>;
    return {
      ...fallback,
      role: STUDIO_STAFFING_ROLES.includes(value.role as StudioStaffingRole) ? value.role as StudioStaffingRole : fallback.role,
      preferredRegion: STUDIO_STAFFING_REGIONS.includes(value.preferredRegion as StudioStaffingRegion) ? value.preferredRegion as StudioStaffingRegion : fallback.preferredRegion,
      language: String(value.language ?? fallback.language).slice(0, 20),
      monthlyBudgetUsd: Math.max(0, Math.min(100_000, Number(value.monthlyBudgetUsd) || fallback.monthlyBudgetUsd)),
      timezoneOverlapHours: Math.max(0, Math.min(12, Number(value.timezoneOverlapHours) || fallback.timezoneOverlapHours)),
      remoteOnly: value.remoteOnly !== false,
      ndaRequired: value.ndaRequired !== false,
      rightsAssignmentRequired: value.rightsAssignmentRequired !== false,
      portfolioVerificationRequired: value.portfolioVerificationRequired !== false,
      scope: String(value.scope ?? "").slice(0, 6000),
      dueDate: String(value.dueDate ?? "").slice(0, 20),
    };
  } catch {
    return fallback;
  }
}

function downloadBrief(brief: StudioStaffingBrief) {
  const blob = new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "creator-staffing-brief.json";
  anchor.click();
  URL.revokeObjectURL(href);
}

export function StudioStaffingSourcingPanel({ projectId }: { readonly projectId: string }) {
  const bt = useBilingual("StudioStaffingSourcingPanel");
  const [brief, setBrief] = useState(() => loadBrief(projectId));
  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  const matches = useMemo(() => rankStudioStaffingPools(brief), [brief]);

  useEffect(() => {
    setBrief(loadBrief(projectId));
    setLoadedProjectId(projectId);
  }, [projectId]);
  useEffect(() => {
    // Never write the previous project state during the scope-change render.
    if (loadedProjectId !== projectId || typeof window === "undefined") return;
    try { window.localStorage.setItem(staffingBriefStorageKey(projectId), JSON.stringify(brief)); } catch { /* persistence is optional */ }
  }, [brief, projectId, loadedProjectId]);

  const patch = (next: Partial<StudioStaffingBrief>) => setBrief((current) => ({ ...current, ...next }));

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="staffing-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent"><Users size={15} aria-hidden="true" /> CREATOR STAFFING</p>
          <h2 id="staffing-title" className="mt-2 text-xl font-black text-fg">{bt("어시스트·제작 인력 소싱 브리프", "Assistant and production staffing brief")}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">{bt("역할·지역·예산·언어·근무 시간·NDA·권리 조건을 먼저 명세하고 후보군과 매칭합니다. 동남아 원격 인력도 같은 계약·검증 기준을 사용합니다.", "Define role, region, budget, language, overlap, NDA and rights terms before matching. Southeast Asian remote talent uses the same contract and verification gates.")}</p>
        </div>
        <Link to={`/production/projects/${encodeURIComponent(projectId)}/overview`} className={buttonClass({ variant: "outline", className: "gap-2" })}><Handshake size={16} aria-hidden="true" /> {bt("프로덕션 허브", "Production hub")}</Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-fg-2">{bt("필요 역할", "Role")}<select className={`${FIELD} mt-1`} value={brief.role} onChange={(event) => patch({ role: event.target.value as StudioStaffingRole })}>{STUDIO_STAFFING_ROLES.map((role) => <option key={role} value={role}>{bt(...ROLE_COPY[role])}</option>)}</select></label>
        <label className="text-xs font-bold text-fg-2">{bt("선호 지역", "Preferred region")}<select className={`${FIELD} mt-1`} value={brief.preferredRegion} onChange={(event) => patch({ preferredRegion: event.target.value as StudioStaffingRegion })}>{STUDIO_STAFFING_REGIONS.map((region) => <option key={region} value={region}>{bt(...REGION_COPY[region])}</option>)}</select></label>
        <label className="text-xs font-bold text-fg-2">{bt("협업 언어", "Working language")}<input className={`${FIELD} mt-1`} value={brief.language} maxLength={20} onChange={(event) => patch({ language: event.target.value.trim().toLowerCase() })} placeholder="en" /></label>
        <label className="text-xs font-bold text-fg-2">{bt("희망 완료일", "Target date")}<input className={`${FIELD} mt-1`} type="date" value={brief.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} /></label>
        <label className="text-xs font-bold text-fg-2">{bt("월 예산 (USD)", "Monthly budget (USD)")}<input className={`${FIELD} mt-1`} type="number" min={0} max={100000} step={50} value={brief.monthlyBudgetUsd} onChange={(event) => patch({ monthlyBudgetUsd: Number(event.target.value) || 0 })} /></label>
        <label className="text-xs font-bold text-fg-2">{bt("하루 겹치는 시간", "Daily overlap")}<input className={`${FIELD} mt-1`} type="number" min={0} max={12} value={brief.timezoneOverlapHours} onChange={(event) => patch({ timezoneOverlapHours: Math.max(0, Math.min(12, Number(event.target.value) || 0)) })} /></label>
        <label className="text-xs font-bold text-fg-2 sm:col-span-2">{bt("작업 범위", "Scope")}<input className={`${FIELD} mt-1`} value={brief.scope} maxLength={6000} onChange={(event) => patch({ scope: event.target.value })} placeholder={bt("예: 주 1화, 배경 25컷, PSD 레이어 유지", "Example: weekly episode, 25 background panels, layered PSD")} /></label>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["ndaRequired", bt("NDA 필수", "NDA required")],
          ["rightsAssignmentRequired", bt("결과물 권리 조항 필수", "Rights clause required")],
          ["portfolioVerificationRequired", bt("포트폴리오 검증", "Portfolio verification")],
          ["remoteOnly", bt("원격 협업", "Remote only")],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2">
            <input type="checkbox" checked={brief[key]} onChange={(event) => patch({ [key]: event.target.checked })} />{label}
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-black text-fg">{bt("매칭 후보군", "Matching pools")}</h3><p className="mt-1 text-xs text-fg-3">{bt("현재 후보군은 연동 전 UX 검증용 샘플입니다. 실제 개인을 의미하지 않습니다.", "Current pools are pre-integration UX samples and do not represent real individuals.")}</p></div>
        <button type="button" onClick={() => downloadBrief(brief)} className={buttonClass({ variant: "quiet", className: "gap-2" })}><Download size={16} aria-hidden="true" /> {bt("소싱 브리프 내보내기", "Export sourcing brief")}</button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {matches.slice(0, 3).map((match) => (
          <article key={match.pool.id} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[0.65rem] font-black uppercase tracking-wide text-accent">{bt(...REGION_COPY[match.pool.region])}</p><h4 className="mt-1 text-sm font-black text-fg">{bt(match.pool.labelKo, match.pool.labelEn)}</h4></div>
              <span className={cn("rounded-full border px-2 py-1 text-xs font-black", match.score >= 70 ? "border-success/30 bg-success-soft/15 text-success" : "border-line bg-card text-fg-2")}>{match.score}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-fg-2">{"$"}{match.pool.typicalMonthlyUsd[0].toLocaleString()}–{"$"}{match.pool.typicalMonthlyUsd[1].toLocaleString()} / mo · {match.pool.timezoneOverlapHours}h overlap</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {match.pool.identityVerification ? <span className="inline-flex items-center gap-1 rounded-full bg-success-soft/15 px-2 py-1 text-[0.65rem] font-bold text-success"><BadgeCheck size={12} /> ID</span> : null}
              {match.pool.portfolioVerification ? <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[0.65rem] font-bold text-accent"><ShieldCheck size={12} /> Portfolio</span> : null}
              {match.pool.contractReady ? <span className="rounded-full bg-raised px-2 py-1 text-[0.65rem] font-bold text-fg-2">NDA / Contract</span> : null}
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 text-[0.68rem] leading-5 text-fg-3">{bt("실거래 단계에서는 신원·사업자/세금·계약 주체·지식재산권 귀속·현지 노동/용역 규정·지급/환불/분쟁 절차를 공급자와 별도 검증해야 합니다.", "Live sourcing must additionally verify identity, tax/business status, contracting entity, IP ownership, local labor/contractor rules, payment, refunds and dispute handling.")}</p>
    </section>
  );
}
