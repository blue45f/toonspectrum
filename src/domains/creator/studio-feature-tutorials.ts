/**
 * Studio 기능별 튜토리얼 카탈로그 — 순수 데이터 + 진행 상태(localStorage).
 * UI(StudioFeatureTutorialHub)와 StudioPage 액션 배선이 같은 id 를 공유한다.
 */

export type StudioTutorialCategory = "그리기" | "대사" | "구성" | "3D" | "AI·내보내기";

/** 튜토리얼 한 단계 — 짧고 행동 가능한 문장. */
export type StudioTutorialStep = {
  title: string;
  body: string;
  /** 선택: 한 줄 팁(심리적으로 부담 줄이는 안심 문구). */
  tip?: string;
};

/**
 * tryAction — 허브의 "따라 해보기"가 StudioPage 에서 실행할 액션 키.
 * 새 액션 추가 시 StudioPage 의 handleTutorialTry 분기에도 같은 키를 추가한다.
 */
export type StudioTutorialTryAction =
  | "pen"
  | "smart-shape"
  | "bubble"
  | "brush"
  | "template"
  | "layers"
  | "character"
  | "bg3d"
  | "ai-assist"
  | "dialogue"
  | "export";

export type StudioFeatureTutorial = {
  id: string;
  category: StudioTutorialCategory;
  title: string;
  /** 카드 한 줄 요약. */
  summary: string;
  /** 목록 이모지 대신 쓸 짧은 배지 글자(1~2자). */
  badge: string;
  steps: StudioTutorialStep[];
  tryAction?: StudioTutorialTryAction;
  tryLabel?: string;
};

export const STUDIO_TUTORIAL_CATEGORY_ORDER: StudioTutorialCategory[] = [
  "그리기",
  "대사",
  "구성",
  "3D",
  "AI·내보내기",
];

export const STUDIO_FEATURE_TUTORIALS: StudioFeatureTutorial[] = [
  {
    id: "pen",
    category: "그리기",
    title: "펜으로 스케치",
    summary: "빈 캔버스에 바로 선을 긋고 크기·불투명도를 조절해요.",
    badge: "펜",
    tryAction: "pen",
    tryLabel: "펜 켜기",
    steps: [
      {
        title: "펜 도구 선택",
        body: "하단 도구막대에서 펜을 누르거나 B 키를 눌러요. 그리기 준비가 끝납니다.",
        tip: "지우개는 E 로 바로 전환할 수 있어요.",
      },
      {
        title: "크기와 농도",
        body: "그리기 옵션에서 브러시 크기와 불투명도를 맞춰요. [ ] 키로 크기를 빠르게 바꿀 수 있어요.",
      },
      {
        title: "자연스럽게 긋기",
        body: "선을 그은 뒤 손을 떼면 한 획이 저장됩니다. ⌘Z 로 언제든 되돌릴 수 있어요.",
        tip: "떨림이 거슬리면 안정화 옵션을 살짝 올려 보세요.",
      },
    ],
  },
  {
    id: "smart-shape",
    category: "그리기",
    title: "스마트 도형",
    summary: "선·네모·원·삼각을 대충 그려도 손을 떼면 단정한 도형으로 다듬어요.",
    badge: "도형",
    tryAction: "smart-shape",
    tryLabel: "스마트 도형 켜기",
    steps: [
      {
        title: "펜 모드에서 켜기",
        body: "펜이 선택된 상태에서 그리기 옵션의 스마트 도형을 ON 으로 바꿔요.",
        tip: "끄적여도 괜찮아요 — 완벽할 필요 없습니다.",
      },
      {
        title: "도형처럼 그리기",
        body: "선·네모·원·삼각·다각형을 한 획으로 그려 보세요. 끝에서 잠깐 멈추면 미리보기가 뜹니다.",
      },
      {
        title: "손을 떼면 확정",
        body: "손을 떼는 순간 깔끔한 도형으로 스냅됩니다. 마음에 안 들면 ⌘Z 로 되돌리면 돼요.",
        tip: "원은 끝까지 살짝 이어 주고, 삼각형은 꼭짓점을 또렷하게 꺾어 주면 인식이 잘 됩니다.",
      },
    ],
  },
  {
    id: "brush",
    category: "그리기",
    title: "브러시 키트",
    summary: "연필·마커·붓·형광펜 등 용도별 브러시로 분위기를 바꿔요.",
    badge: "붓",
    tryAction: "brush",
    tryLabel: "브러시 열기",
    steps: [
      {
        title: "브러시 트레이",
        body: "그리기 옵션에서 브러시 목록을 열고 원하는 질감을 골라요.",
      },
      {
        title: "슬롯에 저장",
        body: "자주 쓰는 브러시는 ⇧1–6 으로 슬롯에 저장하고, 1–6 으로 바로 불러올 수 있어요.",
      },
      {
        title: "색과 함께",
        body: "주 색을 고른 뒤 그어 보세요. X 키로 주 색과 보조 색을 바꿀 수 있습니다.",
      },
    ],
  },
  {
    id: "bubble",
    category: "대사",
    title: "말풍선",
    summary: "말하기·생각·외침 등 장면에 맞는 목소리를 골라 넣어요.",
    badge: "말",
    tryAction: "bubble",
    tryLabel: "말풍선 메뉴",
    steps: [
      {
        title: "종류 고르기",
        body: "상단 말풍선 메뉴에서 대사·감정·연출 UI 그룹을 보고 형태를 골라요.",
        tip: "대충 골라도 나중에 속성에서 모양을 바꿀 수 있어요.",
      },
      {
        title: "대사 입력",
        body: "캔버스의 말풍선을 더블클릭(또는 탭)해 글을 고쳐요. 선택하면 오른쪽 속성에서 색·꼬리·분위기도 조절됩니다.",
      },
      {
        title: "분위기 스와치",
        body: "속성 패널의 분위기 스와치로 색·선·모양을 한 번에 맞춰 보세요.",
      },
    ],
  },
  {
    id: "dialogue",
    category: "대사",
    title: "대사 한 번에 넣기",
    summary: "스크립트를 붙여 넣으면 말풍선이 줄줄이 배치됩니다.",
    badge: "대본",
    tryAction: "dialogue",
    tryLabel: "말풍선·대본",
    steps: [
      {
        title: "스크립트 형식",
        body: "한 줄에 한 대사. 「이름: 대사」면 화자가 나뉘고, 「(지문)」은 나레이션 박스가 됩니다.",
      },
      {
        title: "한 번에 넣기",
        body: "말풍선 메뉴 아래 입력칸에 붙여 넣고 「말풍선으로 한 번에 넣기」를 눌러요.",
      },
      {
        title: "일괄 편집",
        body: "이미 올린 대사는 「배치 대사 편집」에서 한꺼번에 고칠 수 있어요.",
      },
    ],
  },
  {
    id: "template",
    category: "구성",
    title: "컷 템플릿",
    summary: "세로 웹툰·4컷·그리드 등 레이아웃을 한 번에 깔아요.",
    badge: "컷",
    tryAction: "template",
    tryLabel: "템플릿 열기",
    steps: [
      {
        title: "템플릿 고르기",
        body: "연동/템플릿 메뉴에서 세로 웹툰·그리드 등 구성을 선택해요.",
      },
      {
        title: "프레임 안에 그리기",
        body: "각 컷(프레임) 안에 그림·말풍선·캐릭터를 넣어요. 프레임이 장면을 나눠 줍니다.",
      },
      {
        title: "크기 조절",
        body: "캔버스 높이나 프레임을 선택해 길이를 조절할 수 있어요. 스크롤 웹툰은 세로로 길게 두는 편이 좋아요.",
      },
    ],
  },
  {
    id: "layers",
    category: "구성",
    title: "레이어와 선택",
    summary: "겹친 요소를 고르고, 순서·숨김·잠금으로 정리해요.",
    badge: "겹",
    tryAction: "layers",
    tryLabel: "레이어 패널",
    steps: [
      {
        title: "선택하기",
        body: "선택 도구로 요소를 탭하면 속성·레이어 목록에 강조됩니다.",
      },
      {
        title: "순서 바꾸기",
        body: "레이어 목록을 드래그하거나 ⌘] / ⌘[ 로 앞·뒤를 바꿔요.",
      },
      {
        title: "숨김·잠금",
        body: "작업 중 방해되는 요소는 숨기거나 잠가 두면 실수로 움직이지 않아요.",
        tip: "방향키로 1px, ⇧+방향키로 10px 미세 이동할 수 있어요.",
      },
    ],
  },
  {
    id: "character",
    category: "3D",
    title: "3D 캐릭터",
    summary: "VRM 캐릭터 포즈·의상·소품으로 장면을 잡아요.",
    badge: "캐",
    tryAction: "character",
    tryLabel: "캐릭터 열기",
    steps: [
      {
        title: "캐릭터 추가",
        body: "캐릭터 메뉴에서 모델이나 프리셋을 넣어 캔버스에 배치해요.",
      },
      {
        title: "포즈 잡기",
        body: "포즈 프리셋이나 조인트 조작으로 동작을 맞춰요.",
      },
      {
        title: "의상·소품",
        body: "워드로브와 소품 목록으로 분위기를 더해요. 어색하면 위치를 조금만 미세 조정해 보세요.",
      },
    ],
  },
  {
    id: "bg3d",
    category: "3D",
    title: "3D 배경",
    summary: "방·거리·세트 템플릿으로 배경 공간을 빠르게 깔아요.",
    badge: "배경",
    tryAction: "bg3d",
    tryLabel: "3D 배경",
    steps: [
      {
        title: "장면 템플릿",
        body: "3D 배경에서 방·거리 등 템플릿을 골라 한 번에 배치해요.",
      },
      {
        title: "오브젝트 배치",
        body: "가구·소품을 옮기고 바닥 스냅으로 정렬해요. 숨김·잠금으로 정리할 수 있습니다.",
      },
      {
        title: "카메라 감각",
        body: "시점과 조명을 살짝 바꿔 컷의 분위기를 잡아 보세요.",
      },
    ],
  },
  {
    id: "ai-assist",
    category: "AI·내보내기",
    title: "AI 어시스트",
    summary: "대사 제안·리라이트 등 보조 도구로 막힌 장면을 풀어요.",
    badge: "AI",
    tryAction: "ai-assist",
    tryLabel: "AI 어시스트",
    steps: [
      {
        title: "허브 열기",
        body: "AI 어시스트 메뉴에서 필요한 도구 탭을 고르세요.",
      },
      {
        title: "맥락 넣기",
        body: "장면·화자·톤을 짧게 적어 주면 제안이 더 잘 맞아요. 결과는 그대로 쓰지 말고 손봐 주세요.",
        tip: "일부 기능은 내 API 키(BYOK)가 필요할 수 있어요.",
      },
      {
        title: "캔버스에 반영",
        body: "마음에 드는 문장을 말풍선에 붙여 넣거나 적용 버튼으로 반영해요.",
      },
    ],
  },
  {
    id: "export",
    category: "AI·내보내기",
    title: "내보내기",
    summary: "PNG·JSON 백업 등으로 작업을 저장하고 공유해요.",
    badge: "저장",
    tryAction: "export",
    tryLabel: "다운로드 위치",
    steps: [
      {
        title: "이미지로 저장",
        body: "상단 다운로드에서 배율(예: 2× PNG)을 고른 뒤 저장해요.",
      },
      {
        title: "작업 백업",
        body: "JSON 백업으로 레이어·말풍선까지 통째로 보관할 수 있어요. 나중에 다시 불러오세요.",
      },
      {
        title: "게시 전 확인",
        body: "게시/업로드 전에 한 번 더 보고, 필요한 컷만 내보내도 됩니다.",
      },
    ],
  },
];

export const STUDIO_FEATURE_TUTORIAL_BY_ID = new Map(
  STUDIO_FEATURE_TUTORIALS.map((t) => [t.id, t] as const)
);

export function groupStudioFeatureTutorials(
  list: readonly StudioFeatureTutorial[] = STUDIO_FEATURE_TUTORIALS
): { category: StudioTutorialCategory; items: StudioFeatureTutorial[] }[] {
  return STUDIO_TUTORIAL_CATEGORY_ORDER.map((category) => ({
    category,
    items: list.filter((t) => t.category === category),
  })).filter((g) => g.items.length > 0);
}

// ── 진행 상태 (localStorage) ──────────────────────────────────────────────

export const STUDIO_TUTORIAL_PROGRESS_KEY = "toonspectrum.studio.tutorialProgress.v1";

export type StudioTutorialProgress = {
  /** 마지막 단계까지 본 튜토리얼 id. */
  completed: string[];
  /** 마지막으로 열어 둔 튜토리얼 id. */
  lastId?: string;
};

export function emptyTutorialProgress(): StudioTutorialProgress {
  return { completed: [] };
}

export function readTutorialProgress(): StudioTutorialProgress {
  if (typeof window === "undefined") return emptyTutorialProgress();
  try {
    const raw = globalThis.localStorage.getItem(STUDIO_TUTORIAL_PROGRESS_KEY);
    if (!raw) return emptyTutorialProgress();
    const parsed = JSON.parse(raw) as Partial<StudioTutorialProgress>;
    const completed = Array.isArray(parsed.completed)
      ? parsed.completed.filter((id): id is string => typeof id === "string")
      : [];
    return {
      completed,
      lastId: typeof parsed.lastId === "string" ? parsed.lastId : undefined,
    };
  } catch {
    return emptyTutorialProgress();
  }
}

export function writeTutorialProgress(progress: StudioTutorialProgress): void {
  if (typeof window === "undefined") return;
  try {
    globalThis.localStorage.setItem(STUDIO_TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // private mode / quota
  }
}

export function markTutorialCompleted(
  progress: StudioTutorialProgress,
  id: string
): StudioTutorialProgress {
  if (progress.completed.includes(id)) {
    return { ...progress, lastId: id };
  }
  return {
    completed: [...progress.completed, id],
    lastId: id,
  };
}

export function isTutorialCompleted(progress: StudioTutorialProgress, id: string): boolean {
  return progress.completed.includes(id);
}

export function tutorialCompletionRatio(progress: StudioTutorialProgress): {
  done: number;
  total: number;
} {
  const total = STUDIO_FEATURE_TUTORIALS.length;
  const done = STUDIO_FEATURE_TUTORIALS.filter((t) => progress.completed.includes(t.id)).length;
  return { done, total };
}
