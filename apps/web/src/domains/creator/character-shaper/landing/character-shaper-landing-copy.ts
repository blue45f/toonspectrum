import { Box, Camera, Layers, ScanFace, ShieldCheck } from "lucide-react";

import type { LucideIcon } from "lucide-react";

/**
 * 캐릭터 셰이퍼 소개 페이지(/studio/assets/characters/new)의 문구 데이터.
 *
 * 한국어·영어 쌍을 같은 모양의 트리로 두고 화면에서 `useBilingualLocalizer`로 한 번에 고른다.
 * 수치·후기·검증되지 않은 약속은 쓰지 않는다(PRODUCT.md "주장보다 증거").
 * 화면 구성(컴포넌트)과 문구를 분리해 두어 문구만 고칠 때 화면 코드를 건드리지 않는다.
 */

export interface LocalizedPair<T> {
  readonly ko: T;
  readonly en: T;
}

export const SLOT_LABELS: LocalizedPair<readonly string[]> = {
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
};

export const PSD_LAYERS: LocalizedPair<readonly string[]> = {
  ko: ["피부", "얼굴", "눈", "헤어", "상의", "하의", "신발", "액세서리", "음영", "하이라이트", "주선"],
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
};

/* -------------------------------------------------------------------------- */
/* 첫 화면 한 줄 요약(세 단계)                                                  */
/* -------------------------------------------------------------------------- */

export type QuickStepId = "pick" | "pose" | "place";

export interface QuickStepCopy {
  readonly title: string;
  readonly body: string;
}

export const QUICK_STEPS: LocalizedPair<Readonly<Record<QuickStepId, QuickStepCopy>>> = {
  ko: {
    pick: { title: "고르기", body: "카드로 얼굴·헤어·의상 바꾸기" },
    pose: { title: "포즈·그리기", body: "사진·웹캠 포즈, 직접 그리기" },
    place: { title: "컷에 넣기", body: "투명 PNG를 바로 컷에 넣기" },
  },
  en: {
    pick: { title: "Pick", body: "Swap face, hair and outfit with cards" },
    pose: { title: "Pose & draw", body: "Photo or webcam pose, then draw" },
    place: { title: "Add to panel", body: "Drop a transparent PNG into the panel" },
  },
};

export const QUICK_STEP_ORDER: readonly QuickStepId[] = ["pick", "pose", "place"];

/* -------------------------------------------------------------------------- */
/* 핵심 기능 4가지                                                              */
/* -------------------------------------------------------------------------- */

export type FeatureId = "presets" | "paint" | "ai" | "output";

export interface FeatureCopy {
  readonly title: string;
  readonly body: string;
  readonly chips: readonly string[];
}

export interface FeatureBlock {
  readonly id: FeatureId;
  readonly numeral: string;
  readonly copy: LocalizedPair<FeatureCopy>;
}

export const FEATURES: readonly FeatureBlock[] = [
  {
    id: "presets",
    numeral: "01",
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

/* -------------------------------------------------------------------------- */
/* 사용법 5단계                                                                 */
/* -------------------------------------------------------------------------- */

export interface HowToCopy {
  readonly title: string;
  readonly body: string;
  readonly tip: string;
}

export const HOW_TO_STEPS: LocalizedPair<readonly HowToCopy[]> = {
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

/* -------------------------------------------------------------------------- */
/* 단축키                                                                       */
/* -------------------------------------------------------------------------- */

export interface ShortcutCopy {
  readonly keys: readonly string[];
  readonly action: string;
  readonly note: string;
}

export const SHORTCUTS: LocalizedPair<readonly ShortcutCopy[]> = {
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

/* -------------------------------------------------------------------------- */
/* 지원 범위와 한계                                                             */
/* -------------------------------------------------------------------------- */

export interface CapabilityCopy {
  readonly title: string;
  readonly body: string;
}

export interface CapabilityNote {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly copy: LocalizedPair<CapabilityCopy>;
}

export const CAPABILITY_NOTES: readonly CapabilityNote[] = [
  {
    id: "vrm",
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
    id: "face",
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
    id: "ai-local",
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
    id: "webcam",
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
    id: "psd",
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
    id: "storage",
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

/* -------------------------------------------------------------------------- */
/* 자주 묻는 질문                                                               */
/* -------------------------------------------------------------------------- */

export interface FaqCopy {
  readonly question: string;
  readonly answer: string;
}

export const FAQ: LocalizedPair<readonly FaqCopy[]> = {
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

/* -------------------------------------------------------------------------- */
/* 첫 화면 사실 줄                                                              */
/* -------------------------------------------------------------------------- */

export const HERO_FACTS: LocalizedPair<readonly string[]> = {
  ko: ["설치 없음 · 브라우저에서 실행", "VRM 0.x · 1.0", "AI 추천·포즈 인식은 기기 내 처리", "투명 PNG · 레이어 PSD"],
  en: [
    "No install · runs in the browser",
    "VRM 0.x & 1.0",
    "AI recommendations & pose capture stay on-device",
    "Transparent PNG · layered PSD",
  ],
};
