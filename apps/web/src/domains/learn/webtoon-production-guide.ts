export type WebtoonProductionModelId = "solo" | "creator-assistant" | "studio" | "platform-global";

export interface WebtoonProductionModel {
  readonly id: WebtoonProductionModelId;
  readonly title: string;
  readonly summary: string;
  readonly ownership: string;
  readonly reviewStyle: string;
  readonly planningFocus: readonly string[];
}

export const WEBTOON_PRODUCTION_MODELS: readonly WebtoonProductionModel[] = [
  {
    id: "solo",
    title: "개인 독립 연재",
    summary: "한 사람이 기획·콘티·작화·업로드를 대부분 담당하는 방식입니다.",
    ownership: "역할을 사람 대신 시간대와 체크리스트로 분리",
    reviewStyle: "자가 검수 + 신뢰할 수 있는 외부 독자 검수",
    planningFocus: ["작화량 제한", "휴식 포함 마감", "원본·업로드본 분리", "최소 버퍼"],
  },
  {
    id: "creator-assistant",
    title: "작가·어시스턴트형",
    summary: "메인 작가가 작품 방향과 핵심 작화를 맡고 배경·채색·식자 등을 분담합니다.",
    ownership: "메인 작가가 최종 결정, 어시스턴트는 공정별 명시 책임",
    reviewStyle: "콘티·스케치에서 조기 검수하고 최종 작가 승인",
    planningFocus: ["전달 파일 규칙", "공정별 마감", "수정 요청 우선순위", "크레딧·비용"],
  },
  {
    id: "studio",
    title: "CP·스튜디오 분업형",
    summary: "각색·콘티·선화·배경·채색·후보정·식자를 직무별 파이프라인으로 운영합니다.",
    ownership: "PD·AD·공정 리드가 승인 게이트와 처리량을 관리",
    reviewStyle: "대본·콘티·작화·최종 원고를 단계별 잠금",
    planningFocus: ["의존 관계", "병렬 회차", "담당자 처리량", "변경 영향도", "납품 SLA"],
  },
  {
    id: "platform-global",
    title: "플랫폼 오리지널·글로벌형",
    summary: "편집·콘텐츠 운영·마케팅·현지화가 제작 파이프라인과 함께 움직입니다.",
    ownership: "작가·스튜디오·편집·운영 조직이 계약된 책임 범위를 분담",
    reviewStyle: "창작 검수와 플랫폼 정책·현지화·론칭 검수를 분리",
    planningFocus: ["계약·권리", "론칭 패키지", "휴재·복귀", "데이터 회고", "언어별 납품"],
  },
] as const;

export type WebtoonLifecyclePhaseId =
  | "rights"
  | "strategy"
  | "concept"
  | "bible"
  | "season"
  | "visual"
  | "pilot"
  | "contract"
  | "preproduction"
  | "launch"
  | "serialization"
  | "archive";

export interface WebtoonLifecyclePhase {
  readonly id: WebtoonLifecyclePhaseId;
  readonly order: number;
  readonly title: string;
  readonly stage: "개발" | "제작 준비" | "론칭" | "연재 운영" | "완결 이후";
  readonly summary: string;
  readonly tasks: readonly string[];
  readonly outputs: readonly string[];
  readonly roles: readonly string[];
  readonly gate: string;
  readonly risk: string;
  readonly studioLabel: string;
  readonly studioHref: string;
}

export const WEBTOON_LIFECYCLE_PHASES: readonly WebtoonLifecyclePhase[] = [
  {
    id: "rights",
    order: 1,
    title: "원천 IP와 권리 확인",
    stage: "개발",
    summary: "오리지널인지 원작 각색인지 구분하고 웹툰화·해외 유통·2차적저작물 권한을 확인합니다.",
    tasks: ["원작·공동 저작자 확인", "웹툰화 허용 범위 기록", "해외·단행본·영상 권리 분리", "소재·폰트 라이선스 기준 설정"],
    outputs: ["IP 권리 관계표", "참여 저작자 목록", "허용 유통 범위", "계약 확인 목록"],
    roles: ["원작자", "작가", "PD", "사업·법무"],
    gate: "G0 · Rights ready",
    risk: "권리 범위가 불명확하면 제작 완료 후에도 연재·해외 유통이 중단될 수 있습니다.",
    studioLabel: "프로젝트 정보 준비",
    studioHref: "/studio/new?kind=webtoon&onboarding=production&start=source-ip&goal=contracted&team=small-team&cadence=undecided",
  },
  {
    id: "strategy",
    order: 2,
    title: "연재·사업 전략",
    stage: "개발",
    summary: "독립 연재·투고·계약 제작 중 목표를 정하고 분량·주기·예산·플랫폼 가설을 세웁니다.",
    tasks: ["목표 플랫폼과 독자 정의", "단편·시즌·장기 연재 선택", "회차 분량과 난이도 추정", "팀·예산·일정 가설 작성"],
    outputs: ["작품 사업 브리프", "목표 독자", "연재 주기 초안", "제작 규모 가설"],
    roles: ["작가", "PD", "CP", "편집자"],
    gate: "G1 · Route selected",
    risk: "연재 주기와 작화량이 맞지 않으면 론칭 직후 버퍼가 빠르게 소진됩니다.",
    studioLabel: "제작 트랙 진단",
    studioHref: "/learn/process#production-onboarding",
  },
  {
    id: "concept",
    order: 3,
    title: "작품 콘셉트 개발",
    stage: "개발",
    summary: "로그라인·주인공의 욕망·핵심 갈등·작품의 독자 약속과 차별점을 한 문서로 정리합니다.",
    tasks: ["한 줄 로그라인 작성", "주인공 목표와 장애물 정의", "장르·톤·독자 약속 정리", "비교 작품과 차별점 검토"],
    outputs: ["로그라인", "1페이지 콘셉트", "장르·톤 키워드", "비교 작품 표"],
    roles: ["작가", "스토리 작가", "PD"],
    gate: "G2 · Concept approved",
    risk: "설정은 풍부하지만 첫 회 갈등과 작품의 약속이 보이지 않는 상태를 피해야 합니다.",
    studioLabel: "콘셉트부터 시작",
    studioHref: "/studio/new?cadence=undecided&goal=independent&kind=webtoon&onboarding=production&start=idea&team=solo",
  },
  {
    id: "bible",
    order: 4,
    title: "시리즈 바이블",
    stage: "개발",
    summary: "세계관·캐릭터·복선·비주얼 규칙을 장기 연재 중 일관성을 지키는 기준서로 만듭니다.",
    tasks: ["세계관 규칙과 한계 기록", "캐릭터 목표·관계 변화 설계", "복선 공개·회수 시점 관리", "의상·색·말풍선 기준 작성"],
    outputs: ["세계관 문서", "캐릭터 시트", "관계도", "복선 목록", "비주얼 규칙"],
    roles: ["스토리 작가", "메인 작가", "AD", "PD"],
    gate: "G3 · Series bible approved",
    risk: "문서가 파일 묶음에 머물면 회차·장면과 연결되지 않아 설정 오류를 찾기 어렵습니다.",
    studioLabel: "스토리 작업공간",
    studioHref: "/studio/new?cadence=undecided&goal=pitch&kind=webtoon&onboarding=production&start=synopsis&team=small-team",
  },
  {
    id: "season",
    order: 5,
    title: "시즌·회차 아키텍처",
    stage: "개발",
    summary: "전체 이야기에서 시즌·아크·에피소드·장면·비트로 내려가며 정보와 감정 변화를 배치합니다.",
    tasks: ["시즌 시작·종료 상태 정의", "전환점과 중간 반전 배치", "회차별 목표·정보 공개 정리", "초기 3화와 엔딩 훅 설계"],
    outputs: ["시즌 맵", "스토리 아크", "에피소드 카드", "사건 연표"],
    roles: ["스토리 작가", "콘티 작가", "PD", "편집자"],
    gate: "G4 · Season map approved",
    risk: "회차별 사건은 있지만 시즌 변화와 인물 아크가 없으면 장기 페이싱이 흔들립니다.",
    studioLabel: "에피소드 설계 시작",
    studioHref: "/studio/new?cadence=weekly&goal=pitch&kind=webtoon&onboarding=production&start=synopsis&team=small-team",
  },
  {
    id: "visual",
    order: 6,
    title: "비주얼 개발",
    stage: "제작 준비",
    summary: "캐릭터·배경·색·레이어·브러시·3D·효과의 제작 기준을 실제 반복 가능한 수준으로 고정합니다.",
    tasks: ["캐릭터 턴어라운드·표정 제작", "주요 장소와 소품 기준 설정", "채색·광원·효과 가이드 작성", "파일·레이어·에셋 규칙 정의"],
    outputs: ["비주얼 바이블", "캐릭터·배경 시트", "채색 가이드", "레이어·파일 규칙"],
    roles: ["메인 작가", "AD", "선화", "배경", "채색"],
    gate: "G5 · Visual bible approved",
    risk: "보기 좋은 샘플보다 매주 같은 품질로 재현 가능한 스타일인지 검증해야 합니다.",
    studioLabel: "Series Kit 준비",
    studioHref: "/studio/assets",
  },
  {
    id: "pilot",
    order: 7,
    title: "파일럿·피치 패키지",
    stage: "제작 준비",
    summary: "첫 회차 또는 샘플 분량으로 작품성뿐 아니라 제작 가능성과 플랫폼 적합성을 검증합니다.",
    tasks: ["피치 문서와 전체 시놉시스 준비", "샘플 대본·콘티·완성 원고 제작", "첫 3화 진입 구조 검토", "반복 제작 시간 측정"],
    outputs: ["피치 덱", "파일럿 원고", "제작 견적", "수정·그린라이트 기록"],
    roles: ["작가", "PD", "편집자", "사업·마케팅"],
    gate: "G6 · Pilot greenlight",
    risk: "파일럿만 과도하게 고품질이면 정규 연재에서 같은 수준을 유지하기 어렵습니다.",
    studioLabel: "피치 프로젝트 만들기",
    studioHref: "/studio/new?cadence=weekly&goal=pitch&kind=webtoon&onboarding=production&start=synopsis&team=small-team",
  },
  {
    id: "contract",
    order: 8,
    title: "계약·예산·팀 확정",
    stage: "제작 준비",
    summary: "회차 수·마감·검수·수정·정산·휴재·해외·2차적저작물 조건과 공정별 책임을 확정합니다.",
    tasks: ["납품·승인·수정 조건 확인", "원고료·외주비·정산 구조 정리", "역할·크레딧·최종 승인자 지정", "휴재·중단·계약 종료 절차 확인"],
    outputs: ["계약 확인표", "예산표", "RACI", "팀·권한 목록", "납품 캘린더"],
    roles: ["작가", "PD", "CP", "플랫폼", "사업·법무"],
    gate: "G7 · Production greenlight",
    risk: "연재 계약과 IP 확장 권한을 같은 항목으로 취급하지 않아야 합니다.",
    studioLabel: "팀 제작 설정",
    studioHref: "/studio/new?cadence=weekly&goal=contracted&kind=webtoon&onboarding=production&start=script&team=studio",
  },
  {
    id: "preproduction",
    order: 9,
    title: "프리프로덕션·버퍼",
    stage: "제작 준비",
    summary: "표준 폴더·공정·검수·승인·플랫폼 출력 규칙을 만들고 선행 회차를 확보합니다.",
    tasks: ["공정·의존 관계 설계", "처리량과 마감 역산", "승인 게이트와 변경 규칙 설정", "에셋 확보와 선행 원고 제작"],
    outputs: ["제작 파이프라인", "회차 템플릿", "검수 체크리스트", "버퍼 기준선", "비상 대응 계획"],
    roles: ["PD", "AD", "공정 리드", "작가", "운영"],
    gate: "G8 · Launch buffer ready",
    risk: "회차 수만 세지 말고 각 회차가 어느 공정에 있는지와 병목을 함께 봐야 합니다.",
    studioLabel: "제작 파이프라인 시작",
    studioHref: "/studio/new?cadence=weekly&goal=team&kind=webtoon&onboarding=production&start=storyboard&team=studio",
  },
  {
    id: "launch",
    order: 10,
    title: "론칭 준비",
    stage: "론칭",
    summary: "작품 패키징·초기 공개 회차·예약 회차·홍보·댓글·긴급 수정 체계를 준비합니다.",
    tasks: ["제목·소개·썸네일·등급 확정", "초기 공개·예약 회차 검수", "티저·프로모션 일정 조율", "공개 직후 QA 담당 지정"],
    outputs: ["론칭 패키지", "편성표", "예약 회차", "프로모션 소재", "운영 런북"],
    roles: ["작가", "PD", "운영", "마케팅", "플랫폼"],
    gate: "G9 · Publish ready",
    risk: "완성 원고만 있고 썸네일·메타데이터·공개 후 대응이 준비되지 않은 상태를 피해야 합니다.",
    studioLabel: "출판 사전검사",
    studioHref: "/studio/new?cadence=weekly&goal=independent&kind=webtoon&onboarding=production&start=finished-art&team=solo",
  },
  {
    id: "serialization",
    order: 11,
    title: "연재 운영",
    stage: "연재 운영",
    summary: "여러 회차를 병렬 제작하면서 버퍼·병목·품질·독자 반응·휴재·복귀를 함께 관리합니다.",
    tasks: ["롤링 회차 보드 운영", "마감·버퍼·건강 위험 추적", "공개 직후 오류 점검", "반응을 즉시 수정·향후 반영·참고로 분류"],
    outputs: ["연재 캘린더", "회차 상태표", "리스크 로그", "성과·회고 노트", "휴재·복귀 계획"],
    roles: ["작가", "PD", "공정 리드", "운영", "편집자"],
    gate: "G10 · Weekly delivery accepted",
    risk: "한 회차의 완료율보다 여러 회차의 공정 흐름과 버퍼 감소 속도가 더 중요합니다.",
    studioLabel: "연재 운영 이전",
    studioHref: "/studio/new?cadence=weekly&goal=migration&kind=webtoon&onboarding=production&start=serializing&team=studio",
  },
  {
    id: "archive",
    order: 12,
    title: "시즌 종료·정산·IP 확장",
    stage: "완결 이후",
    summary: "회고·정산·원본 보관·크레딧을 마치고 현지화·단행본·영상·게임·굿즈 확장 가능성을 정리합니다.",
    tasks: ["시즌 데이터와 제작 회고", "계약 정산·크레딧 확정", "원본·에셋·버전 장기 보관", "현지화·외전·2차 사업 검토"],
    outputs: ["시즌 회고", "정산 기록", "완전한 아카이브", "현지화 패키지", "IP 확장 백로그"],
    roles: ["작가", "PD", "사업", "현지화", "아카이브 담당"],
    gate: "G11 · Season closed",
    risk: "완결 직후 원본·권리·크레딧을 정리하지 않으면 후속 사업 때 재확인 비용이 커집니다.",
    studioLabel: "프로젝트 보관 구조 보기",
    studioHref: "/learn/process#lifecycle",
  },
] as const;

export interface WebtoonEpisodePipelineStage {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly owner: string;
  readonly purpose: string;
  readonly checks: readonly string[];
  readonly output: string;
  readonly lock: string | null;
  readonly mayRunWith: readonly string[];
}

export const WEBTOON_EPISODE_PIPELINE: readonly WebtoonEpisodePipelineStage[] = [
  { id: "brief", order: 1, title: "회차 브리프", owner: "스토리·PD", purpose: "이번 회차가 전체 이야기에서 수행할 기능과 엔딩 훅을 정의합니다.", checks: ["시작·종료 상태", "감정 변화", "공개·비공개 정보", "예상 컷·고난도 요소"], output: "회차 브리프", lock: null, mayRunWith: ["이후 회차 플롯"] },
  { id: "beats", order: 2, title: "비트 시트", owner: "스토리", purpose: "장면을 쓰기 전에 사건·정보·감정의 순서를 배치합니다.", checks: ["도입·충돌·반전", "장면별 목적", "감정 곡선", "훅까지의 추진력"], output: "장면·비트 목록", lock: null, mayRunWith: ["레퍼런스 조사"] },
  { id: "script", order: 3, title: "대본·글콘티", owner: "각색·스토리", purpose: "장면·행동·대사·효과음·연출 의도를 작화 가능한 문서로 만듭니다.", checks: ["장면 번호", "인물·장소·시간", "대사와 행동", "신규 에셋 표시"], output: "회차 대본", lock: null, mayRunWith: ["캐릭터·장소 조사"] },
  { id: "script-lock", order: 4, title: "대본 검수·잠금", owner: "작가·PD·편집", purpose: "연출과 작화가 시작되기 전에 스토리 문제와 제작 범위를 확정합니다.", checks: ["회차 목적", "설정·대사", "컷 수", "고비용 장면 분산"], output: "잠금 대본", lock: "G6 · Script lock", mayRunWith: ["다음 회차 대본"] },
  { id: "storyboard", order: 5, title: "그림콘티", owner: "콘티 작가", purpose: "대본을 컷·카메라·말풍선·스크롤 리듬으로 변환합니다.", checks: ["시선 흐름", "컷 크기·간격", "대사 순서", "반전 사전 노출"], output: "러프 콘티", lock: null, mayRunWith: ["배경 사전 조사"] },
  { id: "storyboard-lock", order: 6, title: "콘티 검수·잠금", owner: "메인 작가·PD", purpose: "작화 비용이 커지기 전에 모바일 연출과 컷 구성을 승인합니다.", checks: ["모바일 미리보기", "반복 구도", "작화 비용", "신규 배경·소품"], output: "잠금 콘티", lock: "G7 · Storyboard lock", mayRunWith: ["다음 회차 콘티"] },
  { id: "breakdown", order: 7, title: "공정 분해·배정", owner: "PD·공정 리드", purpose: "회차를 장면·컷·공정·신규 에셋 단위로 나눠 담당자와 마감을 지정합니다.", checks: ["컷별 공정", "의존 관계", "담당자 처리량", "변경 영향"], output: "작업 패키지·담당표", lock: null, mayRunWith: ["배경 에셋 제작", "다음 회차 잠금"] },
  { id: "layout", order: 8, title: "배경·3D·카메라", owner: "배경·3D", purpose: "공간·투시·카메라·조명·캐릭터 접지 기준을 만듭니다.", checks: ["공간 연속성", "카메라 방향", "라이선스", "낮·밤·날씨"], output: "배경 레이아웃", lock: null, mayRunWith: ["인물 스케치", "신규 소품"] },
  { id: "line", order: 9, title: "스케치·선화", owner: "메인 작가·선화", purpose: "포즈·표정·비례를 검수한 뒤 최종 선으로 정리합니다.", checks: ["캐릭터 일관성", "손·소품", "좌우 방향", "채색 가능한 선"], output: "선화 원고", lock: "G8 · Art lock", mayRunWith: ["완료 컷 밑색", "후속 컷 배경"] },
  { id: "color", order: 10, title: "채색·명암·광원", owner: "채색", purpose: "캐릭터 팔레트와 장면 환경광을 기준으로 회차 톤을 통일합니다.", checks: ["팔레트", "시간대 광원", "재질", "장면 톤"], output: "채색 원고", lock: null, mayRunWith: ["선화 완료 컷 순차 처리"] },
  { id: "post-lettering", order: 11, title: "후보정·이펙트·식자", owner: "후보정·식자", purpose: "조명·속도선·효과와 대사·말풍선·효과음을 독서 흐름에 맞게 완성합니다.", checks: ["말풍선 순서", "글자 가독성", "효과 과다", "표정·손 가림"], output: "통합 최종 원고", lock: null, mayRunWith: ["완료 장면 우선 처리"] },
  { id: "qa", order: 12, title: "통합 QA·수정", owner: "작가·PD·QA", purpose: "스토리·비주얼·스크롤·기술·권리 기준으로 출판 가능 여부를 확인합니다.", checks: ["설정·오탈자", "작화 연속성", "모바일 스크롤", "규격·정책·권리"], output: "QA 리포트·승인본", lock: "G9 · Final approval", mayRunWith: ["다음 회차 후반 작업"] },
  { id: "delivery", order: 13, title: "납품·예약·공개", owner: "PD·운영", purpose: "플랫폼 파일·썸네일·메타데이터·크레딧을 묶어 납품하고 공개를 확인합니다.", checks: ["파일 패키지", "회차 제목·소개", "등급·경고", "공개 직후 오류"], output: "납품 패키지·공개 기록", lock: "G10 · Delivery accepted", mayRunWith: ["다음 회차 QA", "공개 후 분석"] },
  { id: "feedback", order: 14, title: "반응 분석·다음 회차 반영", owner: "작가·편집·운영", purpose: "오류 수정과 장기 개선을 구분해 다음 제작 주기에 반영합니다.", checks: ["즉시 수정", "향후 개선", "편집 검토", "참고 의견"], output: "회차 회고·개선 백로그", lock: null, mayRunWith: ["다음 회차 제작 전 공정"] },
] as const;

export const WEBTOON_ROLLING_PIPELINE = [
  { episode: "27화", stage: "플롯", owner: "스토리", risk: "normal" },
  { episode: "26화", stage: "대본", owner: "각색", risk: "normal" },
  { episode: "25화", stage: "그림콘티", owner: "콘티", risk: "watch" },
  { episode: "24화", stage: "배경·스케치", owner: "배경·메인", risk: "normal" },
  { episode: "23화", stage: "선화·채색", owner: "선화·채색", risk: "risk" },
  { episode: "22화", stage: "후보정·식자", owner: "후보정·식자", risk: "watch" },
  { episode: "21화", stage: "최종 QA", owner: "PD·QA", risk: "normal" },
  { episode: "20화", stage: "업로드 예약", owner: "운영", risk: "normal" },
  { episode: "19화", stage: "연재 중", owner: "운영", risk: "published" },
] as const;

export const WEBTOON_APPROVAL_GATES = [
  { id: "G0", title: "권리 확인", evidence: "원작·공동 저작·유통·2차 사업 범위" },
  { id: "G1", title: "연재 경로", evidence: "목표·독자·분량·주기·예산" },
  { id: "G2", title: "콘셉트", evidence: "로그라인·갈등·독자 약속·차별점" },
  { id: "G3", title: "시리즈 바이블", evidence: "세계관·캐릭터·복선·비주얼 기준" },
  { id: "G4", title: "시즌 맵", evidence: "아크·회차·정보 공개·엔딩 훅" },
  { id: "G5", title: "비주얼 기준", evidence: "캐릭터·배경·채색·파일 규칙" },
  { id: "G6", title: "파일럿·대본", evidence: "제작 가능성·대본 잠금·피치 패키지" },
  { id: "G7", title: "콘티·제작 승인", evidence: "모바일 연출·공정·예산·팀" },
  { id: "G8", title: "작화 잠금", evidence: "선화·배경·연속성" },
  { id: "G9", title: "최종 출판 승인", evidence: "스토리·비주얼·스크롤·기술·권리 QA" },
  { id: "G10", title: "납품 수락", evidence: "플랫폼 패키지·편성·공개 확인" },
  { id: "G11", title: "시즌 종료", evidence: "정산·크레딧·아카이브·회고" },
] as const;

export const WEBTOON_PROCESS_REFERENCES = [
  {
    label: "WEBTOON Creator 101",
    description: "독립 연재의 공개 준비·예약·분석·댓글 운영 자료",
    href: "https://www.webtoons.com/en/creators101/webtoon-academy/resource-list?resourceType=PUBLISH_CANVAS",
  },
  {
    label: "에듀코카",
    description: "콘티·기획·시나리오·콘텐츠 제작 교육 자료",
    href: "https://edu.kocca.kr/edu/main/main.do",
  },
  {
    label: "문화체육관광부 만화 분야 표준계약서",
    description: "웹툰 연재·공동 저작·2차적저작물 계약 유형 확인",
    href: "https://www.mcst.go.kr/web/s_data/generalData/dataView.jsp?pMenuCD=0405050000&pSeq=51",
  },
  {
    label: "Studio LICO 채용 직무",
    description: "글·그림 콘티, 선화, 배경, 채색, 후보정, 현지화 분업 사례",
    href: "https://recruit.studiolico.com/lico/recruitMain",
  },
] as const;
