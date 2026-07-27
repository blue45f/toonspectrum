/**
 * Studio 기능별 튜토리얼 카탈로그 — 순수 데이터 + 진행 상태(localStorage).
 * UI(StudioFeatureTutorialHub)와 StudioPage 액션 배선이 같은 id 를 공유한다.
 */

export type StudioTutorialCategory =
  | "drawing"
  | "adjustments"
  | "dialogue"
  | "composition"
  | "threed"
  | "aiExport";

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
  | "wet-mix"
  | "dodge-burn"
  | "quick-mask"
  | "mannequin"
  | "frame-anim"
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
  "drawing",
  "adjustments",
  "dialogue",
  "composition",
  "threed",
  "aiExport",
];

export const STUDIO_FEATURE_TUTORIALS: StudioFeatureTutorial[] = [
  {
    id: "pen",
    category: "drawing",
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
    category: "drawing",
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
    category: "drawing",
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
    id: "wet-mix",
    category: "drawing",
    title: "혼색 브러시",
    summary: "바닥색을 붓에 묻혀 섞어 가며 칠하는 물감 느낌 브러시예요.",
    badge: "혼",
    tryAction: "wet-mix",
    tryLabel: "혼색 브러시 켜기",
    steps: [
      {
        title: "이미지 레이어에서 켜기",
        body: "칠할 이미지 레이어를 고른 뒤 왼쪽 도구막대의 혼색 브러시를 누르거나 ⇧N 을 눌러요.",
        tip: "그린 획도 병합해 이미지로 만들면 혼색을 쓸 수 있어요.",
      },
      {
        title: "섞으며 칠하기",
        body: "칠할수록 바닥색이 붓에 묻어 자연스럽게 섞여요. 옵션에서 묻힘·안료 양을 조절합니다.",
      },
      {
        title: "한 획씩 확인",
        body: "한 획이 실행취소 한 번이에요. 과감하게 칠하고 ⌘Z 로 되돌리며 감을 잡아 보세요.",
      },
    ],
  },
  {
    id: "dual-brush",
    category: "drawing",
    title: "듀얼 브러시",
    summary: "두 브러시 팁을 겹쳐 종이·수채 같은 복합 질감을 만들어요.",
    badge: "듀",
    tryAction: "brush",
    tryLabel: "브러시 열기",
    steps: [
      {
        title: "브러시 스튜디오 열기",
        body: "그리기 옵션의 브러시 목록에서 브러시 스튜디오로 들어가요.",
      },
      {
        title: "듀얼 브러시 켜기",
        body: "듀얼 브러시 사용을 켜고 2차 팁과 합성 모드를 골라요. 2차 팁이 1차 팁의 질감을 변조합니다.",
      },
      {
        title: "미리보고 저장",
        body: "미리보기 획을 보며 크기·간격을 다듬고, 마음에 들면 프리셋으로 저장해 두세요.",
        tip: "합성 모드만 바꿔도 분위기가 크게 달라져요.",
      },
    ],
  },
  {
    id: "sketch-shape",
    category: "drawing",
    title: "스케치 도형",
    summary: "도형을 손으로 그린 듯 흔들리는 선(rough.js)으로 바꿔요.",
    badge: "낙",
    steps: [
      {
        title: "도형 선택",
        body: "사각형·타원 같은 도형을 캔버스에 그린 뒤 선택 도구로 골라요.",
      },
      {
        title: "손그림 스케치 켜기",
        body: "속성 패널의 선·도형 스타일에서 손그림 스케치를 켜요.",
      },
      {
        title: "거칠기 조절",
        body: "거칠기·휘어짐과 채우기 질감(해칭 등)을 조절해 콘티나 낙서 느낌을 맞춰요.",
        tip: "콘티 단계에서 켜 두면 그림이 완성처럼 안 보여 부담이 줄어요.",
      },
    ],
  },
  {
    id: "special-rulers",
    category: "drawing",
    title: "특수 자 3종",
    summary: "평행선·동심원·방사선 자에 선을 스냅해 배경 선을 편하게 그어요.",
    badge: "자",
    tryAction: "pen",
    tryLabel: "펜 켜기",
    steps: [
      {
        title: "자 추가",
        body: "펜 모드에서 아무것도 선택하지 않으면 보이는 그리기 도구 설정에서 평행선·동심원·방사선 자를 추가해요.",
      },
      {
        title: "기준 맞추기",
        body: "각도·중심점을 장면에 맞게 옮겨요. 자는 여러 개 표시할 수 있고 스냅은 하나만 적용됩니다.",
      },
      {
        title: "스냅해서 긋기",
        body: "활성 자를 켠 채 선을 그으면 가이드를 따라 스냅돼요. 빗줄기·스피드선·집중선에 좋아요.",
      },
    ],
  },
  {
    id: "dodge-burn",
    category: "adjustments",
    title: "닷지/번/스펀지",
    summary: "브러시로 문질러 밝기와 채도를 부분 보정해요.",
    badge: "닷",
    tryAction: "dodge-burn",
    tryLabel: "닷지/번 켜기",
    steps: [
      {
        title: "이미지에서 켜기",
        body: "보정할 이미지 레이어를 고른 뒤 도구막대의 닷지/번을 누르거나 O 를 눌러요.",
      },
      {
        title: "모드 고르기",
        body: "닷지는 밝게, 번은 어둡게, 스펀지는 채도를 올리거나 내려요. 범위(섀도우·미드톤·하이라이트)도 고를 수 있어요.",
      },
      {
        title: "약하게 여러 번",
        body: "노출을 낮게 두고 여러 번 문지르는 편이 자연스러워요. 한 획이 실행취소 한 번입니다.",
        tip: "볼 터치·역광 림라이트처럼 좁은 영역부터 시도해 보세요.",
      },
    ],
  },
  {
    id: "quick-mask",
    category: "adjustments",
    title: "퀵 마스크",
    summary: "선택 영역을 브러시로 칠해 다듬는 포토샵식 Q 모드예요.",
    badge: "Q",
    tryAction: "quick-mask",
    tryLabel: "퀵 마스크 시작",
    steps: [
      {
        title: "Q 로 진입",
        body: "이미지 레이어를 고르고 Q 를 눌러요. 현재 픽셀 선택이 색 오버레이(마스크)로 바뀝니다.",
        tip: "선택·리터치 탭의 퀵 마스크 패널에서도 시작할 수 있어요.",
      },
      {
        title: "칠해서 다듬기",
        body: "브러시로 칠하면 선택에 더해지고, 지우기 모드로 칠하면 빠져요. 반전도 한 번에 됩니다.",
      },
      {
        title: "선택 영역으로 완료",
        body: "다시 Q 를 누르면 다듬은 마스크가 픽셀 선택으로 바뀌어요. 부드러운 가장자리는 페더로 보존됩니다.",
      },
    ],
  },
  {
    id: "color-range",
    category: "adjustments",
    title: "색상 범위 선택",
    summary: "비슷한 색 픽셀을 한 번에 선택 영역으로 잡아요.",
    badge: "색",
    steps: [
      {
        title: "선택·리터치 탭 열기",
        body: "이미지 레이어를 고르고 속성의 선택·리터치 탭에서 색상 범위 섹션을 찾아요.",
      },
      {
        title: "기준 색과 허용치",
        body: "기준 색을 고르고 허용치를 조절하면 미리보기로 선택될 영역이 보여요.",
      },
      {
        title: "선택 적용",
        body: "적용하면 현재 결합 모드(새 선택·합치기·빼기)에 맞춰 픽셀 선택이 만들어져요. 이어서 색 보정이나 삭제를 하면 됩니다.",
        tip: "하늘·머리카락처럼 색이 뚜렷한 영역에 특히 잘 맞아요.",
      },
    ],
  },
  {
    id: "bubble",
    category: "dialogue",
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
    category: "dialogue",
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
    category: "composition",
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
    category: "composition",
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
    id: "path-boolean",
    category: "composition",
    title: "도형 결합",
    summary: "도형 두 개를 합치기·빼기·교집합으로 한 도형으로 만들어요.",
    badge: "합",
    steps: [
      {
        title: "도형 2개 선택",
        body: "합칠 도형 두 개를 드래그나 Shift+클릭으로 함께 선택해요.",
      },
      {
        title: "연산 고르기",
        body: "속성 패널의 도형 결합에서 합치기·빼기·교집합·나누기를 골라요.",
      },
      {
        title: "결과 다듬기",
        body: "결합된 도형은 하나의 패스가 됩니다. 마음에 안 들면 ⌘Z 로 되돌리고 다시 시도해요.",
        tip: "말풍선 실루엣이나 간판 같은 복합 도형을 만들 때 편해요.",
      },
    ],
  },
  {
    id: "character",
    category: "threed",
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
    category: "threed",
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
    id: "mannequin",
    category: "threed",
    title: "3D 데생 인형",
    summary: "관절 인형으로 포즈를 잡아 인체 밑그림으로 넣어요.",
    badge: "인",
    tryAction: "mannequin",
    tryLabel: "데생 인형 열기",
    steps: [
      {
        title: "데생 인형 열기",
        body: "도구 모음에서 3D 데생 인형을 열어요. 회전·확대는 3D 캐릭터와 같은 조작이에요.",
      },
      {
        title: "포즈 잡기",
        body: "관절을 끌어 동작을 만들거나 포즈 프리셋에서 시작해요. 비율 슬라이더로 체형도 바꿀 수 있어요.",
      },
      {
        title: "밑그림으로 삽입",
        body: "캔버스에 삽입한 뒤 불투명도를 낮추고 위에 선을 얹으면 인체 데생 가이드가 됩니다.",
        tip: "어려운 앵글일수록 인형을 먼저 돌려 보고 그리면 빨라요.",
      },
    ],
  },
  {
    id: "room-builder",
    category: "threed",
    title: "방 만들기",
    summary: "치수를 바꿔 가며 방 구조를 빠르게 블로킹해요.",
    badge: "방",
    tryAction: "bg3d",
    tryLabel: "3D 배경 열기",
    steps: [
      {
        title: "방 만들기 열기",
        body: "3D 배경에서 방 만들기를 골라요. 바닥·벽이 있는 기본 방이 준비됩니다.",
      },
      {
        title: "치수와 개구부",
        body: "가로·세로·높이와 문·창 위치를 조절해요. 값을 바꾸면 방이 즉시 다시 지어져요.",
      },
      {
        title: "장면에 추가",
        body: "장면에 추가하면 가구·소품을 배치할 수 있어요. 태양 리그·조명으로 시간대 분위기도 잡아 보세요.",
      },
    ],
  },
  {
    id: "ai-assist",
    category: "aiExport",
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
    category: "aiExport",
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
  {
    id: "gif-export",
    category: "aiExport",
    title: "GIF·APNG 내보내기",
    summary: "프레임 애니메이션을 어디서나 재생되는 움짤 파일로 저장해요.",
    badge: "움",
    tryAction: "frame-anim",
    tryLabel: "프레임 애니 열기",
    steps: [
      {
        title: "프레임 만들기",
        body: "이미지 레이어를 고르고 프레임 애니 패널에서 프레임을 쌓아 짧은 셀 애니를 만들어요.",
      },
      {
        title: "형식 고르기",
        body: "내보내기에서 GIF 또는 APNG 를 골라요. GIF 는 어디서나 재생되고, APNG 는 화질이 더 좋아요.",
      },
      {
        title: "저장하고 공유",
        body: "속도·반복을 확인하고 저장하면 바로 공유할 수 있는 애니메이션 파일이 나와요.",
        tip: "커뮤니티 업로드용은 GIF, 화질 보존용은 APNG 가 무난해요.",
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
