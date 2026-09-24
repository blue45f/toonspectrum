import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Brush,
  Building2,
  CalendarDays,
  Clapperboard,
  Compass,
  FilePlus2,
  FlaskConical,
  GraduationCap,
  Heart,
  Images,
  Layers3,
  Library,
  MessageCircle,
  MoonStar,
  Palette,
  Play,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Upload,
  UserRound,
  UsersRound,
  WandSparkles,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";
import type { CampusDistrict, CampusDistrictId } from "@/shared/lib/spatial-campus/campus-model";
import { useCampus } from "@/shared/components/spatial-campus/campus-context";
import type { CampusObject } from "@/shared/lib/spatial-campus/campus-objects";

interface DistrictVisual {
  readonly icon: LucideIcon;
  readonly kicker: { readonly ko: string; readonly en: string };
  readonly signals: { readonly ko: readonly string[]; readonly en: readonly string[] };
}

const DISTRICT_VISUALS: Readonly<Record<CampusDistrictId, DistrictVisual>> = {
  plaza: { icon: Sparkles, kicker: { ko: "CREATOR WORLD", en: "CREATOR WORLD" }, signals: { ko: ["만들기", "발견하기", "연결하기"], en: ["Create", "Discover", "Connect"] } },
  atelier: { icon: Brush, kicker: { ko: "MY CREATIVE LAB", en: "MY CREATIVE LAB" }, signals: { ko: ["원고", "캐릭터", "에셋"], en: ["Canvas", "Character", "Assets"] } },
  production: { icon: Clapperboard, kicker: { ko: "PRODUCTION STAGE", en: "PRODUCTION STAGE" }, signals: { ko: ["기획", "협업", "검수"], en: ["Plan", "Collaborate", "Review"] } },
  market: { icon: Store, kicker: { ko: "ASSET DISTRICT", en: "ASSET DISTRICT" }, signals: { ko: ["탐색", "체험", "라이선스"], en: ["Browse", "Try", "License"] } },
  library: { icon: BookOpen, kicker: { ko: "STORY ARCHIVE", en: "STORY ARCHIVE" }, signals: { ko: ["작품", "작가", "트렌드"], en: ["Stories", "Creators", "Trends"] } },
  gallery: { icon: Images, kicker: { ko: "SHOWCASE LOUNGE", en: "SHOWCASE LOUNGE" }, signals: { ko: ["전시", "대화", "챌린지"], en: ["Showcase", "Talk", "Challenge"] } },
  academy: { icon: GraduationCap, kicker: { ko: "CREATOR ACADEMY", en: "CREATOR ACADEMY" }, signals: { ko: ["배우기", "실험", "도구"], en: ["Learn", "Experiment", "Tools"] } },
  observatory: { icon: MoonStar, kicker: { ko: "PRIVATE OBSERVATORY", en: "PRIVATE OBSERVATORY" }, signals: { ko: ["상징", "팔레트", "휴식"], en: ["Symbols", "Palette", "Rest"] } },
  service: { icon: Settings2, kicker: { ko: "SERVICE DESK", en: "SERVICE DESK" }, signals: { ko: ["도움말", "설정", "계정"], en: ["Help", "Settings", "Account"] } },
};

const DESTINATION_ICONS: Readonly<Record<string, LucideIcon>> = {
  explore: Compass, events: CalendarDays, opportunities: WandSparkles,
  works: Library, new: FilePlus2, assets: Layers3, import: Upload,
  team: UsersRound, production: Workflow, collaborate: MessageCircle, organizations: Building2,
  browse: Search, fit: FlaskConical, compare: SlidersHorizontal, library: Library,
  wishlist: Heart, publish: Send, manage: ShieldCheck,
  search: Search, ranking: Sparkles, research: BookOpen, calendar: CalendarDays, insights: WandSparkles,
  showcase: Images, community: MessageCircle, challenges: Sparkles, creators: UserRound,
  learn: GraduationCap, recipes: FlaskConical, manual: BookOpen, ai: WandSparkles,
  trace: Brush, tools: Wrench,
  tarot: Sparkles, saju: BookOpen, lucky: Palette, rest: MoonStar, play: Play,
  help: BookOpen, settings: Settings2, account: UserRound, terms: ShieldCheck,
};

export function CampusRoom({ district, objects }: { readonly district: CampusDistrict; readonly objects: readonly CampusObject[] }) {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const campus = useCampus();
  const location = useLocation();
  const [imageFailed, setImageFailed] = useState(false);
  const visual = DISTRICT_VISUALS[district.id];
  const DistrictIcon = visual.icon;

  return <section className="campus-room" aria-label={district.label[locale]} data-campus-room={district.id}>
    <div className="campus-room-media campus-room-art">
      {!imageFailed ? <img src={district.artworkUrl} alt="" width={640} height={640}
        onError={() => setImageFailed(true)} decoding="async" /> : <div className="campus-room-art-fallback" role="status">
        {locale === "ko" ? "그림 없이도 아래 기능을 사용할 수 있어요." : "All actions remain available without the artwork."}
      </div>}
      <div className="campus-room-aurora" aria-hidden="true" />
      <div className="campus-room-emblem" aria-hidden="true"><DistrictIcon size={24} strokeWidth={1.8} /></div>
      <header className="campus-room-heading">
        <p className="campus-room-kicker">{visual.kicker[locale]}</p>
        <h2>{district.label[locale]}</h2>
        <p>{district.description[locale]}</p>
      </header>
      <div className="campus-room-signals" aria-hidden="true">
        {visual.signals[locale].map((signal) => <span key={signal}>{signal}</span>)}
      </div>
    </div>
    <nav className="campus-room-destinations" aria-label={locale === "ko" ? "이 공간의 기능" : "Actions in this place"}>
      {district.destinations.map((destination) => {
        const DestinationIcon = DESTINATION_ICONS[destination.id] ?? ArrowUpRight;
        return <Link key={destination.id} to={destination.href}
          data-campus-destination={destination.id}
          aria-current={`${location.pathname}${location.search}` === destination.href ? "page" : undefined}>
          <span className="campus-destination-icon" aria-hidden="true"><DestinationIcon size={17} strokeWidth={1.9} /></span>
          <span className="campus-destination-copy"><strong>{destination.label[locale]}</strong><small aria-hidden="true">{locale === "ko" ? "바로 열기" : "Open destination"}</small></span>
          <ArrowUpRight size={15} aria-hidden="true" className="campus-destination-arrow" />
        </Link>;
      })}
    </nav>
    {objects.length > 0 && <nav className="campus-public-objects" aria-label={locale === "ko" ? "이 공간에서 바로 열 수 있는 항목" : "Items available in this place"}>
      {objects.slice(0, 6).map((object) => <Link key={`${object.kind ?? "item"}:${object.id}:${object.href}`} to={object.href}
        aria-label={locale === "ko"
          ? `${object.title} · 공간에서 보기${object.exposure === "private" ? " · 내 화면에서만" : ""}`
          : `${object.title} · Open in this place${object.exposure === "private" ? " · Only in your view" : ""}`}
        data-campus-object-exposure={object.exposure ?? "public"}>
        {object.thumbnail ? <img src={object.thumbnail} alt="" loading="lazy" width={48} height={48} /> : null}
        <span>{object.title}{object.exposure === "private" ? <small>{locale === "ko" ? "내 화면에서만" : "Only in your view"}</small> : null}</span><ArrowUpRight size={16} aria-hidden="true" />
      </Link>)}
    </nav>}
    {district.id === "observatory" && <p className="campus-private-note">{locale === "ko"
      ? "입력과 해석은 나만의 세션입니다. 이 공간은 위치·질문·결과를 다른 사람에게 전송하지 않아요."
      : "Inputs and readings stay in your session. This scene does not broadcast your location, questions or results."}</p>}
    {campus?.binding.private && district.id !== "observatory" && <p className="campus-private-note">
      {locale === "ko"
        ? "이 공간에는 비공개 작품·팀 정보가 보일 수 있습니다. 화면 공유나 공개 스트리밍 전에 표시 내용을 확인하세요."
        : "This place can contain private work or team information. Check what is visible before screen sharing or streaming."}
    </p>}
  </section>;
}
