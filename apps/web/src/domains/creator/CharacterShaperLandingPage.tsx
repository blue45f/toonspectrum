import { SITE_URL } from "@toonstudio/core/business";
import { Suspense } from "react";

import { CharacterShaperEditorLoading } from "./character-shaper/CharacterShaperEditorLoading";
import { CHARACTER_SHAPER_LANDING_PATH } from "./character-shaper/character-shaper-entry";
import { CharacterShaperLandingClosing } from "./character-shaper/landing/CharacterShaperLandingClosing";
import { CharacterShaperLandingFaq } from "./character-shaper/landing/CharacterShaperLandingFaq";
import { CharacterShaperLandingGuide } from "./character-shaper/landing/CharacterShaperLandingGuide";
import { CharacterShaperLandingHero } from "./character-shaper/landing/CharacterShaperLandingHero";
import { CharacterShaperLandingSteps } from "./character-shaper/landing/CharacterShaperLandingSteps";
import { useCharacterShaperEditorEntry } from "./character-shaper/landing/use-character-shaper-editor-entry";

import "./studio-3d-ui/studio-3d-illustrated-chrome.css";

import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

// 캐릭터 셰이퍼 공개 랜딩 + 사용 가이드(/studio/assets/characters/new). 편집기는 이 페이지에서
// `?editor=open`으로 바로 열린다(예전 /studio/character 별칭은 이 랜딩으로 이동하므로 다시 링크하면
// 제자리로 돌아온다). 이 페이지는 무엇을 할 수 있고 무엇이 모델에 따라 달라지는지를 짧고
// 정직하게 안내한다. 수치·후기·검증되지 않은 약속은 쓰지 않는다(PRODUCT.md "주장보다 증거").
//
// 구성(휴대폰 기준 5화면 이하): 첫 화면(제목·시작 버튼) → 세 단계 요약 → 탭 가이드(기능·사용법·학습·단축키)
// → 접이식 FAQ·지원 범위 → 마무리 행동. 문구는 landing/character-shaper-landing-copy.ts에 모았다.

const SHAPER_PATH = CHARACTER_SHAPER_LANDING_PATH;

// 3D 런타임은 무겁다. 안내 페이지를 먼저 보여 주고 편집기를 열 때만 내려받는다.
const CharacterShaperStandaloneEditor = lazyRetry(
  () => import("./character-shaper/CharacterShaperStandaloneEditor").then((module) => ({
    default: module.CharacterShaperStandaloneEditor,
  })),
  "CharacterShaperStandaloneEditor",
);

export function CharacterShaperLandingPage() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const editor = useCharacterShaperEditorEntry();

  const shaperTitle = bt("캐릭터 셰이퍼", "Character Shaper");
  const shaperDescription = bt(
    "프리셋으로 3D 웹툰 캐릭터를 만들고, 사진·웹캠으로 포즈를 잡고, 모델 위에 직접 그려 투명 PNG와 레이어 PSD로 컷에 넣는 브라우저 도구입니다. 설치 없이 스튜디오에서 바로 엽니다.",
    "Create 3D webtoon characters from presets, pose them with photos or a webcam, draw directly on the model, and drop them into your panels as transparent PNGs and layered PSDs — right in the studio, no installation.",
  );
  const socialTitle = bt("캐릭터 셰이퍼 · 툰스튜디오", "Character Shaper · ToonStudio");

  useDocumentTitle(shaperTitle);
  useMetaDescription(shaperDescription);
  usePageSocialMeta({
    canonicalPath: SHAPER_PATH,
    title: socialTitle,
    description: shaperDescription,
  });
  useJsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: socialTitle,
    url: `${SITE_URL}${SHAPER_PATH}`,
    description: shaperDescription,
    inLanguage: localize("ko", "en"),
    isPartOf: { "@type": "WebSite", name: bt("툰스튜디오", "ToonStudio"), url: SITE_URL },
    mainEntity: {
      "@type": "SoftwareApplication",
      name: shaperTitle,
      applicationCategory: "DesignApplication",
      operatingSystem: "Web",
      browserRequirements: bt("WebGL을 지원하는 최신 브라우저", "A modern browser with WebGL support"),
      url: `${SITE_URL}${SHAPER_PATH}`,
    },
  });

  return (
    <div className="studio-character-guide">
      <CharacterShaperLandingHero editor={editor} />
      <CharacterShaperLandingSteps />
      <CharacterShaperLandingGuide />
      <CharacterShaperLandingFaq />
      <CharacterShaperLandingClosing editor={editor} />

      {editor.editorOpen ? (
        <Suspense fallback={<CharacterShaperEditorLoading />}>
          <CharacterShaperStandaloneEditor onClose={editor.close} />
        </Suspense>
      ) : null}
    </div>
  );
}
