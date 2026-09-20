import { useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { workspaceTab, type workspaceProjectLinks } from "./studio-workspace-model";

type Destination = readonly [href: string, title: string, description: string];
function DestinationList({ items }: { readonly items: readonly Destination[] }) {
  return <div className="workspace-link-list">{items.map(([href, title, description]) =>
    <Link key={`${href}:${title}`} href={href}><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={18} aria-hidden="true" /></Link>,
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
  const [tab, select] = useWorkspaceSection(["members", "recruit", "sessions"] as const);
  const tabs = [["members", bt("멤버·권한", "Members & access")], ["recruit", bt("모집·의뢰", "Recruit & commission")], ["sessions", bt("대화·면접 준비", "Conversations & interviews")]] as const;
  const groups = {
    members: {
      title: bt("함께 만드는 사람과 권한", "People and permissions"),
      description: bt("현재 작품의 멤버십과 권한을 관리합니다. 모집 게시물은 팀 가입이나 원고 접근 권한이 아닙니다.", "Manage membership and access for the current work. A recruitment post does not grant access."),
      items: [[project ? links.team : "/studio", project ? bt("선택 작품의 멤버·권한 관리", "Manage this work's team") : bt("팀을 관리할 작품 선택", "Choose a work"), bt("기존 작품 권한 설정으로 이동", "Open existing work permissions")], [project ? links.production : "/production", bt("진행·담당·일정 확인", "Production and assignments"), bt("실제 제작 보드 확인", "Check the production board")], ["/collaborate/workspace?panel=teams", bt("채용 팀·그룹 관리", "Hiring teams and groups"), bt("작품 권한과 분리된 협업 팀 관리", "Manage collaboration teams separately from artwork permissions")]] satisfies Destination[],
    },
    recruit: {
      title: bt("작품에 필요한 동료를 찾으세요", "Find the right collaborators"),
      description: bt("역할·작업량·기한·보수를 정리한 뒤 모집합니다. 접속 중이라는 이유로 즉시 작업 가능으로 판단하지 않습니다.", "Specify the role, scope, deadline and compensation. Being online does not mean being available for work."),
      items: [["/collaborate/new", bt("어시스트 모집·의뢰 작성", "Post a role or commission"), bt("급한 작업은 기한과 착수 가능 일정 명시", "Specify deadlines and start dates for urgent work")], ["/collaborate", bt("구인·의뢰 게시판", "Recruitment and commissions"), bt("공개 모집과 작업자 찾기", "Find public roles and collaborators")], ["/collaborate/positions", bt("역할·도구·보수로 인력 찾기", "Find roles by tools and compensation"), bt("실제 공개 모집 조건 검색", "Search the published hiring conditions")], ["/collaborate/workspace?panel=resumes", bt("이력서·제안 관리", "Resumes and offers"), bt("비공개 이력서와 지원·제안 확인", "Review private resumes, applications and offers")]] satisfies Destination[],
    },
    sessions: {
      title: bt("대화와 작업을 연결하세요", "Connect conversations to work"),
      description: bt("프로젝트 공간에서 참여자를 확인하고 대화를 요청합니다. 외부 지원자에게 내부 원고 권한을 자동으로 부여하지 않습니다.", "Check participants and request a conversation. Applicants are not automatically granted artwork access."),
      items: [["/collaborate/workspace?panel=rooms", bt("면접 대기실·회의 관리", "Interview waiting rooms and meetings"), bt("초대·입장 승인·텍스트 대화 · 영상 통화와 분리", "Invitations, admission and text chat; separate from video calling")], [project ? links.space : "/studio", project ? bt("이 작품의 대화 공간 입장", "Enter the conversation space") : bt("대화할 작품 선택", "Choose a work"), bt("미디어는 직접 켜고 참여 권한은 별도로 확인", "Media is opt-in and permissions are checked separately")], [project ? links.team : "/studio", bt("초대 전 공유 권한 확인", "Check access before inviting"), bt("원고와 팀의 비공개 자료 보호", "Protect private work and team materials")]] satisfies Destination[],
    },
  };
  const group = groups[tab];
  return <div className="workspace-section-content">
    <div className="workspace-tabs" role="group" aria-label={bt("팀 업무 선택", "Choose team activity")}>
      {tabs.map(([key, text]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => select(key)}>{text}</button>)}
    </div>
    <section className="workspace-section-body"><div className="workspace-section-intro"><h2>{group.title}</h2><p>{group.description}</p></div><DestinationList items={group.items} /></section>
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
