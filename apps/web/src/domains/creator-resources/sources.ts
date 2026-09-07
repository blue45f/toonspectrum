/** Link-only sources are deliberately NOT represented as working integrations. */
export type ResourceSourceCommercialStatus =
  | "상업 핵심 후보"
  | "조건부 상업 이용"
  | "계약 후 이용"
  | "비상업·내부 검토"
  | "운영 제외";

export interface ResourceSource {
  name: string;
  category: string;
  status: string;
  commercial: ResourceSourceCommercialStatus;
  url: string;
  note: string;
}

export const RESOURCE_SOURCES: ResourceSource[] = [
  { name: "The Met", category: "창작 자료", status: "검색 어댑터 구현", commercial: "상업 핵심 후보", url: "https://metmuseum.github.io/", note: "키 없는 v1.1 검색과 상세 조회를 사용합니다. isPublicDomain=true이고 권리 제한 문구가 없는 자료만 CC0 미리보기로 표시합니다." },
  { name: "Open Library", category: "글로벌 판본", status: "검색 어댑터 구현", commercial: "조건부 상업 이용", url: "https://openlibrary.org/developers/api", note: "사람 중심의 저용량 작품·판본 발견에 사용합니다. 대량 카탈로그 동기화에는 월간 데이터 덤프를 별도로 검토하며 표지·원문 권리는 자동 승계하지 않습니다." },
  { name: "openBD", category: "일본 판본", status: "ISBN 조회 어댑터 구현", commercial: "조건부 상업 이용", url: "https://openbd.jp/", note: "ISBN 정확 조회로 일본 도서 서지를 확인합니다. 도서 소개·홍보 목적, 원본 정보의 임의 변경 금지, 수정·삭제 반영 조건을 보존합니다." },
  { name: "카카오 책 검색", category: "작품 탐색", status: "서버 인증키 필요", commercial: "조건부 상업 이용", url: "https://developers.kakao.com/docs/ko/daum-search/dev-guide", note: "도서 메타데이터 어댑터가 구현되어 있습니다. 카카오웹툰 전용 API가 아니며 KAKAO_REST_API_KEY가 없으면 연결 대기로 표시합니다." },
  { name: "기업마당", category: "창작 기회", status: "서버 인증키 필요", commercial: "조건부 상업 이용", url: "https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi", note: "지원사업 어댑터가 구현되어 있습니다. BIZINFO_API_KEY 필요. 접수 상태·정확한 마감 시간·신청 자격은 공식 공고 원문을 확인합니다." },
  { name: "만화규장각 KMAS", category: "한국 만화 IP", status: "기존 기능 재사용", commercial: "조건부 상업 이용", url: "https://www.kmas.or.kr/guide/openapi", note: "작품·만화책·작가·출판사·ISBN·연재·영화·드라마·게임·공연·행사·상품 메타데이터를 기존 카탈로그와 레퍼런스 검색에서 사용합니다." },
  { name: "국립중앙도서관", category: "한국 판본", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.nl.go.kr/NL/contents/N31101010000.do", note: "ISBN·SET ISBN·판사항·전자책 여부·발행일을 Work와 Edition 분리의 기준으로 사용할 후보입니다. 표지는 서지 메타데이터와 별도 권리로 판정합니다." },
  { name: "도서관 정보나루", category: "관심 신호", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.data4library.kr/apiUtilization", note: "대출·급상승·신착·지역·연령 데이터를 도서관 이용 신호로만 표시합니다. 플랫폼 조회수·매출과 합산하지 않습니다." },
  { name: "NDL Search", category: "일본 판본", status: "OAI-PMH·검색 연동 예정", commercial: "조건부 상업 이용", url: "https://ndlsearch.ndl.go.jp/help/api", note: "일본 국립국회도서관의 검색 API와 OAI-PMH를 사용해 판본·잡지·희귀자료를 증분 동기화할 후보입니다." },
  { name: "Japan Search", category: "일본 문화자료", status: "SPARQL 연동 예정", commercial: "조건부 상업 이용", url: "https://jpsearch.go.jp/static/developer/en.html", note: "일본의 도서관·박물관·미술관·아카이브 관계를 횡단 탐색하는 데 사용합니다. 원 제공기관의 권리 조건을 최종 기준으로 삼습니다." },
  { name: "Google Books", category: "글로벌 판본", status: "API 키 신청 예정", commercial: "조건부 상업 이용", url: "https://developers.google.com/books/docs/v1/using", note: "해외 판본·언어·ISBN 보강 후보입니다. 사용자 개인 서재는 별도 OAuth와 동의가 있을 때만 연결합니다." },
  { name: "Wikidata·Wikimedia", category: "지식 그래프", status: "연동 예정", commercial: "조건부 상업 이용", url: "https://www.mediawiki.org/wiki/Wikimedia_APIs", note: "다국어 제목·인물·기관·외부 ID를 연결합니다. Commons 이미지는 파일별 저작자·라이선스·동일조건 의무를 따로 저장합니다." },
  { name: "e뮤지엄", category: "한국 박물관", status: "서비스키·권리 매핑 예정", commercial: "조건부 상업 이용", url: "https://emuseum.go.kr/openApi", note: "유물·시대·재질·크기·이미지를 창작 리서치에 연결합니다. 공공누리 유형이 자료마다 다르므로 개별 레코드 단위로 상업 이용과 변경 가능성을 판정합니다." },
  { name: "문화포털·문화데이터광장", category: "문화·문양·행사", status: "연동 예정", commercial: "조건부 상업 이용", url: "https://www.culture.go.kr/data/openapi/openapiInfo.do", note: "전통문양·문화행사·교육·지원사업을 연구실과 캘린더에 연결할 후보입니다. API별 이용조건과 공공누리 유형을 따로 기록합니다." },
  { name: "공유마당", category: "이미지·음원", status: "권리 매핑 예정", commercial: "조건부 상업 이용", url: "https://gongu.copyright.or.kr/", note: "저작물별 CCL·공공누리와 원문 제공 범위를 확인합니다. 번역문·삽화·음원의 권리를 원작과 동일하게 간주하지 않습니다." },
  { name: "IIIF 제공기관", category: "고해상도 자료", status: "표준 어댑터 예정", commercial: "조건부 상업 이용", url: "https://iiif.io/api/presentation/3.0/", note: "Manifest의 rights와 requiredStatement를 그대로 보존하고, 확대 보기·다중 뷰·주석 기능에 사용합니다." },
  { name: "Openverse", category: "오픈 라이선스 검색", status: "원제공처 재검증 필요", commercial: "비상업·내부 검토", url: "https://openverse.org/", note: "발견 인덱스로만 사용합니다. Openverse 표시만으로 Studio 가져오기를 승인하지 않고 원 제공기관의 현재 라이선스를 다시 확인합니다." },
  { name: "Poly Haven", category: "3D·HDRI·텍스처", status: "상업 API 계약 검토", commercial: "계약 후 이용", url: "https://polyhaven.com/our-api", note: "에셋 자체의 CC0 조건과 API의 상업적 이용 조건을 분리합니다. 상업 API 계약 또는 후원 조건을 확인하기 전에는 운영 연동을 활성화하지 않습니다." },
  { name: "Smithsonian Open Access", category: "박물관·3D", status: "API 키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.si.edu/openaccess/devtools", note: "역사·자연사·과학·2D·3D 자료의 연구 후보입니다. 각 레코드의 사용조건과 제3자 권리를 확인합니다." },
  { name: "Europeana", category: "유럽 문화유산", status: "API 키 신청 예정", commercial: "조건부 상업 이용", url: "https://pro.europeana.eu/page/apis", note: "유럽 박물관·도서관·아카이브와 IIIF 자료를 연결합니다. rights statement와 원 제공기관 정보를 최종 판정에 사용합니다." },
  { name: "OpenStreetMap", category: "장소·건축", status: "자체·계약형 인프라 검토", commercial: "조건부 상업 이용", url: "https://www.openstreetmap.org/copyright", note: "장소·도로·건물 구조 연구에 사용합니다. ODbL 출처표시와 데이터베이스 공유 조건을 따르며 공개 타일 서버에 운영 트래픽을 의존하지 않습니다." },
  { name: "KOSIS", category: "공식 통계", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://kosis.kr/openapi/", note: "출판·콘텐츠·문화·인구 통계를 데이터 스토리에 사용합니다. 조사연도·작성기관·단위·집계범위를 함께 표시합니다." },
  { name: "K-Startup", category: "창작 기회", status: "공공데이터 서비스키 예정", commercial: "조건부 상업 이용", url: "https://www.k-startup.go.kr/", note: "예비창업·초기창업·지역·업력 조건을 Creator Compass에 연결합니다. 지원 가능 여부는 확정하지 않고 원문 근거를 표시합니다." },
  { name: "한국콘텐츠진흥원", category: "창작 기회", status: "공식 API·RSS 검토", commercial: "조건부 상업 이용", url: "https://www.kocca.kr/", note: "웹툰·콘텐츠 제작·번역·해외진출 공고를 공식 인터페이스나 검토된 최소 메타데이터로 연결할 후보입니다." },
  { name: "KOPIS·KMDb·KOBIS", category: "IP 확장", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00074", note: "공연·영화·개봉·박스오피스 데이터를 작품의 영상화·공연화 관계와 캘린더에 연결할 후보입니다." },
  { name: "AniList", category: "글로벌 만화·애니", status: "상업 라이선스 문의", commercial: "계약 후 이용", url: "https://docs.anilist.co/guide/terms-of-use", note: "만화·애니·인물·관계 메타데이터 후보입니다. 상업 라이선스가 확인되기 전 운영 기능은 비활성화합니다." },
  { name: "TMDB", category: "해외 영상화", status: "상업 라이선스 문의", commercial: "계약 후 이용", url: "https://developer.themoviedb.org/docs/faq", note: "해외 영화·TV 각색 정보 후보입니다. 상업 계약·출처표시·이미지 캐시 조건을 확인한 뒤 활성화합니다." },
  { name: "Freesound", category: "효과음·환경음", status: "상업 라이선스 문의", commercial: "계약 후 이용", url: "https://freesound.org/docs/api/terms_of_use.html", note: "Sound Lab 후보입니다. API 계약과 개별 음원 라이선스를 모두 통과한 경우에만 다운로드·프로젝트 포함을 허용합니다." },
  { name: "Open-Meteo", category: "날씨·빛", status: "상업 플랜 검토", commercial: "계약 후 이용", url: "https://open-meteo.com/", note: "Scene Lab의 날씨·일출·일몰 참고 후보입니다. 상업 운영 플랜과 데이터 출처표시 조건을 확인한 뒤 활성화합니다." },
  { name: "YouTube Data API", category: "공식 영상", status: "정책 검토 예정", commercial: "조건부 상업 이용", url: "https://developers.google.com/youtube/v3", note: "공식 예고편·인터뷰·학습 영상의 원문 연결 후보입니다. 영상 파일 수집·재편집·외부 지표와의 임의 합산은 하지 않습니다." },
  { name: "AI Hub", category: "데이터셋", status: "별도 신청·용도 검토", commercial: "비상업·내부 검토", url: "https://www.aihub.or.kr/", note: "데이터셋별 사용 목적과 상업·재배포·모델 학습 권리를 별도로 검토합니다. 완성 에셋 생성 API처럼 취급하지 않습니다." },
  { name: "Jikan·비공식 웹툰 API", category: "작품 탐색", status: "핵심 연동에서 제외", commercial: "운영 제외", url: "https://jikan.moe/", note: "비공식 중계 데이터의 안정성과 권리 범위가 불명확하므로 상용 서비스의 기준 카탈로그로 사용하지 않습니다." },
  { name: "알라딘 OpenAPI", category: "작품 탐색", status: "신규 연동 제외", commercial: "운영 제외", url: "https://www.aladin.co.kr/home/welcome.aspx", note: "서비스 종료 공지를 기준으로 새 의존성을 추가하지 않습니다." },
  { name: "네이버 책 검색", category: "작품 탐색", status: "신규 연동 제외", commercial: "운영 제외", url: "https://developers.naver.com/", note: "종료·이관된 기능에 새 의존성을 추가하지 않고 다른 공식 서지 공급자로 대체합니다." },
];
