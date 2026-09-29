/**
 * 만화 툴킷 UI 라벨 (한국어 상수).
 * 기존 i18n 파일은 직접 수정하지 않으므로 컴포넌트 내부 상수로 둔다.
 */

export const MANGA_TOOLKIT_LABELS = {
  panelTitle: "만화 툴킷",
  pageModeNotice: "페이지 모드 전용 · 웹툰 세로 스크롤에서는 사용하지 마세요",
  tabs: {
    frame: "프레임 분할",
    balloon: "말풍선",
    effect: "효과선",
  },
  frame: {
    section: "프레임 나누기",
    rows: "행 수",
    cols: "열 수",
    gutter: "간격 (gutter)",
    borderWidth: "테두리 두께",
    split: "프레임 분할",
    merge: "선택 프레임 병합",
    delete: "프레임 삭제",
    count: "프레임 수",
    unitPx: "px",
  },
  balloon: {
    section: "말풍선 만들기",
    preset: "프리셋",
    text: "대사 텍스트",
    textPlaceholder: "대사를 입력하세요",
    lineWidth: "테두리 굵기",
    tailTip: "꼬리 끝점",
    preview: "말풍선 미리보기",
  },
  effect: {
    section: "효과선 브러시",
    kind: "효과선 종류",
    concentration: "집중선",
    speed: "스피드선",
    flash: "섬광",
    count: "선 수",
    length: "길이",
    width: "선 굵기",
    lengthJitter: "길이 지터",
    angleJitter: "각도 지터",
    opacity: "투명도",
    innerRadius: "내측 반경",
    excludeRange: "제외 각도 범위",
    direction: "방향",
    spacing: "선 간격",
    spikes: "스파이크 수",
    regenerate: "다시 생성",
    preview: "효과선 미리보기",
  },
  common: {
    seed: "시드",
    emptyPreview: "미리보기 준비 중",
  },
} as const;
