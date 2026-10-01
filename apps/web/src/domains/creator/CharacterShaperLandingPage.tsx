import { SITE_URL } from "@toonstudio/core/business";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Camera,
  ChevronDown,
  Layers,
  ScanFace,
  ShieldCheck,
  X,
} from "lucide-react";
import { Suspense, useMemo } from "react";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  AiAssistArt,
  OutputLayersArt,
  PresetSlotsArt,
  SurfacePaintArt,
} from "./CharacterShaperLandingArt";
import { CharacterShaperLearnCenter } from "./CharacterShaperLearnCenter";
import { CharacterShaperEditorLoading } from "./character-shaper/CharacterShaperEditorLoading";
import {
  CHARACTER_SHAPER_EDITOR_HISTORY_MARK,
  CHARACTER_SHAPER_LANDING_PATH,
  characterShaperEditorSearch,
  hasCharacterShaperEditorHistoryMark,
  isCharacterShaperEditorRequested,
  probeCharacterShaperWebGl,
} from "./character-shaper/character-shaper-entry";

import { Studio3dIllustration } from "./studio-3d-ui/Studio3dIllustration";
import "./studio-3d-ui/studio-3d-illustrated-chrome.css";

import type { ComponentType } from "react";


import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";
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

const SHAPER_PATH = CHARACTER_SHAPER_LANDING_PATH;

// 3D 런타임은 무겁다. 안내 페이지를 먼저 보여 주고 편집기를 열 때만 내려받는다.
const CharacterShaperStandaloneEditor = lazyRetry(
  () => import("./character-shaper/CharacterShaperStandaloneEditor").then((module) => ({
    default: module.CharacterShaperStandaloneEditor,
  })),
  "CharacterShaperStandaloneEditor",
);

const SLOT_LABELS = {
  ko: [
    "얼굴형",
    "눈",
    "눈동자",
    "코",
    "입",
    "귀",
    "헤어",
    "체형",
    "상의",
    "하의",
    "신발",
    "액세서리",
    "표정",
    "포즈",
    "손 포즈",
  ],
  en: [
    "Face shape",
    "Eyes",
    "Iris",
    "Nose",
    "Mouth",
    "Ears",
    "Hair",
    "Body",
    "Top",
    "Bottom",
    "Shoes",
    "Accessories",
    "Expression",
    "Pose",
    "Hand pose",
  ],
} as const;

const PSD_LAYERS = {
  ko: [
    "피부",
    "얼굴",
    "눈",
    "헤어",
    "상의",
    "하의",
    "신발",
    "액세서리",
    "음영",
    "하이라이트",
    "주선",
  ],
  en: [
    "Skin",
    "Face",
    "Eyes",
    "Hair",
    "Top",
    "Bottom",
    "Shoes",
    "Accessories",
    "Shading",
    "Highlights",
    "Line art",
  ],
} as const;

interface FeatureCopy {
  readonly title: string;
  readonly body: string;
  readonly chips: readonly string[];
}

interface FeatureBlock {
  readonly id: string;
  readonly numeral: string;
  readonly art: ComponentType<{ className?: string }>;
  readonly copy: { readonly ko: FeatureCopy; readonly en: FeatureCopy };
}

const FEATURES: readonly FeatureBlock[] = [
  {
    id: "presets",
    numeral: "01",
    art: PresetSlotsArt,
    copy: {
      ko: {
        title: "15개 슬롯 프리셋",
        body: "얼굴형부터 손 포즈까지 15개 슬롯을 카드로 고릅니다. 카드를 누르면 바로 적용되고 되돌리기 한 단계로 취소됩니다. 슬롯 하나를 바꿔도 다른 슬롯은 그대로입니다.",
        chips: SLOT_LABELS.ko,
      },
      en: {
        title: "15-slot presets",
        body: "Pick from 15 slots, from face shape to hand pose, as cards. Tapping a card applies it instantly and a single undo step reverts it. Changing one slot leaves the others untouched.",
        chips: SLOT_LABELS.en,
      },
    },
  },
  {
    id: "paint",
    numeral: "02",
    art: SurfacePaintArt,
    copy: {
      ko: {
        title: "모델 위에 직접 드로잉",
        body: "표면 드로잉을 켜면 브러시·지우개·스포이드·채우기로 모델의 UV 표면에 직접 칠합니다. 포즈나 카메라를 바꿔도 그린 선은 모델을 따라갑니다.",
        chips: ["브러시", "지우개", "스포이드", "채우기", "포즈를 바꿔도 유지"],
      },
      en: {
        title: "Draw directly on the model",
        body: "Turn on surface drawing and paint the model's UV surface with brush, eraser, eyedropper, and fill. Your strokes follow the model even when the pose or camera changes.",
        chips: ["Brush", "Eraser", "Eyedropper", "Fill", "Survives pose changes"],
      },
    },
  },
  {
    id: "ai",
    numeral: "03",
    art: AiAssistArt,
    copy: {
      ko: {
        title: "AI 보조",
        body: "참고 이미지를 놓으면 프리셋 조합과 팔레트를 추천하고, 사진이나 웹캠에서 포즈를 읽어 모델에 옮깁니다. 모두 기기 안에서 처리하며 이미지를 업로드하지 않습니다.",
        chips: ["참고 이미지 → 프리셋·팔레트", "사진 → 포즈", "웹캠 → 포즈", "기기 내 처리"],
      },
      en: {
        title: "AI assistance",
        body: "Drop in a reference image for preset and palette recommendations, or read poses from a photo or webcam and transfer them to the model. Everything runs on-device — no image uploads.",
        chips: ["Reference image → presets & palette", "Photo → pose", "Webcam → pose", "On-device"],
      },
    },
  },
  {
    id: "output",
    numeral: "04",
    art: OutputLayersArt,
    copy: {
      ko: {
        title: "제작 편의",
        body: "투명 배경을 켜고 '캔버스에 추가'를 누르면 현재 컷에 PNG로 바로 들어갑니다. PSD는 밑색·음영·하이라이트·주선이 의미 단위 레이어로 나뉘어 나옵니다.",
        chips: PSD_LAYERS.ko,
      },
      en: {
        title: "Production-friendly output",
        body: "Enable the transparent background and hit 'Add to canvas' to drop the current cut in as a PNG. PSDs come with base colors, shading, highlights, and line art on semantic layers.",
        chips: PSD_LAYERS.en,
      },
    },
  },
];

interface HowToCopy {
  readonly title: string;
  readonly body: string;
  readonly tip: string;
}

const HOW_TO_STEPS: { readonly ko: readonly HowToCopy[]; readonly en: readonly HowToCopy[] } = {
  ko: [
    {
      title: "모델 고르기",
      body: "내장 라이브러리의 VRM을 고르거나 내 VRM 파일을 올립니다. 모델이 뷰포트에 뜨면 준비는 끝입니다.",
      tip: "VRM 0.x와 1.0을 모두 읽습니다. 처음이라면 내장 샘플로 시작하세요.",
    },
    {
      title: "카테고리와 카드 고르기",
      body: "오른쪽에서 얼굴·헤어·의상·체형·포즈·소품 중 하나와 세부 부위를 고른 뒤 카드를 눌러 적용합니다. 뷰포트 아래 표정·포즈 스트립으로 연기를 바로 바꾸고, 요약 바에서 무엇이 바뀌었는지 확인합니다.",
      tip: "숫자 키로 세부 부위를 바로 옮기고, 마음에 안 들면 ⌘Z로 한 단계씩 되돌립니다.",
    },
    {
      title: "참고 이미지·사진·웹캠",
      body: "참고 이미지를 놓으면 프리셋 조합과 팔레트를 추천받아 한 번에 적용합니다. 사진이나 웹캠에서 포즈를 읽어 모델에 옮기고, 남길 신체 부위를 고릅니다.",
      tip: "웹캠은 권한에 동의한 뒤에만 켜집니다. 원하는 포즈가 잡히면 고정해 두세요.",
    },
    {
      title: "표면 드로잉",
      body: "B 키나 도크의 표면 드로잉을 켜고 브러시로 모델 위에 직접 그립니다. 스포이드로 모델 색을 집어 쓰고 지우개로 정리합니다.",
      tip: "포즈를 먼저 잡고 그리면 확인이 편합니다. 그린 선은 포즈를 바꿔도 따라갑니다.",
    },
    {
      title: "투명 PNG·PSD 출력",
      body: "투명 배경을 켜고 '캔버스에 추가'로 현재 컷에 바로 넣거나 PNG·PSD로 내려받습니다. PSD는 피부·얼굴·눈·헤어·의상·음영·하이라이트·주선 레이어로 나뉩니다.",
      tip: "카메라 프리셋(정면·사선·상반신)을 컷 구도에 맞춘 뒤 출력하면 다시 자를 일이 줄어듭니다.",
    },
  ],
  en: [
    {
      title: "Pick a model",
      body: "Choose a VRM from the built-in library or upload your own VRM file. Once the model appears in the viewport, you're ready.",
      tip: "Reads both VRM 0.x and 1.0. Start with a built-in sample if this is your first time.",
    },
    {
      title: "Pick a category and cards",
      body: "On the right, choose face, hair, outfit, body, pose, or props and a detail part, then tap a card to apply it. Change expressions and poses instantly from the strip under the viewport, and check the summary bar to see what changed.",
      tip: "Jump between detail parts with the number keys, and undo one step at a time with ⌘Z if you don't like something.",
    },
    {
      title: "Reference image, photo, webcam",
      body: "Drop in a reference image to get preset and palette recommendations and apply them at once. Read poses from a photo or webcam, transfer them to the model, and choose which body parts to keep.",
      tip: "The webcam only turns on after you grant permission. Lock the pose once you've caught the one you want.",
    },
    {
      title: "Surface drawing",
      body: "Turn on surface drawing with the B key or the dock, then draw directly on the model with the brush. Pick colors from the model with the eyedropper and tidy up with the eraser.",
      tip: "Pose first, then draw — it's easier to check. Your strokes follow the model through pose changes.",
    },
    {
      title: "Transparent PNG & PSD export",
      body: "Enable the transparent background and drop the result into the current cut with 'Add to canvas', or download PNG and PSD. The PSD separates skin, face, eyes, hair, clothes, shading, highlights, and line art into layers.",
      tip: "Match a camera preset (front, three-quarter, bust) to your panel composition before exporting to skip re-cropping.",
    },
  ],
};

interface ShortcutCopy {
  readonly keys: readonly string[];
  readonly action: string;
  readonly note: string;
}

const SHORTCUTS: { readonly ko: readonly ShortcutCopy[]; readonly en: readonly ShortcutCopy[] } = {
  ko: [
    { keys: ["1", "0"], action: "슬롯 이동", note: "세부 부위 탭에 포커스가 있을 때 보이는 순서대로 이동합니다. 태블릿 슬롯 레일에서는 앞에서부터 열 번째 슬롯까지" },
    { keys: ["⌘Z"], action: "되돌리기", note: "대화상자 안에서만 동작하고 페이지 실행 취소와 섞이지 않습니다" },
    { keys: ["⇧⌘Z"], action: "다시 실행", note: "" },
    { keys: ["T"], action: "턴테이블", note: "모델을 천천히 돌려 확인합니다. 모션 감소 설정에서는 자동으로 돌지 않습니다" },
    { keys: ["B"], action: "표면 드로잉", note: "켜기·끄기" },
    { keys: ["Esc"], action: "닫기", note: "서랍 → 시트 → 대화상자 순서로 하나씩 닫힙니다" },
  ],
  en: [
    { keys: ["1", "0"], action: "Move between slots", note: "With focus on the detail-part tabs, in the order shown. On the tablet slot rail, from the first to the tenth slot" },
    { keys: ["⌘Z"], action: "Undo", note: "Works inside the dialog only; never mixed with page-level undo" },
    { keys: ["⇧⌘Z"], action: "Redo", note: "" },
    { keys: ["T"], action: "Turntable", note: "Slowly rotates the model for inspection. Disabled automatically with reduced-motion settings" },
    { keys: ["B"], action: "Surface drawing", note: "Toggle on/off" },
    { keys: ["Esc"], action: "Close", note: "Closes one layer at a time: drawer → sheet → dialog" },
  ],
};

interface CapabilityCopy {
  readonly title: string;
  readonly body: string;
}

interface CapabilityNote {
  readonly icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  readonly copy: { readonly ko: CapabilityCopy; readonly en: CapabilityCopy };
}

const CAPABILITY_NOTES: readonly CapabilityNote[] = [
  {
    icon: Box,
    copy: {
      ko: {
        title: "VRM 0.x · 1.0 모델",
        body: "내장 라이브러리에서 고르거나 내 VRM 파일을 올릴 수 있습니다. 두 규격의 모델을 읽습니다.",
      },
      en: {
        title: "VRM 0.x & 1.0 models",
        body: "Choose from the built-in library or upload your own VRM file. Both spec versions are supported.",
      },
    },
  },
  {
    icon: ScanFace,
    copy: {
      ko: {
        title: "얼굴 프리셋은 모델에 따라",
        body: "눈·코·입·귀 프리셋은 모델에 해당 shape key 또는 적응형 얼굴 메시가 있을 때 적용됩니다. 없으면 카드에 이유를 표시하고 몰래 다른 값으로 바꾸지 않습니다.",
      },
      en: {
        title: "Face presets depend on the model",
        body: "Eye, nose, mouth, and ear presets apply only when the model has the matching shape keys or an adaptive face mesh. Otherwise the card shows why — we never silently substitute another value.",
      },
    },
  },
  {
    icon: ShieldCheck,
    copy: {
      ko: {
        title: "AI 추천은 기기 안에서",
        body: "참고 이미지 추천은 MediaPipe 이미지 임베더를 브라우저에서 실행합니다. 이미지를 서버로 업로드하지 않습니다.",
      },
      en: {
        title: "AI recommendations stay on-device",
        body: "Reference-image recommendations run the MediaPipe image embedder in your browser. Images are never uploaded to a server.",
      },
    },
  },
  {
    icon: Camera,
    copy: {
      ko: {
        title: "웹캠은 동의한 뒤에만",
        body: "웹캠 포즈 인식은 브라우저 권한에 동의한 뒤에만 켜지며 언제든 끌 수 있습니다.",
      },
      en: {
        title: "Webcam only with consent",
        body: "Webcam pose capture turns on only after you grant browser permission, and you can turn it off any time.",
      },
    },
  },
  {
    icon: Layers,
    copy: {
      ko: {
        title: "PSD 표면 드로잉 레이어",
        body: "표면 드로잉 레이어는 드로잉 텍스처를 따로 뽑을 수 있을 때만 PSD에 들어갑니다. 빠지면 내보내기 결과에 이유가 함께 표시됩니다.",
      },
      en: {
        title: "PSD surface-drawing layers",
        body: "Surface-drawing layers are included in the PSD only when the drawing texture can be extracted separately. If not, the export result says why.",
      },
    },
  },
  {
    icon: Box,
    copy: {
      ko: {
        title: "저장은 이 기기에",
        body: "작업은 스튜디오 문서와 함께 SQLite/OPFS 로컬 저장소에 저장됩니다. 클라우드 백업을 뜻하지는 않습니다.",
      },
      en: {
        title: "Saved on this device",
        body: "Your work is stored with the studio document in local SQLite/OPFS storage. This is not cloud backup.",
      },
    },
  },
];

interface FaqCopy {
  readonly question: string;
  readonly answer: string;
}

const FAQ: { readonly ko: readonly FaqCopy[]; readonly en: readonly FaqCopy[] } = {
  ko: [
    {
      question: "설치가 필요한가요?",
      answer:
        "아니요. 스튜디오는 브라우저에서 동작합니다. 최초 한 번 온라인으로 로드한 뒤에는 캐시된 앱 자산으로 제한적인 오프라인 사용이 가능하지만, 네트워크가 필요한 기능은 온라인에서만 동작합니다.",
    },
    {
      question: "내 VRM 모델을 쓸 수 있나요?",
      answer:
        "네. VRM 0.x와 1.0 파일을 올릴 수 있습니다. 눈·코·입·귀 같은 얼굴 프리셋은 모델에 shape key나 적응형 얼굴 메시가 있어야 적용되고, 없으면 카드에 이유가 표시됩니다.",
    },
    {
      question: "참고 이미지와 웹캠 영상은 어디로 가나요?",
      answer:
        "기기 밖으로 나가지 않습니다. AI 추천은 MediaPipe 이미지 임베더를 브라우저에서 실행하고, 사진·웹캠 포즈 인식도 기기 안에서 처리합니다. 웹캠은 권한에 동의한 뒤에만 켜집니다.",
    },
    {
      question: "결과물은 어떤 형식으로 나오나요?",
      answer:
        "투명 배경 PNG로 현재 컷에 바로 넣거나 내려받을 수 있습니다. PSD는 밑색(피부·얼굴·눈·헤어·상의·하의·신발·액세서리)·음영·하이라이트·주선 레이어로 나뉘어 나옵니다.",
    },
  ],
  en: [
    {
      question: "Do I need to install anything?",
      answer:
        "No. The studio runs in the browser. After the first online load, cached app assets allow limited offline use, but features that need the network only work online.",
    },
    {
      question: "Can I use my own VRM model?",
      answer:
        "Yes. You can upload VRM 0.x and 1.0 files. Face presets like eyes, nose, mouth, and ears apply only when the model has shape keys or an adaptive face mesh; otherwise the card shows why.",
    },
    {
      question: "Where do my reference images and webcam feed go?",
      answer:
        "Nowhere outside your device. AI recommendations run the MediaPipe image embedder in the browser, and photo and webcam pose capture are processed on-device too. The webcam only turns on after you grant permission.",
    },
    {
      question: "What formats do the results come in?",
      answer:
        "Drop a transparent-background PNG straight into the current cut or download it. PSDs separate base colors (skin, face, eyes, hair, top, bottom, shoes, accessories), shading, highlights, and line art into layers.",
    },
  ],
};

const HERO_FACTS = {
  ko: [
    "설치 없음 · 브라우저에서 실행",
    "VRM 0.x · 1.0",
    "AI 추천·포즈 인식은 기기 내 처리",
    "투명 PNG · 레이어 PSD",
  ],
  en: [
    "No install · runs in the browser",
    "VRM 0.x & 1.0",
    "AI recommendations & pose capture stay on-device",
    "Transparent PNG · layered PSD",
  ],
} as const;

const HERO_GLOW_STYLE = {
  background: "linear-gradient(to bottom, color-mix(in oklab, var(--illustrated-3d-accent) 12%, transparent), transparent)",
} as const;

const HERO_BLOOM_STYLE = {
  background:
    "radial-gradient(closest-side, color-mix(in oklab, var(--illustrated-3d-cyan) 12%, transparent), transparent 72%)",
} as const;

function StepNumber({ value }: { value: number }) {
  return (
    <span aria-hidden className="numeral text-2xl leading-none text-accent sm:text-3xl">
      {String(value).padStart(2, "0")}
    </span>
  );
}

/** 편집기 열기 상태는 URL(`?editor=open`)이 소유한다. 뒤로 가기·새로고침·공유가 같은 화면을 낸다. */
function useCharacterShaperEditorEntry() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = isCharacterShaperEditorRequested(searchParams);
  // WebGL 확인은 편집기를 요청했을 때만 한 번 한다. 확인용 컨텍스트는 즉시 반납한다.
  const webgl = useMemo(() => (requested ? probeCharacterShaperWebGl() : null), [requested]);
  // 여는 동작은 주소 변경이라 링크로 둔다(새 탭 열기·주소 복사가 그대로 동작한다).
  const openLink = {
    to: { search: characterShaperEditorSearch(searchParams, true) },
    state: { [CHARACTER_SHAPER_EDITOR_HISTORY_MARK]: true },
  } as const;
  const close = () => {
    // 이 페이지에서 연 편집기는 뒤로 가기와 같게 닫아 기록이 쌓이지 않게 한다.
    if (hasCharacterShaperEditorHistoryMark(location.state)) navigate(-1);
    else navigate({ search: characterShaperEditorSearch(searchParams, false) }, { replace: true });
  };
  return {
    editorOpen: requested && webgl === "supported",
    webglBlocked: requested && webgl === "unsupported",
    openLink,
    close,
  };
}

function WebGlBlockedNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  const bt = useBilingual("CharacterShaperLandingPage");
  return (
    <div
      role="alert"
      data-character-shaper-webgl="unsupported"
      className="mt-5 flex items-start gap-3 rounded-2xl border border-warn/45 bg-warn/10 p-4 text-sm leading-relaxed text-fg-2"
    >
      <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg">{bt("이 브라우저에서는 3D 편집기를 열 수 없습니다", "The 3D editor can't open in this browser")}</p>
        <p className="mt-1">
          {bt(
            "그래픽 가속(WebGL)을 사용할 수 없습니다. 브라우저 설정에서 하드웨어 가속을 켜거나 최신 Chrome·Edge·Safari에서 다시 열어 주세요. 아래 사용 가이드와 FAQ는 계속 볼 수 있습니다.",
            "Graphics acceleration (WebGL) isn't available. Turn on hardware acceleration in your browser settings or reopen in a recent Chrome, Edge, or Safari. The guide and FAQ below remain available.",
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={bt("안내 닫기", "Dismiss notice")}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

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

  const features = FEATURES.map((feature) => ({ ...feature, copy: localize(feature.copy.ko, feature.copy.en) }));
  const howToSteps = localize(HOW_TO_STEPS.ko, HOW_TO_STEPS.en);
  const shortcuts = localize(SHORTCUTS.ko, SHORTCUTS.en);
  const capabilityNotes = CAPABILITY_NOTES.map((note) => ({ ...note, copy: localize(note.copy.ko, note.copy.en) }));
  const faq = localize(FAQ.ko, FAQ.en);
  const heroFacts = localize(HERO_FACTS.ko, HERO_FACTS.en);

  return (
    <div className="studio-character-guide">
      {/* 히어로 */}
      <section className="studio-character-guide__hero relative overflow-hidden border-b border-line bg-ledger">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70" style={HERO_GLOW_STYLE} />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-6 size-[30rem] rounded-full opacity-60 blur-3xl"
          style={HERO_BLOOM_STYLE}
        />
        <Container
          size="wide"
          className="studio-character-guide__intro relative grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-12 lg:py-20"
        >
          <div className="max-w-2xl">
            <p className="eyebrow text-accent">CHARACTER SHAPER</p>
            <h1 className="mt-3 text-balance [word-break:keep-all] text-[clamp(1.9rem,5vw,3rem)] font-bold leading-[1.12] tracking-tight text-fg">
              {bt("프리셋으로 시작하는 3D 웹툰 캐릭터", "3D webtoon characters that start from presets")}
            </h1>
            <p className="lede mt-4 max-w-xl text-pretty text-base leading-relaxed text-fg-2 sm:text-lg">
              {bt(
                "프리셋으로 캐릭터를 고르고, 사진·웹캠으로 포즈를 잡고, 모델 위에 직접 그린 뒤 투명 PNG·레이어 PSD로 내보내기까지 — 설치 없이 브라우저 안에서 끝납니다.",
                "Pick a character from presets, strike a pose with a photo or webcam, draw right on the model, and export transparent PNGs and layered PSDs — all in the browser, no install.",
              )}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <RouterLink
                {...editor.openLink}
                data-character-shaper-start="hero"
                className={buttonClass({ variant: "solid", size: "lg" })}
              >
                {bt("샘플 캐릭터로 바로 시작", "Start with a sample character")}
                <ArrowRight size={18} aria-hidden="true" />
              </RouterLink>
              <a href="#how-to" className={buttonClass({ variant: "outline", size: "lg" })}>
                {bt("사용 가이드", "User guide")}
              </a>
            </div>
            <p className="mt-3 text-xs text-fg-3">
              {bt(
                "이 페이지에서 편집기가 바로 열립니다. 파일 준비 없이 내장 샘플 캐릭터로 시작하고, 내 VRM은 편집기 안에서 가져올 수 있습니다.",
                "The editor opens right on this page. Start with a built-in sample character — no files needed — and import your own VRM inside the editor.",
              )}
            </p>
            {editor.webglBlocked ? <WebGlBlockedNotice onDismiss={editor.close} /> : null}
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-3">
              {heroFacts.map((fact) => (
                <li key={fact} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-1.5 rounded-full bg-accent/80" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-[24rem] lg:max-w-none">
            <Studio3dIllustration />
          </div>
        </Container>
      </section>

      {/* 핵심 기능 */}
      <Container size="wide" className="studio-character-guide__section py-12 sm:py-16">
        <Section eyebrow={bt("FEATURES", "FEATURES")} title={bt("핵심 기능", "Core features")} desc={bt("고르고, 그리고, 옮기고, 내보내는 데 필요한 네 가지.", "The four essentials: pick, draw, transfer, and export.")}>
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((feature, index) => {
              const Art = feature.art;
              return (
                <RevealOnScroll
                  key={feature.id}
                  delayMs={index * 60}
                  className="studio-character-guide__feature flex flex-col rounded-2xl border border-line bg-card/40 p-5 sm:p-6"
                >
                  <div className="rounded-xl border border-line/70 bg-canvas/60 p-3">
                    <Art className="h-auto w-full" />
                  </div>
                  <div className="mt-4 flex items-baseline gap-2.5">
                    <span className="numeral text-sm text-accent">{feature.numeral}</span>
                    <h3 className="text-lg font-bold text-fg">{feature.copy.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">{feature.copy.body}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {feature.copy.chips.map((chip) => (
                      <li
                        key={chip}
                        className="rounded-full border border-line bg-raised/60 px-2 py-0.5 text-[0.7rem] text-fg-2"
                      >
                        {chip}
                      </li>
                    ))}
                  </ul>
                </RevealOnScroll>
              );
            })}
          </div>
        </Section>
      </Container>

      {/* HOW TO */}
      <section id="how-to" className="scroll-mt-24 border-y border-line bg-panel/30">
        <Container size="wide" className="studio-character-guide__section py-12 sm:py-16">
          <Section
            eyebrow={bt("HOW TO", "HOW TO")}
            title={bt("다섯 단계로 첫 캐릭터 만들기", "Make your first character in five steps")}
            desc={bt("위에서 아래로 한 번만 따라가면 컷에 넣을 수 있는 캐릭터가 나옵니다.", "Follow it once, top to bottom, and you'll have a character ready for your panels.")}
          >
            <ol className="flex flex-col gap-3.5">
              {howToSteps.map((step, index) => (
                <RevealOnScroll
                  key={step.title}
                  as="li"
                  delayMs={index * 50}
                  className="flex gap-4 rounded-2xl border border-line bg-card/40 p-5 sm:gap-6 sm:p-6"
                >
                  <StepNumber value={index + 1} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-fg sm:text-lg">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{step.body}</p>
                    <p className="mt-3 flex gap-2 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[0.8rem] leading-relaxed text-fg-2">
                      <span className="shrink-0 font-semibold text-accent">{bt("팁", "Tip")}</span>
                      <span>{step.tip}</span>
                    </p>
                  </div>
                </RevealOnScroll>
              ))}
            </ol>
          </Section>
        </Container>
      </section>

      {/* 학습 센터 — 30초 클립 튜토리얼 4탭 (B-7) */}
      <CharacterShaperLearnCenter />


      {/* 단축키 */}
      <Container size="wide" className="studio-character-guide__section py-12 sm:py-16">
        <Section eyebrow={bt("SHORTCUTS", "SHORTCUTS")} title={bt("단축키", "Shortcuts")} desc={bt("마우스 없이도 슬롯을 오가고 되돌릴 수 있습니다. ⌘ 표기는 macOS 기준입니다.", "Move between slots and undo without a mouse. ⌘ notation follows macOS.")}>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-card/50 text-left text-xs font-semibold text-fg-3">
                <tr>
                  <th scope="col" className="px-4 py-2.5">{bt("키", "Key")}</th>
                  <th scope="col" className="px-4 py-2.5">{bt("동작", "Action")}</th>
                  <th scope="col" className="px-4 py-2.5">{bt("비고", "Notes")}</th>
                </tr>
              </thead>
              <tbody>
                {shortcuts.map((row, index) => (
                  <tr key={row.action} className={index % 2 ? "bg-card/20" : "bg-transparent"}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {row.keys.map((key, keyIndex) => (
                          <span key={key} className="inline-flex items-center gap-1.5">
                            {keyIndex > 0 && <span className="text-fg-3">–</span>}
                            <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-line bg-card px-1.5 py-0.5 font-display text-[0.72rem] text-fg">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-fg">{row.action}</td>
                    <td className="px-4 py-2.5 text-fg-3 [word-break:keep-all]">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Container>

      {/* 지원 범위와 한계 */}
      <section className="border-y border-line bg-panel/30">
        <Container size="wide" className="studio-character-guide__section py-12 sm:py-16">
          <Section eyebrow="SCOPE" title={bt("지원 범위와 한계", "Scope and limits")} desc={bt("되는 것과 모델에 따라 달라지는 것을 미리 적어 둡니다.", "What works and what depends on the model, up front.")}>
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {capabilityNotes.map((note) => {
                const Icon = note.icon;
                return (
                  <li key={note.copy.title} className="rounded-2xl border border-line bg-card/30 p-4 sm:p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
                      <Icon size={16} className="shrink-0 text-accent" aria-hidden />
                      {note.copy.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{note.copy.body}</p>
                  </li>
                );
              })}
            </ul>
          </Section>
        </Container>
      </section>

      {/* FAQ */}
      <Container size="wide" className="studio-character-guide__section py-12 sm:py-16">
        <Section eyebrow="FAQ" title={bt("자주 묻는 질문", "Frequently asked questions")}>
          <div className="grid gap-2.5 md:grid-cols-2">
            {faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-xl border border-line bg-card/40 open:border-line-strong open:bg-card/70"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-fg-3 transition-transform duration-200 ease-out-expo group-open:rotate-180"
                  />
                </summary>
                <p className="border-t border-line/70 px-4 pb-4 pt-3 text-sm leading-relaxed text-fg-2">{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      </Container>

      {/* 마무리 CTA */}
      <Container size="wide" className="pb-16 sm:pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/50 px-6 py-10 text-center sm:px-10 sm:py-14">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-80" style={HERO_GLOW_STYLE} />
          <div className="relative">
            <p className="eyebrow text-accent">{bt("START", "START")}</p>
            <h2 className="mt-2 text-balance [word-break:keep-all] text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {bt("지금 첫 캐릭터를 만들어 보세요", "Make your first character now")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg-2 sm:text-base">
              {bt(
                "내장 샘플 모델로 시작하면 파일을 따로 준비하지 않아도 됩니다. 만든 캐릭터는 투명 PNG로 바로 컷에 들어갑니다.",
                "Start with a built-in sample model — no files to prepare. Your character drops straight into your panels as a transparent PNG.",
              )}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <RouterLink
                {...editor.openLink}
                data-character-shaper-start="closing"
                className={buttonClass({ variant: "solid", size: "lg" })}
              >
                {bt("지금 편집기 열기", "Open the editor now")}
                <ArrowRight size={18} aria-hidden="true" />
              </RouterLink>
              <Link href="/market/browse?kind=3d-asset" className={buttonClass({ variant: "outline", size: "lg" })}>
                {bt("3D 소재 둘러보기", "Browse 3D assets")}
              </Link>
            </div>
          </div>
        </div>
      </Container>

      {editor.editorOpen ? (
        <Suspense fallback={<CharacterShaperEditorLoading />}>
          <CharacterShaperStandaloneEditor onClose={editor.close} />
        </Suspense>
      ) : null}
    </div>
  );
}
