import { useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { workspaceTab, type workspaceProjectLinks } from "./studio-workspace-model";

type Destination = readonly [href: string, title: string, description: string];
function DestinationList({ items }: { readonly items: readonly Destination[] }) {
  return <div className="workspace-destination-list">{items.map(([href, title, description], index) =>
    <Link key={`${href}:${title}`} href={href}><span className="workspace-destination-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={18} aria-hidden="true" /></Link>,
  )}</div>;
}
function useWorkspaceSection<T extends string>(allowed: readonly [T, ...T[]]) {
  const [params, setParams] = useSearchParams();
  const tab = workspaceTab(params.get("tab"), allowed);
  const select = (next: T) => setParams((current) => {
    const value = new URLSearchParams(current); value.set("tab", next); return value;
  });
  return [tab, select] as const;
}

export function WorkspaceTeamContent({ project, links }: {
  readonly project: StudioProjectLibraryEntry | null;
  readonly links: ReturnType<typeof workspaceProjectLinks>;
}) {
  const bt = useBilingual("WorkspaceTeamContent");
  const [tab, select] = useWorkspaceSection(["overview", "people", "recruit", "review", "sessions"] as const);
  const tabs = [
    ["overview", bt("요약", "Overview")],
    ["people", bt("사람·권한", "People & access")],
    ["recruit", bt("채용", "Recruiting")],
    ["review", bt("검토", "Review")],
    ["sessions", bt("실시간", "Live")],
  ] as const;
  const groups = {
    overview: {
      title: bt("팀의 다음 행동을 한곳에서", "Your team's next actions in one place"),
      description: bt("사람을 찾는 단계부터 작품 권한, 검토와 실시간 세션까지 같은 흐름으로 이어집니다.", "Move from recruiting to access, review and live sessions in one flow."),
      items: [
        ["/team/people", bt("사람·권한 관리", "Manage people and access"), bt("팀 소속과 프로젝트 접근을 함께 확인", "Review team and project access together")],
        ["/team/recruiting", bt("지원·제안 확인", "Review applications and offers"), bt("면접과 합류 확정까지 이어서 처리", "Continue through interviews and onboarding")],
        [project ? links.review : "/studio", bt("검토 요청과 댓글", "Reviews and comments"), bt("열린 의견과 승인 대기 확인", "Check open feedback and pending approvals")],
        [project ? links.space : "/studio", bt("실시간 세션 시작", "Start a live session"), bt("공동 편집·검토·통화를 목적에 맞게 시작", "Start editing, review or calls for the task")],
      ] satisfies Destination[],
    },
    people: {
      title: bt("소속과 작품 권한을 분명하게", "Make membership and access explicit"),
      description: bt("팀 소속, 작품 접근, 제작 역할은 서로 다릅니다. 한 흐름에서 확인하고 필요한 권한만 부여하세요.", "Team membership, work access and production roles are distinct. Grant only what is needed."),
      items: [
        ["/team/people", bt("팀 워크스페이스와 구성원", "Team workspaces and members"), bt("조직 역할·초대·프로젝트 연결 관리", "Manage roles, invitations and project links")],
        [project ? links.team : "/studio", project ? bt("선택 작품의 권한", "Access for this work") : bt("권한을 관리할 작품 선택", "Choose a work"), bt("편집·검토·열람 권한 확인", "Review edit, comment and view access")],
        [project ? links.production : "/production", bt("제작 역할과 담당", "Production roles and assignments"), bt("실제 작업 담당과 검토자 배정", "Assign work owners and reviewers")],
      ] satisfies Destination[],
    },
    recruit: {
      title: bt("모집에서 프로젝트 합류까지", "From recruiting to project onboarding"),
      description: bt("공개 공고, 지원·면접, 합류 확정을 한 채용 파이프라인에서 관리합니다.", "Manage posts, applications, interviews and onboarding in one pipeline."),
      items: [
        ["/collaborate/new", bt("모집·의뢰 작성", "Post a role or commission"), bt("역할·작업량·기한·보수를 명확히 제시", "Specify role, scope, deadline and compensation")],
        ["/collaborate", bt("공개 구인·의뢰", "Public recruiting board"), bt("팀원과 전문 작업자 탐색", "Find teammates and specialists")],
        ["/team/recruiting", bt("인재·지원 관리", "Recruiting workspace"), bt("이력서·제안·면접·합류 처리", "Manage resumes, offers, interviews and onboarding")],
      ] satisfies Destination[],
    },
    review: {
      title: bt("댓글에서 승인까지 한 흐름으로", "Move feedback through approval"),
      description: bt("위치 댓글, 담당 작업, 페이지 상태와 승인본을 같은 작품 문맥에서 확인합니다.", "Keep anchored comments, assignments, page status and approvals in the same work context."),
      items: [
        [project ? links.review : "/studio", project ? bt("이 작품의 검토함", "Review this work") : bt("검토할 작품 선택", "Choose a work"), bt("열린 댓글·수정 요청·승인 대기 확인", "Check open comments, change requests and approvals")],
        [project ? links.production : "/production", bt("작업과 담당자", "Tasks and assignees"), bt("피드백을 실제 제작 작업으로 연결", "Connect feedback to production work")],
        ["/showcase/reviews", bt("공개 승인본", "Published review snapshots"), bt("공개 동의된 고정 검수본 확인", "View consented pinned review snapshots")],
      ] satisfies Destination[],
    },
    sessions: {
      title: bt("목적을 먼저 고르고 함께 작업하세요", "Choose the purpose before going live"),
      description: bt("공동 편집, 검토, 화면 공유 또는 가상 공간 중 필요한 방식만 시작합니다.", "Start only the editing, review, screen sharing or spatial mode you need."),
      items: [
        [project ? links.space : "/studio", project ? bt("이 작품의 실시간 공간", "Live space for this work") : bt("세션을 시작할 작품 선택", "Choose a work"), bt("참여자와 미디어 권한을 직접 확인", "Confirm participants and media permissions")],
        ["/team/recruiting?panel=rooms", bt("면접·회의", "Interviews and meetings"), bt("대기실·입장 승인·대화 관리", "Manage waiting rooms, admission and chat")],
        [project ? links.team : "/studio", bt("세션 전 권한 확인", "Check access before a session"), bt("원고와 팀의 비공개 자료 보호", "Protect private work and team materials")],
      ] satisfies Destination[],
    },
  };
  const group = groups[tab];
  return <div className="workspace-section-content">
    <TeamAreaNavigation compact />
    <div className="workspace-tabs" role="group" aria-label={bt("협업 업무 선택", "Choose collaboration activity")}>
      {tabs.map(([key, text]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => select(key)}>{text}</button>)}
    </div>
    <section className="workspace-section-body">
      <div className="workspace-section-intro"><h2>{group.title}</h2><p>{group.description}</p></div>
      <DestinationList items={group.items} />
    </section>
  </div>;
}

export function WorkspaceExploreContent() {
  const bt = useBilingual("WorkspaceExploreContent");
  const [tab, select] = useWorkspaceSection(["works", "materials", "people", "learn"] as const);
  const tabs = [["works", bt("작품", "Works")], ["materials", bt("소재", "Materials")], ["people", bt("사람", "People")], ["learn", bt("배움·라운지", "Learn & lounge")]] as const;
  const groups = {
    works: { title: bt("완성된 이야기에서 영감을", "Inspiration from finished work"), items: [
      ["/showcase", bt("창작 작품 전시", "Creator showcase"), bt("공개한 작품과 제작 과정", "Published work and creative process")],
      ["/discover", bt("외부 작품 탐색", "Discover titles"), bt("여러 플랫폼의 작품 발견", "Discover titles across platforms")],
      ["/ranking", bt("작품 랭킹", "Title rankings"), bt("출처와 지표를 함께 확인", "Check sources and ranking signals")],
    ] },
    materials: { title: bt("다음 작업을 위한 소재", "Materials for your next work"), items: [
      ["/market", bt("소재 마켓", "Materials market"), bt("호환성과 사용 조건 확인", "Check compatibility and usage terms")],
      ["/research", bt("리서치와 참고자료", "Research and references"), bt("출처가 있는 자료 찾기", "Find sourced references")],
      ["/studio/assets", bt("내 작품 재료", "My materials"), bt("보유한 브러시·배경·캐릭터", "Your brushes, backgrounds and characters")],
    ] },
    people: { title: bt("함께할 사람과 기회", "People and opportunities"), items: [
      ["/collaborate", bt("구인·의뢰", "Recruitment and commissions"), bt("공개 모집과 작업자 찾기", "Find roles and collaborators")],
      ["/collaborate/gallery", bt("경력·포트폴리오", "Careers and portfolios"), bt("공개 허가된 경력과 협업 확인", "Opted-in career records and collaboration confirmations")],
      ["/community", bt("창작자 커뮤니티", "Creator community"), bt("작품과 창작 경험 나누기", "Share work and creative experience")],
      ["/opportunities", bt("창작 기회", "Creator opportunities"), bt("공모전과 지원사업 확인", "Explore contests and programs")],
    ] },
    learn: { title: bt("한 단계씩 배우고 만들기", "Learn and create step by step"), items: [
      ["/learn", bt("배우기", "Learn"), bt("입문부터 전문 제작까지", "From first steps to professional work")],
      ["/help", bt("도움말", "Help"), bt("지금 막힌 작업 해결", "Help with your current task")],
      ["/fortune", bt("라운지 · 오늘의 카드", "Lounge · today's card"), bt("작업과 구분된 선택적 오락", "Optional entertainment, separate from work")],
    ] },
  } satisfies Record<typeof tab, { title: string; items: Destination[] }>;
  const group = groups[tab];
  return <div className="workspace-section-content">
    <div className="workspace-tabs" role="group" aria-label={bt("탐색 분류", "Explore categories")}>
      {tabs.map(([key, text]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => select(key)}>{text}</button>)}
    </div>
    <section className="workspace-section-body"><div className="workspace-section-intro"><h2>{group.title}</h2><p>{bt("작업 중인 비공개 원고와 공개 콘텐츠는 분리됩니다.", "Private work in progress stays separate from public content.")}</p></div><DestinationList items={group.items} /></section>
  </div>;
}
