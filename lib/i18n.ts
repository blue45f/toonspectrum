import { create } from "zustand";
import { persist } from "zustand/middleware";

// 다국어(KO/EN) 기반. zustand 전역 스토어 + localStorage 지속.
// 사전(DICT)에 키를 추가하고 컴포넌트에서 useT()의 t(key)로 사용한다.
// (전면 적용은 점진적 — 동시 디자인 리팩터 중인 컴포넌트는 정리 후 확장.)
export type Lang = "ko" | "en";

const DICT: Record<Lang, Record<string, string>> = {
  ko: {
    "lang.ko": "한국어",
    "lang.en": "English",
    "lang.switch": "언어",
    "common.retry": "다시 시도",
    "nav.home": "홈",
    "nav.ranking": "랭킹",
    "nav.calendar": "연재",
    "nav.recommend": "추천",
    "nav.explore": "탐색",
    "nav.reviews": "리뷰",
    "nav.community": "커뮤니티",
    "nav.insights": "인사이트",
    "nav.library": "내 서재",
    "nav.login": "로그인",
    "nav.search": "작품·작가·태그 검색",
    "nav.searchOpen": "작품·작가·태그 검색 열기",
    "nav.menu": "메뉴",
    "nav.allMenu": "전체 메뉴",
    "footer.browse": "탐색",
    "footer.community": "커뮤니티",
    "footer.tagline": "활자와 스펙트럼",
    "authors.eyebrow": "AUTHOR DIRECTORY",
    "authors.title": "작가별 보기",
    "authors.desc":
      "작품을 많이 낸 작가 순으로 모았습니다. 작가를 누르면 그 작가의 작품·평점·펜카페를 한곳에서 봅니다.",
    "authors.search": "작가 이름 검색",
    "authors.error": "작가 목록을 불러오지 못했습니다.",
    "authors.empty": "와 일치하는 작가가 없습니다.",
    "authors.allOf": "전체",
    "authors.topOf": "명 중 상위",
    "authors.people": "명",
    "authors.works": "작",
    "authors.views": "뷰",
  },
  en: {
    "lang.ko": "한국어",
    "lang.en": "English",
    "lang.switch": "Language",
    "common.retry": "Retry",
    "nav.home": "Home",
    "nav.ranking": "Ranking",
    "nav.calendar": "Schedule",
    "nav.recommend": "For You",
    "nav.explore": "Explore",
    "nav.reviews": "Reviews",
    "nav.community": "Community",
    "nav.insights": "Insights",
    "nav.library": "Library",
    "nav.login": "Sign in",
    "nav.search": "Search titles, authors, tags",
    "nav.searchOpen": "Open search (titles, authors, tags)",
    "nav.menu": "Menu",
    "nav.allMenu": "All menu",
    "footer.browse": "Browse",
    "footer.community": "Community",
    "footer.tagline": "Type & Spectrum",
    "authors.eyebrow": "AUTHOR DIRECTORY",
    "authors.title": "Authors",
    "authors.desc":
      "Authors ranked by number of works. Tap an author to see their titles, ratings, and fan cafe in one place.",
    "authors.search": "Search author name",
    "authors.error": "Couldn't load the author list.",
    "authors.empty": " — no matching author.",
    "authors.allOf": "of",
    "authors.topOf": "· top",
    "authors.people": "",
    "authors.works": " works",
    "authors.views": "views",
  },
};

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

function applyHtmlLang(lang: Lang) {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: "ko",
      setLang: (lang) => {
        applyHtmlLang(lang);
        set({ lang });
      },
    }),
    {
      name: "webdex-lang",
      onRehydrateStorage: () => (state) => {
        if (state) applyHtmlLang(state.lang);
      },
    }
  )
);

export function useT(): (key: string) => string {
  const lang = useI18n((s) => s.lang);
  return (key: string) => DICT[lang][key] ?? DICT.ko[key] ?? key;
}
