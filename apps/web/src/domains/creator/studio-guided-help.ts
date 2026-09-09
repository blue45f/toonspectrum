/**
 * Authored, offline-first help graph for the Studio.
 *
 * Command search answers “where is it?” and tutorials answer “show me the whole
 * workflow”. This graph fills the missing middle: what the current tool does,
 * the shortest safe path to a visible result, and how to recover when that path
 * does not work. Every article names only UI and behaviour that exists in the
 * product; execution stays with the command registry and StudioPage handlers.
 */

import {
  normalizeStudioSearchText,
  tokenizeStudioSearchQuery,
} from "./studio-search-text";

import type { StudioHelpCenterSection } from "./studio-help-center-channel";

export type StudioGuidedHelpCategory =
  | "start"
  | "drawing"
  | "selection"
  | "adjustment"
  | "workflow"
  | "recovery";

export interface StudioGuidedHelpStep {
  readonly title: string;
  readonly body: string;
}

export interface StudioGuidedHelpProblem {
  readonly title: string;
  readonly cause: string;
  readonly fix: string;
}

export type StudioGuidedHelpAction =
  | Readonly<{
      type: "command-search";
      label: string;
    }>
  | Readonly<{
      type: "support";
      label: string;
      section: Exclude<StudioHelpCenterSection, "current-tool">;
    }>
  | Readonly<{
      type: "manual";
      label: string;
    }>;

export interface StudioGuidedHelpArticle {
  readonly id: string;
  readonly commandId?: string;
  readonly category: StudioGuidedHelpCategory;
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly outcome: string;
  readonly steps: readonly StudioGuidedHelpStep[];
  readonly checks?: readonly string[];
  readonly tips?: readonly string[];
  readonly problems: readonly StudioGuidedHelpProblem[];
  readonly aliases: readonly string[];
  readonly relatedIds?: readonly string[];
  readonly tutorialIds?: readonly string[];
  readonly primaryAction: StudioGuidedHelpAction;
  readonly featured?: boolean;
}

export interface StudioGuidedHelpIntent {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly articleId: string;
}

const toolAction = (): StudioGuidedHelpAction => ({
  type: "command-search",
  label: "F1에서 기능·설정 찾기",
});

const ARTICLES: readonly StudioGuidedHelpArticle[] = [
  {
    id: "workflow.find-feature",
    category: "start",
    title: "기능·설정 찾기",
    eyebrow: "가장 빠른 출발점",
    summary: "메뉴를 외우지 않아도 F1 검색에서 기능, 설정, 패널, 튜토리얼을 한 번에 찾습니다.",
    outcome: "원하는 항목의 실제 위치와 현재 실행 가능 여부를 확인하고 바로 이동합니다.",
    steps: [
      { title: "F1 누르기", body: "캔버스에 포커스가 있어도 기능·설정 찾기가 열립니다." },
      { title: "익숙한 말로 검색", body: "ToonStudio 이름뿐 아니라 CSP·Photoshop·Krita·Procreate에서 쓰던 용어도 입력할 수 있습니다." },
      { title: "배지 확인 후 열기", body: "실행·이동·튜토리얼·도움말 배지가 실제 연결 상태를 알려 줍니다. Enter는 표시된 동작만 수행합니다." },
    ],
    checks: ["텍스트를 편집 중일 때는 F1을 가로채지 않습니다.", "범위를 좁혔다가 결과가 없으면 전체 범위 결과 수를 안내합니다."],
    tips: ["기능 이름보다 ‘밝게’, ‘선택’, ‘배경 지우기’처럼 하고 싶은 결과로 검색해도 좋습니다."],
    problems: [
      { title: "검색 결과가 너무 적어요", cause: "현재 패널 범위로 좁혀져 있을 수 있습니다.", fix: "범위를 ‘전체’로 바꾸거나 표시되는 ‘전체에서 보기’를 누르세요." },
      { title: "항목이 ‘사용 불가’예요", cause: "선택 대상이나 현재 편집 상태가 그 명령의 조건을 충족하지 않습니다.", fix: "행의 사유를 확인하고 캔버스에서 대상을 선택하거나 진행 중 동작을 끝낸 뒤 다시 시도하세요." },
    ],
    aliases: ["검색", "명령 팔레트", "command palette", "actions", "quick actions", "도구 찾기"],
    relatedIds: ["workflow.shortcuts", "workflow.recovery"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "workflow.shortcuts",
    category: "start",
    title: "단축키를 부담 없이 익히기",
    eyebrow: "작업 흐름 유지",
    summary: "전체 표를 외우기보다 지금 자주 쓰는 도구와 기본 조작부터 검색해 확인합니다.",
    outcome: "펜·지우개·되돌리기·화면 이동처럼 반복 작업을 손이 기억하게 만듭니다.",
    steps: [
      { title: "? 키로 단축키 열기", body: "기능 이름이나 키를 검색할 수 있는 단축키 도움말이 열립니다." },
      { title: "기본 조작부터 확인", body: "선택과 이동, 화면 이동과 확대, 취소와 되돌리기처럼 편집기 공통 조작부터 익힙니다." },
      { title: "사용자 설정과 함께 보기", body: "앱 설정에서 바꾼 단축키가 있으면 도움말에도 바뀐 키가 표시됩니다." },
    ],
    tips: ["그리기 중에는 B·E·[·]·⌘Z 네 가지부터 익혀도 체감 속도가 크게 달라집니다."],
    problems: [
      { title: "표시된 키와 키보드가 달라요", cause: "운영체제나 키보드 배열에 따라 기호 위치가 다를 수 있습니다.", fix: "앱 설정의 단축키에서 현재 배치를 확인하고 충돌이 있으면 원하는 키로 다시 지정하세요." },
    ],
    aliases: ["shortcut", "keyboard", "핫키", "키보드", "?"],
    relatedIds: ["workflow.find-feature", "tool.pen"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "tool.pen",
    commandId: "tool.pen",
    category: "drawing",
    title: "펜으로 선 그리기",
    eyebrow: "현재 도구 가이드",
    summary: "브러시 프리셋, 굵기, 불투명도, 필압과 안정화를 조합해 자유선을 그립니다.",
    outcome: "손을 떼면 한 획이 저장되고, 바로 다음 획을 이어 그릴 수 있습니다.",
    steps: [
      { title: "펜 선택", body: "도구막대에서 펜을 고르거나 B 키를 누릅니다." },
      { title: "굵기와 농도 맞추기", body: "하단 그리기 옵션에서 브러시 크기와 불투명도를 조절합니다. [ 와 ] 키로 크기를 빠르게 바꿀 수 있습니다." },
      { title: "짧은 시험선 긋기", body: "캔버스 가장자리에서 짧게 그어 필압과 안정화를 확인한 뒤 본선을 그립니다." },
    ],
    checks: ["선택한 레이어가 잠겨 있지 않은지 확인하세요.", "필압이 필요하면 브라우저가 펜 입력을 받고 있는지 확인하세요."],
    tips: ["떨림은 안정화를 조금씩 올려 잡고, 지나치게 높여 생기는 지연감은 다시 낮춰 균형을 맞추세요.", "X 키로 주 색과 보조 색을 바꿀 수 있습니다."],
    problems: [
      { title: "선이 그려지지 않아요", cause: "레이어 잠금, 선택 영역, 투명한 색, 또는 입력 차단 상태일 수 있습니다.", fix: "레이어 잠금과 선택 영역을 확인하고, 현재 색의 불투명도를 올린 뒤 짧은 선으로 다시 시험하세요." },
      { title: "선이 너무 늦게 따라와요", cause: "안정화 값이나 고비용 브러시 엔진 설정이 현재 기기보다 높을 수 있습니다.", fix: "안정화를 낮추고 단순한 프리셋으로 비교한 뒤 필요한 질감 옵션을 하나씩 다시 켜세요." },
    ],
    aliases: ["brush", "브러시", "붓", "ink", "연필", "pencil"],
    relatedIds: ["tool.eraser", "tool.eyedropper", "workflow.brush-studio"],
    tutorialIds: ["pen", "brush"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "tool.eraser",
    commandId: "tool.eraser",
    category: "drawing",
    title: "지우개로 안전하게 다듬기",
    eyebrow: "현재 도구 가이드",
    summary: "현재 획이나 이미지의 필요한 부분을 브러시 크기와 농도에 맞춰 지웁니다.",
    outcome: "손을 뗀 한 획마다 되돌릴 수 있는 지우기 결과가 남습니다.",
    steps: [
      { title: "지우개 선택", body: "도구막대에서 지우개를 고르거나 E 키를 누릅니다." },
      { title: "선보다 조금 크게 맞추기", body: "[ 와 ] 키 또는 그리기 옵션으로 지우개 크기를 맞춥니다." },
      { title: "짧게 나누어 지우기", body: "긴 한 번보다 짧은 획으로 나누면 실수를 ⌘Z로 부분적으로 되돌리기 쉽습니다." },
    ],
    tips: ["다시 그리려면 B 키로 펜에 바로 돌아갈 수 있습니다.", "부드러운 경계는 낮은 불투명도와 필압을 함께 사용하세요."],
    problems: [
      { title: "지웠는데 다시 보여요", cause: "겹친 다른 레이어의 선을 보고 있거나 비파괴 마스크를 편집 중일 수 있습니다.", fix: "레이어 패널에서 눈 아이콘을 하나씩 꺼 실제 대상 레이어를 확인하세요." },
    ],
    aliases: ["erase", "rubber", "삭제", "지우기"],
    relatedIds: ["tool.pen", "workflow.layers"],
    tutorialIds: ["eraser"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "tool.pixel-pen",
    commandId: "tool.pixel-pen",
    category: "drawing",
    title: "픽셀 펜으로 또렷하게 찍기",
    eyebrow: "현재 도구 가이드",
    summary: "안티앨리어싱 없이 문서의 정수 픽셀 셀을 채워 도트와 픽셀 아트를 만듭니다.",
    outcome: "확대해도 가장자리가 흐려지지 않는 셀 단위 획이 만들어집니다.",
    steps: [
      { title: "픽셀 펜 선택", body: "도구막대에서 픽셀 펜을 고르고 작업 영역을 충분히 확대합니다." },
      { title: "셀 크기 확인", body: "100% 이상 확대해 한 칸이 실제 문서 픽셀에 맞는지 확인합니다." },
      { title: "짧은 획으로 형태 만들기", body: "모서리와 대각선은 한 칸씩 확인하며 찍고, 큰 면은 채우기 도구와 함께 사용합니다." },
    ],
    checks: ["부드러운 브러시가 아니라 픽셀 펜 렌더 모드인지 확인하세요."],
    tips: ["픽셀 작업은 캔버스 회전이나 비정수 배율에서 모양을 오해하기 쉬우므로 100% 배율로 자주 확인하세요."],
    problems: [
      { title: "가장자리가 흐려 보여요", cause: "보기 배율이 비정수이거나 브라우저 스케일링이 적용됐을 수 있습니다.", fix: "캔버스를 100% 또는 정수 배율로 맞추고 결과를 다시 확인하세요." },
    ],
    aliases: ["pixel", "도트 펜", "pencil tool", "pixel brush", "도트"],
    relatedIds: ["tool.fill", "workflow.layers"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.fill",
    commandId: "tool.fill",
    category: "drawing",
    title: "닫힌 영역 색 채우기",
    eyebrow: "현재 도구 가이드",
    summary: "선 안쪽을 찾아 한 번에 색칠하고, 허용치·틈 닫기·참조 범위로 경계를 조절합니다.",
    outcome: "클릭한 지점과 연결된 영역이 현재 색으로 채워집니다.",
    steps: [
      { title: "채우기 선택", body: "도구막대에서 채우기를 고르거나 G 키를 누릅니다." },
      { title: "경계 조건 맞추기", body: "선이 끊겼다면 틈 닫기를 올리고, 비슷한 색까지 포함하려면 허용치를 조금씩 조절합니다." },
      { title: "영역 안쪽 클릭", body: "경계선이 아닌 면 안쪽을 누르고 결과를 확인합니다. 새면 ⌘Z 후 값을 한 단계씩 바꿉니다." },
    ],
    checks: ["픽셀 선택이 있으면 그 안에서만 채워집니다.", "여러 레이어의 선을 경계로 쓸 때는 참조 범위를 확인하세요."],
    tips: ["작은 틈 하나 때문에 전체가 새면 허용치를 크게 올리기보다 틈 닫기를 먼저 조절하세요."],
    problems: [
      { title: "페이지 전체가 칠해졌어요", cause: "경계선이 열려 있거나 현재 참조 범위에서 선을 보지 못했습니다.", fix: "⌘Z로 되돌린 뒤 틈 닫기와 참조 레이어를 확인하고 선 안쪽에서 다시 클릭하세요." },
      { title: "가장자리에 흰 테두리가 남아요", cause: "채움 확장이나 허용치가 선 아래까지 닿지 못했습니다.", fix: "채움 확장을 조금 올리고 작은 구역에서 결과를 비교하세요." },
    ],
    aliases: ["paint bucket", "bucket", "페인트 버킷", "버킷", "flood fill", "색칠"],
    relatedIds: ["tool.pixel-pen", "tool.lasso", "workflow.layers"],
    tutorialIds: ["fill"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "tool.smart-shape",
    commandId: "tool.smart-shape",
    category: "drawing",
    title: "스마트 도형으로 선 정리하기",
    eyebrow: "현재 도구 가이드",
    summary: "손으로 그린 선·원·사각형·삼각형을 획 끝의 멈춤으로 감지해 단정하게 다듬습니다.",
    outcome: "손맛은 유지하면서 인식된 도형의 외곽이 정리됩니다.",
    steps: [
      { title: "스마트 도형 켜기", body: "펜 도구를 선택한 뒤 그리기 옵션에서 스마트 도형을 켭니다." },
      { title: "한 획으로 그리기", body: "원이나 사각형을 가능한 한 닫힌 한 획으로 그리고 시작점 근처까지 이어 줍니다." },
      { title: "끝에서 잠깐 멈추기", body: "손을 떼기 전에 획 끝에서 잠깐 멈춰 미리보기를 확인한 뒤 놓습니다." },
    ],
    tips: ["인식이 불안하면 크기를 키우고 꼭짓점 방향을 또렷하게 꺾어 보세요."],
    problems: [
      { title: "그냥 자유선으로 남아요", cause: "끝에서 머문 시간이 짧거나 모양이 열린 상태일 수 있습니다.", fix: "끝점을 시작점 가까이 가져오고 미리보기가 나타날 때까지 잠깐 멈추세요." },
    ],
    aliases: ["QuickShape", "auto draw", "도형 보정", "shape recognition", "스마트 셰이프"],
    relatedIds: ["tool.pen", "workflow.comic-layout"],
    tutorialIds: ["smart-shape"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.eyedropper",
    commandId: "tool.eyedropper",
    category: "drawing",
    title: "캔버스에서 색 가져오기",
    eyebrow: "현재 도구 가이드",
    summary: "보이는 캔버스의 색을 집어 현재 그리기 색으로 사용합니다.",
    outcome: "선택한 지점의 색이 주 색에 반영되어 바로 그릴 수 있습니다.",
    steps: [
      { title: "색 가져오기 선택", body: "도구막대에서 스포이드 도구를 고르거나 펜 사용 중 임시 색 가져오기 키를 누릅니다." },
      { title: "원하는 지점 누르기", body: "혼합된 가장자리보다 대표 색이 분명한 면 안쪽을 클릭합니다." },
      { title: "주 색 확인", body: "색상 표시가 바뀌었는지 확인하고 펜으로 돌아가 시험선을 긋습니다." },
    ],
    tips: ["Alt를 누른 채 클릭하면 펜 흐름을 끊지 않고 잠깐 색을 가져올 수 있습니다."],
    problems: [
      { title: "원하는 색보다 탁해요", cause: "반투명 가장자리나 위 레이어가 합성된 색을 집었을 수 있습니다.", fix: "불투명한 면 안쪽을 다시 찍거나 레이어 표시를 잠깐 정리해 원본 색을 확인하세요." },
    ],
    aliases: ["eyedropper", "color picker", "스포이드", "색상 추출", "sample color"],
    relatedIds: ["tool.pen", "tool.wet-mix"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.select",
    commandId: "tool.select",
    category: "selection",
    title: "객체 선택하고 옮기기",
    eyebrow: "현재 도구 가이드",
    summary: "캔버스 요소를 고른 뒤 이동, 크기 변경, 정렬 같은 후속 편집의 대상을 정합니다.",
    outcome: "선택 테두리와 핸들이 나타나고 인스펙터가 그 요소의 속성으로 바뀝니다.",
    steps: [
      { title: "선택 도구 켜기", body: "도구막대에서 선택을 고르거나 V 키를 누릅니다." },
      { title: "요소 클릭 또는 범위 드래그", body: "한 요소는 클릭하고, 여러 요소는 빈 곳에서 드래그해 둘러쌉니다." },
      { title: "이동·크기 변경", body: "선택 안쪽을 드래그해 옮기고, 테두리 핸들로 크기를 조절합니다." },
    ],
    checks: ["잠긴 레이어의 요소는 선택·이동이 제한될 수 있습니다."],
    tips: ["Shift를 누른 채 클릭하면 기존 선택에 요소를 더할 수 있습니다."],
    problems: [
      { title: "뒤의 요소가 계속 선택돼요", cause: "겹친 요소의 쌓임 순서나 투명 영역 때문에 포인터 대상이 달라질 수 있습니다.", fix: "레이어 패널에서 원하는 요소를 직접 고르거나 다른 요소를 잠시 숨긴 뒤 다시 선택하세요." },
    ],
    aliases: ["move tool", "selection", "선택 도구", "오브젝트 선택", "이동"],
    relatedIds: ["tool.transform", "workflow.layers"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "tool.transform",
    commandId: "tool.transform",
    category: "selection",
    title: "변형으로 크기와 방향 바꾸기",
    eyebrow: "현재 도구 가이드",
    summary: "선택한 대상의 크기, 위치, 회전 또는 변형을 미리본 뒤 확정합니다.",
    outcome: "확정 전에는 미리보기로 조정하고, 확정 후에도 되돌리기로 이전 상태에 돌아갈 수 있습니다.",
    steps: [
      { title: "대상 선택", body: "먼저 선택 도구나 레이어 패널에서 바꿀 요소를 고릅니다." },
      { title: "변형 시작", body: "변형 도구를 켜고 모서리·회전 핸들을 드래그합니다." },
      { title: "확정 또는 취소", body: "결과가 맞으면 확인하고, 원치 않으면 Esc로 현재 변형을 취소합니다." },
    ],
    tips: ["큰 변형 전에는 원본 레이어를 복제하거나 비파괴 변형 경로가 있는지 먼저 확인하세요."],
    problems: [
      { title: "변형 핸들이 보이지 않아요", cause: "선택된 대상이 없거나 현재 도구가 다른 입력을 소유하고 있을 수 있습니다.", fix: "Esc로 진행 중 동작을 끝내고 요소를 다시 선택한 뒤 변형을 시작하세요." },
    ],
    aliases: ["free transform", "scale", "rotate", "warp", "크기 변경", "회전"],
    relatedIds: ["tool.select", "tool.crop", "tool.liquify"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.crop",
    commandId: "tool.crop",
    category: "selection",
    title: "캔버스 자르기",
    eyebrow: "현재 도구 가이드",
    summary: "남길 영역을 프레임으로 지정해 문서의 보이는 범위를 정리합니다.",
    outcome: "확정한 프레임을 기준으로 캔버스 범위가 바뀌며, 직후에는 되돌릴 수 있습니다.",
    steps: [
      { title: "자르기 시작", body: "자르기 도구를 선택하고 캔버스에서 남길 범위를 드래그합니다." },
      { title: "모서리 미세 조정", body: "핸들을 움직여 여백과 구도를 맞추고, 중요한 말풍선과 재단 여백을 확인합니다." },
      { title: "확정 전 전체 확인", body: "페이지 가장자리와 숨은 요소를 확인한 뒤 자르기를 확정합니다." },
    ],
    checks: ["원고 규격과 출력 여백이 정해져 있다면 자르기 전에 치수를 확인하세요."],
    tips: ["구도 실험은 원본 문서를 복제한 뒤 진행하면 비교와 복구가 쉽습니다."],
    problems: [
      { title: "필요한 요소까지 잘렸어요", cause: "숨은 레이어나 페이지 바깥 요소를 확인하지 못했을 수 있습니다.", fix: "바로 ⌘Z로 되돌린 뒤 레이어와 전체 보기를 확인하고 프레임을 다시 잡으세요." },
    ],
    aliases: ["crop", "trim", "재단", "캔버스 크롭"],
    relatedIds: ["tool.transform", "workflow.export"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.hand",
    commandId: "tool.hand",
    category: "start",
    title: "화면만 이동하기",
    eyebrow: "현재 도구 가이드",
    summary: "작품 요소를 건드리지 않고 캔버스 보기를 이동해 다른 영역으로 갑니다.",
    outcome: "문서 내용은 바뀌지 않고 화면의 중심만 이동합니다.",
    steps: [
      { title: "핸드 도구 또는 Space", body: "핸드 도구를 고르거나 다른 도구를 쓰는 중 Space를 누릅니다." },
      { title: "캔버스 드래그", body: "보고 싶은 방향의 반대로 캔버스를 끌어 화면을 이동합니다." },
      { title: "작업 도구로 복귀", body: "Space에서 손을 떼면 이전 도구로 돌아가 이어서 작업합니다." },
    ],
    tips: ["화면 맞춤과 100% 보기를 함께 쓰면 길을 잃었을 때 빠르게 기준을 되찾을 수 있습니다."],
    problems: [
      { title: "요소가 움직였어요", cause: "핸드가 아니라 선택 도구로 드래그했을 수 있습니다.", fix: "⌘Z로 되돌린 뒤 Space를 누른 상태인지 확인하고 다시 이동하세요." },
    ],
    aliases: ["pan", "hand tool", "화면 이동", "캔버스 이동", "space drag"],
    relatedIds: ["workflow.shortcuts", "tool.select"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.marquee-rect",
    commandId: "tool.marquee-rect",
    category: "selection",
    title: "사각형 픽셀 선택",
    eyebrow: "현재 도구 가이드",
    summary: "이미지에서 직사각형 범위만 골라 보정, 삭제, 이동, 채우기의 대상을 제한합니다.",
    outcome: "점선 선택 경계 안쪽에만 후속 픽셀 작업이 적용됩니다.",
    steps: [
      { title: "사각 선택 고르기", body: "픽셀 선택 도구에서 사각형 방식을 선택합니다." },
      { title: "한 모서리에서 반대편으로 드래그", body: "필요한 영역보다 약간 넉넉하게 잡은 뒤 추가·빼기로 다듬습니다." },
      { title: "선택 범위 안에서 작업", body: "보정이나 채우기를 적용하고, 끝나면 선택 해제로 제한을 풉니다." },
    ],
    tips: ["선택이 남아 있으면 이후 작업도 계속 제한되므로 작업이 끝나면 선택 경계를 확인하세요."],
    problems: [
      { title: "캔버스 일부에만 그려져요", cause: "이전에 만든 픽셀 선택이 아직 남아 있을 수 있습니다.", fix: "선택 해제를 실행하고 캔버스 전체에서 다시 시험하세요." },
    ],
    aliases: ["rectangular marquee", "사각 선택", "marquee", "영역 선택"],
    relatedIds: ["tool.marquee-ellipse", "tool.lasso", "select.quick-mask"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.marquee-ellipse",
    commandId: "tool.marquee-ellipse",
    category: "selection",
    title: "원형 픽셀 선택",
    eyebrow: "현재 도구 가이드",
    summary: "타원이나 원형 범위를 골라 그 안에만 픽셀 작업을 적용합니다.",
    outcome: "타원형 점선 경계 안쪽이 후속 작업의 대상이 됩니다.",
    steps: [
      { title: "원형 선택 고르기", body: "픽셀 선택 도구에서 원형 방식을 선택합니다." },
      { title: "바깥 상자를 그리듯 드래그", body: "타원이 들어갈 직사각형의 한 모서리에서 반대편으로 드래그합니다." },
      { title: "추가·빼기로 다듬기", body: "필요하면 선택 모드를 바꿔 작은 영역을 더하거나 뺍니다." },
    ],
    tips: ["정원에 가깝게 만들 때는 비율 고정 보조키나 속성 옵션을 확인하세요."],
    problems: [
      { title: "원이 원하는 위치에서 시작하지 않아요", cause: "드래그 시작점은 원의 중심이 아니라 바깥 상자의 모서리일 수 있습니다.", fix: "원 전체를 감싸는 사각형을 상상하고 왼쪽 위에서 오른쪽 아래로 다시 드래그하세요." },
    ],
    aliases: ["elliptical marquee", "원형 선택", "타원 선택", "ellipse selection"],
    relatedIds: ["tool.marquee-rect", "tool.lasso"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.lasso",
    commandId: "tool.lasso",
    category: "selection",
    title: "올가미로 자유롭게 선택",
    eyebrow: "현재 도구 가이드",
    summary: "고칠 부분의 둘레를 손으로 그려 불규칙한 영역을 픽셀 선택으로 만듭니다.",
    outcome: "그린 외곽선 안쪽에만 보정, 삭제, 채우기 같은 작업이 적용됩니다.",
    steps: [
      { title: "올가미 선택", body: "픽셀 선택 도구에서 올가미를 고릅니다." },
      { title: "대상 둘레를 한 바퀴 그리기", body: "시작점으로 돌아오도록 외곽을 그리고 손을 뗍니다." },
      { title: "경계 확인 후 작업", body: "빠진 곳은 더하기, 넘친 곳은 빼기 모드로 다듬고 원하는 작업을 적용합니다." },
    ],
    tips: ["정확한 모서리는 다각형 올가미가 더 빠르고, 부드러운 형태는 자유 올가미가 편합니다."],
    problems: [
      { title: "선택이 반대로 되었어요", cause: "선택 반전이 켜져 있거나 이전 선택과 결합됐을 수 있습니다.", fix: "선택 해제 후 새 선택으로 다시 시작하거나 선택 반전을 한 번 실행해 확인하세요." },
    ],
    aliases: ["lasso", "자유 선택", "freehand selection", "올가미 선택"],
    relatedIds: ["tool.marquee-rect", "select.quick-mask", "tool.fill"],
    primaryAction: toolAction(),
  },
  {
    id: "select.quick-mask",
    commandId: "select.quick-mask",
    category: "selection",
    title: "퀵 마스크로 선택 영역 칠하기",
    eyebrow: "현재 도구 가이드",
    summary: "브러시로 마스크를 칠해 복잡한 픽셀 선택을 눈으로 보며 만들고 수정합니다.",
    outcome: "퀵 마스크를 끄면 칠한 결과가 일반 픽셀 선택 경계로 바뀝니다.",
    steps: [
      { title: "퀵 마스크 켜기", body: "선택 메뉴 또는 Q 키로 퀵 마스크 모드에 들어갑니다." },
      { title: "브러시로 범위 칠하기", body: "선택에 포함하거나 제외할 부분을 마스크 표시를 보며 칠합니다." },
      { title: "Q로 선택 경계 변환", body: "다시 Q를 눌러 일반 선택으로 돌아가고 경계를 확인합니다." },
    ],
    checks: ["퀵 마스크 표시 색은 실제 작품에 그려지는 색이 아닙니다."],
    tips: ["가장자리는 작은 브러시, 큰 면은 큰 브러시로 나누면 빠릅니다."],
    problems: [
      { title: "그림에 색을 칠한 것처럼 보여요", cause: "퀵 마스크의 반투명 표시를 작품 색으로 오해할 수 있습니다.", fix: "Q로 모드를 끄고 점선 선택 경계가 만들어졌는지 확인하세요." },
    ],
    aliases: ["quick mask", "quickmask", "마스크로 선택", "선택 칠하기"],
    relatedIds: ["tool.lasso", "tool.marquee-rect", "workflow.layers"],
    tutorialIds: ["quick-mask"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.smudge",
    commandId: "tool.smudge",
    category: "adjustment",
    title: "색 밀어 섞기",
    eyebrow: "현재 도구 가이드",
    summary: "새 색을 더하지 않고 이미 칠한 픽셀을 드래그 방향으로 밀어 경계를 부드럽게 섞습니다.",
    outcome: "손을 뗀 한 획이 이미지에 반영되고 획 단위로 되돌릴 수 있습니다.",
    steps: [
      { title: "이미지 대상 준비", body: "이미지를 선택하거나 색 밀어 섞기 도구를 켭니다. 벡터 획만 있으면 편집용 이미지 복사본이 준비될 수 있습니다." },
      { title: "크기와 강도 낮게 시작", body: "경계보다 조금 큰 브러시와 낮은 강도로 시험합니다." },
      { title: "섞고 싶은 방향으로 드래그", body: "색 경계를 짧게 밀고 손을 떼어 결과를 확인합니다." },
    ],
    tips: ["한 번에 강하게 문지르기보다 약한 획을 겹치면 형태와 명암을 지키기 쉽습니다."],
    problems: [
      { title: "전체가 뭉개져요", cause: "브러시가 너무 크거나 밀기 강도가 높을 수 있습니다.", fix: "⌘Z 후 크기와 강도를 절반 가까이 낮추고 짧은 획으로 다시 시도하세요." },
    ],
    aliases: ["smudge", "blend", "문지르기", "손가락 도구", "색 밀기"],
    relatedIds: ["tool.wet-mix", "tool.dodge-burn", "workflow.layers"],
    tutorialIds: ["smudge"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.wet-mix",
    commandId: "tool.wet-mix",
    category: "adjustment",
    title: "물감처럼 섞어 칠하기",
    eyebrow: "현재 도구 가이드",
    summary: "현재 색을 칠하면서 바닥색을 붓에 묻혀 함께 섞는 혼색 브러시입니다.",
    outcome: "새 색과 기존 색이 한 획 안에서 섞인 결과가 이미지에 반영됩니다.",
    steps: [
      { title: "이미지와 현재 색 준비", body: "칠할 이미지를 선택하고 섞을 새 색을 고릅니다." },
      { title: "칠하는 양과 색 줍기 맞추기", body: "바닥색 섞기와 색 줍기를 낮은 값에서 시작해 작은 시험 획을 만듭니다." },
      { title: "색 경계를 가로질러 칠하기", body: "새 색에서 바닥색 방향 또는 반대로 짧게 드래그하며 섞임을 확인합니다." },
    ],
    tips: ["깨끗한 색을 다시 묻히고 싶으면 색 줍기를 낮추거나 획을 새로 시작하세요."],
    problems: [
      { title: "원하는 새 색이 거의 안 보여요", cause: "바닥색 줍기나 섞기 값이 칠하는 양보다 높을 수 있습니다.", fix: "칠하는 양을 올리고 바닥색 섞기·색 줍기를 낮춘 뒤 비교하세요." },
    ],
    aliases: ["wet mix", "wet paint", "혼색", "물감 섞기", "색 섞기"],
    relatedIds: ["tool.smudge", "tool.eyedropper", "workflow.brush-studio"],
    tutorialIds: ["wet-mix"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.dodge-burn",
    commandId: "tool.dodge-burn",
    category: "adjustment",
    title: "밝기·어둡기·채도 부분 보정",
    eyebrow: "현재 도구 가이드",
    summary: "브러시로 문지른 부분만 밝게, 어둡게 또는 채도 보정해 명암과 시선을 다듬습니다.",
    outcome: "손을 뗀 획마다 선택한 보정이 이미지의 해당 부분에 반영됩니다.",
    steps: [
      { title: "대상 이미지 선택", body: "보정할 이미지를 고르고 닷지·번 계열 도구를 켭니다." },
      { title: "모드와 강도 정하기", body: "밝게·어둡게·채도 중 목적을 고르고 낮은 강도로 시작합니다." },
      { title: "한 방향으로 얇게 쌓기", body: "한 번에 강하게 바꾸지 말고 짧은 획을 여러 번 겹쳐 결과를 확인합니다." },
    ],
    tips: ["얼굴과 재질은 확대·축소를 오가며 전체 명암이 무너지지 않는지 확인하세요."],
    problems: [
      { title: "색이 회색이나 형광처럼 변해요", cause: "강도나 채도 모드가 과하게 누적됐을 수 있습니다.", fix: "⌘Z 후 강도를 낮추고 새 레이어 또는 복사본에서 더 약하게 쌓으세요." },
    ],
    aliases: ["dodge", "burn", "sponge", "닷지", "번", "밝게", "어둡게", "채도"],
    relatedIds: ["tool.smudge", "workflow.layers"],
    tutorialIds: ["dodge-burn"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.liquify",
    commandId: "tool.liquify",
    category: "adjustment",
    title: "리퀴파이로 형태 밀기",
    eyebrow: "현재 도구 가이드",
    summary: "이미지의 픽셀 형태를 브러시 방향으로 밀어 비율과 실루엣을 섬세하게 고칩니다.",
    outcome: "드래그한 주변 픽셀이 연속적으로 변형되어 형태가 조정됩니다.",
    steps: [
      { title: "대상 복사본 준비", body: "중요한 원본은 복제하거나 비파괴 편집 경로를 확인한 뒤 이미지를 선택합니다." },
      { title: "큰 브러시·낮은 강도로 시작", body: "수정 부위보다 넓은 브러시와 낮은 강도로 전체 형태부터 맞춥니다." },
      { title: "짧게 밀고 전체 보기", body: "한 번 밀 때마다 확대와 전체 보기를 오가며 실루엣을 확인합니다." },
    ],
    tips: ["작은 브러시로 여러 번 밀면 표면이 울기 쉬우므로 큰 흐름부터 고치세요."],
    problems: [
      { title: "선이 울퉁불퉁해졌어요", cause: "브러시가 너무 작거나 같은 자리를 여러 번 강하게 밀었을 수 있습니다.", fix: "되돌린 뒤 더 큰 브러시와 낮은 강도로 한두 번만 움직이세요." },
    ],
    aliases: ["liquify", "warp", "push", "형태 보정", "왜곡"],
    relatedIds: ["tool.transform", "workflow.layers"],
    primaryAction: toolAction(),
  },
  {
    id: "tool.comment",
    commandId: "tool.comment",
    category: "workflow",
    title: "캔버스에 댓글 핀 남기기",
    eyebrow: "현재 도구 가이드",
    summary: "검토가 필요한 위치에 핀을 놓고 맥락을 잃지 않도록 의견을 기록합니다.",
    outcome: "페이지의 특정 위치와 연결된 댓글 스레드가 만들어집니다.",
    steps: [
      { title: "댓글 도구 선택", body: "댓글 핀 배치 모드를 켭니다." },
      { title: "문제가 보이는 위치 클릭", body: "말풍선, 선화, 여백처럼 의견의 기준점이 분명한 곳에 핀을 놓습니다." },
      { title: "행동 가능한 문장으로 작성", body: "무엇이 문제인지와 원하는 결과를 함께 적고 댓글을 등록합니다." },
    ],
    tips: ["‘이상함’보다 ‘모바일에서 대사가 잘리므로 오른쪽 여백 12px 확보’처럼 확인 기준을 적으세요."],
    problems: [
      { title: "댓글 위치가 맥락과 어긋나요", cause: "확대 상태나 요소 이동 후 핀의 기준이 달라졌을 수 있습니다.", fix: "현재 페이지와 확대 상태를 확인하고 정확한 시각 기준점에 새 핀을 남기세요." },
    ],
    aliases: ["comment", "annotation", "피드백", "댓글 핀", "검수 의견"],
    relatedIds: ["workflow.export", "workflow.comic-layout"],
    primaryAction: toolAction(),
  },
  {
    id: "workflow.layers",
    category: "workflow",
    title: "레이어로 원본 지키기",
    eyebrow: "안전한 편집 흐름",
    summary: "선화, 채색, 말풍선, 보정을 분리해 실수를 되돌리고 수정 범위를 명확하게 유지합니다.",
    outcome: "원본을 직접 덮지 않고 각 작업을 독립적으로 숨기고 비교하고 수정할 수 있습니다.",
    steps: [
      { title: "역할별로 레이어 나누기", body: "선화·밑색·그림자·말풍선·효과를 구분하고 알아볼 수 있는 이름을 붙입니다." },
      { title: "그룹과 잠금 사용", body: "완료한 묶음은 그룹으로 정리하고 실수로 움직이면 안 되는 레이어는 잠급니다." },
      { title: "원본 보존 경로 선택", body: "보정 전 복제, 마스크, 스마트 필터처럼 되돌릴 수 있는 방식을 우선합니다." },
    ],
    checks: ["현재 선택 레이어와 잠금 상태를 편집 전마다 확인하세요."],
    tips: ["효과 이름보다 역할과 장면을 함께 적으면 긴 원고에서도 찾기 쉽습니다. 예: ‘03컷_인물_그림자’."],
    problems: [
      { title: "어느 레이어를 고쳐야 할지 모르겠어요", cause: "이름이 기본값이거나 요소가 여러 레이어에 흩어져 있을 수 있습니다.", fix: "눈 아이콘을 하나씩 꺼 보며 대상을 찾고, 찾은 즉시 역할 중심 이름과 그룹으로 정리하세요." },
    ],
    aliases: ["layer", "레이어 패널", "그룹", "마스크", "클리핑", "원본 보존"],
    relatedIds: ["tool.select", "tool.fill", "workflow.export"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "workflow.brush-studio",
    category: "workflow",
    title: "브러시 스튜디오에서 질감 만들기",
    eyebrow: "개인화 작업 흐름",
    summary: "팁, 간격, 산포, 질감, 필압, 혼색과 엔진 조합을 시험해 목적별 브러시를 만듭니다.",
    outcome: "미리보기로 비교한 설정을 재사용 가능한 브러시 프리셋으로 저장합니다.",
    steps: [
      { title: "가까운 프리셋에서 시작", body: "연필·잉크·마커·수채처럼 목표와 가장 가까운 기존 브러시를 복제합니다." },
      { title: "한 축씩 바꾸기", body: "팁과 간격, 질감, 필압, 혼색을 한 번에 모두 바꾸지 말고 미리보기에서 차이를 확인합니다." },
      { title: "실제 크기로 시험 후 저장", body: "원고 배율과 자주 쓰는 획 속도로 시험하고 목적이 드러나는 이름으로 저장합니다." },
    ],
    tips: ["질감이 강할수록 작은 화면에서는 뭉칠 수 있으므로 썸네일 크기에서도 확인하세요."],
    problems: [
      { title: "미리보기와 실제 획이 달라요", cause: "캔버스 배율, 필압, 속도, 바닥색 또는 렌더 엔진 조건이 다를 수 있습니다.", fix: "같은 크기·색·입력 장치로 비교하고 엔진과 후처리 옵션을 하나씩 끄며 원인을 좁히세요." },
    ],
    aliases: ["brush studio", "브러시 설정", "custom brush", "브러시 제작", "듀얼 브러시"],
    relatedIds: ["tool.pen", "tool.wet-mix", "workflow.shortcuts"],
    tutorialIds: ["brush", "dual-brush"],
    primaryAction: toolAction(),
  },
  {
    id: "workflow.lettering",
    category: "workflow",
    title: "말풍선과 대사 넣기",
    eyebrow: "만화 제작 흐름",
    summary: "대사를 먼저 구조화하고 말풍선 크기, 꼬리, 글자 위계를 함께 다듬습니다.",
    outcome: "읽는 순서와 화자가 분명한 대사 블록이 페이지에 배치됩니다.",
    steps: [
      { title: "대사 단위로 추가", body: "텍스트 또는 말풍선 도구에서 한 호흡의 대사를 하나의 블록으로 만듭니다." },
      { title: "읽는 순서에 맞춰 배치", body: "시선 흐름을 따라 말풍선을 놓고 인물과 중요한 그림을 가리지 않는지 확인합니다." },
      { title: "꼬리와 여백 다듬기", body: "꼬리 끝을 화자 쪽으로 향하게 하고 글자 주변의 안쪽 여백을 균일하게 맞춥니다." },
    ],
    tips: ["모바일 축소 보기에서 글자 크기와 말풍선 순서를 반드시 다시 확인하세요."],
    problems: [
      { title: "대사가 답답하거나 읽기 어려워요", cause: "한 풍선의 문장이 길거나 안쪽 여백과 줄 간격이 부족할 수 있습니다.", fix: "대사를 두 풍선으로 나누고 글자 크기보다 여백·행간을 먼저 조정해 보세요." },
    ],
    aliases: ["speech bubble", "balloon", "lettering", "대사", "텍스트", "말풍선"],
    relatedIds: ["workflow.comic-layout", "workflow.export"],
    tutorialIds: ["bubble", "dialogue"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "workflow.comic-layout",
    category: "workflow",
    title: "컷과 읽는 흐름 정리하기",
    eyebrow: "만화 제작 흐름",
    summary: "컷 크기, 여백, 시선 방향과 대사 순서를 함께 보며 페이지 리듬을 만듭니다.",
    outcome: "독자가 다음 컷과 대사를 자연스럽게 찾는 페이지 구조가 완성됩니다.",
    steps: [
      { title: "큰 장면부터 배치", body: "강조할 장면과 정보량이 많은 장면의 크기를 먼저 정합니다." },
      { title: "컷 사이 리듬 맞추기", body: "시간이 이어지는 컷은 가깝게, 장면 전환은 여백을 넓혀 구분합니다." },
      { title: "축소 검수", body: "페이지 전체와 모바일 폭에서 시선이 어디로 이동하는지 확인합니다." },
    ],
    tips: ["디테일을 보기 전에 흑백 썸네일처럼 축소해 명암 덩어리와 읽는 순서를 확인하세요."],
    problems: [
      { title: "어디부터 읽어야 할지 모호해요", cause: "비슷한 크기의 컷과 말풍선이 경쟁하거나 여백 방향이 흐름과 어긋날 수 있습니다.", fix: "첫 진입 컷의 크기·명암을 키우고 말풍선 위치를 읽는 방향에 맞춰 다시 정렬하세요." },
    ],
    aliases: ["panel", "컷", "프레임", "웹툰 레이아웃", "페이지 구성", "gutter"],
    relatedIds: ["tool.smart-shape", "workflow.lettering", "workflow.export"],
    primaryAction: toolAction(),
  },
  {
    id: "workflow.export",
    category: "workflow",
    title: "내보내기 전 검수",
    eyebrow: "출고 안전망",
    summary: "원고를 파일로 만들기 전에 크기, 잘림, 글자, 색, 숨은 레이어와 저장 상태를 점검합니다.",
    outcome: "의도한 페이지 순서와 품질로 다시 열어 확인할 수 있는 출력 파일을 만듭니다.",
    steps: [
      { title: "페이지와 레이어 검수", body: "숨김·잠금·임시 레이어와 페이지 순서를 확인하고 불필요한 선택 경계를 해제합니다." },
      { title: "실제 소비 크기로 보기", body: "모바일 폭과 100% 배율에서 글자, 선, 효과, 가장자리 잘림을 확인합니다." },
      { title: "형식 선택 후 다시 열기", body: "목적에 맞는 형식과 크기로 내보낸 뒤 결과 파일을 별도로 열어 최종 확인합니다." },
    ],
    checks: ["저장 상태가 최신인지 확인하고, 긴 원고는 원본 프로젝트와 출력 파일을 분리해 보관하세요."],
    tips: ["검수용 저용량 파일과 최종 납품 파일을 분리하면 수정 반복이 빨라집니다."],
    problems: [
      { title: "출력에서 글자나 효과가 달라요", cause: "폰트, 색상 공간, 합성 또는 출력 배율 차이일 수 있습니다.", fix: "동일한 페이지 한 장을 시험 출력해 원본과 비교하고, 문제가 나는 효과를 단순화하거나 래스터화 경로를 확인하세요." },
    ],
    aliases: ["export", "내보내기", "출력", "저장", "publish", "납품", "검수"],
    relatedIds: ["workflow.lettering", "workflow.layers", "workflow.recovery"],
    primaryAction: toolAction(),
    featured: true,
  },
  {
    id: "workflow.recovery",
    category: "recovery",
    title: "저장·복구 문제 해결",
    eyebrow: "문제가 생겼을 때",
    summary: "임시저장, 체크포인트, 저장소 압박과 안전 모드의 실제 상태를 확인해 가장 안전한 복구 경로를 고릅니다.",
    outcome: "브라우저에 남은 복구 가능 항목과 지금 실행 가능한 조치만 확인합니다.",
    steps: [
      { title: "추가 편집 멈추기", body: "저장 실패나 화면 이상이 보이면 반복 입력을 멈추고 현재 상태를 더 덮지 않습니다." },
      { title: "복구 가이드에서 실측 상태 확인", body: "임시저장, 체크포인트, 저장소 상태와 권장 조치를 확인합니다." },
      { title: "가능하면 먼저 내보내기", body: "현재 문서를 읽을 수 있다면 복구나 저장소 정리 전에 안전한 파일로 내보냅니다." },
    ],
    checks: ["복구 가이드는 확인할 수 없는 값을 0건으로 표시하지 않고 ‘확인 못 함’으로 구분합니다."],
    tips: ["저장소 정리는 원본 내보내기를 확보한 뒤 최소 범위부터 진행하세요."],
    problems: [
      { title: "복구 항목이 0건인지 확인할 수 없어요", cause: "브라우저가 저장소 접근을 막았거나 현재 컨텍스트에서 읽지 못했을 수 있습니다.", fix: "기기 진단과 브라우저 권한을 확인하고, 같은 브라우저·프로필·사이트 주소로 다시 여세요." },
    ],
    aliases: ["recovery", "autosave", "checkpoint", "복구", "임시저장", "저장 실패", "안전 모드"],
    relatedIds: ["workflow.export", "workflow.find-feature"],
    primaryAction: { type: "support", label: "복구 가이드 열기", section: "recovery" },
    featured: true,
  },
];

export const STUDIO_GUIDED_HELP_ARTICLES: readonly StudioGuidedHelpArticle[] =
  Object.freeze(ARTICLES);

export const STUDIO_GUIDED_HELP_ARTICLE_BY_ID: ReadonlyMap<string, StudioGuidedHelpArticle> =
  new Map(STUDIO_GUIDED_HELP_ARTICLES.map((article) => [article.id, article]));

const ARTICLE_BY_COMMAND_ID: ReadonlyMap<string, StudioGuidedHelpArticle> = new Map(
  STUDIO_GUIDED_HELP_ARTICLES.flatMap((article) =>
    article.commandId ? [[article.commandId, article] as const] : [],
  ),
);

export function studioGuidedHelpArticle(
  articleId: string | null | undefined,
): StudioGuidedHelpArticle | null {
  return articleId ? STUDIO_GUIDED_HELP_ARTICLE_BY_ID.get(articleId) ?? null : null;
}

export function studioGuidedHelpArticleForCommand(
  commandId: string | null | undefined,
): StudioGuidedHelpArticle | null {
  return commandId ? ARTICLE_BY_COMMAND_ID.get(commandId) ?? null : null;
}

export const STUDIO_GUIDED_HELP_INTENTS: readonly StudioGuidedHelpIntent[] = Object.freeze([
  { id: "draw", label: "선을 그리고 싶어요", description: "펜·굵기·필압·안정화", articleId: "tool.pen" },
  { id: "fill", label: "색이 새지 않게 채우고 싶어요", description: "허용치·틈 닫기·참조", articleId: "tool.fill" },
  { id: "select", label: "일부만 고쳐야 해요", description: "객체 선택·픽셀 선택·퀵 마스크", articleId: "tool.select" },
  { id: "lettering", label: "말풍선과 대사를 넣고 싶어요", description: "읽는 순서·꼬리·여백", articleId: "workflow.lettering" },
  { id: "layers", label: "원본을 지키며 편집하고 싶어요", description: "레이어·그룹·마스크", articleId: "workflow.layers" },
  { id: "brush", label: "내 브러시를 만들고 싶어요", description: "팁·질감·필압·혼색", articleId: "workflow.brush-studio" },
  { id: "export", label: "내보내기 전에 검수하고 싶어요", description: "잘림·글자·색·파일 확인", articleId: "workflow.export" },
  { id: "recover", label: "저장이나 복구가 걱정돼요", description: "임시저장·체크포인트·진단", articleId: "workflow.recovery" },
]);

const CATEGORY_LABEL: Readonly<Record<StudioGuidedHelpCategory, string>> = Object.freeze({
  start: "시작과 탐색",
  drawing: "그리기",
  selection: "선택과 변형",
  adjustment: "부분 보정",
  workflow: "제작 흐름",
  recovery: "복구",
});

export function studioGuidedHelpCategoryLabel(category: StudioGuidedHelpCategory): string {
  return CATEGORY_LABEL[category];
}

export interface StudioGuidedHelpSearchResult {
  readonly article: StudioGuidedHelpArticle;
  readonly score: number;
  readonly matchedOn: "title" | "alias" | "content";
}

function articleSearchFields(article: StudioGuidedHelpArticle): readonly string[] {
  return [
    article.title,
    article.eyebrow,
    article.summary,
    article.outcome,
    article.commandId ?? "",
    ...article.aliases,
    ...article.steps.flatMap((step) => [step.title, step.body]),
    ...(article.checks ?? []),
    ...(article.tips ?? []),
    ...article.problems.flatMap((problem) => [problem.title, problem.cause, problem.fix]),
  ];
}

function scoreStudioGuidedHelpArticle(
  article: StudioGuidedHelpArticle,
  normalizedQuery: string,
  tokens: readonly string[],
): StudioGuidedHelpSearchResult | null {
  const normalizedTitle = normalizeStudioSearchText(article.title);
  const normalizedAliases = article.aliases.map(normalizeStudioSearchText);
  const normalizedFields = articleSearchFields(article).map(normalizeStudioSearchText);

  if (!tokens.every((token) => normalizedFields.some((field) => field.includes(token)))) {
    return null;
  }

  let score = 0;
  let matchedOn: StudioGuidedHelpSearchResult["matchedOn"] = "content";
  if (normalizedTitle === normalizedQuery) {
    score += 160;
    matchedOn = "title";
  } else if (normalizedTitle.startsWith(normalizedQuery)) {
    score += 120;
    matchedOn = "title";
  } else if (normalizedTitle.includes(normalizedQuery)) {
    score += 90;
    matchedOn = "title";
  }

  const aliasExact = normalizedAliases.some((alias) => alias === normalizedQuery);
  const aliasPartial = normalizedAliases.some((alias) => alias.includes(normalizedQuery));
  if (aliasExact) {
    score += 135;
    if (matchedOn === "content") matchedOn = "alias";
  } else if (aliasPartial) {
    score += 80;
    if (matchedOn === "content") matchedOn = "alias";
  }

  for (const token of tokens) {
    if (normalizedTitle.includes(token)) score += 35;
    else if (normalizedAliases.some((alias) => alias.includes(token))) score += 28;
    else score += 10;
  }
  if (article.featured) score += 4;

  return { article, score, matchedOn };
}

export function searchStudioGuidedHelp(
  query: string,
  limit = 12,
): readonly StudioGuidedHelpSearchResult[] {
  const tokens = tokenizeStudioSearchQuery(query);
  if (tokens.length === 0) {
    return STUDIO_GUIDED_HELP_ARTICLES
      .filter((article) => article.featured)
      .slice(0, limit)
      .map((article) => ({ article, score: 0, matchedOn: "content" as const }));
  }
  const normalizedQuery = normalizeStudioSearchText(query);
  return STUDIO_GUIDED_HELP_ARTICLES
    .map((article) => scoreStudioGuidedHelpArticle(article, normalizedQuery, tokens))
    .filter((result): result is StudioGuidedHelpSearchResult => result !== null)
    .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title, "ko"))
    .slice(0, Math.max(1, limit));
}
