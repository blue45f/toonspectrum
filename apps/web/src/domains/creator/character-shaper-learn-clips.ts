/**
 * CharacterShaperLearnCenter — 3D 학습 센터 클립 데이터.
 *
 * 4개 트랙(프리셋 활용 / 직접 그리기·포즈 편집 / AI 기능 / 실전 워크플로우)에
 * 30초 클립을 싣는다. 실제 영상 파일이 아직 없으므로 각 클립은 제목·설명·재생시간·난이도만
 * 들고 있고, 나중에 `videoUrl`·`posterUrl`만 채우면 영상이 붙도록 데이터 구조를 분리했다.
 *
 * 한국어(`SHAPER_LEARN_TABS`)와 영어(`SHAPER_LEARN_TABS_EN`)는 같은 모양의 트리다. 문자열이 아닌
 * 값(id·재생시간·난이도 단계·주소)은 두 트리에서 같아야 하고, 화면은 `useBilingualLocalizer`로 고른다.
 *
 * 복사 원칙: 실제 기능 이름만 쓰고, 검증되지 않은 수치·후기·약속은 쓰지 않는다.
 */

/** 클립 난이도 단계. 화면 이름은 `SHAPER_LEARN_LEVEL_LABEL`로 고른다. */
export type ShaperLearnLevel = 1 | 2 | 3;

export const SHAPER_LEARN_LEVEL_LABEL: Readonly<Record<ShaperLearnLevel, readonly [ko: string, en: string]>> = {
  1: ["입문", "Beginner"],
  2: ["초급", "Easy"],
  3: ["중급", "Intermediate"],
};

export interface ShaperLearnClip {
  /** 트랙 안에서 고유한 식별자. 나중에 영상 URL이 붙어도 바뀌지 않는다. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** 초 단위 재생시간. 학습 센터 클립은 모두 30초 포맷이다. */
  readonly durationSeconds: 30;
  readonly level: ShaperLearnLevel;
  /**
   * 실제 영상 URL. 아직 촬영·업로드 전이면 undefined — 화면은 "영상 준비 중"을 한 번만 알린다.
   */
  readonly videoUrl?: string;
  /** 썸네일 이미지 URL. 붙일 때는 `posterAlt`도 함께 채운다. */
  readonly posterUrl?: string;
  readonly posterAlt?: string;
}

export type ShaperLearnTabId = "presets" | "draw" | "ai" | "workflow";

export interface ShaperLearnTab {
  readonly id: ShaperLearnTabId;
  readonly title: string;
  /** 트랙을 고르면 나오는 한 줄 소개. */
  readonly blurb: string;
  /**
   * "바로 해보기" CTA가 여는 스튜디오 패널. 깨진 링크를 막기 위해
   * 실제 등록된 라우트만 사용한다(아래 주석의 출처 확인).
   */
  readonly studioHref: string;
  /** CTA 접근성 이름에 들어가는 패널 이름. */
  readonly studioLabel: string;
  readonly clips: readonly ShaperLearnClip[];
}

const THIRTY_SECONDS = 30 as const;

export const SHAPER_LEARN_TABS: readonly ShaperLearnTab[] = [
  {
    id: "presets",
    title: "프리셋 활용",
    blurb: "15개 슬롯 카드를 고르고 되돌리는 기본 동작을 30초씩 익힙니다.",
    // 예전 작업실 별칭(/studio/character)은 소개 페이지의 `?editor=open` 주소로 바꿔 연다.
    studioHref: "/studio/character",
    studioLabel: "캐릭터 작업실",
    clips: [
      {
        id: "presets-slots-tour",
        title: "얼굴형부터 손 포즈까지: 슬롯 레일 둘러보기",
        description: "오른쪽 카테고리와 세부 부위 탭을 차례로 훑으며 각 부위가 무엇을 바꾸는지 확인합니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "presets-expression-swap",
        title: "카드 한 번으로 표정 바꾸기",
        description: "표정 슬롯 카드를 눌러 바로 적용하고, 요약 바에서 바뀐 점을 확인합니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "presets-undo-safely",
        title: "되돌리기로 안전하게 실험하기",
        description: "마음에 안 드는 조합은 ⌘Z로 한 단계씩 되돌립니다. 슬롯 하나를 바꿔도 나머지는 그대로입니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
    ],
  },
  {
    id: "draw",
    title: "직접 그리기 · 포즈 편집",
    blurb: "모델 위에 직접 그리고, 포즈를 잡은 뒤에도 선이 따라가는 흐름을 배웁니다.",
    // 표면 드로잉(B 키)과 사진·웹캠 포즈는 캐릭터 셰이퍼의 기능이다. 예전에는 /studio/poser(데생 인형 독립 페이지)로
    // 보냈지만 그곳에는 표면 드로잉이 없어 클립 내용과 어긋났다. 예전 작업실 별칭은 편집기를 바로 여는 주소로 바뀐다.
    studioHref: "/studio/character",
    studioLabel: "캐릭터 작업실",
    clips: [
      {
        id: "draw-surface-on",
        title: "표면 드로잉 켜기: 모델 위에 바로 그리기",
        description: "B 키나 도크에서 표면 드로잉을 켜고 브러시로 모델의 UV 표면에 직접 칠합니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "draw-pose-first",
        title: "포즈를 먼저 잡고 그리기",
        description: "원하는 포즈를 잡은 뒤 그리면 확인이 편합니다. 그린 선은 포즈를 바꿔도 모델을 따라갑니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "draw-picker-eraser",
        title: "스포이드와 지우개로 정리하기",
        description: "스포이드로 모델 색을 집어 쓰고, 지우개로 삐져나온 선을 정리합니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
    ],
  },
  {
    id: "ai",
    title: "AI 기능",
    blurb: "사진에서 포즈를 읽고 참고 이미지로 추천받는 과정을 따라 합니다. 모두 기기 안에서 처리됩니다.",
    // AI 보조(레퍼런스 서랍·사진/웹캠 포즈)는 캐릭터 셰이퍼의 기능.
    studioHref: "/studio/character",
    studioLabel: "캐릭터 작업실",
    clips: [
      {
        id: "ai-reference-recommend",
        title: "참고 이미지를 놓으면 프리셋·팔레트 추천",
        description: "참고 이미지를 서랍에 놓으면 어울리는 프리셋 조합과 팔레트를 추천받아 한 번에 적용합니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "ai-photo-to-pose",
        title: "사진 한 장으로 포즈 옮기기",
        description: "사진에서 포즈를 읽어 모델에 옮깁니다. 남길 신체 부위를 골라 부분 적용할 수 있습니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "ai-webcam-pose",
        title: "웹캠으로 실시간 포즈 잡기",
        description: "브라우저 권한에 동의한 뒤 웹캠을 켜면 내 포즈가 모델에 바로 반영됩니다. 원하면 고정해 둡니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 3,
      },
    ],
  },
  {
    id: "workflow",
    title: "실전 워크플로우",
    blurb: "구도 잡기부터 투명 PNG·PSD 내보내기까지, 컷 제작 파이프라인을 순서대로 익힙니다.",
    // MakeHub "4컷·컷툰" 항목에서 검증된 실제 프리셋 딥링크 — 컷 제작 작업실로 연결.
    studioHref: "/studio?preset=4cut",
    studioLabel: "컷툰 프리셋 스튜디오",
    clips: [
      {
        id: "workflow-camera-frame",
        title: "카메라 프리셋으로 구도 잡기",
        description: "정면·사선·상반신 카메라 프리셋을 컷 구도에 맞춰 두면 출력 뒤에 다시 자를 일이 줄어듭니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "workflow-png-to-canvas",
        title: "투명 PNG로 컷에 바로 넣기",
        description: "투명 배경을 켜고 '캔버스에 추가'를 누르면 렌더가 현재 컷에 바로 들어갑니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "workflow-psd-layers",
        title: "PSD 레이어로 넘겨 마무리하기",
        description: "PSD는 밑색·음영·하이라이트·주선이 의미 단위 레이어로 나뉘어 나와 후작업이 편합니다.",
        durationSeconds: THIRTY_SECONDS,
        level: 3,
      },
    ],
  },
];

/** 영어 화면용. 구조·id·주소·단계는 `SHAPER_LEARN_TABS`와 같고 문자열만 영어다. */
export const SHAPER_LEARN_TABS_EN: readonly ShaperLearnTab[] = [
  {
    id: "presets",
    title: "Using presets",
    blurb: "Learn the basics of picking and undoing the 15 slot cards, 30 seconds at a time.",
    studioHref: "/studio/character",
    studioLabel: "Character workshop",
    clips: [
      {
        id: "presets-slots-tour",
        title: "From face shape to hand pose: a tour of the slot rail",
        description: "Walk through the category and detail-part tabs on the right to see what each part changes.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "presets-expression-swap",
        title: "Change an expression with one card",
        description: "Tap an expression card to apply it at once, then check what changed in the summary bar.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "presets-undo-safely",
        title: "Experiment safely with undo",
        description: "Undo a combination you don't like one step at a time with ⌘Z. Changing one slot leaves the others as they were.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
    ],
  },
  {
    id: "draw",
    title: "Drawing & posing",
    blurb: "Learn to draw right on the model and keep your lines after you change the pose.",
    studioHref: "/studio/character",
    studioLabel: "Character workshop",
    clips: [
      {
        id: "draw-surface-on",
        title: "Turn on surface drawing: draw right on the model",
        description: "Turn on surface drawing with the B key or the dock and paint the model's UV surface with the brush.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "draw-pose-first",
        title: "Pose first, then draw",
        description: "Strike the pose you want before drawing so it's easier to check. Your lines follow the model through pose changes.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "draw-picker-eraser",
        title: "Tidy up with the eyedropper and eraser",
        description: "Pick colors from the model with the eyedropper and clean up stray lines with the eraser.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
    ],
  },
  {
    id: "ai",
    title: "AI features",
    blurb: "Follow how a photo becomes a pose and a reference image becomes recommendations. Everything runs on your device.",
    studioHref: "/studio/character",
    studioLabel: "Character workshop",
    clips: [
      {
        id: "ai-reference-recommend",
        title: "Drop a reference image to get presets and a palette",
        description: "Drop a reference image on the drawer to get matching preset combinations and a palette, then apply them at once.",
        durationSeconds: THIRTY_SECONDS,
        level: 1,
      },
      {
        id: "ai-photo-to-pose",
        title: "Transfer a pose from one photo",
        description: "Read a pose from a photo and move it onto the model. Choose which body parts to keep for a partial transfer.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "ai-webcam-pose",
        title: "Catch a live pose with the webcam",
        description: "After you grant browser permission, turn on the webcam and your pose shows up on the model. Lock it when you like it.",
        durationSeconds: THIRTY_SECONDS,
        level: 3,
      },
    ],
  },
  {
    id: "workflow",
    title: "Real-world workflow",
    blurb: "From framing to exporting a transparent PNG or PSD, learn the panel production pipeline in order.",
    studioHref: "/studio?preset=4cut",
    studioLabel: "4-panel cuttoon preset studio",
    clips: [
      {
        id: "workflow-camera-frame",
        title: "Frame the shot with camera presets",
        description: "Match the front, three-quarter and bust camera presets to your panel composition and you'll re-crop less after export.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "workflow-png-to-canvas",
        title: "Drop a transparent PNG into the panel",
        description: "Turn on the transparent background and press 'Add to canvas' to put the render straight into the current panel.",
        durationSeconds: THIRTY_SECONDS,
        level: 2,
      },
      {
        id: "workflow-psd-layers",
        title: "Finish in layered PSD",
        description: "The PSD separates base colors, shading, highlights and line art into semantic layers, which makes post-work easier.",
        durationSeconds: THIRTY_SECONDS,
        level: 3,
      },
    ],
  },
];

/** 재생시간(초) → "0:30" 형태의 짧은 표기. */
export function formatClipDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
