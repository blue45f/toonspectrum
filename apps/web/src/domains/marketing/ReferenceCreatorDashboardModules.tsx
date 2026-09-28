import { useState, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, Boxes, Check, ChevronRight, FolderKanban, Layers3, MessageCircle, PackageCheck, PanelsTopLeft, Sparkles, Users, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import "./reference-creator-dashboard-modules.css";

const ART = "/brand/illustrated-20260928";
const SCENES = "/assets/studio/scene-assistant/imagegen25-v1";
type Localize = ReturnType<typeof useBilingualLocalizer>;

function MiniArt({ name, className = "" }: { name: string; className?: string }) {
  return <img className={className} src={`${ART}/${name}-320.webp`} srcSet={`${ART}/${name}-320.webp 320w, ${ART}/${name}-640.webp 640w`} sizes="(max-width: 599px) 45vw, 20vw" alt="" width={480} height={360} loading="lazy" decoding="async" />;
}

function Workspace({ kind, title, href, icon: Icon, caption, children, bi }: {
  kind: string;
  title: string;
  href: string;
  icon: LucideIcon;
  caption: string;
  children: ReactNode;
  bi: Localize;
}) {
  return (
    <article className={`rd-mini-workspace rd-mini-workspace--${kind}`} aria-labelledby={`rd-mini-${kind}-title`}>
      <h3 id={`rd-mini-${kind}-title`} className="rd-mini-heading">
        <Link href={href} aria-label={`${title} ${bi("열기", "— open")}`}>
          <Icon size={18} aria-hidden="true" /><span>{title}</span><ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </h3>
      <div className="rd-mini-content">{children}</div>
      <p className="rd-mini-caption">{caption}</p>
    </article>
  );
}

function ProjectShelf({ bi }: { bi: Localize }) {
  return (
    <Workspace kind="projects" title={bi("프로젝트", "Projects")} href="/studio" icon={FolderKanban} caption={bi("당신의 모든 이야기, 하나의 세계로", "Your stories, one universe")} bi={bi}>
      <div className="rd-mini-project-sidebar" aria-hidden="true"><FolderKanban /><BookOpen /><Layers3 /></div>
      <div className="rd-mini-project-library">
        <div className="rd-mini-meta"><strong>{bi("작품 선반", "Story shelf")}</strong><span>{bi("예시 작품", "Example works")}</span></div>
        <div className="rd-mini-project-covers">
          <figure><MiniArt name="canvas-noir" /><figcaption>{bi("회색의 도시", "City of grey")}</figcaption></figure>
          <figure><MiniArt name="project-romance" /><figcaption>{bi("다시, 봄", "Spring, again")}</figcaption></figure>
          <figure><MiniArt name="project-crimson" /><figcaption>{bi("붉은 기억", "Crimson memory")}</figcaption></figure>
        </div>
      </div>
    </Workspace>
  );
}

function CharacterSheet({ bi }: { bi: Localize }) {
  const [character, setCharacter] = useState<"pink" | "blue">("pink");
  return (
    <Workspace kind="character" title={bi("캐릭터 스튜디오", "Character studio")} href="/studio/assets/characters/new" icon={Users} caption={bi("인물에 표정과 이야기를 더하세요", "Give every character a story")} bi={bi}>
      <div className="rd-mini-character-portrait"><MiniArt name={`character-${character}`} /><span>{bi("캐릭터 예시", "Character example")}</span></div>
      <div className="rd-mini-character-sheet">
        <div className="rd-mini-character-picker" role="group" aria-label={bi("예시 캐릭터 선택", "Choose an example character")}>
          <button type="button" aria-pressed={character === "pink"} onClick={() => setCharacter("pink")}>{bi("벚꽃", "Blossom")}</button>
          <button type="button" aria-pressed={character === "blue"} onClick={() => setCharacter("blue")}>{bi("푸른빛", "Azure")}</button>
        </div>
        <strong>{bi("캐릭터 스터디", "Character study")}</strong>
        <div className="rd-mini-expressions">
          <span className="rd-mini-study-face"><MiniArt name={`character-${character}`} /><small>{bi("얼굴", "Face")}</small></span>
          <span className="rd-mini-study-hair"><MiniArt name={`character-${character}`} /><small>{bi("머리", "Hair")}</small></span>
          <span className="rd-mini-study-outfit"><MiniArt name={`character-${character}`} /><small>{bi("의상", "Outfit")}</small></span>
        </div>
      </div>
    </Workspace>
  );
}

function BackgroundGallery({ bi }: { bi: Localize }) {
  const [scene, setScene] = useState("city");
  const scenes = [
    { id: "city", ko: "도시", en: "City", src: `${ART}/background-city-640.webp` },
    { id: "palace", ko: "궁궐", en: "Palace", src: `${SCENES}/palace.webp` },
    { id: "classroom", ko: "교실", en: "Classroom", src: `${ART}/background-classroom-640.webp` },
  ];
  const selected = scenes.find((item) => item.id === scene) ?? scenes[0];
  return (
    <Workspace kind="background" title={bi("배경 스튜디오", "Background studio")} href="/studio/bg3d" icon={Boxes} caption={bi("상상한 장면을 하나의 공간으로", "Worlds beyond imagination")} bi={bi}>
      <figure className="rd-mini-background-main"><img src={selected.src} alt={bi(`${selected.ko} 배경 예시`, `${selected.en} background example`)} width={480} height={360} loading="lazy" decoding="async" /><figcaption>{bi("배경 예시", "Scene example")} · {bi(selected.ko, selected.en)}</figcaption></figure>
      <div className="rd-mini-background-picker" role="group" aria-label={bi("배경 예시 선택", "Choose an example background")}>
        {scenes.map((item) => <button type="button" key={item.id} aria-pressed={scene === item.id} aria-label={bi(`${item.ko} 배경 보기`, `View ${item.en.toLowerCase()} background`)} onClick={() => setScene(item.id)}><img src={item.src} alt="" width={96} height={64} loading="lazy" decoding="async" /><span>{bi(item.ko, item.en)}</span></button>)}
      </div>
    </Workspace>
  );
}

function AssetGrid({ bi }: { bi: Localize }) {
  return (
    <Workspace kind="assets" title={bi("에셋 라이브러리", "Asset library")} href="/studio/assets" icon={Layers3} caption={bi("작품을 완성하는 작은 재료들", "Everything your next scene needs")} bi={bi}>
      <div className="rd-mini-meta"><strong>{bi("소재 보드", "Material board")}</strong><span>{bi("소재 예시", "Material examples")}</span></div>
      <div className="rd-mini-asset-grid" role="group" aria-label={bi("캐릭터·말풍선·효과 소재 예시", "Character, speech bubble and effect examples")}>
        <div className="rd-mini-asset-tile"><MiniArt name="materials" /></div>
        <div className="rd-mini-asset-tile rd-mini-asset-bubble"><MessageCircle aria-hidden="true" /><span>{bi("안녕!", "Hello!")}</span></div>
        <div className="rd-mini-asset-tile rd-mini-asset-spark"><Sparkles aria-hidden="true" /></div>
        <div className="rd-mini-asset-tile"><MiniArt name="character-blue" /></div>
        <div className="rd-mini-asset-tile rd-mini-asset-screentone" role="img" aria-label={bi("망점 패턴", "Halftone pattern")} />
        <div className="rd-mini-asset-tile rd-mini-asset-speed" role="img" aria-label={bi("집중선 효과", "Speed line effect")} />
        <div className="rd-mini-asset-tile rd-mini-asset-letter">Aa<span>{bi("글자", "Type")}</span></div>
        <div className="rd-mini-asset-tile rd-mini-asset-paper"><span>{bi("효과음", "SFX")}</span></div>
      </div>
    </Workspace>
  );
}

function Storyboard({ bi }: { bi: Localize }) {
  return (
    <Workspace kind="storyboard" title={bi("스토리보드", "Storyboard")} href="/story-lab" icon={PanelsTopLeft} caption={bi("아이디어가 장면으로 이어지는 곳", "From ideas to scenes")} bi={bi}>
      <div className="rd-mini-story-panels" aria-label={bi("스토리보드 예시 컷", "Example storyboard panels")}>
        <figure><MiniArt name="storyboard" /><figcaption>01</figcaption></figure>
        <figure><MiniArt name="project-romance" /><figcaption>02</figcaption></figure>
        <figure><MiniArt name="project-crimson" /><figcaption>03</figcaption></figure>
      </div>
      <div className="rd-mini-story-outline"><strong>{bi("구성 예시", "Story outline")}</strong><ol><li>{bi("프롤로그", "Prologue")}</li><li>{bi("첫 만남", "First encounter")}</li><li>{bi("새로운 선택", "A new choice")}</li></ol></div>
    </Workspace>
  );
}

function AiDirector({ bi }: { bi: Localize }) {
  return (
    <Workspace kind="ai" title={bi("AI 크리에이티브 디렉터", "AI creative director")} href="/studio/ai-lab" icon={Sparkles} caption={bi("내 API 키로, 내가 선택한 창작 도구", "Your API key. Your creative choices.")} bi={bi}>
      <div className="rd-mini-luna"><MiniArt name="luna" /></div>
      <div className="rd-mini-ai-copy"><strong>Luna</strong><span>{bi("창작 도우미", "Creative assistant")}</span><p>{bi("어떤 이야기를 함께 만들어 볼까요?", "What story shall we imagine together?")}</p><Link href="/studio/ai-lab">{bi("AI 도구 살펴보기", "Explore AI tools")}<ChevronRight size={14} aria-hidden="true" /></Link></div>
    </Workspace>
  );
}

function PublishChecklist({ bi }: { bi: Localize }) {
  const [checked, setChecked] = useState<string[]>([]);
  const checks = [
    { id: "format", ko: "규격 확인", en: "Check format" },
    { id: "rights", ko: "사용 권리 확인", en: "Check rights" },
    { id: "preview", ko: "모바일 미리보기", en: "Mobile preview" },
  ];
  return (
    <Workspace kind="publish" title={bi("발행 & 공유", "Publish & share")} href="/studio/publish" icon={PackageCheck} caption={bi("준비 목록 예시 · 실제 검수는 발행에서", "Example checklist · Review in Publish")} bi={bi}>
      <div className="rd-mini-publish-cover"><MiniArt name="project-romance" /><span>{bi("세상과 만날 시간", "Share your story")}</span></div>
      <fieldset className="rd-mini-publish-checks"><legend>{bi("발행 준비 예시", "Example preparation")}</legend>{checks.map((item) => <label key={item.id}><input type="checkbox" checked={checked.includes(item.id)} onChange={() => setChecked((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="rd-mini-checkbox" aria-hidden="true">{checked.includes(item.id) && <Check size={12} />}</span><span>{bi(item.ko, item.en)}</span></label>)}</fieldset>
    </Workspace>
  );
}

function CommunityGallery({ bi }: { bi: Localize }) {
  const [genre, setGenre] = useState<"all" | "characters">("all");
  const images = genre === "all" ? ["project-romance", "character-pink", "project-crimson", "character-blue"] : ["character-pink", "character-blue"];
  return (
    <Workspace kind="community" title={bi("커뮤니티", "Community")} href="/community" icon={Users} caption={bi("함께 만드는 더 큰 이야기", "Together, we create more")} bi={bi}>
      <div className="rd-mini-community-tabs" role="group" aria-label={bi("예시 갤러리 분류", "Example gallery categories")}><button type="button" aria-pressed={genre === "all"} onClick={() => setGenre("all")}>{bi("전체", "All")}</button><button type="button" aria-pressed={genre === "characters"} onClick={() => setGenre("characters")}>{bi("캐릭터", "Characters")}</button><span>{bi("예시 작품", "Example works")}</span></div>
      <div className="rd-mini-community-gallery" data-genre={genre}>{images.map((name) => <MiniArt key={name} name={name} />)}</div>
    </Workspace>
  );
}

/** 홈에서 탐색하는 예시 작업공간이며 사용자 프로젝트나 AI 실행 결과를 만들지 않는다. */
export function ReferenceCreatorDashboardModules() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboardModules");
  return (
    <section className="rd-mini-workspaces" aria-labelledby="rd-modules-title">
      <div className="rd-mini-section-heading"><h2 id="rd-modules-title">{bi("모든 이야기가 연결되는 곳", "One place for every part of your story")}</h2><Link href="/sitemap">{bi("전체 기능 보기", "Explore all tools")}<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      <div className="rd-mini-workspace-grid"><ProjectShelf bi={bi} /><CharacterSheet bi={bi} /><BackgroundGallery bi={bi} /><AssetGrid bi={bi} /><Storyboard bi={bi} /><AiDirector bi={bi} /><PublishChecklist bi={bi} /><CommunityGallery bi={bi} /></div>
    </section>
  );
}
