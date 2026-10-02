import { ArrowRight, Bot, Boxes, Brush, Check, Eraser, Eye, Layers3, Map as MapIcon, MessageSquare, Type, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { SiteSectionTabs, SiteTabPanel } from "@/domains/legal/public/site-section-tabs";
import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import "./about-feature-showcase.css";

const SCOPE = "domains.marketing.public.about-feature-showcase";
const ID_PREFIX = "about-feature";

export type AboutFeatureId = "drawing" | "three-d" | "collaboration" | "virtual-studio" | "ai";

export interface AboutFeatureCopy {
  readonly tab: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly [string, string, string];
  readonly cta: string;
  readonly secondaryCta: string;
}

export interface AboutFeature {
  readonly id: AboutFeatureId;
  readonly image: string;
  readonly href: string;
  readonly secondary: string;
  readonly ko: AboutFeatureCopy;
  readonly en: AboutFeatureCopy;
}

const FEATURE_ICONS: Readonly<Record<AboutFeatureId, LucideIcon>> = {
  drawing: Brush,
  "three-d": Boxes,
  collaboration: UsersRound,
  "virtual-studio": MapIcon,
  ai: Bot,
};

type Localize = ReturnType<typeof useBilingualLocalizer>;

/* 각 미리보기는 실제 작업공간을 단순화한 예시 그림이다(사용자 데이터·실행 결과가 아님). 장식 요소는 aria-hidden. */

const DRAWING_TOOLS: readonly (readonly [string, LucideIcon])[] = [["brush", Brush], ["eraser", Eraser], ["type", Type], ["balloon", MessageSquare]];

function DrawingPreview({ image, bi }: { readonly image: string; readonly bi: Localize }) {
  return (
    <div className="afs-stage afs-stage--drawing">
      <img src={image} alt="" width={640} height={638} decoding="async" className="afs-art" />
      <div className="afs-tools" aria-hidden="true">
        {DRAWING_TOOLS.map(([id, Icon]) => <span key={id} data-active={id === "brush" || undefined}><Icon size={14} /></span>)}
      </div>
      <svg className="afs-stroke" viewBox="0 0 320 200" aria-hidden="true" preserveAspectRatio="none">
        <path d="M34 160 C 82 70, 140 190, 196 92 S 276 70, 292 34" />
      </svg>
      <span className="afs-bubble" aria-hidden="true">{bi("…아직 끝나지 않았어.", "…It isn't over yet.")}</span>
      <div className="afs-layers" aria-hidden="true">
        <strong><Layers3 size={12} />{bi("레이어", "Layers")}</strong>
        {[bi("대사", "Dialogue"), bi("캐릭터", "Character"), bi("배경", "Background")].map((name, index) => (
          <span key={name} data-active={index === 0 || undefined}><i>{String(index + 1).padStart(2, "0")}</i>{name}<Eye size={11} /></span>
        ))}
      </div>
    </div>
  );
}

function ThreeDPreview({ image, bi }: { readonly image: string; readonly bi: Localize }) {
  const poses = [bi("기본", "Idle"), bi("걷기", "Walk"), bi("액션", "Action"), bi("감정", "Emote")];
  return (
    <div className="afs-stage afs-stage--three-d">
      <div className="afs-turntable" aria-hidden="true"><img src={image} alt="" width={640} height={637} decoding="async" className="afs-art" /></div>
      <svg className="afs-gizmo" viewBox="0 0 64 64" aria-hidden="true">
        <line x1="32" y1="32" x2="58" y2="40" data-axis="x" />
        <line x1="32" y1="32" x2="32" y2="6" data-axis="y" />
        <line x1="32" y1="32" x2="12" y2="48" data-axis="z" />
        <circle cx="32" cy="32" r="4" />
      </svg>
      <span className="afs-chip afs-chip--camera" aria-hidden="true">{bi("카메라 35mm · 로우 앵글", "Camera 35mm · low angle")}</span>
      <div className="afs-poses" aria-hidden="true">
        {poses.map((pose) => <span key={pose}>{pose}</span>)}
      </div>
    </div>
  );
}

function CollaborationPreview({ bi }: { readonly bi: Localize }) {
  const columns = [
    { title: bi("할 일", "To do"), cards: [{ name: bi("4화 콘티", "Ep.4 storyboard"), owner: "S", due: "D-5" }] },
    { title: bi("작업 중", "In progress"), cards: [{ name: bi("3화 선화", "Ep.3 line art"), owner: "M", due: "D-2", moving: true }, { name: bi("3화 배경", "Ep.3 backgrounds"), owner: "J", due: "D-3" }] },
    { title: bi("검토", "Review"), cards: [{ name: bi("2화 채색", "Ep.2 color"), owner: "H", due: bi("수정 1", "1 note") }] },
  ];
  return (
    <div className="afs-stage afs-stage--collaboration" aria-hidden="true">
      <div className="afs-board">
        {columns.map((column) => (
          <div key={column.title} className="afs-column">
            <strong>{column.title}<i>{column.cards.length}</i></strong>
            {column.cards.map((card) => (
              <span key={card.name} className="afs-card" data-moving={card.moving || undefined}>
                <b>{card.name}</b>
                <small><em>{card.owner}</em>{card.due}</small>
              </span>
            ))}
          </div>
        ))}
      </div>
      <span className="afs-chip afs-chip--toast"><Check size={12} />{bi("검토 요청을 보냈어요", "Review requested")}</span>
    </div>
  );
}

function VirtualStudioPreview({ image, bi }: { readonly image: string; readonly bi: Localize }) {
  return (
    <div className="afs-stage afs-stage--virtual-studio" aria-hidden="true">
      <img src={image} alt="" width={480} height={270} decoding="async" className="afs-art" />
      <span className="afs-chip afs-chip--hud"><MapIcon size={12} />{bi("스튜디오 로비 · 예시", "Studio lobby · sample")}</span>
      <span className="afs-avatar afs-avatar--me">{bi("나", "Me")}</span>
      <span className="afs-avatar afs-avatar--mate">M</span>
      <span className="afs-bubble afs-bubble--space">{bi("같이 콘티 볼까요?", "Review the storyboard?")}</span>
    </div>
  );
}

function AiPreview({ image, bi }: { readonly image: string; readonly bi: Localize }) {
  const suggestions = [bi("장면 구도 3안", "3 framing ideas"), bi("대사 다듬기", "Polish dialogue"), bi("배경 톤 제안", "Background mood")];
  return (
    <div className="afs-stage afs-stage--ai" aria-hidden="true">
      <img src={image} alt="" width={640} height={637} decoding="async" className="afs-art" />
      <div className="afs-chat">
        <span className="afs-chat-user">{bi("비 오는 날 첫 만남 장면", "A first meeting in the rain")}</span>
        <span className="afs-chat-typing"><i /><i /><i /></span>
        {suggestions.map((item) => <span key={item} className="afs-chat-suggestion"><Check size={11} />{item}</span>)}
        <small>{bi("적용은 내가 선택", "I choose what to apply")}</small>
      </div>
    </div>
  );
}

function FeaturePreview({ feature, bi }: { readonly feature: AboutFeature; readonly bi: Localize }) {
  switch (feature.id) {
    case "drawing": return <DrawingPreview image={feature.image} bi={bi} />;
    case "three-d": return <ThreeDPreview image={feature.image} bi={bi} />;
    case "collaboration": return <CollaborationPreview bi={bi} />;
    case "virtual-studio": return <VirtualStudioPreview image={feature.image} bi={bi} />;
    case "ai": return <AiPreview image={feature.image} bi={bi} />;
  }
}

/**
 * 핵심 기능을 한 번에 하나씩: 아이콘 탭 → 움직이는 예시 화면 → 할 수 있는 일 세 가지 → 실제 작업공간 열기.
 * 다섯 장의 세로 카드 대신 한 패널을 바꿔 보여 줘 모바일 길이를 줄인다. 루프 애니메이션은 감속 모드에서 멈춘다.
 */
export function AboutFeatureShowcase({ features, label }: { readonly features: readonly AboutFeature[]; readonly label: string }) {
  const bi = useBilingualLocalizer(SCOPE);
  const [value, setValue] = useState<AboutFeatureId>(features[0]?.id ?? "drawing");
  const index = Math.max(0, features.findIndex((feature) => feature.id === value));
  const active = features[index];
  if (!active) return null;
  const copy = bi(active.ko, active.en);
  return (
    <div className="afs" data-feature={active.id}>
      <SiteSectionTabs
        label={label}
        idPrefix={ID_PREFIX}
        value={active.id}
        onChange={setValue}
        tabs={features.map((feature) => ({ id: feature.id, label: bi(feature.ko.tab, feature.en.tab), icon: FEATURE_ICONS[feature.id] }))}
      />
      <SiteTabPanel idPrefix={ID_PREFIX} id={active.id} active className="mt-4 rounded-[1.75rem]">
        <article className="afs-panel" data-about-feature={active.id}>
          <figure className="afs-figure" key={active.id}>
            <FeaturePreview feature={active} bi={bi} />
            <figcaption className="afs-caption">{bi("예시 미리보기 · 실제 화면을 단순화했어요", "Sample preview · a simplified view of the real screen")}</figcaption>
          </figure>
          <div className="afs-copy">
            <p className="afs-count">{String(index + 1).padStart(2, "0")} / {String(features.length).padStart(2, "0")}</p>
            <h3>{copy.title}</h3>
            <p className="afs-body">{copy.body}</p>
            <ul className="afs-points">
              {copy.points.map((point) => <li key={point}><Check size={14} aria-hidden="true" />{point}</li>)}
            </ul>
            <div className="afs-actions">
              <Link href={active.href} className="afs-primary">{copy.cta}<ArrowRight size={16} aria-hidden="true" /></Link>
              <Link href={active.secondary} className="afs-secondary">{copy.secondaryCta}<ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </div>
        </article>
      </SiteTabPanel>
    </div>
  );
}
