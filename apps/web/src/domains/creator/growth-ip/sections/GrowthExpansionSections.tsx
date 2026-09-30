// 판권 제안 CRM · SNS 공유 · 사용 환경과 앱 설치 · 교육 과정 섹션.
import { BookOpen, Clapperboard, Copy, ExternalLink, GraduationCap, MonitorCheck, Plus, Scale, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { SharePageButton } from "@/shared/components/share-page-button";
import { copyText } from "@/shared/lib/copy-text";
import { getActiveI18nLocale } from "@/shared/lib/i18n-bilingual-copy";

import {
  creatorAgePolicy,
  WEBTOON_CURRICULUM_GUIDE,
  type EducationProgram,
  type RightsInquiry,
} from "../creator-growth-ip-model";
import { describeEnvironmentCapabilities, detectEnvironmentSupport } from "../environment-capabilities";
import { CapabilityGrid, PwaStatusPanel } from "../EnvironmentStatus";
import {
  CURRICULUM_GUIDE_EN,
  EDUCATION_LEVEL_LABEL,
  EDUCATION_LEVELS,
  EDUCATION_MODE_LABEL,
  EDUCATION_MODES,
  RIGHTS_MEDIA,
  RIGHTS_MEDIUM_LABEL,
  RIGHTS_STATUS_LABEL,
  RIGHTS_STATUSES,
} from "../growth-ip-labels";
import {
  bi,
  biLabel,
  GROWTH_BUTTON,
  GROWTH_CARD,
  GROWTH_INPUT,
  GROWTH_ITEM,
  GROWTH_PRIMARY,
  policyReason,
  safeExternalUrl,
  safeUuid,
  splitTags,
  type GrowthSectionProps,
} from "../growth-ip-shared";
import { EmptyNote, GrowthField, GrowthSection, Pill } from "../GrowthIpUi";
import { requestPwaInstallMessage, usePwaInstallSnapshot } from "../pwa-status";

const GROWTH_IP_PATH = "/studio/growth-ip";

function formatRecordedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "—";
  return new Intl.DateTimeFormat(getActiveI18nLocale(), { dateStyle: "medium" }).format(date);
}

const EMPTY_RIGHTS = { medium: "animation" as RightsInquiry["medium"], company: "", contact: "", territory: "", scope: "" };

export function RightsInquirySection({ state, update, notify, notice }: GrowthSectionProps) {
  const [draft, setDraft] = useState(EMPTY_RIGHTS);
  const policy = creatorAgePolicy(state.ageBand, "rights-offers");

  const record = () => {
    if (!policy.allowed) {
      notify(policyReason(policy));
      return;
    }
    if (!draft.company.trim() || !draft.scope.trim()) {
      notify(bi("제안 회사와 제안 범위를 입력하세요.", "Enter the proposing company and scope."));
      return;
    }
    const inquiry: RightsInquiry = {
      id: safeUuid(),
      medium: draft.medium,
      company: draft.company.trim().slice(0, 160),
      contact: draft.contact.trim().slice(0, 240),
      territory: draft.territory.trim().slice(0, 160),
      scope: draft.scope.trim().slice(0, 3000),
      status: "received",
      createdAt: new Date().toISOString(),
    };
    update((current) => ({ ...current, rightsInquiries: [...current.rightsInquiries, inquiry].slice(-200) }));
    setDraft((current) => ({ ...current, company: "", contact: "", territory: "", scope: "" }));
    notify(bi("IP 제안 CRM에 기록했습니다. 계약 체결은 이 화면에서 자동 실행되지 않습니다.", "Recorded in the IP inquiry CRM. Contracts are not executed from this screen."));
  };

  const changeStatus = (inquiryId: string, value: string) => {
    const status = RIGHTS_STATUSES.find((item) => item === value);
    if (!status) return;
    update((current) => ({ ...current, rightsInquiries: current.rightsInquiries.map((row) => (row.id === inquiryId ? { ...row, status } : row)) }));
  };

  return (
    <GrowthSection
      id="rights"
      icon={Scale}
      eyebrow="RIGHTS · FILM · ANIMATION"
      title={bi("판권·영화화·애니화 제안 CRM", "Rights, film and animation inquiry CRM")}
      description={bi("작품별 제안 수신·검토·법률 검토 필요·거절·종료 상태를 기록합니다. 제안 기록과 실제 계약 체결을 분리해, 클릭 한 번으로 권리가 이전되거나 동의된 것처럼 보이지 않게 합니다.", "Track inbound proposals and review states while keeping inquiry records separate from actual contract execution or rights transfer.")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("받은 제안 기록", "Record an inquiry")}</h3>
          <fieldset disabled={!policy.allowed} className="mt-3 grid gap-3">
            <legend className="sr-only">{bi("판권 제안 정보", "Rights inquiry details")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <GrowthField label={bi("분야", "Medium")}>
                <select
                  className={GROWTH_INPUT}
                  value={draft.medium}
                  onChange={(e) => {
                    const medium = RIGHTS_MEDIA.find((item) => item === e.target.value);
                    if (medium) setDraft((c) => ({ ...c, medium }));
                  }}
                >
                  {RIGHTS_MEDIA.map((medium) => <option key={medium} value={medium}>{biLabel(RIGHTS_MEDIUM_LABEL[medium])}</option>)}
                </select>
              </GrowthField>
              <GrowthField label={bi("지역/권역", "Territory")}>
                <input className={GROWTH_INPUT} value={draft.territory} onChange={(e) => setDraft((c) => ({ ...c, territory: e.target.value }))} />
              </GrowthField>
              <GrowthField label={bi("제안 회사/스튜디오", "Company / studio")}>
                <input className={GROWTH_INPUT} value={draft.company} onChange={(e) => setDraft((c) => ({ ...c, company: e.target.value }))} />
              </GrowthField>
              <GrowthField label={bi("담당자 연락 식별자", "Contact identifier")}>
                <input className={GROWTH_INPUT} value={draft.contact} onChange={(e) => setDraft((c) => ({ ...c, contact: e.target.value }))} />
              </GrowthField>
            </div>
            <GrowthField label={bi("제안 범위", "Scope")} hint={bi("옵션/판권 범위·기간·독점 여부 등 받은 내용을 사실 그대로 기록하세요.", "Record scope, term, exclusivity and other received terms factually.")}>
              {(describedBy) => (
                <textarea className={`${GROWTH_INPUT} min-h-28`} aria-describedby={describedBy} value={draft.scope} onChange={(e) => setDraft((c) => ({ ...c, scope: e.target.value }))} />
              )}
            </GrowthField>
            <button type="button" className={`${GROWTH_PRIMARY} justify-self-start`} onClick={record}><Plus size={15} aria-hidden />{bi("제안 기록", "Record inquiry")}</button>
          </fieldset>
          {!policy.allowed ? (
            <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-fg">
              {policyReason(policy)}{" "}
              <a href="#age" className="font-bold text-accent underline underline-offset-2">{bi("연령 정책으로 이동", "Go to age policy")}</a>
            </p>
          ) : null}
        </div>
        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">
            {bi("기록한 제안", "Recorded inquiries")} <span className="text-sm font-bold text-fg-2">{state.rightsInquiries.length}</span>
          </h3>
          <div className="mt-3 grid gap-2">
            {state.rightsInquiries.length ? state.rightsInquiries.slice().reverse().map((item) => (
              <article key={item.id} className={GROWTH_ITEM}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <strong className="text-sm text-fg">{item.company || bi("회사 미입력", "No company")}</strong>
                    <Pill>{biLabel(RIGHTS_MEDIUM_LABEL[item.medium])}</Pill>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-fg-2">
                    <span>{bi("검토 상태", "Status")}</span>
                    <select className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:ring-2 focus-visible:ring-accent/40" value={item.status} onChange={(e) => changeStatus(item.id, e.target.value)}>
                      {RIGHTS_STATUSES.map((status) => <option key={status} value={status}>{biLabel(RIGHTS_STATUS_LABEL[status])}</option>)}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-xs leading-5 text-fg-2">{[item.territory || bi("권역 미입력", "No territory"), formatRecordedDate(item.createdAt)].join(" · ")}</p>
                <p className="mt-1 whitespace-pre-line text-xs leading-5 text-fg">{item.scope}</p>
              </article>
            )) : <EmptyNote>{bi("아직 기록한 판권 제안이 없습니다.", "No rights inquiries recorded yet.")}</EmptyNote>}
          </div>
        </div>
      </div>
    </GrowthSection>
  );
}

type ManualSharePlatform = "linkedin" | "instagram" | "tiktok";

export function SocialShareSection({ notify, notice }: Pick<GrowthSectionProps, "notify" | "notice">) {
  const shareTo = async (platform: ManualSharePlatform) => {
    const url = new URL(GROWTH_IP_PATH, window.location.origin).toString();
    if (platform === "linkedin") {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
      notify(bi("LinkedIn 공유 화면을 열었습니다.", "Opened LinkedIn sharing."));
      return;
    }
    const name = platform === "instagram" ? "Instagram" : "TikTok";
    const copied = await copyText(url);
    notify(copied
      ? bi(`${name}은 일반 웹 주소를 바로 게시하는 기능이 제한적이라 링크를 복사했습니다. 앱의 프로필·메시지 등 지원되는 곳에 붙여넣으세요.`, `Direct web-link posting to ${name} is limited, so the link was copied for pasting into a supported app surface.`)
      : bi("링크를 복사하지 못했습니다.", "Could not copy the link."));
  };

  return (
    <GrowthSection
      id="share"
      icon={Share2}
      eyebrow="SOCIAL DISTRIBUTION"
      title={bi("SNS 공유와 현실적인 플랫폼 제약", "Social sharing with truthful platform constraints")}
      description={bi("카카오·X·Facebook·Naver·LINE·Telegram·메일·QR은 통합 공유 창을 사용합니다. LinkedIn은 공식 공유 주소를 열고, Instagram·TikTok은 웹 링크 직접 게시가 제한되어 링크 복사로 안내합니다.", "The share dialog covers Kakao, X, Facebook, Naver, LINE, Telegram, email and QR. LinkedIn opens its share URL; Instagram and TikTok fall back to copying the link.")}
      notice={notice}
    >
      <div className={GROWTH_CARD}>
        <div className="flex flex-wrap gap-2">
          <SharePageButton
            path={GROWTH_IP_PATH}
            text={bi("작가 성장·IP 확장 작업대", "Creator growth & IP workspace")}
            description={bi("창작자 성장·협업·IP 확장 기능", "Creator growth, collaboration and IP expansion")}
            label={bi("통합 공유", "Share")}
            className="min-h-11 rounded-xl px-4 text-sm"
          />
          <button type="button" className={GROWTH_BUTTON} onClick={() => void shareTo("linkedin")}><ExternalLink size={15} aria-hidden />{bi("LinkedIn에 공유", "Share on LinkedIn")}</button>
          <button type="button" className={GROWTH_BUTTON} onClick={() => void shareTo("instagram")}><Copy size={15} aria-hidden />{bi("Instagram용 링크 복사", "Copy link for Instagram")}</button>
          <button type="button" className={GROWTH_BUTTON} onClick={() => void shareTo("tiktok")}><Copy size={15} aria-hidden />{bi("TikTok용 링크 복사", "Copy link for TikTok")}</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-fg-2">{bi("공유 링크에는 공통 공유 모듈의 유입 추적이 그대로 적용됩니다. Instagram·TikTok에는 브라우저가 확인할 수 없는 ‘게시 완료’ 상태를 표시하지 않습니다.", "Share attribution stays intact. Instagram/TikTok never report a post success the browser cannot verify.")}</p>
      </div>
    </GrowthSection>
  );
}

export function EnvironmentSection({ notify, notice }: Pick<GrowthSectionProps, "notify" | "notice">) {
  const support = useMemo(() => detectEnvironmentSupport(), []);
  const capabilities = describeEnvironmentCapabilities(support);
  const readyCount = capabilities.filter((item) => item.supported).length;
  const pwa = usePwaInstallSnapshot();

  return (
    <GrowthSection
      id="environment"
      icon={MonitorCheck}
      eyebrow="ENVIRONMENT · PWA"
      title={bi("사용 환경 진단과 앱 설치", "Environment diagnostics and app install")}
      description={bi("브라우저가 실제로 제공하는 기능을 확인해 드로잉·웹캠·마이크·오프라인·3D·음성 기능의 준비 상태를 보여 주고, 앱 설치(PWA)로 이어집니다.", "Detects real browser capabilities for drawing, camera, microphone, offline, 3D and speech, and connects to app installation (PWA).")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className={GROWTH_CARD}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-black text-fg">{bi("지금 이 브라우저", "This browser right now")}</h3>
            <Pill tone="accent">{readyCount}/{capabilities.length} {bi("사용 가능", "ready")}</Pill>
          </div>
          <CapabilityGrid capabilities={capabilities} />
        </div>
        <aside className={GROWTH_CARD} aria-label={bi("앱 설치 상태", "App install status")}>
          <PwaStatusPanel pwa={pwa} onInstall={() => void requestPwaInstallMessage().then(notify)}>
            <Link to="/studio/environment" className={`${GROWTH_BUTTON} mt-2 w-full`}><MonitorCheck size={15} aria-hidden />{bi("상세 사용 환경 안내", "Full environment guide")}</Link>
            <p className="mt-3 text-xs leading-5 text-fg-2">{bi("iOS는 브라우저 제한 때문에 직접 ‘홈 화면에 추가’ 안내가 나올 수 있습니다. 오프라인·업데이트 대기 상태도 함께 보여 줍니다.", "iOS may require manual Add to Home Screen. Offline and pending-update states remain visible.")}</p>
          </PwaStatusPanel>
        </aside>
      </div>
    </GrowthSection>
  );
}

const EMPTY_EDUCATION = { institution: "", program: "", region: "", mode: "hybrid" as EducationProgram["mode"], level: "beginner" as EducationProgram["level"], duration: "", url: "", tags: "" };

function CurriculumRoadmap() {
  return (
    <ol className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={bi("웹툰 교육과정 단계", "Webtoon curriculum phases")}>
      {WEBTOON_CURRICULUM_GUIDE.map((phase, index) => {
        const english = CURRICULUM_GUIDE_EN[index];
        return (
          <li key={phase.phase} className={GROWTH_ITEM}>
            <div className="flex items-center gap-2">
              <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-black text-accent">{String(index + 1).padStart(2, "0")}</span>
              <strong className="text-sm text-fg">{bi(phase.phase, english?.phase ?? phase.phase)}</strong>
            </div>
            <ul className="mt-2 grid gap-1 text-xs leading-5 text-fg-2">
              {phase.subjects.map((subject, subjectIndex) => <li key={subject}>· {bi(subject, english?.subjects[subjectIndex] ?? subject)}</li>)}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

export function EducationSection({ state, update, notify, notice }: GrowthSectionProps) {
  const [draft, setDraft] = useState(EMPTY_EDUCATION);

  const addProgram = () => {
    if (!draft.institution.trim() || !draft.program.trim()) {
      notify(bi("교육기관과 과정명을 입력하세요.", "Enter an institution and program name."));
      return;
    }
    const program: EducationProgram = {
      id: safeUuid(),
      institution: draft.institution.trim().slice(0, 160),
      program: draft.program.trim().slice(0, 200),
      region: draft.region.trim().slice(0, 160),
      mode: draft.mode,
      level: draft.level,
      duration: draft.duration.trim().slice(0, 120),
      url: safeExternalUrl(draft.url),
      tags: splitTags(draft.tags),
    };
    update((current) => ({ ...current, educationPrograms: [...current.educationPrograms, program].slice(-300) }));
    setDraft(EMPTY_EDUCATION);
    notify(bi("교육 과정을 등록했습니다. 출처 링크가 있으면 함께 확인할 수 있어요.", "Program added. Keep the source link to verify it later."));
  };

  return (
    <GrowthSection
      id="education"
      icon={GraduationCap}
      eyebrow="SCHOOL · CURRICULUM · TRAINING"
      title={bi("웹툰 학교·학과·학원·교육원 정보와 교육과정", "Webtoon schools, programs and curriculum guidance")}
      description={bi("실제 교육기관 정보는 출처를 확인한 뒤 직접 기록하도록 비워 두었습니다. 대신 웹툰 제작에 필요한 표준 학습 로드맵을 제공합니다.", "Institution data is left for you to record from verified sources instead of being prefilled with fictional schools. A generic production curriculum map is provided.")}
      notice={notice}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("교육과정 로드맵", "Curriculum roadmap")}</h3>
          <CurriculumRoadmap />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/learn" className={GROWTH_BUTTON}><BookOpen size={15} aria-hidden />{bi("내부 학습실", "Learning hub")}</Link>
            <Link to="/learn/studio" className={GROWTH_BUTTON}><Clapperboard size={15} aria-hidden />{bi("Studio 실습", "Studio practice")}</Link>
          </div>
        </div>
        <div className={GROWTH_CARD}>
          <h3 className="font-black text-fg">{bi("확인한 교육기관/과정 등록", "Record a verified institution/program")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <GrowthField label={bi("기관명", "Institution")}>
              <input className={GROWTH_INPUT} value={draft.institution} onChange={(e) => setDraft((c) => ({ ...c, institution: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("학과/과정명", "Program")}>
              <input className={GROWTH_INPUT} value={draft.program} onChange={(e) => setDraft((c) => ({ ...c, program: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("지역", "Region")}>
              <input className={GROWTH_INPUT} value={draft.region} onChange={(e) => setDraft((c) => ({ ...c, region: e.target.value }))} />
            </GrowthField>
            <GrowthField label={bi("기간", "Duration")}>
              <input className={GROWTH_INPUT} value={draft.duration} onChange={(e) => setDraft((c) => ({ ...c, duration: e.target.value }))} placeholder={bi("예: 12주", "e.g. 12 weeks")} />
            </GrowthField>
            <GrowthField label={bi("수업 방식", "Format")}>
              <select
                className={GROWTH_INPUT}
                value={draft.mode}
                onChange={(e) => {
                  const mode = EDUCATION_MODES.find((item) => item === e.target.value);
                  if (mode) setDraft((c) => ({ ...c, mode }));
                }}
              >
                {EDUCATION_MODES.map((mode) => <option key={mode} value={mode}>{biLabel(EDUCATION_MODE_LABEL[mode])}</option>)}
              </select>
            </GrowthField>
            <GrowthField label={bi("난이도", "Level")}>
              <select
                className={GROWTH_INPUT}
                value={draft.level}
                onChange={(e) => {
                  const level = EDUCATION_LEVELS.find((item) => item === e.target.value);
                  if (level) setDraft((c) => ({ ...c, level }));
                }}
              >
                {EDUCATION_LEVELS.map((level) => <option key={level} value={level}>{biLabel(EDUCATION_LEVEL_LABEL[level])}</option>)}
              </select>
            </GrowthField>
            <GrowthField label={bi("공식/출처 링크", "Official source link")}>
              <input className={GROWTH_INPUT} type="url" inputMode="url" value={draft.url} onChange={(e) => setDraft((c) => ({ ...c, url: e.target.value }))} placeholder="https://" />
            </GrowthField>
            <GrowthField label={bi("태그(쉼표로 구분)", "Tags (comma separated)")}>
              <input className={GROWTH_INPUT} value={draft.tags} onChange={(e) => setDraft((c) => ({ ...c, tags: e.target.value }))} />
            </GrowthField>
          </div>
          <button type="button" className={`${GROWTH_PRIMARY} mt-3`} onClick={addProgram}><Plus size={15} aria-hidden />{bi("과정 등록", "Add program")}</button>
          <div className="mt-4 grid gap-2">
            {state.educationPrograms.length ? state.educationPrograms.slice().reverse().map((program) => (
              <article key={program.id} className={GROWTH_ITEM}>
                <strong className="text-sm text-fg">{program.institution} · {program.program}</strong>
                <p className="mt-1 text-xs text-fg-2">
                  {[
                    program.region || bi("지역 미입력", "No region"),
                    biLabel(EDUCATION_MODE_LABEL[program.mode]),
                    biLabel(EDUCATION_LEVEL_LABEL[program.level]),
                    program.duration || bi("기간 미입력", "No duration"),
                  ].join(" · ")}
                </p>
                {program.tags.length ? <p className="mt-1 text-xs text-fg-2">{program.tags.map((tag) => `#${tag}`).join(" ")}</p> : null}
                {program.url ? (
                  <a href={program.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-accent">
                    {bi("공식/확인 링크", "Source link")}<ExternalLink size={12} aria-hidden />
                  </a>
                ) : null}
              </article>
            )) : <EmptyNote>{bi("확인한 교육기관·과정을 등록하면 여기에 모입니다.", "Verified programs you record appear here.")}</EmptyNote>}
          </div>
        </div>
      </div>
    </GrowthSection>
  );
}
