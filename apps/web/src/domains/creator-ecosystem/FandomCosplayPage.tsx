import { Camera, Shield, Sparkles, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";
import { FanCafePanel } from "@/domains/community/components/fan-cafe-panel";

const GUIDE = [
  {
    icon: Camera,
    title: "촬영 동의 우선",
    text: "피사체·촬영자 동의와 공개 범위를 확인하고, 타인의 사진을 무단으로 재업로드하지 마세요.",
  },
  {
    icon: Shield,
    title: "개인정보 · 미성년자 보호",
    text: "집·학교 등 정확한 위치와 개인 연락처 노출을 피하고 미성년자가 포함된 콘텐츠는 보호자·행사 규정을 우선합니다.",
  },
  {
    icon: UsersRound,
    title: "크레딧과 권리 표시",
    text: "코스플레이어, 사진가, 의상·소품 제작자와 원작을 구분해 크레딧하고 상업적 이용은 별도 허락을 확인하세요.",
  },
] as const;

export function FandomCosplayPage() {
  return (
    <CreatorEcosystemLayout
      title="팬덤 · 코스프레 허브"
      intro="기존 팬아트 커뮤니티의 이미지 첨부·댓글·검색·신고 기능을 그대로 활용해 코스프레와 행사 정보를 작품 팬덤 안에서 연결합니다."
    >
      <section className="grid gap-4 md:grid-cols-3">
        {GUIDE.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-line bg-panel p-5">
            <Icon size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-black">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">{text}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-accent" aria-hidden="true" />
              <h2 className="text-xl font-black">코스프레 피드</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
              처음부터 코스프레 유형으로 열립니다. 캐릭터명·작품명·의상 제작·사진가·행사명을 태그로 남기면 검색과 크레딧 관리가 쉬워집니다.
            </p>
          </div>
          <Link
            to="/community"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised"
          >
            전체 팬 커뮤니티
          </Link>
        </div>
      </section>

      <FanCafePanel
        scope="pencafe"
        targetId="creator-ecosystem-fandom"
        targetLabel="코스프레 · 팬덤"
        initialKind="cosplay"
      />
    </CreatorEcosystemLayout>
  );
}
