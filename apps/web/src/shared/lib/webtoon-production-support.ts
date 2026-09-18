export type WebtoonProductionProjectSection =
  | "story"
  | "production"
  | "assets"
  | "review"
  | "export"
  | "settings";

export type WebtoonProductionDestination =
  | { readonly kind: "project"; readonly section: WebtoonProductionProjectSection; readonly view: string }
  | { readonly kind: "work"; readonly surface: string };

export interface WebtoonProductionSupportAction {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly destination: WebtoonProductionDestination;
}

export interface WebtoonProductionStageSupport {
  readonly stageId: string;
  readonly order: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly inputKo: string;
  readonly handoffKo: string;
  readonly reworkRiskKo: string;
  readonly conveniencesKo: readonly string[];
  readonly readinessChecksKo: readonly string[];
  readonly actions: readonly WebtoonProductionSupportAction[];
}

const projectAction = (
  id: string,
  section: WebtoonProductionProjectSection,
  view: string,
  labelKo: string,
  labelEn: string,
): WebtoonProductionSupportAction => ({
  id,
  labelKo,
  labelEn,
  destination: { kind: "project", section, view },
});

const workAction = (
  id: string,
  surface: string,
  labelKo: string,
  labelEn: string,
): WebtoonProductionSupportAction => ({
  id,
  labelKo,
  labelEn,
  destination: { kind: "work", surface },
});

export const WEBTOON_PRODUCTION_STAGE_SUPPORT: readonly WebtoonProductionStageSupport[] = [
  {
    stageId: "brief", order: 1, titleKo: "회차 브리프", titleEn: "Episode brief",
    inputKo: "시즌 맵·이전 회차 상태·이번 화에서 바뀌어야 할 정보와 감정",
    handoffKo: "장면별 목적과 엔딩 훅이 명확한 브리프를 비트 시트로 넘깁니다.",
    reworkRiskKo: "목표가 모호하면 대본과 콘티 완성 뒤에도 회차 전체를 다시 구성하게 됩니다.",
    conveniencesKo: ["에피소드 카드와 시즌 구조 비교", "이전·다음 회차의 정보 공개와 감정 변화 확인", "참고자료를 회차 단위로 연결"],
    readinessChecksKo: ["시작과 종료 상태가 다르다", "핵심 감정 변화가 한 문장으로 설명된다", "엔딩 훅이 다음 화와 연결된다"],
    actions: [projectAction("episodes", "story", "episodes", "에피소드 설계", "Episode planning"), projectAction("overview", "story", "overview", "작품 구조", "Story overview"), projectAction("references", "story", "references", "참고자료", "References")],
  },
  {
    stageId: "beats", order: 2, titleKo: "비트 시트", titleEn: "Beat sheet",
    inputKo: "승인된 회차 브리프와 장면 후보",
    handoffKo: "사건·정보·감정 변화가 순서대로 배치된 비트 시트를 대본으로 넘깁니다.",
    reworkRiskKo: "장면마다 목적이 없으면 대사량이 늘고 후반에서 컷 삭제가 발생합니다.",
    conveniencesKo: ["장면 순서를 에피소드 구조에서 재배치", "연표·관계도와 충돌 여부 확인", "복선과 공개 정보를 회차 기준으로 추적"],
    readinessChecksKo: ["모든 장면에 목적이 있다", "정보 공개 순서가 반전을 미리 노출하지 않는다", "감정 곡선이 엔딩까지 변화한다"],
    actions: [projectAction("beats", "story", "episodes", "비트 정리", "Episode beats"), projectAction("timeline", "story", "timeline", "연표", "Timeline"), projectAction("relations", "story", "relations", "관계도", "Relations")],
  },
  {
    stageId: "script", order: 3, titleKo: "대본·글콘티", titleEn: "Script",
    inputKo: "비트 시트·캐릭터 말투·장면별 참고자료",
    handoffKo: "장면·행동·대사·효과음·신규 에셋 요구가 포함된 대본을 검수로 넘깁니다.",
    reworkRiskKo: "작화 단계에서 대사를 다시 쓰면 말풍선·구도·컷 수가 연쇄적으로 바뀝니다.",
    conveniencesKo: ["대본과 에피소드 정보를 함께 관리", "캐릭터·세계관 기준을 옆에서 확인", "대사를 원고의 말풍선 작업으로 이어가기"],
    readinessChecksKo: ["장면 번호와 장소·시간이 명확하다", "행동과 대사가 중복 설명하지 않는다", "신규 배경·소품 요구가 표시되어 있다"],
    actions: [projectAction("script", "story", "script", "대본 작업", "Script"), projectAction("characters", "story", "characters", "캐릭터", "Characters"), projectAction("world", "story", "world", "세계관", "World")],
  },
  {
    stageId: "script-lock", order: 4, titleKo: "대본 검수·잠금", titleEn: "Script lock",
    inputKo: "검토 가능한 회차 대본과 제작량 추정",
    handoffKo: "승인자와 잠금 시점이 기록된 대본 버전을 그림콘티로 넘깁니다.",
    reworkRiskKo: "잠금 없이 작화가 시작되면 수정 비용과 책임 소재가 동시에 커집니다.",
    conveniencesKo: ["승인과 수정 요청을 분리해 기록", "잠금 전·후 버전 비교", "승인자와 근거를 이력으로 보존"],
    readinessChecksKo: ["회차 목적과 엔딩 훅이 승인되었다", "예상 컷과 고비용 장면이 검토되었다", "잠금 이후 변경 규칙이 정해졌다"],
    actions: [projectAction("approval", "review", "approvals", "대본 승인", "Script approval"), projectAction("versions", "review", "versions", "버전", "Versions"), projectAction("script-review", "story", "script", "대본 다시 보기", "Review script")],
  },
  {
    stageId: "storyboard", order: 5, titleKo: "그림콘티", titleEn: "Storyboard",
    inputKo: "잠금 대본·배경/소품 요구·캐릭터 연기 의도",
    handoffKo: "컷·카메라·말풍선·스크롤 간격이 들어간 그림콘티를 검수로 넘깁니다.",
    reworkRiskKo: "콘티에서 해결하지 않은 구도와 가독성 문제는 선화 이후 가장 비싼 수정이 됩니다.",
    conveniencesKo: ["긴 세로 원고 기준 컷·말풍선 배치", "3D 배경·포즈를 구도 가이드로 활용", "모바일 독서 리듬을 빠르게 미리보기"],
    readinessChecksKo: ["첫 시선이 어디로 가는지 명확하다", "대사 순서가 스크롤 방향과 맞다", "반전 정보가 적절한 시점에 드러난다"],
    actions: [projectAction("board", "production", "board", "제작 보드", "Production board"), workAction("comic", "comic", "웹툰·컷 편집", "Comic workspace"), workAction("bg3d", "bg3d", "3D 구도", "3D layout")],
  },
  {
    stageId: "storyboard-lock", order: 6, titleKo: "콘티 검수·잠금", titleEn: "Storyboard lock",
    inputKo: "모바일로 읽을 수 있는 그림콘티와 컷별 제작 난이도",
    handoffKo: "잠금 콘티와 변경 규칙을 공정 분해·배정 단계로 넘깁니다.",
    reworkRiskKo: "콘티 잠금 후 장면 삽입·삭제는 배경·선화·채색 작업을 동시에 흔듭니다.",
    conveniencesKo: ["콘티 승인 상태를 프로젝트 승인 흐름으로 관리", "버전 비교로 컷 이동·추가 확인", "수정 요청을 컷 단위로 남기기"],
    readinessChecksKo: ["모바일 전체 스크롤 검수가 끝났다", "신규 배경·소품이 목록화되었다", "잠금 이후 변경 승인자가 정해졌다"],
    actions: [projectAction("storyboard-approval", "review", "approvals", "콘티 승인", "Storyboard approval"), projectAction("compare", "review", "compare", "버전 비교", "Compare"), projectAction("storyboard-board", "production", "board", "제작 보드", "Production board")],
  },
  {
    stageId: "breakdown", order: 7, titleKo: "공정 분해·배정", titleEn: "Production breakdown",
    inputKo: "잠금 콘티·신규 에셋 목록·팀 가용 시간",
    handoffKo: "컷별 공정·담당자·마감·의존 관계가 있는 작업 패키지를 제작팀에 배정합니다.",
    reworkRiskKo: "의존 관계 없이 담당자만 배정하면 배경·선화·채색이 서로 기다리는 시간이 늘어납니다.",
    conveniencesKo: ["회차를 공정별 작업으로 분해", "담당자 작업량과 일정 충돌 확인", "여러 회차의 병렬 파이프라인 관리"],
    readinessChecksKo: ["모든 컷에 다음 담당자가 정해졌다", "선행 작업이 필요한 항목이 표시됐다", "고난도 컷이 특정 담당자에게 몰리지 않았다"],
    actions: [projectAction("pipeline", "production", "pipeline", "제작 단계", "Pipeline"), projectAction("workload", "production", "workload", "담당·작업량", "Workload"), projectAction("calendar", "production", "calendar", "제작 일정", "Calendar")],
  },
  {
    stageId: "layout", order: 8, titleKo: "배경·3D·카메라", titleEn: "Background & 3D layout",
    inputKo: "잠금 콘티·장소 기준·신규 배경/소품 목록",
    handoffKo: "투시·카메라·광원·접지 기준이 있는 배경 레이아웃을 인물 작화와 합칩니다.",
    reworkRiskKo: "공간 방향이나 카메라가 틀리면 캐릭터 선화까지 다시 맞춰야 합니다.",
    conveniencesKo: ["3D에서 카메라와 배경을 먼저 블로킹", "Series Kit의 장소·색 기준 재사용", "배경 에셋의 출처와 사용 권리 확인"],
    readinessChecksKo: ["공간 좌우 방향이 이전 컷과 이어진다", "캐릭터와 오브젝트가 자연스럽게 접지된다", "배경 에셋의 사용 범위가 확인됐다"],
    actions: [workAction("layout-bg3d", "bg3d", "3D 장면 연출", "3D scene"), projectAction("layout-series", "assets", "series", "Series Kit", "Series Kit"), projectAction("layout-rights", "assets", "rights", "에셋 권리", "Asset rights")],
  },
  {
    stageId: "line", order: 9, titleKo: "스케치·선화", titleEn: "Sketch & line art",
    inputKo: "잠금 콘티·배경 레이아웃·캐릭터 디자인 기준",
    handoffKo: "포즈·표정·비례가 승인된 선화 원고를 채색 단계로 넘깁니다.",
    reworkRiskKo: "캐릭터 비례와 손·소품 오류를 채색 이후 발견하면 후속 공정 전체를 되돌립니다.",
    conveniencesKo: ["드로잉 작업공간의 브러시·레이어·선택 도구", "Series Kit의 캐릭터·브러시 기준 재사용", "중요한 선화 상태를 버전으로 보관"],
    readinessChecksKo: ["표정과 포즈가 대사 의도와 맞다", "손·소품·의상 연속성이 맞다", "채색 가능한 선과 레이어가 준비됐다"],
    actions: [workAction("drawing", "canvas", "드로잉", "Drawing"), projectAction("line-series", "assets", "series", "Series Kit", "Series Kit"), projectAction("line-versions", "review", "versions", "버전", "Versions")],
  },
  {
    stageId: "color", order: 10, titleKo: "채색·명암·광원", titleEn: "Color & lighting",
    inputKo: "승인 선화·캐릭터 팔레트·장면 시간대와 광원 기준",
    handoffKo: "팔레트·명암·환경광이 통일된 채색 원고를 후반작업으로 넘깁니다.",
    reworkRiskKo: "팔레트와 광원 기준이 없으면 컷별 색이 흔들리고 후보정에서 일괄 수정하기 어렵습니다.",
    conveniencesKo: ["작품 팔레트와 소재를 Series Kit에서 재사용", "레이어 구조를 유지해 수정 범위 축소", "완료 컷부터 순차적으로 다음 공정에 전달"],
    readinessChecksKo: ["캐릭터 고유색이 장면마다 일치한다", "시간대와 주광 방향이 유지된다", "재질별 명암 차이가 읽힌다"],
    actions: [workAction("color-canvas", "canvas", "채색 작업", "Coloring"), projectAction("color-series", "assets", "series", "팔레트·스타일", "Palette & style"), projectAction("color-board", "production", "board", "완료 컷 전달", "Panel handoff")],
  },
  {
    stageId: "post-lettering", order: 11, titleKo: "후보정·이펙트·식자", titleEn: "Post & lettering",
    inputKo: "채색 원고·최종 대사·효과음·장면별 연출 의도",
    handoffKo: "효과·말풍선·식자까지 통합된 최종 원고를 QA에 넘깁니다.",
    reworkRiskKo: "말풍선 흐름을 마지막에만 보면 얼굴·손을 가리거나 스크롤 순서가 깨집니다.",
    conveniencesKo: ["웹툰 작업공간에서 말풍선·대사·효과음 편집", "글꼴·말풍선 규칙을 Series Kit에서 재사용", "수정 요청을 컷 위치에 직접 연결"],
    readinessChecksKo: ["말풍선 읽기 순서가 명확하다", "글자가 얼굴·손·중요 소품을 가리지 않는다", "효과가 중요한 정보보다 강하지 않다"],
    actions: [workAction("lettering", "comic", "말풍선·식자", "Lettering"), projectAction("lettering-series", "assets", "series", "글꼴·말풍선 기준", "Typography rules"), projectAction("lettering-comments", "review", "comments", "위치 기반 검토", "Contextual review")],
  },
  {
    stageId: "qa", order: 12, titleKo: "통합 QA·수정", titleEn: "Integrated QA",
    inputKo: "통합 최종 원고·플랫폼 규격·권리 및 등급 기준",
    handoffKo: "스토리·비주얼·스크롤·기술·권리 검사를 통과한 승인본을 납품으로 넘깁니다.",
    reworkRiskKo: "출력 직전에 오류를 찾으면 원본 수정·재출력·재검수까지 마감 시간을 연쇄 소비합니다.",
    conveniencesKo: ["승인·수정 요청·버전 비교를 한 흐름에서 처리", "출력 사전검사로 규격·누락·권리 확인", "승인본을 버전으로 남겨 이후 수정과 구분"],
    readinessChecksKo: ["오탈자와 설정 오류가 없다", "모바일 전체 스크롤에서 가독성이 유지된다", "출력 규격·권리·등급 조건을 통과했다"],
    actions: [projectAction("qa-approval", "review", "approvals", "최종 승인", "Final approval"), projectAction("qa-compare", "review", "compare", "수정본 비교", "Compare revisions"), projectAction("preflight", "export", "preflight", "출력 사전검사", "Preflight")],
  },
  {
    stageId: "delivery", order: 13, titleKo: "납품·예약·공개", titleEn: "Delivery & publish",
    inputKo: "최종 승인본·썸네일·회차 메타데이터·플랫폼 납품 규격",
    handoffKo: "재현 가능한 납품 패키지와 공개 기록을 남기고 연재 운영으로 넘깁니다.",
    reworkRiskKo: "원고와 메타데이터·크레딧을 따로 관리하면 재업로드와 현지화 때 같은 오류가 반복됩니다.",
    conveniencesKo: ["플랫폼 목적별 출력 규격을 먼저 선택", "납품 파일을 패키지 단위로 보관", "출력 이력과 공개 시점을 기록"],
    readinessChecksKo: ["썸네일·회차 제목·소개가 준비됐다", "파일 분할·용량·크기가 규격에 맞다", "크레딧·등급·경고 문구가 확인됐다"],
    actions: [projectAction("packages", "export", "packages", "납품 패키지", "Delivery packages"), projectAction("targets", "export", "targets", "게시 대상", "Destinations"), projectAction("history", "export", "history", "출력 기록", "Export history")],
  },
  {
    stageId: "feedback", order: 14, titleKo: "반응 분석·다음 회차 반영", titleEn: "Feedback & iteration",
    inputKo: "공개 결과·오류 제보·독자 반응·편집 피드백·제작 지표",
    handoffKo: "즉시 수정·다음 회차 개선·장기 참고를 구분한 회고를 다음 제작 주기에 반영합니다.",
    reworkRiskKo: "모든 반응을 즉시 스토리에 반영하면 비축분과 장기 플롯이 흔들립니다.",
    conveniencesKo: ["성과와 공개 후 데이터를 프로젝트에서 확인", "오류 수정과 일반 의견을 검토 흐름에서 분리", "개선 항목을 다음 회차 계획으로 연결"],
    readinessChecksKo: ["즉시 수정할 오류를 따로 분류했다", "다음 회차에 반영할 개선만 선택했다", "장기 플롯 변경은 별도 편집 검토로 남겼다"],
    actions: [projectAction("analytics", "export", "analytics", "공개 후 성과", "Analytics"), projectAction("feedback-comments", "review", "comments", "피드백 분류", "Feedback review"), projectAction("next-episode", "story", "episodes", "다음 회차 계획", "Next episode")],
  },
] as const;

export function webtoonProductionStageSupport(stageId: string): WebtoonProductionStageSupport | null {
  return WEBTOON_PRODUCTION_STAGE_SUPPORT.find((stage) => stage.stageId === stageId) ?? null;
}

export function webtoonProductionActionHref(
  projectId: string,
  action: WebtoonProductionSupportAction,
): string {
  const encoded = encodeURIComponent(projectId);
  const destination = action.destination;
  if (destination.kind === "work") {
    return `/studio/work/${encoded}/${destination.surface}`;
  }
  const params = new URLSearchParams({ view: destination.view });
  return `/studio/p/${encoded}/${destination.section}?${params.toString()}`;
}

export function webtoonProductionStagesForProjectView(
  section: string,
  view: string,
): readonly WebtoonProductionStageSupport[] {
  return WEBTOON_PRODUCTION_STAGE_SUPPORT.filter((stage) => (
    stage.actions.some((action) => (
      action.destination.kind === "project"
      && action.destination.section === section
      && action.destination.view === view
    ))
  ));
}
