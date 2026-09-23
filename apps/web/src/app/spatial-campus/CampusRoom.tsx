import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";
import type { CampusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { useCampus } from "@/shared/components/spatial-campus/campus-context";
import type { CampusObject } from "@/shared/lib/spatial-campus/campus-objects";

export function CampusRoom({ district, objects }: { readonly district: CampusDistrict; readonly objects: readonly CampusObject[] }) {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const campus = useCampus();
  const location = useLocation();
  const [imageFailed, setImageFailed] = useState(false);

  return <section className="campus-room" aria-label={district.label[locale]} data-campus-room={district.id}>
    <header><h2>{district.label[locale]}</h2><p>{district.description[locale]}</p></header>
    <div className="campus-room-art">
      {!imageFailed ? <img src={district.artworkUrl} alt="" width={640} height={640}
        onError={() => setImageFailed(true)} decoding="async" /> : <p role="status">
        {locale === "ko" ? "그림 없이도 아래 기능을 사용할 수 있어요." : "All actions remain available without the artwork."}
      </p>}
    </div>
    <nav className="campus-room-destinations" aria-label={locale === "ko" ? "이 공간의 기능" : "Actions in this place"}>
      {district.destinations.map((destination) => <Link key={destination.id} to={destination.href}
        aria-current={`${location.pathname}${location.search}` === destination.href ? "page" : undefined}>
        <span>{destination.label[locale]}</span><ArrowUpRight size={16} aria-hidden="true" />
      </Link>)}
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
