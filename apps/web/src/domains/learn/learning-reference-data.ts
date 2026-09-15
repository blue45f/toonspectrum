export const EDUCATION_KIND_LABELS = {
  university: "대학·전문대학",
  academy: "사설 학원·교육원",
  public: "공공 교육",
  online: "온라인 교육",
} as const;

export type EducationKind = keyof typeof EDUCATION_KIND_LABELS;

export const EDUCATION_DELIVERY_LABELS = {
  "in-person": "오프라인",
  online: "온라인",
  hybrid: "온·오프라인",
} as const;

export type EducationDelivery = keyof typeof EDUCATION_DELIVERY_LABELS;

export const EDUCATION_GOAL_LABELS = {
  entrance: "입시",
  debut: "작가 데뷔",
  portfolio: "포트폴리오",
  hobby: "취미·기초",
  pd: "웹툰 PD",
  story: "스토리·콘티",
  art: "작화·채색",
  production: "제작 실무",
} as const;

export type EducationGoal = keyof typeof EDUCATION_GOAL_LABELS;

export const EDUCATION_REGIONS = ["서울", "경기", "수도권", "대전", "부산", "전남", "전국", "온라인"] as const;

export interface EducationInstitution {
  readonly id: string;
  readonly name: string;
  readonly kind: EducationKind;
  readonly region: typeof EDUCATION_REGIONS[number];
  readonly location: string;
  readonly delivery: readonly EducationDelivery[];
  readonly goals: readonly EducationGoal[];
  readonly focus: readonly string[];
  readonly summary: string;
  readonly costLabel: string;
  readonly officialUrl: string;
  readonly sourceLabel: string;
  readonly verifiedAt: string;
}

export const EDUCATION_INSTITUTIONS: readonly EducationInstitution[] = [
  {
    id: "induk-webtoon-comics",
    name: "인덕대학교 웹툰만화학과",
    kind: "university",
    region: "서울",
    location: "서울 노원구",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "story", "art"],
    focus: ["웹툰 기획", "디지털 작화", "스토리텔링", "포트폴리오"],
    summary: "웹툰·만화 창작을 전공 과정으로 배우려는 입시생이 공식 학과 안내와 모집 요강을 함께 확인할 수 있는 대학 과정입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://www.induk.ac.kr/",
    sourceLabel: "인덕대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "cheonggang-cartoon-school",
    name: "청강문화산업대학교 만화콘텐츠스쿨",
    kind: "university",
    region: "경기",
    location: "경기 이천시",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "story", "art", "production"],
    focus: ["만화·웹툰 창작", "스토리", "연출", "프로젝트 제작"],
    summary: "만화·웹툰 콘텐츠 제작을 학교 단위 커리큘럼과 프로젝트로 배우려는 입시생을 위한 전문대학 과정입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://www.ck.ac.kr/",
    sourceLabel: "청강문화산업대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "sejong-cartoon-animation-tech",
    name: "세종대학교 만화애니메이션텍",
    kind: "university",
    region: "서울",
    location: "서울 광진구",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "story", "art", "production"],
    focus: ["만화·애니메이션", "디지털 콘텐츠", "기획", "작화"],
    summary: "만화와 애니메이션을 디지털 콘텐츠 제작 관점에서 함께 공부하려는 입시생이 살펴볼 수 있는 대학 전공입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://www.sejong.ac.kr/",
    sourceLabel: "세종대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "mokwon-webtoon",
    name: "목원대학교 웹툰학과",
    kind: "university",
    region: "대전",
    location: "대전 서구",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "story", "art"],
    focus: ["웹툰 창작", "디지털 드로잉", "스토리", "포트폴리오"],
    summary: "웹툰 창작을 학과 과정으로 배우고 작품 포트폴리오를 준비하려는 입시생을 위한 대학 전공입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://www.mokwon.ac.kr/",
    sourceLabel: "목원대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "dongseo-webtoon",
    name: "동서대학교 웹툰학과",
    kind: "university",
    region: "부산",
    location: "부산 사상구",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "story", "art", "production"],
    focus: ["웹툰 제작", "캐릭터", "연출", "산학 프로젝트"],
    summary: "웹툰 제작과 콘텐츠 산업 실무를 대학 커리큘럼 안에서 준비하려는 입시생이 확인할 수 있는 전공입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://uni.dongseo.ac.kr/",
    sourceLabel: "동서대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "cheongam-webtoon-content",
    name: "청암대학교 웹툰콘텐츠학과",
    kind: "university",
    region: "전남",
    location: "전남 순천시",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "story", "art"],
    focus: ["웹툰 콘텐츠", "디지털 작화", "캐릭터", "포트폴리오"],
    summary: "웹툰 콘텐츠 창작을 전문대학 과정과 전공심화 안내까지 함께 검토하려는 입시생을 위한 학과입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://www.ca.ac.kr/",
    sourceLabel: "청암대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "gtec-webtoon-illustration",
    name: "경기과학기술대학교 웹툰일러스트학과",
    kind: "university",
    region: "경기",
    location: "경기 시흥시",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "art", "production"],
    focus: ["웹툰", "일러스트", "디지털 드로잉", "작품 제작"],
    summary: "웹툰과 일러스트레이션을 함께 배우며 제작 포트폴리오를 준비하려는 입시생이 살펴볼 수 있는 전공입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://www.gtec.ac.kr/",
    sourceLabel: "경기과학기술대학교 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "yeonsung-webtoon-comics",
    name: "연성대학교 웹툰만화콘텐츠과",
    kind: "university",
    region: "경기",
    location: "경기 안양시",
    delivery: ["in-person"],
    goals: ["entrance", "portfolio", "debut", "story", "art"],
    focus: ["웹툰·만화 콘텐츠", "스토리", "연출", "디지털 작화"],
    summary: "웹툰·만화 콘텐츠의 기획과 작화를 전문대학 과정으로 익히려는 입시생을 위한 학과입니다.",
    costLabel: "등록금·전형별 공식 안내 확인",
    officialUrl: "https://dept.yeonsung.ac.kr/",
    sourceLabel: "연성대학교 공식 학과 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "seoul-webtoon-academy",
    name: "서울웹툰아카데미",
    kind: "academy",
    region: "서울",
    location: "서울",
    delivery: ["in-person"],
    goals: ["debut", "portfolio", "story", "art", "production"],
    focus: ["작품 기획", "콘티", "작화", "데뷔 포트폴리오"],
    summary: "작품 제작과 데뷔 준비를 중심으로 커리큘럼·강사진·모집 일정을 비교하려는 학습자가 확인할 수 있는 사설 교육기관입니다.",
    costLabel: "과정별 수강료 공식 안내 확인",
    officialUrl: "https://sawa.co.kr/",
    sourceLabel: "서울웹툰아카데미 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "ab-webtoon-academy",
    name: "AB웹툰아카데미",
    kind: "academy",
    region: "수도권",
    location: "수도권 지점",
    delivery: ["in-person"],
    goals: ["entrance", "debut", "portfolio", "story", "art"],
    focus: ["웹툰 입시", "드로잉", "연출", "클립스튜디오"],
    summary: "웹툰학과 입시와 작가 양성 과정을 목적별로 비교하려는 학습자가 지점·과정 정보를 확인할 수 있는 사설 교육기관입니다.",
    costLabel: "지점·과정별 수강료 공식 안내 확인",
    officialUrl: "https://abacademy.kr/",
    sourceLabel: "AB웹툰아카데미 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "sbs-webtoon-academy",
    name: "SBS아카데미웹툰학원",
    kind: "academy",
    region: "전국",
    location: "전국 지점",
    delivery: ["in-person"],
    goals: ["entrance", "debut", "portfolio", "pd", "story", "art", "production"],
    focus: ["웹툰·웹소설", "입시", "작가 데뷔", "웹툰 PD"],
    summary: "입시·작가 데뷔·스튜디오 취업 등 목표별 과정을 여러 지점에서 비교하려는 학습자를 위한 사설 교육기관입니다.",
    costLabel: "지점·과정별 수강료 공식 안내 확인",
    officialUrl: "https://sbswebtoon.com/",
    sourceLabel: "SBS아카데미웹툰학원 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "educocca-webtoon",
    name: "에듀코카 만화·웹툰 교육",
    kind: "online",
    region: "온라인",
    location: "온라인",
    delivery: ["online"],
    goals: ["hobby", "debut", "pd", "story", "art", "production"],
    focus: ["웹툰 콘티", "기획·시나리오", "콘텐츠 산업", "온라인 강의"],
    summary: "한국콘텐츠진흥원이 운영하는 온라인 교육 플랫폼에서 웹툰 제작과 콘텐츠 산업 관련 강의를 찾아볼 수 있습니다.",
    costLabel: "무료 온라인 콘텐츠 중심·과정별 확인",
    officialUrl: "https://edu.kocca.kr/edu/main/main.do",
    sourceLabel: "에듀코카 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "kamt",
    name: "한국만화웹툰아카데미",
    kind: "public",
    region: "경기",
    location: "경기 부천시 웹툰융합센터",
    delivery: ["in-person", "online"],
    goals: ["debut", "portfolio", "story", "art", "production"],
    focus: ["창작 프로젝트", "현업 작가 코칭", "특강", "온라인 교육"],
    summary: "한국만화영상진흥원이 운영하는 교육 포털로 연구과정 모집과 온라인 교육·특강 정보를 함께 확인할 수 있습니다.",
    costLabel: "모집 과정별 지원 조건·비용 확인",
    officialUrl: "https://kamt.komacon.kr/",
    sourceLabel: "한국만화웹툰아카데미 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
  {
    id: "komacon-education",
    name: "한국만화영상진흥원 교육·캠프",
    kind: "public",
    region: "경기",
    location: "경기 부천시·프로그램별",
    delivery: ["in-person", "online"],
    goals: ["hobby", "debut", "portfolio", "story", "art", "production"],
    focus: ["창작 교육", "웹툰 캠퍼스", "멘토링", "공공 지원 프로그램"],
    summary: "진흥원 공지에서 연도별 교육·캠프·멘토링과 지역 연계 프로그램의 모집 여부를 확인할 수 있습니다.",
    costLabel: "프로그램별 참가 조건·비용 확인",
    officialUrl: "https://www.komacon.kr/komacon/",
    sourceLabel: "한국만화영상진흥원 공식 홈페이지",
    verifiedAt: "2026-09-16",
  },
] as const;

export interface EducationFilters {
  readonly query?: string;
  readonly kind?: EducationKind | "all";
  readonly region?: typeof EDUCATION_REGIONS[number] | "all";
  readonly delivery?: EducationDelivery | "all";
  readonly goal?: EducationGoal | "all";
}

function normalizedTokens(value: string): readonly string[] {
  return value.trim().toLocaleLowerCase("ko-KR").split(/\s+/u).filter(Boolean).slice(0, 8);
}

export function filterEducationInstitutions(
  filters: EducationFilters,
  institutions: readonly EducationInstitution[] = EDUCATION_INSTITUTIONS,
): readonly EducationInstitution[] {
  const tokens = normalizedTokens(filters.query ?? "");
  return institutions.filter((institution) => {
    const searchable = [
      institution.name,
      institution.location,
      institution.summary,
      institution.sourceLabel,
      ...institution.focus,
      ...institution.goals.map((goal) => EDUCATION_GOAL_LABELS[goal]),
    ].join(" ").toLocaleLowerCase("ko-KR");

    return (!filters.kind || filters.kind === "all" || institution.kind === filters.kind)
      && (!filters.region || filters.region === "all" || institution.region === filters.region)
      && (!filters.delivery || filters.delivery === "all" || institution.delivery.includes(filters.delivery))
      && (!filters.goal || filters.goal === "all" || institution.goals.includes(filters.goal))
      && tokens.every((token) => searchable.includes(token));
  });
}

export type CareerRoleId =
  | "creator"
  | "story"
  | "storyboard"
  | "line-art"
  | "background"
  | "color"
  | "lettering"
  | "producer";

export interface WebtoonProcessStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly summary: string;
  readonly tasks: readonly string[];
  readonly outputs: readonly string[];
  readonly roleIds: readonly CareerRoleId[];
  readonly beginnerNote: string;
  readonly studioHref: string;
  readonly studioLabel: string;
}

export const WEBTOON_PROCESS_STEPS: readonly WebtoonProcessStep[] = [
  {
    id: "idea",
    order: 1,
    title: "아이디어와 목표 정하기",
    summary: "누구에게 어떤 감정을 전달할지, 단편인지 연재물인지부터 정합니다.",
    tasks: ["한 줄 소개 작성", "장르·독자 정의", "단편·연재 형식 선택", "참고 작품과 분위기 수집"],
    outputs: ["로그라인", "독자·장르 메모", "레퍼런스 보드"],
    roleIds: ["creator", "story", "producer"],
    beginnerNote: "설정을 많이 만드는 것보다 독자가 첫 회에서 보게 될 갈등을 한 문장으로 적는 편이 먼저입니다.",
    studioHref: "/studio/new",
    studioLabel: "새 프로젝트 만들기",
  },
  {
    id: "planning",
    order: 2,
    title: "작품 기획과 세계관",
    summary: "작품의 차별점, 전체 줄거리, 회차 흐름과 세계의 규칙을 문서로 정리합니다.",
    tasks: ["작품 기획서 작성", "세계관 규칙 정리", "주요 갈등 설계", "회차별 사건 배열"],
    outputs: ["작품 기획서", "세계관 문서", "전체 시놉시스", "회차 계획표"],
    roleIds: ["creator", "story", "producer"],
    beginnerNote: "세계관 설명이 이야기보다 앞서지 않도록, 규칙마다 실제 장면에서 쓰일 이유를 붙여 보세요.",
    studioHref: "/story-lab",
    studioLabel: "스토리 연구실 열기",
  },
  {
    id: "characters",
    order: 3,
    title: "캐릭터와 관계 설계",
    summary: "외형뿐 아니라 욕망·약점·관계 변화가 장면에서 드러나도록 인물을 설계합니다.",
    tasks: ["주요 인물의 욕망·갈등 작성", "인물 관계도 만들기", "표정·포즈 탐색", "의상·소품 규칙 정리"],
    outputs: ["캐릭터 시트", "인물 관계도", "표정·포즈 시트", "의상·소품 보드"],
    roleIds: ["creator", "story", "line-art"],
    beginnerNote: "설명문보다 선택과 행동으로 성격이 보이게 만들면 콘티 단계가 쉬워집니다.",
    studioHref: "/studio/character",
    studioLabel: "캐릭터 작업실 열기",
  },
  {
    id: "script",
    order: 4,
    title: "시나리오와 대사",
    summary: "회차의 시작·전환·클라이맥스·마무리를 장면과 대사 단위로 풀어냅니다.",
    tasks: ["장면 목록 작성", "장면별 목표·갈등 기록", "대사 초안 작성", "회차 끝의 다음 화 동기 설계"],
    outputs: ["회차 시나리오", "장면 목록", "대사 초안"],
    roleIds: ["creator", "story", "producer"],
    beginnerNote: "대사는 정보 전달보다 인물이 원하는 것을 얻으려는 행동으로 쓰면 자연스러워집니다.",
    studioHref: "/story-lab",
    studioLabel: "회차 이야기 설계하기",
  },
  {
    id: "storyboard",
    order: 5,
    title: "콘티와 세로 스크롤 연출",
    summary: "컷 크기·간격·카메라·말풍선 순서로 독자의 시선과 읽는 속도를 설계합니다.",
    tasks: ["컷 분할", "카메라 구도 선택", "스크롤 여백 조절", "말풍선·효과음 위치 배치"],
    outputs: ["러프 콘티", "컷별 연출 메모", "대사·말풍선 배치"],
    roleIds: ["creator", "storyboard", "lettering", "producer"],
    beginnerNote: "한 컷의 그림 완성도보다 컷 사이에서 정보와 감정이 어떻게 바뀌는지 먼저 확인하세요.",
    studioHref: "/learn/recipes",
    studioLabel: "연출 레시피 실험하기",
  },
  {
    id: "art",
    order: 6,
    title: "러프부터 작화 완성",
    summary: "러프·선화·배경·채색·효과·식자를 역할과 레이어 단위로 나누어 제작합니다.",
    tasks: ["러프와 선화", "배경 제작", "밑색·명암·후보정", "말풍선·식자·효과음"],
    outputs: ["선화 원고", "배경 레이어", "채색 원고", "식자 완료본"],
    roleIds: ["creator", "line-art", "background", "color", "lettering"],
    beginnerNote: "레이어 이름과 담당 범위를 먼저 정하면 협업 수정과 재사용 비용이 크게 줄어듭니다.",
    studioHref: "/studio",
    studioLabel: "Studio에서 원고 작업하기",
  },
  {
    id: "review",
    order: 7,
    title: "검수와 수정",
    summary: "오탈자·설정·시선 흐름·작화 일관성·플랫폼 규격을 체크리스트로 검수합니다.",
    tasks: ["대사·오탈자 검수", "캐릭터·배경 일관성 확인", "컷 순서·시선 흐름 점검", "수정 요청과 승인 관리"],
    outputs: ["검수 체크리스트", "수정 요청 목록", "승인본", "버전 기록"],
    roleIds: ["creator", "lettering", "producer"],
    beginnerNote: "작업자 자신이 바로 검수하기보다 잠시 간격을 두거나 다른 사람이 읽게 하면 누락을 더 잘 찾습니다.",
    studioHref: "/studio/review",
    studioLabel: "리뷰·승인 화면 열기",
  },
  {
    id: "export",
    order: 8,
    title: "내보내기와 업로드 준비",
    summary: "플랫폼 규격에 맞게 이미지를 분할·압축하고 썸네일과 소개 정보를 준비합니다.",
    tasks: ["플랫폼 규격 확인", "이미지 분할·용량 최적화", "대표 이미지 제작", "작품 소개·회차 정보 작성"],
    outputs: ["업로드 이미지", "썸네일", "작품·회차 메타데이터", "원본 보관본"],
    roleIds: ["creator", "lettering", "producer"],
    beginnerNote: "원본과 업로드용 파일을 분리하고, 내보내기 전 원본 백업부터 확인하세요.",
    studioHref: "/studio/publish",
    studioLabel: "게시 준비 점검하기",
  },
  {
    id: "serialization",
    order: 9,
    title: "연재 일정과 운영",
    summary: "마감·회차 재고·독자 반응·수정 이력을 관리하며 다음 제작 주기를 안정화합니다.",
    tasks: ["마감 일정 관리", "회차 재고 점검", "독자 반응 기록", "시즌·협업·정산 자료 정리"],
    outputs: ["연재 캘린더", "회차 상태표", "반응·개선 노트", "시즌 회고"],
    roleIds: ["creator", "producer"],
    beginnerNote: "모든 반응을 즉시 반영하기보다 작품 목표와 반복해서 나타나는 문제를 구분해 기록하세요.",
    studioHref: "/studio/projects",
    studioLabel: "프로젝트와 일정 관리하기",
  },
] as const;

export interface WebtoonCareerRole {
  readonly id: CareerRoleId;
  readonly title: string;
  readonly summary: string;
  readonly responsibilities: readonly string[];
  readonly skills: readonly string[];
  readonly portfolioEvidence: readonly string[];
  readonly processStepIds: readonly string[];
  readonly educationGoal: EducationGoal;
}

export const WEBTOON_CAREER_ROLES: readonly WebtoonCareerRole[] = [
  {
    id: "creator",
    title: "웹툰 작가",
    summary: "기획부터 연출·작화·연재까지 작품 전체를 책임하거나 팀을 이끄는 창작자입니다.",
    responsibilities: ["작품 방향 결정", "회차 제작", "마감·품질 관리"],
    skills: ["스토리텔링", "콘티", "작화", "자기 일정 관리"],
    portfolioEvidence: ["완결된 단편 또는 연재 샘플", "캐릭터·세계관 자료", "제작 과정 설명"],
    processStepIds: ["idea", "planning", "characters", "script", "storyboard", "art", "review", "export", "serialization"],
    educationGoal: "debut",
  },
  {
    id: "story",
    title: "스토리 작가",
    summary: "작품의 세계관·인물·전체 줄거리와 회차별 사건·대사를 설계합니다.",
    responsibilities: ["기획·시놉시스", "회차 시나리오", "인물과 갈등 설계"],
    skills: ["서사 구조", "대사", "리서치", "피드백 반영"],
    portfolioEvidence: ["작품 기획서", "회차 시나리오", "장면별 의도 설명"],
    processStepIds: ["idea", "planning", "characters", "script", "storyboard"],
    educationGoal: "story",
  },
  {
    id: "storyboard",
    title: "콘티 작가",
    summary: "시나리오를 컷·카메라·스크롤 호흡과 인물 동선으로 바꾸는 연출 담당입니다.",
    responsibilities: ["컷 분할", "카메라·동선 연출", "말풍선 흐름 설계"],
    skills: ["시각 연출", "공간 이해", "세로 스크롤 리듬", "협업 문서화"],
    portfolioEvidence: ["러프 콘티", "완성본과의 비교", "연출 의도 주석"],
    processStepIds: ["script", "storyboard", "review"],
    educationGoal: "story",
  },
  {
    id: "line-art",
    title: "작화·선화 담당",
    summary: "캐릭터와 주요 오브젝트를 러프에서 완성 선화로 정리해 작품의 시각적 기준을 만듭니다.",
    responsibilities: ["인물 러프·선화", "표정·동작 표현", "작화 일관성 유지"],
    skills: ["인체·원근", "선의 강약", "캐릭터 재현", "레이어 관리"],
    portfolioEvidence: ["러프→선화 과정", "다양한 표정·동작", "연속 컷 일관성"],
    processStepIds: ["characters", "storyboard", "art", "review"],
    educationGoal: "art",
  },
  {
    id: "background",
    title: "배경 담당",
    summary: "장면의 공간·원근·소품과 분위기를 설계하고 반복 사용 가능한 배경 자산을 제작합니다.",
    responsibilities: ["공간 설계", "배경 작화·3D 활용", "소품·시간대 표현"],
    skills: ["투시", "건축·공간 관찰", "3D·사진 참고", "라이선스 확인"],
    portfolioEvidence: ["실내·실외 배경", "시간대·날씨 변형", "3D 또는 자료 활용 과정"],
    processStepIds: ["planning", "storyboard", "art", "review"],
    educationGoal: "art",
  },
  {
    id: "color",
    title: "채색·후보정 담당",
    summary: "색·명암·빛·효과로 장면의 감정과 가독성을 완성하고 회차 전체의 톤을 맞춥니다.",
    responsibilities: ["밑색·명암", "조명·분위기", "효과·후보정"],
    skills: ["색채", "광원", "레이어 합성", "색상 일관성"],
    portfolioEvidence: ["채색 전후 비교", "시간대별 조명", "회차 톤 가이드"],
    processStepIds: ["art", "review", "export"],
    educationGoal: "art",
  },
  {
    id: "lettering",
    title: "식자·편집 담당",
    summary: "말풍선·대사·효과음과 파일 규격을 정리해 독자가 자연스럽게 읽을 최종 원고를 만듭니다.",
    responsibilities: ["말풍선·대사 배치", "효과음·폰트 관리", "오탈자·규격 검수"],
    skills: ["가독성", "타이포그래피", "교정", "내보내기 규격"],
    portfolioEvidence: ["식자 전후 비교", "대사 흐름 예시", "검수 체크리스트"],
    processStepIds: ["storyboard", "art", "review", "export"],
    educationGoal: "production",
  },
  {
    id: "producer",
    title: "웹툰 PD·제작 프로듀서",
    summary: "작품 기획·작가 커뮤니케이션·일정·품질·플랫폼 운영을 연결하는 제작 책임자입니다.",
    responsibilities: ["작품 개발", "일정·예산·리스크 관리", "피드백·플랫폼 커뮤니케이션"],
    skills: ["콘텐츠 기획", "편집", "프로젝트 관리", "시장·독자 이해"],
    portfolioEvidence: ["작품기획서", "제작 일정·리스크 계획", "피드백·개선 사례"],
    processStepIds: ["idea", "planning", "script", "storyboard", "review", "export", "serialization"],
    educationGoal: "pd",
  },
] as const;

export function processStepTitle(stepId: string): string {
  return WEBTOON_PROCESS_STEPS.find((step) => step.id === stepId)?.title ?? stepId;
}
