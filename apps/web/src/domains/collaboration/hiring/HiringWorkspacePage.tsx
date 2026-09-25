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

import Link from "@/compat/router-link";
import { getApiErrorMessage } from "@/platform/api";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

const workspacePanels = { resumes: "이력서", availability: "작업 가능", invitations: "초대함", offers: "제안·예약", teams: "팀·그룹", rooms: "면접·회의", career: "경력·전시", activity: "활동 기록" } as const;
export function HiringWorkspacePage() {
  const actor = useApp((s) => s.userId);
  return <Container size="wide" className="py-8"><Link href="/collaborate" className={collabButton}>구인·의뢰로 돌아가기</Link><h1 className="my-6 text-3xl font-bold">창작자 협업 작업실</h1>{actor ? <WorkspaceContent key={actor} actor={actor} /> : <CollabLogin />}</Container>;
}
function WorkspaceContent({ actor }: { actor: string }) {
  const [params, setParams] = useSearchParams();
  const requested = params.has("room") ? "rooms" : params.get("panel") ?? "resumes";
  const panel = Object.hasOwn(workspacePanels, requested) ? requested : "resumes";
  function navigate(next: string) { const query = new URLSearchParams(params); query.set("panel", next); if (next !== "rooms") query.delete("room"); setParams(query); }
  return <div className="space-y-6"><nav aria-label="협업 작업실 메뉴" className="flex flex-wrap gap-2">{Object.entries(workspacePanels).map(([key, label]) => <button key={key} className={panel === key ? collabPrimary : collabButton} aria-pressed={panel === key} onClick={() => navigate(key)}>{label}</button>)}</nav>
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
  const [items, setItems] = useState<HiringResume[] | null>(null), [reload, setReload] = useState(0);
  const [edit, setEdit] = useState<{ id: string | null; input: HiringResumeInput } | null>(null);
  const [versions, setVersions] = useState<HiringResumeVersion[] | null>(null), [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void hiringClient.resumes(c.signal).then((v) => { if (!c.signal.aborted) setItems(v); }).catch(async (e) => { const message = await getApiErrorMessage(e, "이력서를 불러오지 못했어요."); if (!c.signal.aborted) setError(message); });
    return () => c.abort();
  }, [reload]);
  async function act(work: () => Promise<unknown>, message: string) {
    if (busy) return; setBusy(true); setError(""); setNote("");
    try { await work(); setReload((n) => n + 1); setNote(message); } catch (e) { setError(await getApiErrorMessage(e, "처리하지 못했어요. 다시 시도해 주세요.")); } finally { setBusy(false); }
  }
  const version = versions?.find((v) => v.id === selected);
  return <div className="space-y-6 text-fg"><header className="space-y-3"><h2 className="text-2xl font-bold">내 비공개 이력서</h2><p className="text-sm text-fg-3">최대 30개 이력서와 이력서당 100개 버전을 보관합니다. 공고에서 제출할 버전과 포트폴리오를 직접 선택하세요.</p><button className={collabPrimary} disabled={busy} onClick={() => { setEdit({ id: null, input: emptyResume() }); setVersions(null); }}>새 이력서 작성</button></header>
    {error && <CollabNotice error>{error}<button className={`${collabButton} ml-3`} onClick={() => { setError(""); setReload((n) => n + 1); }}>다시 불러오기</button></CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}
    {!items && !error && <p role="status">이력서를 불러오고 있어요.</p>}{items?.length === 0 && <p>저장한 이력서가 없어요. 첫 이력서를 작성해 주세요.</p>}
    {edit && <ResumeEditor key={`${edit.id}:${edit.input.expectedRevision}`} initial={edit.input} busy={busy} onCancel={() => setEdit(null)} onSave={(input) => { void act(async () => { await hiringClient.save(edit.id, input); setEdit(null); setVersions(null); }, "새 버전을 저장했어요. 기존 제출본은 바뀌지 않습니다."); }} />}
    <ul className="grid gap-4 md:grid-cols-2">{items?.map((item) => <li key={item.id} className="space-y-3 rounded-xl border border-line bg-panel p-5"><h3 className="text-lg font-bold">{item.title}</h3>{item.submissionBlocked && <p className="text-sm text-danger">원본 경력의 권리가 철회되어 제출할 수 없는 이력서입니다.</p>}<p className="text-sm">버전 {item.revision} · {new Date(item.updatedAt).toLocaleString("ko-KR")}</p><div className="flex flex-wrap gap-2"><button className={collabButton} disabled={busy} onClick={() => { setVersions(null); setEdit({ id: item.id, input: { title: item.title, content: item.currentVersion.content, expectedRevision: item.revision } }); }}>수정</button><button className={collabButton} disabled={busy} onClick={() => { void act(async () => { const list = await hiringClient.versions(item.id); setVersions(list); setSelected(list[0]?.id ?? ""); setEdit(null); }, "저장한 버전을 불러왔어요."); }}>버전·미리보기</button><button className={collabButton} disabled={busy} onClick={() => { if (globalThis.confirm("모든 이력서 버전과 파생 제출본 내용을 지울까요? 별도 지원 메시지·연락처는 남습니다. 함께 지우려면 해당 공고에서 지원을 철회해 주세요.")) void act(async () => { await hiringClient.remove(item.id, item.revision); setVersions(null); setEdit(null); }, "이력서와 파생 제출본 내용을 삭제했어요. 지원 메시지·연락처는 해당 공고에서 지원 철회로 지울 수 있습니다."); }}>삭제</button></div></li>)}</ul>
    {versions && <section className="space-y-4"><label>저장 버전<select className="ml-3 rounded border border-line bg-panel p-2" value={selected} onChange={(e) => setSelected(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>버전 {v.revision} · {new Date(v.createdAt).toLocaleString("ko-KR")}</option>)}</select></label><button className={collabButton} onClick={() => globalThis.print()}>인쇄·PDF 저장</button>{version && <ResumePreview content={version.content} />}</section>}
  </div>;
}
