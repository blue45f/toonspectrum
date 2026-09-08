import type { StudioHelpCenterSection } from "./studio-help-center-channel";

export type StudioContextHelpView = "home" | "tool" | "troubleshooting";

export interface StudioContextHelpStep {
  readonly title: string;
  readonly body: string;
}

export interface StudioContextHelpFix {
  readonly symptom: string;
  readonly resolution: string;
}

export interface StudioContextHelpGuide {
  readonly id: string;
  readonly commandIds: readonly string[];
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly outcome: string;
  readonly steps: readonly StudioContextHelpStep[];
  readonly tips: readonly string[];
  readonly troubleshooting: readonly StudioContextHelpFix[];
  readonly relatedRecipeIds: readonly string[];
  readonly tutorialId?: string;
}

export type StudioHelpRecipeDestination =
  | {
      readonly type: "view";
      readonly label: string;
      readonly view: Exclude<StudioContextHelpView, "home">;
    }
  | {
      readonly type: "section";
      readonly label: string;
      readonly section: Exclude<StudioHelpCenterSection, "current-tool">;
    }
  | {
      readonly type: "command-search";
      readonly label: string;
    }
  | {
      readonly type: "manual";
      readonly label: string;
    };

export interface StudioHelpRecipe {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly keywords: readonly string[];
  readonly checks: readonly StudioContextHelpStep[];
  readonly primaryAction: StudioHelpRecipeDestination;
  readonly secondaryAction?: StudioHelpRecipeDestination;
}

export const STUDIO_CONTEXT_HELP_GUIDES = [
  {
    id: "draw-with-pen",
    commandIds: ["tool.pen"],
    eyebrow: "그리기",
    title: "펜으로 안정적인 선 그리기",
    summary: "브러시 크기와 불투명도를 먼저 정한 뒤 짧은 테스트 선으로 필압과 보정을 확인합니다.",
    outcome: "현재 캔버스와 입력 장치에 맞는 선 품질을 빠르게 확인할 수 있습니다.",
    steps: [
      { title: "레이어와 색 확인", body: "그릴 레이어가 보이고 잠금 해제되어 있는지, 전경색이 배경과 구분되는지 확인합니다." },
      { title: "작게 시험하기", body: "짧은 선을 그어 크기·불투명도·필압 반응을 확인한 뒤 필요한 값만 조정합니다." },
      { title: "긴 선은 나눠 그리기", body: "한 번에 완성하려 하기보다 형태를 잡는 선과 정리하는 선을 나누면 수정 비용이 줄어듭니다." },
    ],
    tips: ["확대 상태가 너무 높으면 떨림이 과장되어 보일 수 있습니다.", "선이 늦게 따라오면 먼저 진단에서 입력 지연과 렌더러 상태를 확인하세요."],
    troubleshooting: [
      { symptom: "선이 보이지 않음", resolution: "레이어 가시성·잠금·선택 영역과 현재 색의 알파 값을 차례로 확인합니다." },
      { symptom: "선이 끊기거나 늦음", resolution: "진단 화면에서 포인터 이벤트와 GPU 상태를 확인하고 큰 브러시 크기를 잠시 낮춰 비교합니다." },
    ],
    relatedRecipeIds: ["stroke-not-visible", "canvas-lag"],
    tutorialId: "pen",
  },
  {
    id: "pixel-pen",
    commandIds: ["tool.pixel-pen"],
    eyebrow: "픽셀 작업",
    title: "픽셀 가장자리를 선명하게 유지하기",
    summary: "픽셀 펜은 흐림 없는 작은 단위 편집에 적합합니다. 실제 픽셀 경계를 보며 형태를 정리하세요.",
    outcome: "안티앨리어싱으로 흐려지지 않는 또렷한 픽셀 형태를 만들 수 있습니다.",
    steps: [
      { title: "픽셀 격자 확인", body: "충분히 확대해 한 번의 입력이 차지하는 픽셀 범위를 확인합니다." },
      { title: "작은 크기부터 시작", body: "1~수 픽셀 크기로 외곽선을 먼저 정리하고 필요한 부분만 넓힙니다." },
      { title: "실제 배율 재확인", body: "작업 중간마다 100% 보기로 돌아가 전체 인상을 확인합니다." },
    ],
    tips: ["확대 화면의 매끄러움보다 100% 배율의 실루엣을 기준으로 판단하세요."],
    troubleshooting: [{ symptom: "가장자리가 흐려 보임", resolution: "픽셀 펜이 선택되어 있는지와 확대 보간 표시를 구분해 확인합니다." }],
    relatedRecipeIds: ["stroke-not-visible"],
  },
  {
    id: "erase-cleanly",
    commandIds: ["tool.eraser"],
    eyebrow: "수정",
    title: "지우개로 형태를 깨끗하게 정리하기",
    summary: "큰 면을 먼저 정리하고 작은 크기로 가장자리를 다듬으면 과도한 왕복 작업을 줄일 수 있습니다.",
    outcome: "원본 형태를 잃지 않으면서 불필요한 픽셀과 선을 단계적으로 제거할 수 있습니다.",
    steps: [
      { title: "대상 레이어 확인", body: "지우려는 내용이 있는 레이어를 선택하고 잠금 상태를 확인합니다." },
      { title: "큰 영역부터 제거", body: "넓은 부분을 적절한 크기로 먼저 지운 뒤, 외곽선 근처에서 크기를 줄입니다." },
      { title: "투명 영역 점검", body: "배경색을 바꾸거나 레이어를 숨겨 잔여 픽셀이 남았는지 확인합니다." },
    ],
    tips: ["되돌리기를 반복하기보다 지우개 크기를 먼저 낮추는 편이 빠릅니다."],
    troubleshooting: [{ symptom: "지워지지 않음", resolution: "레이어 잠금, 선택 영역, 현재 편집 대상이 벡터·텍스트 객체인지 확인합니다." }],
    relatedRecipeIds: ["stroke-not-visible", "missing-object"],
    tutorialId: "eraser",
  },
  {
    id: "fill-closed-area",
    commandIds: ["tool.fill"],
    eyebrow: "채색",
    title: "빈틈 없이 영역 채우기",
    summary: "경계의 작은 틈과 현재 레이어의 상태를 확인한 뒤 한 번에 작은 영역부터 채워 결과를 검증합니다.",
    outcome: "의도한 경계 안쪽만 빠르게 채우고 누수 원인을 쉽게 찾을 수 있습니다.",
    steps: [
      { title: "경계 닫기", body: "채울 영역을 확대해 선 사이의 작은 틈이나 투명한 픽셀이 없는지 확인합니다." },
      { title: "작은 영역 시험", body: "복잡한 면 전체보다 작은 폐쇄 영역에서 먼저 채우기 결과를 확인합니다." },
      { title: "허용 범위 조정", body: "색 차이가 있는 가장자리가 남거나 넘칠 때만 허용 범위와 틈 보정 값을 조금씩 바꿉니다." },
    ],
    tips: ["원본 선 레이어를 복제해 보존한 뒤 채색하면 복구가 쉽습니다.", "넘침은 대부분 경계 틈 또는 참조 레이어 불일치에서 시작합니다."],
    troubleshooting: [
      { symptom: "캔버스 전체가 채워짐", resolution: "확대해 경계가 끊긴 위치를 찾고 닫은 뒤 다시 시도합니다." },
      { symptom: "가장자리에 흰 틈이 남음", resolution: "허용 범위와 가장자리 확장 값을 한 단계씩 높여 비교합니다." },
    ],
    relatedRecipeIds: ["fill-leaks", "missing-object"],
    tutorialId: "fill",
  },
  {
    id: "smart-shape",
    commandIds: ["tool.smart-shape"],
    eyebrow: "도형",
    title: "스마트 도형을 정확하게 만들기",
    summary: "먼저 대략적인 형태를 만든 뒤 핸들과 속성에서 수치·모서리를 조정하는 순서가 가장 빠릅니다.",
    outcome: "반복 수정 가능한 깨끗한 도형을 만들고 다른 요소와 정렬할 수 있습니다.",
    steps: [
      { title: "기본 형태 만들기", body: "캔버스에서 원하는 크기와 비율에 가깝게 드래그합니다." },
      { title: "핸들로 형태 보정", body: "선택 핸들과 도형 속성으로 크기·회전·모서리 값을 조정합니다." },
      { title: "정렬 상태 확인", body: "확대와 축소를 번갈아 보며 주변 요소와 간격이 일관적인지 확인합니다." },
    ],
    tips: ["복제할 도형은 완성한 뒤 복사하면 반복 편집을 줄일 수 있습니다."],
    troubleshooting: [{ symptom: "도형이 선택되지 않음", resolution: "선택 도구로 전환한 뒤 레이어 잠금과 선택 영역을 확인합니다." }],
    relatedRecipeIds: ["missing-object", "selection-confusing"],
    tutorialId: "smart-shape",
  },
  {
    id: "blend-with-smudge",
    commandIds: ["tool.smudge"],
    eyebrow: "블렌딩",
    title: "스머지로 색 경계 부드럽게 연결하기",
    summary: "낮은 강도와 작은 크기에서 시작해 색의 흐름을 따라 짧게 움직이면 질감 손실을 줄일 수 있습니다.",
    outcome: "색 경계를 자연스럽게 연결하면서 원래의 명암 구조를 유지할 수 있습니다.",
    steps: [
      { title: "낮은 강도로 시작", body: "한 번의 움직임이 지나치게 많은 색을 끌고 가지 않도록 강도를 낮게 설정합니다." },
      { title: "형태 방향 따라가기", body: "면의 곡률과 빛의 방향을 따라 짧은 스트로크를 겹칩니다." },
      { title: "원본 질감 되살리기", body: "필요하면 마지막에 작은 브러시로 핵심 가장자리와 질감을 다시 넣습니다." },
    ],
    tips: ["긴 왕복 입력은 색을 탁하게 만들 수 있으므로 짧게 나누세요."],
    troubleshooting: [{ symptom: "색이 지나치게 뭉개짐", resolution: "강도와 브러시 크기를 낮추고 되돌린 뒤 더 짧게 입력합니다." }],
    relatedRecipeIds: ["canvas-lag"],
    tutorialId: "smudge",
  },
  {
    id: "wet-mix",
    commandIds: ["tool.wet-mix"],
    eyebrow: "블렌딩",
    title: "습식 혼합으로 자연스러운 색 만들기",
    summary: "서로 섞을 두 색의 양을 작게 유지하고 중간색을 확인하며 단계적으로 혼합합니다.",
    outcome: "색이 탁해지는 것을 줄이면서 회화적인 중간색과 경계를 만들 수 있습니다.",
    steps: [
      { title: "두 색의 비율 확인", body: "작은 영역에서 어느 색이 더 많이 끌려오는지 먼저 확인합니다." },
      { title: "중간색 누적", body: "한 방향으로 짧게 반복해 중간색을 만들고 반대 방향 입력은 최소화합니다." },
      { title: "경계 다시 세우기", body: "혼합 뒤 사라진 초점 영역은 원래 색과 작은 브러시로 복원합니다." },
    ],
    tips: ["새 레이어나 복제 레이어에서 시험하면 원본을 빠르게 비교할 수 있습니다."],
    troubleshooting: [{ symptom: "전체가 회색·갈색으로 탁해짐", resolution: "되돌린 뒤 한 번에 섞는 색 수와 왕복 횟수를 줄입니다." }],
    relatedRecipeIds: ["canvas-lag"],
    tutorialId: "wet-mix",
  },
  {
    id: "dodge-burn",
    commandIds: ["tool.dodge-burn"],
    eyebrow: "명암",
    title: "닷지·번으로 명암을 안전하게 보정하기",
    summary: "낮은 강도로 넓게 누적하고 중간 배율에서 전체 대비를 자주 확인합니다.",
    outcome: "형태의 입체감은 높이면서 하이라이트와 그림자의 클리핑을 줄일 수 있습니다.",
    steps: [
      { title: "낮은 강도 선택", body: "한 번의 입력보다 여러 번 누적할 수 있도록 약한 값에서 시작합니다." },
      { title: "빛 방향 통일", body: "장면의 광원 방향과 면의 굴곡을 따라 넓게 적용합니다." },
      { title: "전체 대비 확인", body: "100%와 맞춤 보기를 오가며 국소 보정이 과해지지 않았는지 확인합니다." },
    ],
    tips: ["복제 레이어에서 작업하면 전후 비교와 강도 조절이 쉽습니다."],
    troubleshooting: [{ symptom: "색이 뜨거나 검게 뭉침", resolution: "강도를 낮추고 더 넓은 크기로 여러 번 나눠 적용합니다." }],
    relatedRecipeIds: ["missing-object"],
    tutorialId: "dodge-burn",
  },
  {
    id: "liquify",
    commandIds: ["tool.liquify"],
    eyebrow: "변형",
    title: "리퀴파이로 형태를 자연스럽게 보정하기",
    summary: "큰 형태를 낮은 강도로 먼저 움직인 뒤 작은 크기로 국소 영역을 정리합니다.",
    outcome: "윤곽의 흐름을 유지하면서 비율과 실루엣을 점진적으로 보정할 수 있습니다.",
    steps: [
      { title: "큰 형태부터", body: "넓은 크기와 낮은 강도로 전체 실루엣을 먼저 조정합니다." },
      { title: "짧게 밀기", body: "한 번에 멀리 끌기보다 짧은 입력을 겹쳐 왜곡을 제어합니다." },
      { title: "세부 복원", body: "작은 크기로 눈·입·모서리처럼 초점이 되는 부분을 다시 정리합니다." },
    ],
    tips: ["원본 레이어를 복제해 두면 과도한 왜곡을 빠르게 되돌릴 수 있습니다."],
    troubleshooting: [{ symptom: "주변 픽셀까지 휘어짐", resolution: "브러시 크기와 강도를 낮추고 변형 범위를 더 작게 나눕니다." }],
    relatedRecipeIds: ["missing-object", "canvas-lag"],
  },
  {
    id: "quick-mask",
    commandIds: ["select.quick-mask"],
    eyebrow: "선택",
    title: "퀵 마스크로 복잡한 선택 영역 다듬기",
    summary: "선택 범위를 마스크처럼 칠하고 지우면서 가장자리를 직접 보정합니다.",
    outcome: "머리카락·소품 틈처럼 자동 선택이 놓치는 복잡한 영역을 정밀하게 선택할 수 있습니다.",
    steps: [
      { title: "선택 범위 표시", body: "퀵 마스크를 켜 현재 포함·제외 영역을 색상 오버레이로 확인합니다." },
      { title: "브러시로 보정", body: "작은 브러시와 지우개로 경계를 확대해 포함·제외 영역을 정리합니다." },
      { title: "선택으로 복귀", body: "퀵 마스크를 종료하고 선택 테두리와 누락 영역을 다시 확인합니다." },
    ],
    tips: ["경계가 복잡할수록 큰 브러시로 내부를 채운 뒤 작은 브러시로 외곽을 정리하세요."],
    troubleshooting: [{ symptom: "그리기 결과가 캔버스에 남지 않음", resolution: "퀵 마스크가 켜져 있으면 입력은 그림이 아니라 선택 범위를 수정합니다." }],
    relatedRecipeIds: ["stroke-not-visible", "selection-confusing"],
    tutorialId: "quick-mask",
  },
  {
    id: "pan-canvas",
    commandIds: ["tool.hand"],
    eyebrow: "탐색",
    title: "캔버스를 빠르게 이동하기",
    summary: "도구를 바꾸지 않고 스페이스를 누른 채 드래그하면 현재 확대율을 유지하며 화면을 이동할 수 있습니다.",
    outcome: "그리기 흐름을 끊지 않고 작업 위치를 바꿀 수 있습니다.",
    steps: [
      { title: "임시 이동", body: "다른 도구를 사용하는 동안 스페이스를 누른 채 캔버스를 드래그합니다." },
      { title: "영역 맞추기", body: "작업할 영역을 화면 중앙에 놓고 스페이스에서 손을 떼 원래 도구로 돌아갑니다." },
      { title: "전체 위치 확인", body: "필요할 때 맞춤 보기를 사용해 캔버스에서 현재 위치를 다시 확인합니다." },
    ],
    tips: ["포인터가 입력 필드 위에 있을 때는 스페이스가 이동 도구로 동작하지 않을 수 있습니다."],
    troubleshooting: [{ symptom: "캔버스 대신 객체가 움직임", resolution: "스페이스를 먼저 누른 상태에서 빈 캔버스를 드래그하거나 손 도구가 활성화됐는지 확인합니다." }],
    relatedRecipeIds: ["lost-on-canvas", "shortcut-conflict"],
  },
  {
    id: "select-object",
    commandIds: ["tool.select"],
    eyebrow: "선택",
    title: "객체를 정확하게 선택하고 이동하기",
    summary: "레이어 잠금과 선택 영역을 먼저 확인한 뒤 클릭·드래그로 대상을 선택합니다.",
    outcome: "겹친 객체에서도 의도한 요소를 선택하고 안전하게 이동·정렬할 수 있습니다.",
    steps: [
      { title: "잠금 상태 확인", body: "레이어 패널에서 대상 레이어가 보이고 잠금 해제되어 있는지 확인합니다." },
      { title: "작은 이동으로 검증", body: "선택 후 아주 조금 움직여 올바른 객체인지 확인하고 필요하면 즉시 되돌립니다." },
      { title: "여러 객체는 단계적으로", body: "한 번에 모두 잡기보다 기준 객체를 먼저 선택한 뒤 선택 범위를 확장합니다." },
    ],
    tips: ["선택이 어려운 겹침 구조에서는 레이어 패널에서 대상을 먼저 찾는 편이 정확합니다."],
    troubleshooting: [{ symptom: "클릭해도 선택되지 않음", resolution: "레이어 잠금·가시성·현재 선택 영역과 퀵 마스크 상태를 확인합니다." }],
    relatedRecipeIds: ["missing-object", "selection-confusing"],
  },
  {
    id: "marquee-and-lasso",
    commandIds: ["tool.marquee-rect", "tool.marquee-ellipse", "tool.lasso"],
    eyebrow: "선택",
    title: "선택 영역을 빠르게 만들고 다듬기",
    summary: "큰 범위를 먼저 잡은 뒤 선택 모드와 퀵 마스크를 이용해 필요한 부분만 보정합니다.",
    outcome: "편집할 픽셀 범위를 제한해 이동·삭제·채색의 실수를 줄일 수 있습니다.",
    steps: [
      { title: "형태에 맞는 도구 선택", body: "직사각형·타원·자유 형태 중 대상 윤곽에 가장 가까운 방식을 선택합니다." },
      { title: "넉넉하게 시작", body: "경계 안쪽을 놓치지 않도록 큰 범위를 먼저 만들고 이후 제외 영역을 정리합니다." },
      { title: "경계 검사", body: "확대해 누락·과다 선택이 없는지 확인하고 복잡한 부분은 퀵 마스크로 보정합니다." },
    ],
    tips: ["선택 테두리가 보이지 않더라도 선택이 남아 있을 수 있으니 동작 전 상태 표시를 확인하세요."],
    troubleshooting: [{ symptom: "일부 영역만 그려짐", resolution: "이전 선택 영역이 남아 있는지 확인하고 필요하면 선택을 해제합니다." }],
    relatedRecipeIds: ["stroke-not-visible", "selection-confusing"],
  },
  {
    id: "transform-object",
    commandIds: ["tool.transform"],
    eyebrow: "변형",
    title: "크기와 회전을 안전하게 조정하기",
    summary: "대상을 선택하고 작은 변화부터 적용한 뒤 주변 요소와의 비율을 확인합니다.",
    outcome: "원치 않는 왜곡을 줄이며 위치·크기·회전을 단계적으로 조정할 수 있습니다.",
    steps: [
      { title: "대상 검증", body: "선택 영역과 레이어 패널에서 변형할 객체가 정확한지 확인합니다." },
      { title: "한 속성씩 조정", body: "위치·크기·회전을 동시에 크게 바꾸지 말고 한 가지씩 적용해 비교합니다." },
      { title: "확정 전 전체 보기", body: "맞춤 보기로 전환해 주변 요소와의 비율과 정렬을 확인한 뒤 확정합니다." },
    ],
    tips: ["복잡한 변형은 원본을 복제한 뒤 적용하면 비교와 복구가 쉽습니다."],
    troubleshooting: [{ symptom: "원하지 않은 객체가 변형됨", resolution: "즉시 취소하고 레이어 패널에서 대상을 직접 선택한 뒤 다시 시작합니다." }],
    relatedRecipeIds: ["missing-object", "selection-confusing"],
  },
  {
    id: "crop-canvas",
    commandIds: ["tool.crop"],
    eyebrow: "캔버스",
    title: "구도를 유지하며 캔버스 자르기",
    summary: "최종 출력 비율을 먼저 정하고 중요한 요소에 안전 여백을 남긴 채 자르기 범위를 조정합니다.",
    outcome: "핵심 장면을 잃지 않고 게시·출력 목적에 맞는 구도를 만들 수 있습니다.",
    steps: [
      { title: "출력 목적 확인", body: "게시 위치나 내보내기 규격에 필요한 비율과 해상도를 먼저 확인합니다." },
      { title: "안전 여백 남기기", body: "말풍선·텍스트·인물 얼굴이 경계에 붙지 않도록 여백을 확보합니다." },
      { title: "확정 전 축소 확인", body: "전체 보기를 통해 시선 흐름과 잘린 요소가 없는지 확인한 뒤 적용합니다." },
    ],
    tips: ["원본 크기로 다시 돌아갈 가능성이 있다면 자르기 전에 버전을 저장하세요."],
    troubleshooting: [{ symptom: "필요한 요소가 잘림", resolution: "적용 전 취소하거나 복구 기록에서 이전 상태를 선택해 범위를 다시 잡습니다." }],
    relatedRecipeIds: ["save-and-recovery", "export-result"],
  },
  {
    id: "sample-color",
    commandIds: ["tool.eyedropper"],
    eyebrow: "색상",
    title: "캔버스에서 정확한 색 추출하기",
    summary: "샘플할 지점을 충분히 확대하고 표시 결과와 전경색이 바뀌었는지 확인합니다.",
    outcome: "기존 그림의 색을 재사용해 팔레트 일관성을 유지할 수 있습니다.",
    steps: [
      { title: "샘플 지점 확대", body: "경계가 섞이지 않도록 원하는 색의 내부 영역을 충분히 크게 표시합니다." },
      { title: "색 추출", body: "스포이드로 한 번 선택하고 전경색 표시가 바뀌었는지 확인합니다." },
      { title: "테스트 입력", body: "작은 테스트 선으로 추출한 색이 주변 색과 맞는지 확인합니다." },
    ],
    tips: ["반투명 가장자리보다 불투명한 내부 픽셀을 샘플하면 예상 가능한 색을 얻기 쉽습니다."],
    troubleshooting: [{ symptom: "원하는 색보다 탁함", resolution: "반투명 경계나 효과가 적용된 픽셀을 피하고 내부 영역에서 다시 추출합니다." }],
    relatedRecipeIds: ["stroke-not-visible"],
  },
  {
    id: "add-comment",
    commandIds: ["tool.comment"],
    eyebrow: "협업",
    title: "수정 지점을 명확하게 코멘트하기",
    summary: "코멘트 핀은 위치·요청·완료 조건을 함께 적어야 다른 사람이 바로 행동할 수 있습니다.",
    outcome: "모호한 피드백을 줄이고 장면별 수정 상태를 빠르게 추적할 수 있습니다.",
    steps: [
      { title: "정확한 위치 선택", body: "수정이 필요한 객체나 픽셀과 겹치지 않으면서 의미가 분명한 위치에 핀을 둡니다." },
      { title: "행동 중심으로 작성", body: "현재 문제, 원하는 변경, 완료 판단 기준을 한 메시지에 짧게 적습니다." },
      { title: "해결 상태 갱신", body: "수정이 끝나면 결과를 확인한 뒤 코멘트 상태를 정리합니다." },
    ],
    tips: ["‘이상해요’ 대신 ‘말풍선을 오른쪽 16px 이동’처럼 확인 가능한 요청을 적으세요."],
    troubleshooting: [{ symptom: "코멘트 위치가 어긋남", resolution: "현재 페이지와 확대율을 확인하고 대상 가까이에 새 핀을 만들어 비교합니다." }],
    relatedRecipeIds: ["collaboration-state", "missing-object"],
  },
] as const satisfies readonly StudioContextHelpGuide[];

const GUIDE_BY_COMMAND = new Map<string, StudioContextHelpGuide>(
  STUDIO_CONTEXT_HELP_GUIDES.flatMap((guide) =>
    guide.commandIds.map((commandId) => [commandId, guide] as const),
  ),
);

export function getStudioContextHelpGuide(
  commandId: string | null | undefined,
): StudioContextHelpGuide | null {
  if (!commandId) return null;
  return GUIDE_BY_COMMAND.get(commandId) ?? null;
}

export const STUDIO_HELP_RECIPES = [
  {
    id: "stroke-not-visible",
    title: "선이나 지우개 결과가 보이지 않아요",
    summary: "도구보다 먼저 레이어·선택 영역·퀵 마스크·색상 상태를 순서대로 확인합니다.",
    keywords: ["펜", "브러시", "선", "안그려짐", "지우개", "입력", "퀵마스크"],
    checks: [
      { title: "레이어", body: "현재 레이어가 보이고 잠금 해제되어 있으며 올바른 페이지에 있는지 확인합니다." },
      { title: "선택 상태", body: "남아 있는 선택 영역이나 퀵 마스크가 입력 범위를 제한하고 있지 않은지 확인합니다." },
      { title: "도구와 색", body: "현재 도구, 크기, 불투명도, 전경색 알파 값을 확인하고 짧은 테스트 선을 그립니다." },
    ],
    primaryAction: { type: "view", label: "현재 도구 확인", view: "tool" },
    secondaryAction: { type: "section", label: "입력 진단 열기", section: "diagnostics" },
  },
  {
    id: "fill-leaks",
    title: "채우기가 밖으로 새거나 가장자리가 남아요",
    summary: "경계 틈과 허용 범위를 분리해 확인하면 반복 클릭 없이 원인을 찾을 수 있습니다.",
    keywords: ["채우기", "버킷", "누수", "틈", "경계", "흰선", "허용범위"],
    checks: [
      { title: "경계 확대", body: "선이 만나는 모서리와 좁은 통로를 확대해 투명한 틈이 있는지 확인합니다." },
      { title: "작은 영역 시험", body: "문제가 재현되는 작은 폐쇄 영역에서 먼저 채우기 동작을 비교합니다." },
      { title: "한 값씩 변경", body: "허용 범위와 가장자리 확장을 동시에 바꾸지 말고 하나씩 조정합니다." },
    ],
    primaryAction: { type: "view", label: "채우기 가이드 보기", view: "tool" },
    secondaryAction: { type: "command-search", label: "채우기 설정 찾기" },
  },
  {
    id: "selection-confusing",
    title: "일부 영역만 편집되거나 선택이 이상해요",
    summary: "남아 있는 선택과 퀵 마스크는 화면상으로 놓치기 쉬워 편집 범위를 제한할 수 있습니다.",
    keywords: ["선택", "라쏘", "마키", "퀵마스크", "일부", "범위", "테두리"],
    checks: [
      { title: "선택 표시", body: "선택 테두리와 상태 표시에서 활성 선택이 남아 있는지 확인합니다." },
      { title: "퀵 마스크", body: "퀵 마스크가 켜져 있다면 종료해 일반 편집 상태로 돌아옵니다." },
      { title: "레이어 범위", body: "현재 편집 대상이 원하는 레이어와 객체인지 레이어 패널에서 확인합니다." },
    ],
    primaryAction: { type: "view", label: "선택 도구 가이드", view: "tool" },
    secondaryAction: { type: "command-search", label: "선택 해제 찾기" },
  },
  {
    id: "missing-object",
    title: "객체나 레이어가 사라진 것처럼 보여요",
    summary: "삭제로 단정하기 전에 가시성·잠금·순서·페이지·캔버스 위치를 확인합니다.",
    keywords: ["레이어", "객체", "사라짐", "안보임", "가시성", "잠금", "페이지"],
    checks: [
      { title: "레이어 상태", body: "눈 아이콘, 잠금, 불투명도와 상위 그룹의 가시성을 확인합니다." },
      { title: "쌓임 순서", body: "다른 객체나 배경 뒤로 이동했는지 레이어 순서를 확인합니다." },
      { title: "위치와 페이지", body: "맞춤 보기로 전체 캔버스를 확인하고 현재 페이지가 맞는지 점검합니다." },
    ],
    primaryAction: { type: "command-search", label: "레이어 명령 찾기" },
    secondaryAction: { type: "section", label: "복구 기록 확인", section: "recovery" },
  },
  {
    id: "lost-on-canvas",
    title: "확대하다 작업 위치를 잃었어요",
    summary: "캔버스 맞춤 보기와 손 도구를 사용해 현재 위치를 빠르게 다시 잡습니다.",
    keywords: ["확대", "축소", "줌", "캔버스", "손도구", "위치", "길잃음"],
    checks: [
      { title: "맞춤 보기", body: "캔버스 전체가 보이는 보기 명령으로 현재 위치를 재설정합니다." },
      { title: "중앙으로 이동", body: "스페이스를 누른 채 드래그해 작업 영역을 화면 중앙으로 옮깁니다." },
      { title: "적정 배율", body: "세부 작업 전 한 단계 낮은 배율에서 주변 맥락을 확인합니다." },
    ],
    primaryAction: { type: "view", label: "손 도구 가이드", view: "tool" },
    secondaryAction: { type: "command-search", label: "보기 명령 찾기" },
  },
  {
    id: "canvas-lag",
    title: "선이 늦거나 캔버스가 버벅여요",
    summary: "입력 문제와 렌더링 문제를 구분한 뒤 큰 브러시·캔버스·효과를 하나씩 비교합니다.",
    keywords: ["느림", "버벅", "지연", "렉", "성능", "gpu", "입력", "렌더링"],
    checks: [
      { title: "진단 캡처", body: "문제가 발생한 상태에서 입력·렌더러·GPU 진단 정보를 먼저 확인합니다." },
      { title: "작은 조건 비교", body: "브러시 크기나 캔버스 배율을 낮춰 입력 지연이 달라지는지 비교합니다." },
      { title: "효과 분리", body: "무거운 효과나 많은 레이어를 잠시 숨겨 렌더링 병목을 분리합니다." },
    ],
    primaryAction: { type: "section", label: "시스템 진단 열기", section: "diagnostics" },
    secondaryAction: { type: "section", label: "버그 보고 준비", section: "bug-report" },
  },
  {
    id: "save-and-recovery",
    title: "저장 결과가 의심되거나 이전 상태로 돌아가고 싶어요",
    summary: "같은 작업을 반복하기 전에 복구 후보와 현재 저장 상태를 확인합니다.",
    keywords: ["저장", "복구", "자동저장", "초안", "버전", "되돌리기", "유실"],
    checks: [
      { title: "현재 상태 보존", body: "가능하면 현재 상태를 별도 버전으로 보존해 추가 손실을 막습니다." },
      { title: "복구 후보 비교", body: "시간과 페이지 정보를 기준으로 가장 최근의 정상 후보를 찾습니다." },
      { title: "복구 후 검증", body: "페이지 수, 레이어, 최근 수정 내용을 확인한 뒤 계속 작업합니다." },
    ],
    primaryAction: { type: "section", label: "복구 센터 열기", section: "recovery" },
    secondaryAction: { type: "manual", label: "사용자 설명서 보기" },
  },
  {
    id: "shortcut-conflict",
    title: "단축키가 기억나지 않거나 예상과 다르게 동작해요",
    summary: "편집 가능한 입력칸과 브라우저 단축키 충돌을 구분하고 명령 검색에서 현재 바인딩을 확인합니다.",
    keywords: ["단축키", "키보드", "shortcut", "충돌", "명령", "f1"],
    checks: [
      { title: "포커스 위치", body: "텍스트 입력칸이나 검색창에 포커스가 있으면 캔버스 단축키가 동작하지 않을 수 있습니다." },
      { title: "명령 검색", body: "F1에서 기능 이름을 검색해 현재 명령과 표시된 단축키를 확인합니다." },
      { title: "브라우저 충돌", body: "브라우저가 먼저 처리하는 조합인지 확인하고 메뉴 명령으로 동일 기능을 시험합니다." },
    ],
    primaryAction: { type: "command-search", label: "명령 검색 열기" },
    secondaryAction: { type: "manual", label: "단축키 설명서 보기" },
  },
  {
    id: "terminology-gap",
    title: "다른 편집기에서 쓰던 기능 이름을 찾기 어려워요",
    summary: "동의어와 타 편집기 용어를 한국어·영어로 함께 검색해 ToonStudio 명령으로 연결합니다.",
    keywords: ["용어", "동의어", "포토샵", "클립스튜디오", "영어", "기능이름", "검색"],
    checks: [
      { title: "용어 사전", body: "알고 있는 제품명이나 기능 이름으로 동의어를 검색합니다." },
      { title: "명령 검색", body: "찾은 ToonStudio 용어를 F1 명령 검색에서 실행 가능한 기능으로 확인합니다." },
      { title: "현재 도구 비교", body: "현재 선택 도구의 별칭과 관련 명령을 함께 확인합니다." },
    ],
    primaryAction: { type: "section", label: "용어 사전 열기", section: "terminology" },
    secondaryAction: { type: "command-search", label: "명령 검색 열기" },
  },
  {
    id: "export-result",
    title: "내보낸 결과의 크기·여백·선명도가 달라요",
    summary: "출력 형식, 캔버스 크기, 자르기 범위와 투명 배경을 각각 확인합니다.",
    keywords: ["내보내기", "다운로드", "export", "해상도", "여백", "투명", "품질"],
    checks: [
      { title: "캔버스 범위", body: "자르기 범위와 페이지 크기에 불필요한 여백이 포함되지 않았는지 확인합니다." },
      { title: "출력 설정", body: "파일 형식, 배율, 배경 투명도와 품질 옵션을 목적에 맞게 확인합니다." },
      { title: "실제 크기 검증", body: "다운로드한 파일을 100% 배율로 열어 에디터 확대 화면과 구분해 비교합니다." },
    ],
    primaryAction: { type: "command-search", label: "다운로드 명령 찾기" },
    secondaryAction: { type: "manual", label: "사용자 설명서 보기" },
  },
  {
    id: "collaboration-state",
    title: "협업자의 변경이나 코멘트 상태가 맞지 않아 보여요",
    summary: "현재 프로젝트·페이지·온라인 상태를 확인하고 재현 정보를 보존한 뒤 진단합니다.",
    keywords: ["협업", "동기화", "코멘트", "커서", "변경", "온라인", "충돌"],
    checks: [
      { title: "같은 범위 확인", body: "두 사용자가 같은 프로젝트와 페이지를 보고 있는지 먼저 확인합니다." },
      { title: "새 변경 비교", body: "작은 테스트 변경 하나를 만들어 양쪽 화면에서 반영 시점을 확인합니다." },
      { title: "재현 정보 보존", body: "시간, 페이지, 작업 순서와 진단 정보를 함께 남겨 동기화 문제를 추적합니다." },
    ],
    primaryAction: { type: "section", label: "시스템 진단 열기", section: "diagnostics" },
    secondaryAction: { type: "section", label: "버그 보고 작성", section: "bug-report" },
  },
] as const satisfies readonly StudioHelpRecipe[];

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .trim();

export function filterStudioHelpRecipes(query: string): readonly StudioHelpRecipe[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return STUDIO_HELP_RECIPES;

  return STUDIO_HELP_RECIPES.filter((recipe) => {
    const haystack = normalizeSearchText(
      [
        recipe.title,
        recipe.summary,
        ...recipe.keywords,
        ...recipe.checks.flatMap((check) => [check.title, check.body]),
      ].join(" "),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}

export function getStudioHelpRecipe(recipeId: string): StudioHelpRecipe | null {
  return STUDIO_HELP_RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
}
