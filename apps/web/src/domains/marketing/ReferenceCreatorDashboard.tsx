import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, FolderKanban, PencilLine, Plus } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HomeCoreStudios } from "./HomeCoreStudios";
import { HomeLunaPanel } from "./HomeLunaPanel";
import { HomePersonalStrip } from "./HomePersonalStrip";
import { ServiceFlowNext } from "./public/intro-primitives";
import { ReferenceEditorPreview } from "./ReferenceEditorPreview";
import { HOME_EXAMPLES, HOME_LEARN_MORE, HOME_QUICK_STARTS, homeArt } from "./reference-home-content";
import "./reference-creator-dashboard.css";

/**
 * 공개 홈(/)은 얇게 유지한다: 첫 화면은 포스터 히어로(아이디어 입력이 1차 행동)와
 * 시작 카드까지만, Luna 상담·예시·작업실 입구는 아래 섹션으로 나눈다.
 * 로그인해도 홈은 그대로이고 개인 동선은 히어로 아래 스트립으로만 얹는다.
 */
export function ReferenceCreatorDashboard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const submitIdea = (event: FormEvent) => {
    event.preventDefault();
    const text = idea.trim();
    navigate(text ? `/story-lab?idea=${encodeURIComponent(text)}` : "/story-lab");
  };
  return <div className="reference-dashboard" data-reference-dashboard="true">
    <section className="rd-poster" aria-labelledby="creator-hero-title">
      <img
        className="rd-poster-art"
        src="/brand/illustrated-20260928/hero.webp"
        srcSet="/brand/illustrated-20260928/hero-320.webp 320w, /brand/illustrated-20260928/hero-640.webp 640w, /brand/illustrated-20260928/hero.webp 677w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
      />
      <div className="rd-poster-inner">
        <div className="rd-story">
          <p className="rd-brand"><ToonStudioWordmark /><small>Stories Come to Life</small></p>
          <p className="rd-eyebrow">{bi("상상하는 모든 이야기, 여기서 작품이 됩니다.", "Every story you imagine starts here.")}</p>
          <h1 id="creator-hero-title">{bi("오늘은 어떤 이야기를", "What story will you")}<br /><em>{bi("만들까요?", "create today?")}</em></h1>
          <p className="rd-intro">{bi("당신의 상상이, 세상을 놀라게 할 웹툰이 됩니다.", "Your imagination. Your next extraordinary story.")}</p>
          <form className="rd-idea" onSubmit={submitIdea}>
            <PencilLine size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="rd-idea-input">{bi("아이디어 입력", "Idea input")}</label>
            <input
              id="rd-idea-input"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder={bi("아이디어를 입력해보세요 (예: 비 오는 날의 첫사랑)", "Type an idea (e.g. first love on a rainy day)")}
              maxLength={200}
              autoComplete="off"
            />
            <button type="submit" className="rd-idea-submit">{bi("시작하기", "Start")}<ArrowRight size={16} aria-hidden="true" /></button>
          </form>
        </div>
      </div>
    </section>
    <HomePersonalStrip />
    <nav id="creator-start" className="rd-quick" aria-labelledby="creator-toolkit-title">
      <div className="rd-section-heading">
        <h2 id="creator-toolkit-title" tabIndex={-1}>{bi("무엇부터 시작할까요?", "Where would you like to start?")}</h2>
        <span aria-hidden="true">START CREATING</span>
      </div>
      <div className="rd-quick-grid">{HOME_QUICK_STARTS.map((item) => <Link key={item.href} href={item.href}><img src={homeArt(item.image, 320)} alt="" width={240} height={144} decoding="async" /><strong>{bi(item.ko, item.en)}</strong><small>{bi(item.detailKo, item.detailEn)}</small></Link>)}</div>
    </nav>
    <section className="rd-examples" aria-labelledby="rd-examples-title">
      <div className="rd-examples-heading"><h2 id="rd-examples-title">{bi("예시 작품", "Example works")}</h2><Link href="/studio"><FolderKanban size={13} aria-hidden="true" />{bi("내 프로젝트", "My projects")}<ChevronRight size={13} aria-hidden="true" /></Link></div>
      <div className="rd-example-shelf">{HOME_EXAMPLES.map((example) => <div className="rd-example-cover" key={example.image}><img src={homeArt(example.image, 320)} alt="" width={180} height={120} decoding="async" /><span>{bi(example.ko, example.en)}<small>{bi(example.metaKo, example.metaEn)}</small></span></div>)}<Link className="rd-new-project" href="/studio/new"><Plus size={22} aria-hidden="true" /><span>{bi("새 작품", "New work")}</span></Link></div>
    </section>
    <section className="rd-luna-section" aria-labelledby="rd-luna-title">
      <div className="rd-section-heading">
        <h2 id="rd-luna-title">{bi("Luna에게 물어보세요", "Ask Luna")}</h2>
        <span aria-hidden="true">CREATIVE GUIDE</span>
      </div>
      <HomeLunaPanel />
    </section>
    <HomeCoreStudios />
    <ReferenceEditorPreview />
    <div className="rd-flow-next">
      <ServiceFlowNext current="home" title={bi("처음이라면 서비스 소개부터", "New here? Start with the introduction")} />
    </div>
    <nav className="rd-chapters" aria-label={bi("서비스 더 알아보기", "Learn more about ToonStudio")}>
      <span className="rd-chapters-label">{bi("더 알아보기", "Learn more")}</span>
      {HOME_LEARN_MORE.map((link) => <Link key={link.href} href={link.href}>{bi(link.ko, link.en)}<ArrowRight size={14} aria-hidden="true" /></Link>)}
    </nav>
  </div>;
}
