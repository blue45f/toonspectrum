import { lazy, Suspense, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, ClipboardList, Compass, FolderOpen, HelpCircle, MapPin, Plus, Search, Settings } from "lucide-react";
import Link from "@/compat/router-link";
import { useSession } from "@/compat/auth-session-store";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { useCreatorExperienceMode } from "@/shared/lib/creator-experience-mode";
import { CreatorExperienceModeSwitch } from "@/shared/components/CreatorExperienceModeSwitch";
import { OpenSearchButton } from "@/shared/components/open-search-button";
import { workspaceNavigationHref } from "@/shared/components/workspace/workspace-navigation-model";
import { WorkspaceAccountAction, WorkspaceBrand, WorkspaceSidebar } from "@/shared/components/workspace/WorkspaceChrome";
import { WorkspaceContextPanel } from "@/shared/components/workspace/WorkspaceContextPanel";
import { useStudioProjectLibrary } from "../studio-shell/useStudioProjectLibrary";
import { useStudioWorkspaceResume } from "./useStudioWorkspaceResume";
import { WorkspaceResumeNotice } from "./WorkspaceResumeNotice";
import { selectWorkspaceProject, workspacePanel, workspaceProjectLinks, type WorkspaceSurface } from "./studio-workspace-model";
import { WorkspaceTeamContent, WorkspaceExploreContent } from "./StudioWorkspaceSections";
import { StudioWorkspaceProjectPicker } from "./StudioWorkspaceProjectPicker";
import { StudioWorkspaceSpaceBoundary } from "./StudioWorkspaceSpaceBoundary";
import { StudioWorkspaceActivityRail } from "./StudioWorkspaceActivityRail";
import { StudioWorkspaceRecentWorks } from "./StudioWorkspaceRecentWorks";
import "@/shared/components/workspace/workspace.css";
import "@/shared/components/workspace/workspace-redesign.css";

const WorkspaceLiveHome = lazy(() => import("./StudioWorkspaceLiveHome").then((module) => ({ default: module.StudioWorkspaceLiveHome })));


/** Thin presentation adapter over the existing project, resume and document authorities. */
export function StudioWorkspacePage({ surface = "home" }: { readonly surface?: WorkspaceSurface }) {
  const bt = useBilingual("StudioWorkspacePage");
  const language = useI18n((state) => state.lang);
  const locale = language.startsWith("ko") ? "ko" : "en";
  const session = useSession();
  const library = useStudioProjectLibrary(locale, "active");
  const [params, setParams] = useSearchParams();
  const mode = useCreatorExperienceMode((state) => state.mode);
  const setMode = useCreatorExperienceMode((state) => state.setMode);
  const context = useMemo(() => selectWorkspaceProject(library.projects, params.get("project"), params.get("scope") === "personal"), [library.projects, params]);
  const loading = library.state === null && !library.error;
  const blocked = loading || Boolean(library.error) || context.missing;
  const project = blocked ? null : context.selected;
  const navigationContext = { projectId: params.get("project") || project?.id, personal: params.get("scope") === "personal" };
  const homeHref = workspaceNavigationHref("/home", navigationContext);
  // Freeze the resolved default in this history entry, without marking artwork as opened.
  useEffect(() => {
    if (!project || params.get("project") || params.get("scope") === "personal") return;
    setParams((current) => {
      if (current.get("project") || current.get("scope") === "personal") return current;
      const next = new URLSearchParams(current);
      next.set("project", project.id);
      return next;
    }, { replace: true });
  }, [project, params, setParams]);
  const resumeState = useStudioWorkspaceResume(project, locale);
  const resume = resumeState.target;
  const resumeActionLabel = resumeState.status === "unavailable" ? bt("원고 목록 확인", "Check manuscripts")
    : resumeState.status === "storage-error" ? bt("저장 공간 확인", "Check storage") : null;
  const verifyResumeClick = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest("a[data-workspace-resume]") : null;
    if (!link || event.defaultPrevented) return;
    const latest = resumeState.refresh();
    if (!latest.target || latest.target.href !== link.getAttribute("href")) event.preventDefault();
  };
  const links = workspaceProjectLinks(project, resume);
  const panel = workspacePanel(params.get("panel"));
  const projectSearchRef = useRef<HTMLInputElement>(null);
  const setPanel = (next: typeof panel) => {
    setParams((current) => {
      const value = new URLSearchParams(current);
      if (next) value.set("panel", next); else value.delete("panel");
      return value;
    }, { replace: Boolean(panel) });
  };
  const chooseProject = (id: string) => {
    if (loading || library.error || (id && !context.projects.some((item) => item.id === id))) return;
    setParams((current) => {
    const next = new URLSearchParams(current);
    next.delete("panel");
    if (id) { next.set("project", id); next.delete("scope"); } else { next.delete("project"); next.set("scope", "personal"); }
    return next;
    }, { replace: Boolean(panel) });
  };
  const label = surface === "team" ? bt("팀", "Team") : surface === "hub" ? bt("둘러보기", "Explore") : bt("내 스튜디오", "My studio");
  const activeId = surface === "home" ? "workspace-home" : surface === "team" ? "workspace-team" : "workspace-hub";
  const userName = session.data?.user.name;
  const canResume = Boolean(project && !library.error && !context.missing);

  const workspaceHeader = (
      <header className="workspace-topbar">
        <WorkspaceBrand href={homeHref} />
        <div className="workspace-project-select">
          <label htmlFor="workspace-current-project">{bt("현재 작품", "Current work")}</label>
          <select id="workspace-current-project" aria-label={bt("현재 작품 선택", "Select current work")} value={project?.id ?? ""}
            disabled={loading || Boolean(library.error)} onChange={(event) => chooseProject(event.target.value)}>
            <option value="">{loading ? bt("불러오는 중…", "Loading…") : context.missing ? bt("작품을 다시 선택하세요", "Select a work again") : bt("개인 작업실", "Personal studio")}</option>
            {context.projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button type="button" className="workspace-icon-button workspace-project-find" onClick={() => setPanel("projects")} aria-haspopup="dialog" aria-expanded={panel === "projects"} aria-label={bt("작품 찾아 전환", "Find and switch work")}><Search size={19} aria-hidden="true" /></button>
        </div>
        <div className="workspace-utilities">
          <OpenSearchButton ariaLabel={bt("작품·도구·메뉴 검색", "Search works, tools, menus")} className="workspace-search-trigger"><Search size={17} aria-hidden="true" /><span>{bt("작품·도구·메뉴 검색", "Search works, tools, menus")}</span><kbd aria-hidden="true">⌘ K</kbd></OpenSearchButton>
          <button type="button" className="workspace-work-shortcut" onClick={() => setPanel("work")} aria-haspopup="dialog" aria-expanded={panel === "work"} aria-label={bt("작업 바로가기 열기", "Open work shortcuts")}><ClipboardList size={20} aria-hidden="true" /></button>
          {surface === "home" ? <CreatorExperienceModeSwitch compact /> : null}
          <WorkspaceAccountAction />
        </div>
      </header>
  );
  const workspaceDialog = (
      <WorkspaceContextPanel open={panel !== null} initialFocusRef={panel === "projects" ? projectSearchRef : undefined} title={panel === "projects" ? bt("작품 찾아 전환", "Find and switch work") : panel === "work" ? bt("작업 바로가기", "Work shortcuts") : panel === "tools" ? bt("도구와 공간", "Tools and space") : bt("도움말", "Help")} onClose={() => setPanel(null)}>
        {panel === "projects" ? <StudioWorkspaceProjectPicker projects={context.projects} selectedId={project?.id ?? null} personal={!blocked && !project} loading={loading} error={library.error} locale={locale} searchRef={projectSearchRef} onSelect={chooseProject} onRetry={library.reload} /> : <div className="workspace-link-list">
          {panel === "work" ? blocked ? <><p>{bt("작품 목록을 확인한 후 작업을 열 수 있습니다.", "Work actions will be available after the library has been verified.")}</p><Link href="/studio">{bt("작품 목록 열기", "Open work library")}</Link></> : project ? <><WorkspaceResumeNotice snapshot={resumeState} onRetry={resumeState.refresh} /><StudioWorkspaceActivityRail project={project} links={links} resume={resume} resumeLabel={resumeActionLabel} /></> : <><p>{bt("작품을 만들거나 가져오면 이곳에서 이어갈 수 있습니다.", "Create or import a work to continue here.")}</p><Link href="/studio/new"><Plus size={20} aria-hidden="true" />{bt("새 작품", "New work")}</Link><Link href="/studio/import">{bt("파일 가져오기", "Import files")}</Link></> : panel === "tools" ? <><Link href={links.assets}>{project ? bt("현재 작품 소재", "Work materials") : bt("소재 라이브러리", "Materials library")}</Link><Link href="/market">{bt("새 소재 찾기", "Discover materials")}</Link>{project ? <Link href={links.space}>{bt("공간 입장과 꾸미기", "Enter and customize space")}</Link> : null}<Link href="/settings">{bt("테마·언어·환경 설정", "Theme, language and preferences")}</Link><button type="button" onClick={() => setPanel("help")}><HelpCircle size={20} aria-hidden="true" />{bt("도움말", "Help")}</button></> : <><Link href="/help"><BookOpen size={20} aria-hidden="true" />{bt("사용 도움말", "User help")}</Link><Link href="/about/studio">{bt("서비스 소개", "Studio introduction")}</Link><Link href="/product-tour"><Compass size={20} aria-hidden="true" />{bt("서비스 둘러보기", "Product tour")}</Link></>}
        </div>}
      </WorkspaceContextPanel>
  );

  if (surface === "home" && mode === "virtual-studio" && !blocked) {
    const recovery = <div className="workspace-runtime-recovery">{workspaceHeader}
      <section role="status"><p>{bt("가상 스튜디오 준비 중", "Preparing your virtual studio")}</p>
        <button type="button" onClick={() => setMode("classic")}>{bt("목록 보기로 전환", "Switch to list view")}</button>
      </section>
    </div>;
    return <div onClickCapture={verifyResumeClick} onAuxClickCapture={verifyResumeClick} data-workspace-runtime="true" data-workspace-surface="home" data-workspace-view={mode}>
      <StudioWorkspaceSpaceBoundary fallback={recovery}><Suspense fallback={recovery}>
        <WorkspaceLiveHome projectId={project?.id ?? null} header={workspaceHeader} />
      </Suspense></StudioWorkspaceSpaceBoundary>{workspaceDialog}
    </div>;
  }

  return (
    <div className="workspace-shell" onClickCapture={verifyResumeClick} onAuxClickCapture={verifyResumeClick} data-workspace-resume-state={resumeState.status} data-route-ready="studio-workspace" data-workspace-surface={surface} data-workspace-view={mode}>
      {workspaceHeader}
      <WorkspaceSidebar activeId={activeId} context={navigationContext} />
      <section className="workspace-main" aria-labelledby="workspace-title">
        <p className="workspace-section-marker" aria-hidden="true">{surface === "home" ? "YOUR CREATIVE SPACE" : surface === "team" ? "BETTER TOGETHER" : "BEYOND YOUR STUDIO"}</p>
        <div className="workspace-heading">
          <div><p className="workspace-eyebrow">{userName ? bt(`${userName} 님의 작업실`, `${userName}'s workspace`) : bt("나만의 온라인 작업실", "Your creative workspace")}</p><h1 id="workspace-title">{label}</h1><p className="workspace-heading-description">{surface === "home" ? bt("좋은 이야기는, 나만의 공간에서 시작됩니다.", "Every good story begins with a space of your own.") : surface === "team" ? bt("같은 이야기를 만드는 사람들과, 한곳에서.", "One place for the people creating the same story.") : bt("새로운 영감을 만나, 내 작업실로 가져오세요.", "Find fresh inspiration. Bring it back to your studio.")}</p></div>
        </div>
        {surface === "home" && panel !== "work" ? <WorkspaceResumeNotice snapshot={resumeState} onRetry={resumeState.refresh} /> : null}
        {library.error ? <div className="workspace-notice" role="alert"><p>{library.error}</p><button type="button" onClick={library.reload}>{bt("다시 확인", "Retry")}</button><Link href="/studio?view=storage">{bt("저장 공간 확인", "Check storage")}</Link></div> : null}
        {context.missing && !loading ? <p className="workspace-notice" role="status">{bt("이 기기에서 선택한 작품을 찾을 수 없습니다. 다른 작품으로 자동 이동하지 않았습니다.", "This work is not available on this device. Another work has not been opened in its place.")}</p> : null}
        {blocked && surface !== "hub" ? <section className="workspace-unavailable" data-workspace-state={loading ? "loading" : library.error ? "error" : "missing"} aria-busy={loading}>
          <h2>{loading ? bt("작품 목록을 확인하고 있습니다", "Checking your work library") : bt("작품을 확인한 뒤 이어갑니다", "Verify your work before continuing")}</h2>
          <p role={loading ? "status" : undefined}>{loading ? bt("작품을 확인하는 동안 다른 원고를 열지 않습니다.", "No other artwork will open while your library is being checked.") : library.error ? bt("브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요. 원고는 변경하지 않았습니다.", "Check browser storage and try again. Your artwork has not been changed.") : bt("원고를 다른 작품으로 대체하지 않았습니다. 작품 목록에서 다시 선택하거나 개인 작업실로 돌아가세요.", "No other artwork has been substituted. Choose a work from the library or return to your personal studio.")}</p>
          {!loading ? <div><Link className="workspace-primary" href={library.error ? "/studio?view=storage" : "/studio"}>{library.error ? bt("저장 공간 확인", "Check storage") : bt("작품 목록 열기", "Open work library")}</Link>{!library.error ? <button type="button" className="workspace-icon-button" onClick={() => chooseProject("")}>{bt("개인 작업실로 돌아가기", "Return to personal studio")}</button> : null}</div> : null}
        </section> : surface === "home" ? <>
          <div className="workspace-home-layout">
          <div className="workspace-list-view">
            <div className="workspace-current-work"><p className="workspace-eyebrow">{bt("이어서 만들기", "Continue creating")}</p>
              <h2>{project?.title ?? bt("첫 이야기를 시작해 보세요", "Start your first story")}</h2>
              <p>{resume?.summary ?? bt("원고와 팀의 작업을 한곳에서 이어갑니다.", "Keep your artwork and team workflow together.")}</p>
              {!loading && !library.error ? <Link className="workspace-primary" data-workspace-resume={project ? "true" : undefined} href={canResume ? links.resume : "/studio/new"}>{canResume ? (resumeActionLabel ?? (resume?.summary ? bt("원고 이어하기", "Resume artwork") : bt("작품 열기", "Open work"))) : bt("새 작품 만들기", "Create a work")}<ArrowRight size={18} aria-hidden="true" /></Link> : null}
            </div>
            <div className="workspace-link-list" aria-label={bt("현재 작품 작업", "Current work actions")}>
              {project ? <><Link href={links.review}><ClipboardList size={20} aria-hidden="true" /><span><strong>{bt("원고 검수", "Review artwork")}</strong><small>{bt("선택 작품의 받은 요청 확인", "Open requests for the selected work")}</small></span><ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href={links.production}><FolderOpen size={20} aria-hidden="true" /><span><strong>{bt("진행과 담당 작업", "Production and assignments")}</strong><small>{bt("실제 제작 보드에서 상태 확인", "Check the actual production board")}</small></span><ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href={links.space}><MapPin size={20} aria-hidden="true" /><span><strong>{bt("가상스튜디오 입장", "Enter virtual studio")}</strong><small>{bt("이 작품의 실시간 공간으로 이동", "Open this work's live space")}</small></span><ArrowRight size={18} aria-hidden="true" /></Link></> : <Link href="/studio/import"><FolderOpen size={20} aria-hidden="true" /><span>{bt("기존 파일 가져오기", "Import existing work")}</span><ArrowRight size={18} aria-hidden="true" /></Link>}
            </div>
          </div>
          </div>
          {mode === "classic" ? <StudioWorkspaceRecentWorks projects={context.projects} selectedId={project?.id} locale={locale} onSelect={chooseProject} /> : null}
        </> : surface === "team" ? <WorkspaceTeamContent links={links} project={project} /> : <WorkspaceExploreContent />}
      </section>
      <footer className="workspace-statusbar">
        <div><strong>{loading ? bt("작품 확인 중", "Checking works") : library.error ? bt("저장 공간 확인 필요", "Storage needs attention") : context.missing ? bt("선택 작품 확인 필요", "Selected work unavailable") : project?.title ?? bt("개인 작업실", "Personal studio")}</strong><small>{surface === "home" && resumeState.status === "ready" && resume?.summary ? resume.summary : bt("이 기기의 작품 목록 · 공유 권한은 각 작업에서 확인합니다", "Device work library · sharing access is checked in each workspace")}</small></div>
        {surface === "home" ? <div className="workspace-footer-actions"><button type="button" className="workspace-icon-button" onClick={() => setPanel("tools")} aria-haspopup="dialog" aria-expanded={panel === "tools"} aria-label={bt("도구와 공간 메뉴", "Tools and space menu")}><Settings size={19} aria-hidden="true" /></button>
          {!loading && !library.error && !context.missing ? <Link className="workspace-primary" data-workspace-resume={project ? "true" : undefined} href={canResume ? links.resume : "/studio/new"}>{canResume ? (resumeActionLabel ?? (resume?.summary ? bt("이어서 작업", "Resume work") : bt("작품 열기", "Open work"))) : bt("작품 시작", "Start creating")}<ArrowRight size={18} aria-hidden="true" /></Link> : null}</div> : <Link href={homeHref}>{bt("작업실로 돌아가기", "Back to studio")}</Link>}
      </footer>
      {workspaceDialog}
    </div>
  );
}
