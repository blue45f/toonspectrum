import { Link, useLocation } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_PAGES } from "./navigation";
import { ResearchSceneStudy } from "./ResearchSceneStudy";

import "./resource-atelier.css";
import "./resource-illustrated.css";

import type { ReactNode } from "react";

import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const NOTICE_SCOPE = "domains.creator.resources.ResourceLayout.LocalSaveNotice";
const noticeTx = (source: string): string => translateCurrentStaticSourceText(NOTICE_SCOPE, "ko", source);
const LAYOUT_SCOPE = "domains.creator.resources.ResourceLayout";
const layoutTx = (source: string): string => translateCurrentStaticSourceText(LAYOUT_SCOPE, "ko", source);

const INTRO_ART: Record<string, string> = {
  "/story-lab": "canvas-noir",
  "/now": "project-crimson",
  "/research/assets": "character-pink",
  "/research/books": "project-romance",
  "/research/3d-assets": "background-city",
};

export function ResourceLayout({
  title,
  intro,
  children,
  width = "default",
}: {
  title: string;
  intro: string;
  children: ReactNode;
  width?: "default" | "wide";
}) {
  useBilingualI18nRevision();
  const { pathname } = useLocation();
  const isDesk = pathname === "/research" || pathname === "/research/";
  const introArt = INTRO_ART[pathname.replace(/\/$/u, "")];
  const isCurrent = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return <section className={`resource-atelier resource-illustrated mx-auto space-y-8 px-4 py-8 text-fg sm:px-6 sm:py-12 ${width === "wide" ? "max-w-[90rem]" : "max-w-6xl"}`}>
    <header className={`resource-masthead ${isDesk ? "resource-masthead--desk" : "resource-masthead--detail"} ${introArt ? "resource-masthead--illustrated" : ""}`}>
      <div className="resource-masthead-copy">
        <Link to="/research" className="inline-flex min-h-11 items-center text-xs font-semibold tracking-[.12em] text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{layoutTx("TOONSTUDIO / 리서치 데스크")}</Link>
        <h1 className="font-bold">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-fg-2">{intro}</p>
        <p className="resource-context">{layoutTx("복식·소품·배경을 관찰하고, 다음 웹툰 컷의 근거로")}</p>
      </div>
      {isDesk ? <ResearchSceneStudy /> : introArt ? <img className="resource-masthead-image" src={`/brand/illustrated-20260928/${introArt}.webp`} alt="" aria-hidden="true" width={320} height={240} /> : null}
    </header>
    <nav aria-label={layoutTx("창작 리서치 메뉴")} className="resource-menu resource-menu--desktop">
      {RESOURCE_PAGES.slice(1).map((page) => <Link key={page.path} to={page.path} aria-current={isCurrent(page.path) ? "page" : undefined}
        className={`${RESOURCE_BUTTON} ${isCurrent(page.path) ? "bg-accent-soft text-accent" : "bg-panel"}`}>{layoutTx(page.title)}</Link>)}
    </nav>
    <details className="resource-menu-mobile">
      <summary>{layoutTx("리서치·학습 전체 메뉴")} <span aria-hidden="true">⌄</span></summary>
      <nav aria-label={layoutTx("모바일 창작 리서치 메뉴")}>
        {RESOURCE_PAGES.slice(1).map((page) => <Link key={page.path} to={page.path} aria-current={isCurrent(page.path) ? "page" : undefined}
          className={isCurrent(page.path) ? "bg-accent-soft text-accent" : "bg-panel text-fg-2"}>{layoutTx(page.title)}</Link>)}
      </nav>
    </details>
    {children}
    <footer className="resource-next-work">
      <div><p className="eyebrow text-accent">FROM REFERENCE TO CANVAS</p><h2>{layoutTx("찾아낸 장면을, 웹툰으로 그릴 시간.")}</h2><p>{layoutTx("자료에서 얻은 형태와 분위기를 내 이야기로 바꿔보세요. ToonStudio의 브러시와 레이어로 구도를 잡고, 필요한 표현은 제작 강좌에서 익힐 수 있습니다.")}</p></div>
      <div className="flex flex-wrap gap-2">
        <Link className={`${RESOURCE_BUTTON} border-accent bg-accent text-on-accent hover:bg-accent-2`} to="/studio" reloadDocument>{layoutTx("스튜디오 열기 ↗")}</Link>
        <Link className={RESOURCE_BUTTON} to="/learn">{layoutTx("제작 강좌")}</Link>
        <Link className={RESOURCE_BUTTON} to="/create">{layoutTx("작품 갤러리")}</Link>
        <Link className={RESOURCE_BUTTON} to="/community">{layoutTx("창작 커뮤니티")}</Link>
      </div>
    </footer>
  </section>;
}

export function LocalSaveNotice({ error, saving = false, writable = true }: { error?: string; saving?: boolean; writable?: boolean }) {
  useBilingualI18nRevision();
  return <div className="rounded-xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2">
    <p>{noticeTx("자료와 기획서는 이 브라우저에만 저장됩니다. 계정·다른 기기로 동기화되지 않습니다. 공용 기기에서는 개인 작업 정보를 저장하지 마세요.")}</p>
    {saving && <p role="status">{noticeTx("다른 탭의 변경을 확인하며 저장하고 있습니다…")}</p>}
    {!writable && <p className="mt-2">{noticeTx("이 환경에서는 안전한 동시 저장을 사용할 수 없습니다. 읽기·내보내기는 가능하며, 저장은 HTTPS의 최신 브라우저를 이용하세요.")}</p>}
    {error && <p role="alert" className="mt-2 font-semibold text-fg">{formatI18nTemplate(noticeTx("저장 오류: {v0}"), { v0: error })}</p>}
  </div>;
}
