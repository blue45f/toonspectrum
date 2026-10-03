import { ArrowRight, ArrowUpRight, Film, ImageIcon, Sparkles } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { PRODUCT_TOUR_ADDITIONS } from "./product-tour-additions";

/**
 * 영상 제작 이후 더해진 핵심 기능(가상 스튜디오·제작 관리 보드) — 제품 투어 페이지의 '새로 더해진 기능' 탭 본문.
 * 투어 영상에 없다는 사실과 이미지의 성격(캡처·개념 이미지)을 카드마다 밝힌다.
 */
export function ProductTourAdditions() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourAdditions");
  return (
    <div className="product-tour__after" data-product-tour-additions="">
      <p className="mk-body product-tour__note">{bi(
        "8분 투어에는 나오지 않는 기능입니다. 영상 대신 지금 바로 열어 보세요.",
        "These features are not in the 8-minute tour. Open them directly instead.",
      )}</p>
      <ul className="product-tour__after-grid mk-rail">
        {PRODUCT_TOUR_ADDITIONS.map((item) => {
          const copy = bi(item.ko, item.en);
          return (
            <li key={item.id} className="product-tour__after-card mk-card" data-addition={item.id}>
              <figure data-visual={item.visual}>
                <img src={item.image} alt="" width={item.imageWidth} height={item.imageHeight} loading="lazy" decoding="async" />
                <span className="product-tour__visual-badge product-tour__visual-badge--new"><Film size={13} aria-hidden="true" />{bi("영상에 없음", "Not in the tour")}</span>
                <span className="product-tour__visual-badge product-tour__visual-badge--end">
                  {item.visual === "capture" ? <ImageIcon size={13} aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
                  {item.visual === "capture" ? bi("실제 화면 캡처", "Real screen capture") : bi("개념 이미지", "Concept image")}
                </span>
              </figure>
              <div className="product-tour__after-copy">
                <h3>{copy.title}</h3>
                <p>{copy.body}</p>
                <div className="product-tour__after-actions">
                  <Link className="mk-button mk-button--primary" href={item.href}>{copy.action}<ArrowRight size={16} aria-hidden="true" /></Link>
                  <Link className="mk-link" href={item.secondary.href}>{bi(item.secondary.ko, item.secondary.en)}<ArrowUpRight size={15} aria-hidden="true" /></Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
