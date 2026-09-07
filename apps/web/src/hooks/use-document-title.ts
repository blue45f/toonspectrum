import { SITE_URL } from "@toonspectrum/core";
import { useEffect } from "react";

import { useT } from "@/shared/lib/i18n";

const LEGACY_PRODUCT_NAMES = ["툰스펙트럼", "ToonSpectrum"] as const;

/**
 * Page callers historically supplied a full title with the legacy product suffix.
 * Normalize that boundary in one place while those callers migrate to page-only titles.
 */
export function formatProductTitle(
  title: string | null | undefined,
  productName: string,
): string {
  const brand = productName.trim() || "툰스튜디오";
  const rawTitle = title?.trim() ?? "";
  if (!rawTitle || rawTitle === brand || LEGACY_PRODUCT_NAMES.some((name) => rawTitle === name)) {
    return brand;
  }

  const knownNames = [brand, ...LEGACY_PRODUCT_NAMES];
  let pageTitle = rawTitle;
  for (const name of knownNames) {
    const suffix = ` · ${name}`;
    if (pageTitle.endsWith(suffix)) {
      pageTitle = pageTitle.slice(0, -suffix.length).trim();
      break;
    }
  }

  return pageTitle ? `${pageTitle} · ${brand}` : brand;
}

// 라우트별 브라우저 탭 제목을 설정한다. 브랜드명은 현재 로케일의 app.name 한 곳에서 읽는다.
export function useDocumentTitle(title?: string | null) {
  const t = useT();
  const productName = t("app.name");

  useEffect(() => {
    const next = formatProductTitle(title, productName);
    if (document.title !== next) document.title = next;
  }, [productName, title]);
}

// 라우트별 구조화 데이터(JSON-LD)를 head에 별도 <script type="application/ld+json">로 주입한다.
// 구글은 JS 렌더링으로 클라이언트 주입 JSON-LD도 수집한다(랭킹 등 허브 페이지 대응).
// index.html의 WebSite/Organization 그래프는 건드리지 않고, 언마운트·데이터 변경 시 제거한다.
export function useJsonLd(data: object | null | undefined) {
  // 직렬화 문자열을 의존성으로 사용 — 폴링 갱신으로 객체 참조가 바뀌어도 내용이 같으면 재주입하지 않는다.
  // '<'는 유니코드 이스케이프(역슬래시 u003c)로 치환 — HTML 직렬화 시 script 태그 조기 종료·주입 방지(api/og.js와 동일).
  const json = data ? JSON.stringify(data).replace(/</g, "\\u003c") : null;
  useEffect(() => {
    if (!json) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = json;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [json]);
}

// 라우트별 <meta name="description">를 설정한다(검색 스니펫·JS 실행 크롤러 대응).
// 언마운트/변경 시 직전 값으로 복원해 다른 페이지에 잔류하지 않게 한다.
// 작품 상세의 크롤러용 메타는 서버(api/og.js)에서 별도 주입한다.
export function useMetaDescription(description?: string | null) {
  useEffect(() => {
    const el = document.querySelector('meta[name="description"]');
    const next = description?.trim();
    if (!el || !next) return;
    const prev = el.getAttribute("content");
    el.setAttribute("content", next.slice(0, 200));
    return () => {
      if (prev != null) el.setAttribute("content", prev);
    };
  }, [description]);
}

interface PageSocialMeta {
  readonly canonicalPath: string;
  readonly title: string;
  readonly description: string;
  readonly type?: "website" | "article";
  readonly image?: string;
  readonly imageAlt?: string;
}

type HeadAttributeSnapshot = Readonly<{
  element: Element;
  attribute: string;
  previous: string | null;
}>;

function setHeadAttribute(
  selector: string,
  attribute: string,
  value: string,
  snapshots: HeadAttributeSnapshot[]
): void {
  const element = document.head.querySelector(selector);
  if (!element) return;
  snapshots.push({ element, attribute, previous: element.getAttribute(attribute) });
  element.setAttribute(attribute, value);
}

/**
 * SPA route transitions must not leave the root page's canonical/Open Graph metadata behind.
 * This updates only the tags already owned by index.html and restores their previous values on
 * unmount, so nested routes cannot leak their social card into the next page.
 *
 * Crawlers that never execute JavaScript still need an edge/prerender response; this hook is the
 * browser-rendered half of that contract, not a substitute for server-side marketplace metadata.
 */
export function usePageSocialMeta({
  canonicalPath,
  title,
  description,
  type = "website",
  image = `${SITE_URL}/og-web.png`,
  imageAlt,
}: PageSocialMeta): void {
  const t = useT();
  const productName = t("app.name");

  useEffect(() => {
    const normalizedPath = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
    const canonicalUrl = `${SITE_URL}${normalizedPath}`;
    const safeTitle = formatProductTitle(title, productName).slice(0, 120);
    const safeDescription = description.trim().slice(0, 200);
    const safeImageAlt = (imageAlt?.trim() || safeTitle).slice(0, 160);
    if (!safeTitle || !safeDescription) return;

    const snapshots: HeadAttributeSnapshot[] = [];
    setHeadAttribute('link[rel="canonical"]', "href", canonicalUrl, snapshots);
    setHeadAttribute('meta[property="og:type"]', "content", type, snapshots);
    setHeadAttribute('meta[property="og:title"]', "content", safeTitle, snapshots);
    setHeadAttribute('meta[property="og:description"]', "content", safeDescription, snapshots);
    setHeadAttribute('meta[property="og:url"]', "content", canonicalUrl, snapshots);
    setHeadAttribute('meta[property="og:image"]', "content", image, snapshots);
    setHeadAttribute('meta[property="og:image:alt"]', "content", safeImageAlt, snapshots);
    setHeadAttribute('meta[name="twitter:title"]', "content", safeTitle, snapshots);
    setHeadAttribute('meta[name="twitter:description"]', "content", safeDescription, snapshots);
    setHeadAttribute('meta[name="twitter:image"]', "content", image, snapshots);

    return () => {
      for (const { element, attribute, previous } of snapshots) {
        if (previous === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, previous);
      }
    };
  }, [canonicalPath, description, image, imageAlt, productName, title, type]);
}
