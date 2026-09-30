import { FileUser } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { CollabLogin, CollabNotice, collabButton, collabPrimary } from "../collaboration-ui";

import { CreatorActivityPanel, CreatorCareerPanel } from "./CreatorCareerPanel";
import { CreatorMeetingPanel } from "./CreatorMeetingPanel";
import { CreatorTeamsPanel } from "./CreatorTeamsPanel";
import { HiringInvitationInbox } from "./HiringCampaignPanel";
import { HiringAvailabilityPanel } from "./HiringAvailabilityPanel";
import { HiringOffersPanel } from "./HiringOffersPanel";
import { hiringClient } from "./hiring-client";
import { ResumeEditor } from "./ResumeEditor";
import { emptyResume } from "./hiring-form-values";
import { ResumePreview } from "./ResumePreview";
import "./hiring.css";

import type { HiringResume, HiringResumeInput, HiringResumeVersion } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getApiErrorMessage } from "@/platform/api";
import { Container } from "@/shared/components/section";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { useApp } from "@/shared/lib/store";

const SCOPE = "domains.collaboration.hiring.HiringWorkspacePage";

const PANEL_KEYS = ["resumes", "availability", "career", "invitations", "offers", "rooms", "teams", "activity"] as const;
type WorkspacePanel = (typeof PANEL_KEYS)[number];

const PANEL_KO: Record<WorkspacePanel, string> = {
  resumes: "이력서",
  availability: "작업 가능",
  career: "경력·전시",
  invitations: "초대함",
  offers: "제안·예약",
  rooms: "면접·회의",
  teams: "팀·그룹",
  activity: "활동 기록",
};
const PANEL_EN: Record<WorkspacePanel, string> = {
  resumes: "Resumes",
  availability: "Availability",
  career: "Career · showcase",
  invitations: "Invitations",
  offers: "Offers · bookings",
  rooms: "Interviews · meetings",
  teams: "Teams",
  activity: "Activity",
};
const PANEL_GROUPS: readonly { readonly label: [string, string]; readonly panels: readonly WorkspacePanel[] }[] = [
  { label: ["내 프로필", "My profile"], panels: ["resumes", "availability", "career"] },
  { label: ["채용 파이프라인", "Hiring pipeline"], panels: ["invitations", "offers", "rooms"] },
  { label: ["운영", "Operations"], panels: ["teams", "activity"] },
] as const;

export function HiringWorkspacePage() {
  const bt = useBilingual(SCOPE);
  const actor = useApp((state) => state.userId);
  return (
    <Container size="wide" className="py-8 sm:py-10">
      <TeamAreaNavigation />
      <header className="my-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-accent">TEAM · RECRUITING</p>
          <h1 className="mt-2 text-3xl font-bold text-fg">{bt("인재·지원 관리", "Talent & application management")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-3">
            {bt("이력서와 작업 가능 일정부터 지원, 제안, 면접과 합류 준비까지 한 흐름에서 관리합니다.", "Manage resumes, availability, applications, offers, interviews, and onboarding in one flow.")}
          </p>
        </div>
        <Link href="/collaborate" className={collabButton}>{bt("공개 구인·의뢰 보기", "Browse open gigs")}</Link>
      </header>
      {actor ? <WorkspaceContent key={actor} actor={actor} /> : <CollabLogin />}
    </Container>
  );
}

function WorkspaceContent({ actor }: { actor: string }) {
  const bt = useBilingual(SCOPE);
  const [params, setParams] = useSearchParams();
  const requested = params.has("room") ? "rooms" : params.get("panel") ?? "resumes";
  const panel: WorkspacePanel = (PANEL_KEYS as readonly string[]).includes(requested) ? requested as WorkspacePanel : "resumes";
  function navigate(next: WorkspacePanel) {
    const query = new URLSearchParams(params);
    query.set("panel", next);
    if (next !== "rooms") query.delete("room");
    setParams(query);
  }
  return <div className="space-y-6">
    <nav aria-label={bt("인재·지원 관리 메뉴", "Talent & application menu")} className="hiring-panel-nav grid gap-3 lg:grid-cols-3">
      {PANEL_GROUPS.map((group) => <section key={group.label[0]} className="rounded-2xl border border-line bg-panel p-3">
        <h2 className="px-1 pb-2 text-xs font-bold text-fg-3">{bt(group.label[0], group.label[1])}</h2>
        <div className="hiring-panel-nav-buttons flex flex-wrap gap-2">{group.panels.map((key) => <button key={key} type="button" className={panel === key ? collabPrimary : collabButton} aria-pressed={panel === key} onClick={() => navigate(key)}>{bt(PANEL_KO[key], PANEL_EN[key])}</button>)}</div>
      </section>)}
    </nav>
    {panel === "resumes" && <ResumeWorkspace />}
    {panel === "availability" && <HiringAvailabilityPanel />}
    {panel === "invitations" && <HiringInvitationInbox />}
    {panel === "offers" && <HiringOffersPanel actor={actor} />}
    {panel === "teams" && <CreatorTeamsPanel actor={actor} />}
    {panel === "rooms" && <CreatorMeetingPanel actor={actor} />}
    {panel === "career" && <CreatorCareerPanel onResumeCreated={() => navigate("resumes")} />}
    {panel === "activity" && <CreatorActivityPanel />}
  </div>;
}

function ResumeWorkspace() {
  const bt = useBilingual(SCOPE);
  const [items, setItems] = useState<HiringResume[] | null>(null), [reload, setReload] = useState(0);
  const [edit, setEdit] = useState<{ id: string | null; input: HiringResumeInput } | null>(null);
  const [versions, setVersions] = useState<HiringResumeVersion[] | null>(null), [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void hiringClient.resumes(controller.signal).then((value) => { if (!controller.signal.aborted) setItems(value); }).catch(async (cause) => { const message = await getApiErrorMessage(cause, bt("이력서를 불러오지 못했어요.", "Couldn't load resumes.")); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [reload, bt]);
  async function act(work: () => Promise<unknown>, message: string) {
    if (busy) return; setBusy(true); setError(""); setNote("");
    try { await work(); setReload((value) => value + 1); setNote(message); } catch (cause) { setError(await getApiErrorMessage(cause, bt("처리하지 못했어요. 다시 시도해 주세요.", "Couldn't process it. Please try again."))); } finally { setBusy(false); }
  }
  const version = versions?.find((item) => item.id === selected);
  function startCreate() { setEdit({ id: null, input: emptyResume() }); setVersions(null); }
  return <div className="space-y-6 text-fg"><header className="space-y-3"><h2 className="text-2xl font-bold">{bt("내 비공개 이력서", "My private resumes")}</h2><p className="text-sm text-fg-3">{bt("최대 30개 이력서와 이력서당 100개 버전을 보관합니다. 공고에서 제출할 버전과 포트폴리오를 직접 선택하세요.", "Keep up to 30 resumes, 100 versions each. Choose which version and portfolio to submit per gig.")}</p><button className={collabPrimary} disabled={busy} onClick={startCreate}>{bt("새 이력서 작성", "Write a new resume")}</button></header>
    {error && <CollabNotice error>{error}<button className={`${collabButton} ml-3`} onClick={() => { setError(""); setReload((value) => value + 1); }}>{bt("다시 불러오기", "Reload")}</button></CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}
    {!items && !error && <div role="status" aria-label={bt("이력서를 불러오는 중", "Loading resumes")} className="grid gap-4 md:grid-cols-2" aria-hidden="true"><div className="skeleton h-36 rounded-xl" /><div className="skeleton h-36 rounded-xl" /></div>}
    {items?.length === 0 && (
      <ActionableEmptyState
        icon={FileUser}
        art="generic"
        title={bt("저장한 이력서가 없어요.", "No saved resumes yet.")}
        description={bt("첫 이력서를 작성해 두면 공고에서 원하는 버전을 골라 바로 지원할 수 있어요.", "Write your first resume now and you'll be able to pick a version and apply right from any gig post.")}
        primary={{ href: "/collaborate/positions", label: bt("모집 조건 둘러보기", "Browse open positions") }}
      >
        <button type="button" className={collabPrimary} disabled={busy} onClick={startCreate}>
          {bt("첫 이력서 작성하기", "Write my first resume")}
        </button>
      </ActionableEmptyState>
    )}
    {edit && <ResumeEditor key={`${edit.id}:${edit.input.expectedRevision}`} initial={edit.input} busy={busy} onCancel={() => setEdit(null)} onSave={(input) => { void act(async () => { await hiringClient.save(edit.id, input); setEdit(null); setVersions(null); }, bt("새 버전을 저장했어요. 기존 제출본은 바뀌지 않습니다.", "Saved a new version. Existing submissions stay unchanged.")); }} />}
    <ul className="grid gap-4 md:grid-cols-2">{items?.map((item) => <li key={item.id} className="space-y-3 rounded-xl border border-line bg-panel p-5"><h3 className="text-lg font-bold">{item.title}</h3>{item.submissionBlocked && <p className="text-sm text-danger">{bt("원본 경력의 권리가 철회되어 제출할 수 없는 이력서입니다.", "This resume can't be submitted because rights to the source career record were revoked.")}</p>}<p className="text-sm">{bt(`버전 ${item.revision} · ${new Date(item.updatedAt).toLocaleString("ko-KR")}`, `v${item.revision} · ${new Date(item.updatedAt).toLocaleString("en-US")}`)}</p><div className="flex flex-wrap gap-2"><button className={collabButton} disabled={busy} onClick={() => { setVersions(null); setEdit({ id: item.id, input: { title: item.title, content: item.currentVersion.content, expectedRevision: item.revision } }); }}>{bt("수정", "Edit")}</button><button className={collabButton} disabled={busy} onClick={() => { void act(async () => { const list = await hiringClient.versions(item.id); setVersions(list); setSelected(list[0]?.id ?? ""); setEdit(null); }, bt("저장한 버전을 불러왔어요.", "Loaded the saved versions.")); }}>{bt("버전·미리보기", "Versions · preview")}</button><button className={collabButton} disabled={busy} onClick={() => { if (globalThis.confirm(bt("모든 이력서 버전과 파생 제출본 내용을 지울까요? 별도 지원 메시지·연락처는 남습니다. 함께 지우려면 해당 공고에서 지원을 철회해 주세요.", "Delete all versions of this resume and derived submissions? Separate application messages and contacts remain; withdraw the application on the post to remove those too."))) void act(async () => { await hiringClient.remove(item.id, item.revision); setVersions(null); setEdit(null); }, bt("이력서와 파생 제출본 내용을 삭제했어요. 지원 메시지·연락처는 해당 공고에서 지원 철회로 지울 수 있습니다.", "Deleted the resume and derived submissions. Remove application messages and contacts by withdrawing on the post.")); }}>{bt("삭제", "Delete")}</button></div></li>)}</ul>
    {versions && <section className="space-y-4"><label>{bt("저장 버전", "Saved versions")}<select className="ml-3 rounded border border-line bg-panel p-2" value={selected} onChange={(event) => setSelected(event.target.value)}>{versions.map((item) => <option key={item.id} value={item.id}>{bt(`버전 ${item.revision} · ${new Date(item.createdAt).toLocaleString("ko-KR")}`, `v${item.revision} · ${new Date(item.createdAt).toLocaleString("en-US")}`)}</option>)}</select></label><button className={collabButton} onClick={() => globalThis.print()}>{bt("인쇄·PDF 저장", "Print · save PDF")}</button>{version && <ResumePreview content={version.content} />}</section>}
  </div>;
}
