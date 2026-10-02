import {
  ArrowRight,
  FolderHeart,
  Heart,
} from "lucide-react";

import { useState } from "react";
import "../components/market-library-experience.css";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketWishlistResource } from "../components/MarketWishlistResource";
import { useMarketWishlist } from "../hooks/use-market-wishlist";

import { Container } from "@/shared/components/section";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

export function MarketWishlistPage() {
  const bt = useBilingual("MarketWishlistPage");
  useDocumentTitle(bt("찜 목록 · 창작 마켓", "Wishlist · Creator Market"));
  useMetaDescription(
    bt(
      "내가 찜한 웹툰 창작 마켓 리소스들을 모아보고, 필요할 때 언제든 스튜디오에 적용하거나 소장하세요.",
      "Collect the webtoon creator market resources you saved, and apply or own them in Studio whenever you need them.",
    ),
  );

  const { wishlistIds, wishlistCount, removeFromWishlist, storageError } = useMarketWishlist();
  const [visibleCount, setVisibleCount] = useState(12);

  return (
    <Container size="wide" className="market-library-page py-7 sm:py-10">
      <MarketNavHeader />

      <img
        src="/images/section-market.webp"
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-6 h-32 w-full rounded-3xl object-cover sm:h-40"
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <FolderHeart className="size-5 text-warn" />
            <h1 className="text-xl font-bold text-fg sm:text-2xl">{bt("찜 목록", "Wishlist")}</h1>
            <span className="numeral tnum rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-bold text-fg">
              {bt(`${wishlistCount}개`, `${wishlistCount} items`)}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-3">
            {bt("이 브라우저에 저장한 찜 목록입니다. 소장·기기 설치와는 별개이며 소재 상세에서 현재 공개 상태와 사용권을 확인하세요.", "Saved in this browser, separately from ownership and device installation. Check the material detail for its current availability and license.")}
          </p>
        </div>

        <Link
          href="/market/browse"
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <span>{bt("더 둘러보기", "Browse more")}</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {storageError ? <p role="alert" className="mt-4 rounded-xl border border-bad/30 bg-panel p-3 text-sm text-fg">{storageError}</p> : null}
      {/* Grid */}
      {wishlistIds.length === 0 ? (
        <ActionableEmptyState
          art="generic"
          className="mt-10"
          icon={Heart}
          title={bt("찜한 에셋이 아직 없어요", "No saved assets yet")}
          description={bt("마켓 카탈로그를 둘러보시면서 마음에 드는 에셋 카드 좌측 상단의 하트 버튼을 눌러보세요.", "Browse the market catalog and tap the heart button at the top-left of any asset card you like.")}
          primary={{ href: "/market/browse", label: bt("에셋 탐색하러 가기", "Explore assets") }}
        />
      ) : (
        <section aria-label={bt("찜한 소재 목록", "Saved materials")}>
          <ul aria-label={bt("찜한 소재 목록", "Saved materials")} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {wishlistIds.slice(0, visibleCount).map((id, index) => (
              <li key={id} aria-label={bt(`찜한 소재 ${index + 1}`, `Saved material ${index + 1}`)} className="min-w-0" {...introItemProps(index)}>
                <MarketWishlistResource resourceId={id} onRemove={removeFromWishlist} />
              </li>
            ))}
          </ul>
          {wishlistCount > visibleCount ? <div className="mt-6 text-center">
            <button type="button" onClick={() => setVisibleCount((count) => count + 12)}
              className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>{bt("찜한 소재 더 보기", "Load more saved materials")}</button>
          </div> : null}
        </section>
      )}
    </Container>
  );
}
