import { ArrowUpRight, Bell, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const NAV = [
  ["프로젝트", "/home"],
  ["캔버스", "/studio"],
  ["캐릭터", "/studio/character"],
  ["배경", "/studio/bg3d"],
  ["에셋", "/studio/assets"],
  ["AI", "/ai"],
  ["커뮤니티", "/community"],
] as const;

function contextFor(pathname: string) {
  if (/^\/studio\/character/.test(pathname) || pathname === "/shaper") return ["캐릭터 스튜디오", "캐릭터를 만들고 표정·포즈·의상을 구성합니다."];
  if (/^\/studio\/bg3d/.test(pathname)) return ["배경 스튜디오", "장면과 공간을 조합해 이야기의 무대를 만듭니다."];
  if (/^\/studio\/assets/.test(pathname) || /^\/research\//.test(pathname)) return ["에셋 라이브러리", "작품에 바로 사용할 수 있는 소재와 레퍼런스를 탐색합니다."];
  if (/^\/story-lab|^\/learn|^\/research/.test(pathname)) return ["스토리보드", "아이디어를 장면과 컷으로 확장합니다."];
  if (/^\/ai/.test(pathname)) return ["AI 크리에이티브 디렉터", "아이디어부터 캐릭터·장면·스토리까지 제작을 보조합니다."];
  if (/^\/market/.test(pathname)) return ["에셋 마켓", "작품 제작에 필요한 에셋과 리소스를 발견합니다."];
  if (/^\/community|^\/collaborate|^\/team/.test(pathname)) return ["커뮤니티", "창작자와 작품, 협업 기회를 연결합니다."];
  if (/^\/publish|^\/publishing|^\/showcase/.test(pathname)) return ["발행 & 공유", "작품을 정리하고 공개 채널로 전달합니다."];
  if (/^\/fortune/.test(pathname)) return ["캐릭터 인사이트", "캐릭터와 이야기를 새로운 관점에서 탐색합니다."];
  if (/^\/production/.test(pathname)) return ["프로덕션", "팀 작업과 제작 흐름을 한 화면에서 관리합니다."];
  return ["Creator Workspace", "상상하는 모든 이야기를 하나의 제작 공간에서 이어갑니다."];
}

export function ReferenceRouteChrome({ pathname, children }: { pathname: string; children?: ReactNode }) {
  const [label, description] = contextFor(pathname);
  return (
    <div className="reference-route-chrome" data-reference-route-chrome>
      <div className="reference-route-chrome__top">
        <Link to="/home" className="reference-route-chrome__brand" aria-label="ToonStudio 홈">
          <span className="reference-route-chrome__mark"><Sparkles size={16} aria-hidden="true" /></span>
          <span><strong>ToonStudio</strong><small>Story Comes to Life</small></span>
        </Link>
        <nav className="reference-route-chrome__nav" aria-label="크리에이터 작업공간">
          {NAV.map(([name, href]) => (
            <Link key={href} to={href} className={pathname === href || pathname.startsWith(`${href}/`) ? "is-active" : undefined}>{name}</Link>
          ))}
        </nav>
        <div className="reference-route-chrome__tools">
          <button type="button" aria-label="검색"><Search size={16} /></button>
          <button type="button" aria-label="알림"><Bell size={16} /></button>
          <Link to="/studio/new" className="reference-route-chrome__cta">+ 새 프로젝트</Link>
        </div>
      </div>
      <div className="reference-route-chrome__context">
        <div><span className="reference-route-chrome__eyebrow">TOONSTUDIO / {label.toUpperCase()}</span><h1>{label}</h1><p>{description}</p></div>
        <Link to="/studio" className="reference-route-chrome__open">작업공간 열기 <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
      {children}
    </div>
  );
}
