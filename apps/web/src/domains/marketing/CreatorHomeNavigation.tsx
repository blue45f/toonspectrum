import {
  translateBilingualValueForLocale,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { type ReactNode } from "react";

import { CREATOR_HOME_SECTIONS, focusCreatorSection, isPlainCreatorJump, type CreatorHomeSectionId } from "./creator-home-navigation";
import { useCreatorHomeSectionNavigation } from "./use-creator-home-section-navigation";
import "./creator-home-navigation.css";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("CreatorHomeNavigation", ko, en);

export function CreatorSectionLink({ sectionId, className, children }: {
  sectionId: CreatorHomeSectionId;
  className?: string;
  children: ReactNode;
}) {
  useBilingualI18nRevision();
  const href = `#${sectionId}`;
  return (
    <a href={href} className={className} onClick={(event) => {
      if (!isPlainCreatorJump(event) || window.location.hash !== href) return;
      // An identical fragment does not emit hashchange. Handle only that case;
      // leave all changed URLs and modifier clicks to the browser's history.
      if (focusCreatorSection(href, (id) => document.getElementById(id), true)) event.preventDefault();
    }}>
      {children}
    </a>
  );
}

export function CreatorHomeNavigation({ locale: _locale }: { locale: "ko" | "en" }) {
  useBilingualI18nRevision();
  useCreatorHomeSectionNavigation();

  const label = bi("툰스튜디오 소개 바로가기", "Explore the ToonStudio introduction");
  return (
    <nav className="ch-jump-nav" aria-label={label}>
      <span className="ch-jump-label">{bi("필요한 곳으로 바로 이동하세요.", "Jump to the part you need.")}</span>
      <div className="ch-jump-links">
        {CREATOR_HOME_SECTIONS.map((section) => (
          <CreatorSectionLink key={section.id} sectionId={section.id}>
            {bi((section).ko, (section).en)}<span aria-hidden="true">↘</span>
          </CreatorSectionLink>
        ))}
      </div>
    </nav>
  );
}
