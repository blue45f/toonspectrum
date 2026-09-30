import { ArrowRight, Camera, CalendarDays, MapPin, Shield, Sparkles, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";
import { FanCafePanel } from "@/domains/community/components/fan-cafe-panel";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const SCOPE = "domains.creator-ecosystem.FandomCosplayPage";

const GUIDE_ART = ["fandom-art-consent", "fandom-art-safety", "fandom-art-credit"] as const;

export function FandomCosplayPage() {
  const bt = useBilingual(SCOPE);

  const guide = [
    {
      icon: Camera,
      art: GUIDE_ART[0],
      title: bt("촬영 동의 우선", "Consent first"),
      text: bt(
        "피사체·촬영자 동의와 공개 범위를 확인하고, 타인의 사진을 무단으로 재업로드하지 마세요.",
        "Confirm consent and publication scope with subjects and photographers — never re-upload someone else's photos without permission.",
      ),
    },
    {
      icon: Shield,
      art: GUIDE_ART[1],
      title: bt("개인정보 · 미성년자 보호", "Privacy · minor protection"),
      text: bt(
        "집·학교 등 정확한 위치와 개인 연락처 노출을 피하고 미성년자가 포함된 콘텐츠는 보호자·행사 규정을 우선합니다.",
        "Keep exact locations and personal contacts private; for content involving minors, guardian and event rules come first.",
      ),
    },
    {
      icon: UsersRound,
      art: GUIDE_ART[2],
      title: bt("크레딧과 권리 표시", "Credits & rights"),
      text: bt(
        "코스플레이어, 사진가, 의상·소품 제작자와 원작을 구분해 크레딧하고 상업적 이용은 별도 허락을 확인하세요.",
        "Credit cosplayers, photographers, costume and prop makers, and the original work separately — confirm permission for commercial use.",
      ),
    },
  ] as const;

  return (
    <CreatorEcosystemLayout
      title={bt("팬덤 · 코스프레 허브", "Fandom · cosplay hub")}
      intro={bt(
        "기존 팬아트 커뮤니티의 이미지 첨부·댓글·검색·신고 기능을 그대로 활용해 코스프레와 행사 정보를 작품 팬덤 안에서 연결합니다.",
        "Uses the existing fan-art community's image, comment, search, and report features to connect cosplay and event info inside each fandom.",
      )}
    >
      <section id="fandom-guide" aria-labelledby="fandom-guide-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-accent">FANDOM GUIDE</p>
            <h2 id="fandom-guide-title" className="mt-2 text-xl font-black">
              {bt("팬덤 문화를 지키는 세 가지 약속", "Three promises that keep fandom culture healthy")}
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-fg-2">
            {bt(
              "코스프레 피드에 올리기 전에 한 번만 읽어 주세요. 서로의 동의와 크레딧이 팬덤을 오래갑니다.",
              "Read once before posting to the cosplay feed — consent and credit keep fandom going.",
            )}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {guide.map(({ icon: Icon, art, title, text }) => (
            <article key={title} className="overflow-hidden rounded-2xl border border-line bg-panel">
              <div
                className={`fandom-guide-art ${art} relative flex h-28 items-center justify-center overflow-hidden`}
                aria-hidden="true"
              >
                <Icon size={44} strokeWidth={1.4} className="fandom-guide-art-icon" />
                <Sparkles size={18} className="fandom-guide-art-spark absolute right-4 top-4" aria-hidden="true" />
              </div>
              <div className="p-5">
                <h3 className="font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-fg-2">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="fandom-event-title"
        className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 sm:p-8"
      >
        <div className="fandom-event-backdrop" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-accent">
              <CalendarDays size={20} aria-hidden="true" />
              <p className="eyebrow">EVENT · MEETUP</p>
            </div>
            <h2 id="fandom-event-title" className="mt-3 text-2xl font-black tracking-tight">
              {bt("코스프레 행사, 같이 갈 동료를 찾아보세요", "Going to a cosplay event? Find company")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {bt(
                "행사명·날짜·장소를 태그로 남기면 같은 행사를 찾는 팬이 모입니다. 오프라인 만남 전에는 공개 장소에서 만나고, 일정은 지인에게 공유해 주세요.",
                "Tag the event name, date, and venue to gather fans heading to the same event. Meet in public places for offline meetups and share your plans with someone you trust.",
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/community"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:brightness-110"
              >
                <MapPin size={16} aria-hidden="true" />
                {bt("행사 글 모아보기", "Browse event posts")}
              </Link>
              <a
                href="#fandom-feed"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-5 text-sm font-bold hover:bg-raised"
              >
                {bt("피드로 이동", "Go to feed")} <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="fandom-event-art" aria-hidden="true">
            <Camera size={56} strokeWidth={1.2} />
          </div>
        </div>
      </section>

      <section id="fandom-feed" aria-labelledby="fandom-feed-title" className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-accent" aria-hidden="true" />
              <h2 id="fandom-feed-title" className="text-xl font-black">
                {bt("코스프레 피드", "Cosplay feed")}
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
              {bt(
                "처음부터 코스프레 유형으로 열립니다. 캐릭터명·작품명·의상 제작·사진가·행사명을 태그로 남기면 검색과 크레딧 관리가 쉬워집니다.",
                "Opens on the cosplay type by default. Tagging character, work, costume maker, photographer, and event names makes search and credits easy.",
              )}
            </p>
          </div>
          <Link
            to="/community"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised"
          >
            {bt("전체 팬 커뮤니티", "All fan communities")}
          </Link>
        </div>
      </section>

      <FanCafePanel
        scope="pencafe"
        targetId="creator-ecosystem-fandom"
        targetLabel={bt("코스프레 · 팬덤", "Cosplay · fandom")}
        initialKind="cosplay"
        emptyGuide={{
          icon: Camera,
          title: bt("아직 올라온 코스프레가 없어요", "No cosplay posts yet"),
          description: bt(
            "첫 코스프레 사진을 올려 팬덤을 깨워 보세요. 촬영 동의와 크레딧 표시만 잊지 마세요.",
            "Wake up the fandom with the first cosplay photo. Just remember consent and credits.",
          ),
          primary: {
            href: "/community",
            label: bt("팬 커뮤니티에서 글 쓰기", "Write in the fan community"),
          },
          secondary: {
            href: "#fandom-guide",
            label: bt("가이드 다시 보기", "Re-read the guide"),
          },
        }}
      />
    </CreatorEcosystemLayout>
  );
}
