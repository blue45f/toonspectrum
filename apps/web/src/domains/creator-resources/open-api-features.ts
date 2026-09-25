export type OpenApiFeatureStatus = "사용 가능" | "부분 사용" | "신청 준비" | "기술 검토" | "OAuth 설계";

export interface OpenApiFeature {
  title: string;
  description: string;
  providers: string;
  status: OpenApiFeatureStatus;
  route?: string;
}

export const OPEN_API_FEATURES: OpenApiFeature[] = [
  { title: "CC0 3D 장면 스타터", description: "PBR 재질·HDRI·3D 모델·지형을 배경과 소품 브리프로 저장합니다.", providers: "ambientCG · Poly Haven", status: "사용 가능", route: "/research/material-assets" },
  { title: "시대·문화 고증 보드", description: "복식·가구·장식·회화의 제작자·시대·권리 근거를 한 보드에서 비교합니다.", providers: "V&A · Rijksmuseum · Met · AIC · Cleveland", status: "사용 가능", route: "/research/vam" },
  { title: "우주·SF 시각 연구실", description: "행성·우주선·성운·지구 관측 이미지를 NASA 출처와 함께 저장합니다.", providers: "NASA Images", status: "사용 가능", route: "/research/space-assets" },
  { title: "글로벌 문화유산 횡단 검색", description: "박물관·도서관·아카이브 메타데이터를 권리 문구와 원문 링크까지 함께 저장합니다.", providers: "Smithsonian · Europeana · DPLA", status: "부분 사용", route: "/research/open-data/smithsonian" },
  { title: "한국 배경 장면 설계실", description: "실제 장소·문화유산·관광 해설·좌표를 장면 동선과 배경 브리프로 묶습니다.", providers: "국가유산청 · TourAPI · Odii · VWorld", status: "부분 사용", route: "/research/open-data" },
  { title: "한국어 대사·말투 연구실", description: "표준어·방언·고어·뜻풀이를 캐릭터 어휘 사전과 작품 용어집에 연결합니다.", providers: "국립국어원 사전", status: "신청 준비", route: "/research/open-data/korean" },
  { title: "생물·크리처 디자인 도감", description: "종 분류·서식지·분포·형태 근거를 크리처 디자인 카드로 구조화합니다.", providers: "국립생물자원관 · GBIF", status: "부분 사용", route: "/research/creatures" },
  { title: "날씨·빛 연출 도우미", description: "날짜·장소별 관측과 예보를 장면의 강수·구름·빛 연속성에 연결합니다.", providers: "기상청 · MET Norway", status: "부분 사용", route: "/research/weather-light" },
  { title: "소재·장르 관심 레이더", description: "검색·백과·뉴스 관심 신호를 서로 합산하지 않고 나란히 보여줍니다.", providers: "Wikimedia Analytics · 네이버 DataLab · GDELT", status: "부분 사용", route: "/research/open-data/wikimedia" },
  { title: "레터링·폰트 매처", description: "한글 지원·장르·굵기·스타일을 검색하고 실제 문구 렌더링으로 말풍선과 타이틀 후보를 비교합니다.", providers: "Google Fonts", status: "사용 가능", route: "/research/fonts" },
  { title: "역사 사진·신문 아카이브", description: "역사 사진·지도·신문·잡지를 원 제공기관 권리와 함께 발견합니다.", providers: "Internet Archive · Smithsonian · Europeana · DPLA", status: "부분 사용", route: "/research/archive" },
  { title: "학교물 현실성 캘린더", description: "학교 기본정보를 학교물 설정과 타임라인 검수에 연결하고, 학사일정·시간표는 최신 원문을 다시 확인합니다.", providers: "NEIS", status: "사용 가능", route: "/research/open-data/neis" },
  { title: "서울 도시 고증 랩", description: "교통·공원·시설·환경 데이터를 도시 배경과 이동 동선의 근거로 사용합니다.", providers: "서울 열린데이터광장 · VWorld", status: "신청 준비" },
  { title: "연재 배포 허브", description: "공지와 에피소드 링크를 채널별 형식으로 미리보기한 뒤 명시적 승인으로 게시합니다.", providers: "WordPress · Mastodon · Bluesky · Discord", status: "OAuth 설계" },
];
