import { Sparkles } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { resolveProductLocale } from "@/shared/lib/product-identity";
import { useI18n } from "@/shared/lib/i18n";

import { ECOSYSTEM_MODULES } from "./creator-ecosystem-atlas-data";

const COPY = {
  ko: {
    eyebrow: "생태계",
    title: "작품을 찾는 곳과\n만드는 곳이 이어집니다.",
    body: "발견에서 제작, 검수와 공유까지. 각 목적지를 한 화면 안에서 오갈 수 있게 연결했습니다.",
    disclosure: "AI로 제작한 브랜드 콘셉트 아트",
  },
  en: {
    eyebrow: "Ecosystem",
    title: "Where you find a work\nis where you make it.",
    body: "From discovery to creation, review and sharing, every destination stays one hop away.",
    disclosure: "AI-generated brand concept art",
  },
} as const;

export function CreatorEcosystemAtlas() {
  const language = useI18n((state) => state.lang);
  const locale = resolveProductLocale(language);
  const copy = COPY[locale];
  const isKo = locale === "ko";

  return (
    <section className="cf-atlas" aria-labelledby="cf-atlas-title">
      <div className="cf-shell">
        <div className="cf-atlas-heading">
          <div>
            <p className="cf-kicker">
              <span className="cf-signal" aria-hidden="true" />
              {copy.eyebrow}
            </p>
            <h2 id="cf-atlas-title" tabIndex={-1}>
              {copy.title}
            </h2>
          </div>
          <p className="cf-atlas-body">{copy.body}</p>
        </div>

        <ul className="cf-atlas-grid">
          {ECOSYSTEM_MODULES.map(({ icon: Icon, href, image, position, span, titleKo, titleEn, label, bodyKo, bodyEn }, index) => (
            <li key={href} className={`cf-atlas-cell cf-atlas-cell--${span}`}>
              <Link href={href} className="cf-atlas-card">
                {/* 모듈 이름과 설명이 이미 텍스트로 제공되므로 아트는 장식 이미지로 처리한다. */}
                <span className="cf-atlas-art" aria-hidden="true">
                  <img src={image} alt="" width={1536} height={1024} loading="lazy" decoding="async" style={{ objectPosition: position }} />
                </span>
                <span className="cf-atlas-text">
                  <span className="cf-atlas-top">
                    <span className="cf-atlas-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="cf-atlas-icon">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                  </span>
                  <span className="cf-atlas-name">{isKo ? titleKo : titleEn}</span>
                  <span className="cf-atlas-label">{label}</span>
                  <span className="cf-atlas-blurb">{isKo ? bodyKo : bodyEn}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="cf-atlas-disclosure">
          <Sparkles size={13} aria-hidden="true" />
          {copy.disclosure}
        </p>
      </div>
    </section>
  );
}
