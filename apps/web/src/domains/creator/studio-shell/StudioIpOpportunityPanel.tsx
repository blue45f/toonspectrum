import { BriefcaseBusiness, Download, Film, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_IP_MEDIA,
  createStudioIpInquiry,
  createStudioIpOpportunityDocument,
  evaluateStudioIpReadiness,
  ipOpportunityStorageKey,
  type StudioIpAvailability,
  type StudioIpInquiryStatus,
  type StudioIpMedia,
  type StudioIpOpportunityDocument,
  type StudioIpRightsStatus,
} from "../studio-ip-opportunity";

const FIELD = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const MEDIA_COPY: Readonly<Record<StudioIpMedia, readonly [string, string]>> = {
  webtoon: ["웹툰", "Webtoon"],
  "web-novel": ["웹소설", "Web novel"],
  film: ["영화", "Film"],
  series: ["드라마·시리즈", "Series"],
  animation: ["애니메이션", "Animation"],
  game: ["게임", "Game"],
  "audio-drama": ["오디오 드라마", "Audio drama"],
  merchandise: ["굿즈", "Merchandise"],
};

function loadDocument(projectId: string): StudioIpOpportunityDocument {
  const fallback = createStudioIpOpportunityDocument(projectId);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(ipOpportunityStorageKey(projectId));
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<StudioIpOpportunityDocument>;
    return {
      ...fallback,
      ...value,
      version: 1,
      projectId,
      availableMedia: Array.isArray(value.availableMedia)
        ? value.availableMedia.filter((item): item is StudioIpMedia => STUDIO_IP_MEDIA.includes(item as StudioIpMedia))
        : fallback.availableMedia,
      territories: Array.isArray(value.territories)
        ? value.territories.filter((item): item is string => typeof item === "string").slice(0, 30)
        : fallback.territories,
      inquiries: Array.isArray(value.inquiries) ? value.inquiries.slice(0, 100) as StudioIpOpportunityDocument["inquiries"] : [],
      logline: String(value.logline ?? "").slice(0, 1000),
      synopsis: String(value.synopsis ?? "").slice(0, 12000),
      audience: String(value.audience ?? "").slice(0, 1000),
      comparableTitles: String(value.comparableTitles ?? "").slice(0, 2000),
      creatorBio: String(value.creatorBio ?? "").slice(0, 4000),
      contact: String(value.contact ?? "").slice(0, 500),
    };
  } catch {
    return fallback;
  }
}

function downloadPitch(document: StudioIpOpportunityDocument) {
  const report = evaluateStudioIpReadiness(document);
  const payload = {
    kind: "toonstudio-ip-pitch",
    version: 1,
    projectId: document.projectId,
    readiness: report,
    pitch: {
      logline: document.logline,
      synopsis: document.synopsis,
      audience: document.audience,
      comparableTitles: document.comparableTitles,
      creatorBio: document.creatorBio,
      contact: document.contact,
    },
    rights: {
      status: document.rightsStatus,
      availability: document.availability,
      media: document.availableMedia,
      territories: document.territories,
      sourceRightsVerified: document.sourceRightsVerified,
      contributorAgreementsComplete: document.contributorAgreementsComplete,
      assetRightsVerified: document.assetRightsVerified,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = href;
  anchor.download = "ip-pitch-package.json";
  anchor.click();
  URL.revokeObjectURL(href);
}

export function StudioIpOpportunityPanel({ projectId }: { readonly projectId: string }) {
  const bt = useBilingual("StudioIpOpportunityPanel");
  const [document, setDocument] = useState(() => loadDocument(projectId));
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [media, setMedia] = useState<StudioIpMedia>("film");
  const report = useMemo(() => evaluateStudioIpReadiness(document), [document]);

  useEffect(() => setDocument(loadDocument(projectId)), [projectId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(ipOpportunityStorageKey(projectId), JSON.stringify(document)); } catch { /* optional persistence */ }
  }, [document, projectId]);

  const patch = (next: Partial<StudioIpOpportunityDocument>) => setDocument((current) => ({ ...current, ...next }));
  const toggleMedia = (value: StudioIpMedia, checked: boolean) => patch({
    availableMedia: checked
      ? [...new Set([...document.availableMedia, value])]
      : document.availableMedia.filter((item) => item !== value),
  });

  const addInquiry = () => {
    if (!company.trim()) return;
    const inquiry = createStudioIpInquiry({
      company: company.trim(),
      contact: contact.trim(),
      media,
      territory: document.territories[0] ?? "worldwide",
      note: "",
    });
    patch({ inquiries: [inquiry, ...document.inquiries] });
    setCompany("");
    setContact("");
  };

  const statusTone = report.status === "ready"
    ? "border-success/30 bg-success-soft/15 text-success"
    : report.status === "blocked"
      ? "border-danger/30 bg-danger-soft/15 text-danger"
      : "border-warning/30 bg-warning-soft/15 text-warning";

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="ip-opportunity-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent"><Film size={15} aria-hidden="true" /> IP / ADAPTATION</p>
          <h2 id="ip-opportunity-title" className="mt-2 text-xl font-black text-fg">{bt("영화화·애니화·판권 제안 준비", "Film, animation and IP licensing readiness")}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">{bt("제안서보다 먼저 권리 정본을 확인하고, 매체별 가용 권리·지역·문의 상태와 피치 자료를 프로젝트에 함께 관리합니다.", "Verify chain of title before pitching, then manage media availability, territories, inquiries and pitch material with the project.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-black", statusTone)}>{bt("준비도", "Readiness")} {report.score}%</span>
          <button type="button" onClick={() => downloadPitch(document)} className={buttonClass({ variant: "outline", className: "gap-2" })}><Download size={16} /> {bt("피치 패키지", "Pitch package")}</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <label className="text-xs font-bold text-fg-2">{bt("권리 상태", "Rights status")}<select className={`${FIELD} mt-1`} value={document.rightsStatus} onChange={(event) => patch({ rightsStatus: event.target.value as StudioIpRightsStatus })}><option value="owned">{bt("단독 보유", "Owned")}</option><option value="co-owned">{bt("공동 보유", "Co-owned")}</option><option value="represented">{bt("대리/에이전시", "Represented")}</option><option value="unknown">{bt("확인 필요", "Unknown")}</option></select></label>
        <label className="text-xs font-bold text-fg-2">{bt("판권 가용 상태", "Availability")}<select className={`${FIELD} mt-1`} value={document.availability} onChange={(event) => patch({ availability: event.target.value as StudioIpAvailability })}><option value="available">{bt("제안 가능", "Available")}</option><option value="optioned">{bt("옵션 계약 중", "Optioned")}</option><option value="licensed">{bt("라이선스됨", "Licensed")}</option><option value="not-offered">{bt("제안 안 함", "Not offered")}</option><option value="unknown">{bt("확인 필요", "Unknown")}</option></select></label>
        <label className="text-xs font-bold text-fg-2">{bt("지역", "Territories")}<input className={`${FIELD} mt-1`} value={document.territories.join(", ")} onChange={(event) => patch({ territories: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30) })} placeholder="KR, JP, US, worldwide" /></label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-bold text-fg-2">{bt("제안 가능한 매체", "Available media rights")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STUDIO_IP_MEDIA.map((item) => <label key={item} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2"><input type="checkbox" checked={document.availableMedia.includes(item)} onChange={(event) => toggleMedia(item, event.target.checked)} />{bt(...MEDIA_COPY[item])}</label>)}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {([
          ["sourceRightsVerified", bt("원작/원천 권리 확인", "Source rights verified")],
          ["contributorAgreementsComplete", bt("공동 작업자 계약 완료", "Contributor agreements complete")],
          ["assetRightsVerified", bt("이미지·음원·폰트 권리 확인", "Asset rights verified")],
        ] as const).map(([key, label]) => <label key={key} className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2"><input type="checkbox" checked={document[key]} onChange={(event) => patch({ [key]: event.target.checked })} /><ShieldCheck size={15} className="text-accent" />{label}</label>)}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <label className="text-xs font-bold text-fg-2">{bt("로그라인", "Logline")}<textarea className={cn(FIELD, "mt-1 min-h-20 resize-y")} maxLength={1000} value={document.logline} onChange={(event) => patch({ logline: event.target.value })} /></label>
        <label className="text-xs font-bold text-fg-2">{bt("핵심 독자·시장", "Audience / market")}<textarea className={cn(FIELD, "mt-1 min-h-20 resize-y")} maxLength={1000} value={document.audience} onChange={(event) => patch({ audience: event.target.value })} /></label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-2">{bt("시놉시스", "Synopsis")}<textarea className={cn(FIELD, "mt-1 min-h-28 resize-y")} maxLength={12000} value={document.synopsis} onChange={(event) => patch({ synopsis: event.target.value })} /></label>
        <label className="text-xs font-bold text-fg-2">{bt("비교 작품/포지셔닝", "Comparable titles / positioning")}<textarea className={cn(FIELD, "mt-1 min-h-20 resize-y")} maxLength={2000} value={document.comparableTitles} onChange={(event) => patch({ comparableTitles: event.target.value })} /></label>
        <label className="text-xs font-bold text-fg-2">{bt("작가·팀 소개", "Creator / team bio")}<textarea className={cn(FIELD, "mt-1 min-h-20 resize-y")} maxLength={4000} value={document.creatorBio} onChange={(event) => patch({ creatorBio: event.target.value })} /></label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-2">{bt("판권 문의 연락처", "Rights contact")}<input className={`${FIELD} mt-1`} maxLength={500} value={document.contact} onChange={(event) => patch({ contact: event.target.value })} placeholder={bt("공개 피치 패키지에 포함할 업무용 연락처", "Business contact to include in the pitch package")} /></label>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2"><BriefcaseBusiness size={17} className="text-accent" /><h3 className="text-sm font-black text-fg">{bt("제안·문의 파이프라인", "Inquiry pipeline")}</h3></div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr_10rem_auto]">
          <input className={FIELD} value={company} onChange={(event) => setCompany(event.target.value)} placeholder={bt("제작사/플랫폼/에이전시", "Studio / platform / agency")} />
          <input className={FIELD} value={contact} onChange={(event) => setContact(event.target.value)} placeholder={bt("담당자/연락처", "Contact")} />
          <select className={FIELD} value={media} onChange={(event) => setMedia(event.target.value as StudioIpMedia)}>{STUDIO_IP_MEDIA.map((item) => <option key={item} value={item}>{bt(...MEDIA_COPY[item])}</option>)}</select>
          <button type="button" disabled={!company.trim()} onClick={addInquiry} className={buttonClass({ className: "gap-2" })}><Plus size={15} /> {bt("추가", "Add")}</button>
        </div>
        <div className="mt-3 space-y-2">
          {document.inquiries.slice(0, 8).map((inquiry) => <article key={inquiry.id} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><b className="text-sm text-fg">{inquiry.company}</b><p className="mt-1 truncate text-xs text-fg-3">{bt(...MEDIA_COPY[inquiry.media])} · {inquiry.contact || bt("연락처 없음", "No contact")}</p></div><select className="min-h-9 rounded-lg border border-line bg-panel px-2 text-xs text-fg" value={inquiry.status} onChange={(event) => patch({ inquiries: document.inquiries.map((item) => item.id === inquiry.id ? { ...item, status: event.target.value as StudioIpInquiryStatus } : item) })}><option value="new">{bt("신규", "New")}</option><option value="reviewing">{bt("검토", "Review")}</option><option value="meeting">{bt("미팅", "Meeting")}</option><option value="negotiating">{bt("협상", "Negotiating")}</option><option value="closed">{bt("종료", "Closed")}</option></select></article>)}
        </div>
      </div>

      {report.issues.length > 0 ? <div className="mt-4 rounded-2xl border border-warning/25 bg-warning-soft/10 p-4"><p className="flex items-center gap-2 text-xs font-black text-warning"><Sparkles size={14} /> {bt("피치 전 확인", "Before pitching")}</p><p className="mt-2 text-xs leading-5 text-fg-2">{report.issues.join(" · ")}</p></div> : null}
      <p className="mt-4 text-[0.68rem] leading-5 text-fg-3">{bt("옵션·양도·독점·지역·기간·2차적 저작물 범위 등 실제 계약 조건은 법률 검토가 필요한 영역이며, 이 화면은 제안 준비와 진행 상태를 관리하기 위한 도구입니다.", "Option, assignment, exclusivity, territory, term and derivative-rights clauses require legal review; this workspace manages pitch readiness and deal progress rather than replacing legal advice.")}</p>
    </section>
  );
}
