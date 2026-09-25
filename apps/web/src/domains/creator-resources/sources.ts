import { ADDITIONAL_RESOURCE_SOURCES } from "./sources-extra";

/** Link-only sources are deliberately NOT represented as working integrations. */
export type ResourceSourceCommercialStatus =
  | "상업 핵심 후보"
  | "조건부 상업 이용"
  | "계약 후 이용"
  | "비상업·내부 검토"
  | "운영 제외";

export type ResourceSourceIntegrationStatus = "운영 연결" | "어댑터 구현" | "신청·승인 필요" | "기술 검토" | "계약 검토" | "운영 제외";
export type ResourceSourceAuthMode = "없음" | "API 키" | "OAuth" | "기관 승인" | "상업 계약";
export type ResourceSourceRightsMode = "CC0·퍼블릭 도메인" | "출처표시" | "레코드별 확인" | "메타데이터 전용" | "계약 필요" | "사용 제외";
export type ResourceSourceImportMode = "Studio 직접 가져오기" | "레퍼런스 보드" | "검색·원문 링크" | "운영 차단";

export interface ResourceSource {
  freeAccess?: boolean;
  freeKeyless?: boolean;
  integration?: ResourceSourceIntegrationStatus;
  auth?: ResourceSourceAuthMode;
  rights?: ResourceSourceRightsMode;
  importMode?: ResourceSourceImportMode;
  termsReviewedAt?: string;
  productRoute?: string;
  name: string;
  category: string;
  status: string;
  commercial: ResourceSourceCommercialStatus;
  url: string;
  note: string;
}

export function isFreeResourceSource(source: ResourceSource): boolean {
  return source.freeAccess === true || source.freeKeyless === true;
}

export function resourceSourceCostLabel(source: ResourceSource): string {
  if (source.freeKeyless === true) return "무료 · 키 없음";
  if (source.freeAccess === true) return "무료 · 키/신청 필요";
  if (source.commercial === "계약 후 이용") return "유료·계약 필요";
  if (source.commercial === "운영 제외") return "운영 제외";
  return "비용·약관 확인";
}

export function resourceSourceIntegrationLabel(source: ResourceSource): ResourceSourceIntegrationStatus {
  if (source.integration) return source.integration;
  if (source.commercial === "운영 제외") return "운영 제외";
  if (source.commercial === "계약 후 이용") return "계약 검토";
  if (source.status.includes("구현") || source.status.includes("연결")) return "어댑터 구현";
  if (source.status.includes("신청") || source.status.includes("승인") || source.status.includes("키")) return "신청·승인 필요";
  return "기술 검토";
}

export function resourceSourceAuthLabel(source: ResourceSource): ResourceSourceAuthMode {
  if (source.auth) return source.auth;
  if (source.freeKeyless) return "없음";
  if (source.commercial === "계약 후 이용") return "상업 계약";
  return "API 키";
}

export function resourceSourceRightsLabel(source: ResourceSource): ResourceSourceRightsMode {
  if (source.rights) return source.rights;
  if (source.commercial === "운영 제외") return "사용 제외";
  if (source.commercial === "계약 후 이용") return "계약 필요";
  return "레코드별 확인";
}

export function resourceSourceImportLabel(source: ResourceSource): ResourceSourceImportMode {
  if (source.importMode) return source.importMode;
  if (source.commercial === "운영 제외" || source.commercial === "계약 후 이용") return "운영 차단";
  return "검색·원문 링크";
}

export const RESOURCE_SOURCES: ResourceSource[] = [
  { name: "한국어 위키백과", freeKeyless: true, category: "배경지식·용어", status: "키 없는 제목·원문 검색 구현", commercial: "조건부 상업 이용", url: "https://www.mediawiki.org/wiki/API:Cross-site_requests", note: "무료 창작 재료실에서 문서 제목·원문 링크만 검색합니다. 본문·이미지는 수집하지 않으며, 링크 저장을 이미지·본문의 복제 또는 각색 허락으로 표시하지 않습니다." },
  { name: "시카고 미술관 (Art Institute of Chicago)", freeKeyless: true, category: "복식·소품·배경", status: "무료·키 없는 검색 구현", commercial: "상업 핵심 후보", url: "https://api.artic.edu/docs/", note: "가입 없이 공식 API를 검색합니다. is_public_domain=true이며 저작권 제한이 없는 자료만 공개 미리보기를 표시합니다. CC BY 설명문은 수집하지 않고, 브리프에는 출처·조회일을 보존합니다." },
  { name: "클리블랜드 미술관", freeKeyless: true, category: "유물·문양·미술", status: "무료·키 없는 검색 구현", commercial: "상업 핵심 후보", url: "https://openaccess-api.clevelandart.org/", note: "공식 API를 한 번에 최대 12건 검색합니다. share_license_status=CC0 및 이미지 호스트를 확인하며, 저작권 제한이나 권리 미확인 항목은 제외합니다. 검색 결과는 기존 저장 보드와 제작실에서 활용합니다." },
  { name: "The Met", freeKeyless: true, category: "창작 자료", status: "검색 어댑터 구현", commercial: "상업 핵심 후보", url: "https://metmuseum.github.io/", note: "키 없는 v1.1 검색과 상세 조회를 사용합니다. isPublicDomain=true이고 권리 제한 문구가 없는 자료만 CC0 미리보기로 표시합니다." },
  { name: "Open Library", freeKeyless: true, category: "글로벌 판본", status: "검색 어댑터 구현", commercial: "조건부 상업 이용", url: "https://openlibrary.org/developers/api", note: "사람 중심의 저용량 작품·판본 발견에 사용합니다. 대량 카탈로그 동기화에는 월간 데이터 덤프를 별도로 검토하며 표지·원문 권리는 자동 승계하지 않습니다." },
  { name: "openBD", freeKeyless: true, category: "일본 판본", status: "ISBN 조회 어댑터 구현", commercial: "조건부 상업 이용", url: "https://openbd.jp/", note: "ISBN 정확 조회로 일본 도서 서지를 확인합니다. 도서 소개·홍보 목적, 원본 정보의 임의 변경 금지, 수정·삭제 반영 조건을 보존합니다." },
  { name: "카카오 책 검색", category: "작품 탐색", status: "서버 인증키 필요", commercial: "조건부 상업 이용", url: "https://developers.kakao.com/docs/ko/daum-search/dev-guide", note: "도서 메타데이터 어댑터가 구현되어 있습니다. 카카오웹툰 전용 API가 아니며 KAKAO_REST_API_KEY가 없으면 연결 대기로 표시합니다." },
  { name: "기업마당", freeAccess: true, category: "창작 기회", status: "무료 발급 양식 확인·운영키 등록 대기", commercial: "조건부 상업 이용", url: "https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi", note: "지원사업 어댑터가 구현되어 있습니다. BIZINFO_API_KEY 필요. 접수 상태·정확한 마감 시간·신청 자격은 공식 공고 원문을 확인합니다." },
  { name: "만화규장각 KMAS", freeAccess: true, category: "한국 만화 IP", status: "무료 승인키 확인·기존 검색 기능 연결", commercial: "조건부 상업 이용", url: "https://www.kmas.or.kr/guide/openapi", note: "관리자 승인이 완료된 서버 전용 KMAS_PRV_KEY를 사용하며 현재 인증 만료일은 2027-07-06입니다. 일 1,000회 한도 안에서 작품·만화책·작가·출판사·ISBN·장르·줄거리·표지 URL을 기존 카탈로그와 레퍼런스 검색에 보강하고, 키는 브라우저에 노출하지 않습니다." },
  { name: "국립중앙도서관", category: "한국 판본", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.nl.go.kr/NL/contents/N31101010000.do", note: "ISBN·SET ISBN·판사항·전자책 여부·발행일을 Work와 Edition 분리의 기준으로 사용할 후보입니다. 표지는 서지 메타데이터와 별도 권리로 판정합니다." },
  { name: "도서관 정보나루", category: "관심 신호", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.data4library.kr/apiUtilization", note: "대출·급상승·신착·지역·연령 데이터를 도서관 이용 신호로만 표시합니다. 플랫폼 조회수·매출과 합산하지 않습니다." },
  { name: "NDL Search", category: "일본 판본", status: "OAI-PMH·검색 연동 예정", commercial: "조건부 상업 이용", url: "https://ndlsearch.ndl.go.jp/help/api", note: "일본 국립국회도서관의 검색 API와 OAI-PMH를 사용해 판본·잡지·희귀자료를 증분 동기화할 후보입니다." },
  { name: "Japan Search", category: "일본 문화자료", status: "SPARQL 연동 예정", commercial: "조건부 상업 이용", url: "https://jpsearch.go.jp/static/developer/en.html", note: "일본의 도서관·박물관·미술관·아카이브 관계를 횡단 탐색하는 데 사용합니다. 원 제공기관의 권리 조건을 최종 기준으로 삼습니다." },
  { name: "Google Books", freeAccess: true, integration: "어댑터 구현", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "글로벌 판본", status: "무료 제한키 발급·검색 어댑터 구현·운영 등록 대기", commercial: "조건부 상업 이용", url: "https://developers.google.com/books/docs/v1/using", note: "결제 계정이 연결되지 않은 전용 프로젝트에서 Books API로만 제한한 서버 키를 발급했습니다. 해외 판본·언어·ISBN 메타데이터를 통합 검색하며 표지·미리보기·본문은 가져오지 않습니다. 사용자 개인 서재는 별도 OAuth와 동의가 있을 때만 연결합니다." },
  { name: "Wikidata·Wikimedia", freeKeyless: true, category: "지식 그래프·CC0 이미지", status: "무료·키 없는 Commons CC0 검색 구현", commercial: "조건부 상업 이용", url: "https://www.mediawiki.org/wiki/Wikimedia_APIs", note: "Open Creation에서 Commons 파일의 LicenseShortName이 정확히 CC0이고 출처·미리보기 호스트와 제한 없음이 확인된 경우만 표시합니다. 파일별 저작자·크레딧·조회일·원문 링크를 보존하며, 그 밖의 CCL 이미지는 현재 가져오지 않습니다." },
  { name: "e뮤지엄", category: "한국 박물관", status: "서비스키·권리 매핑 예정", commercial: "조건부 상업 이용", url: "https://emuseum.go.kr/openApi", note: "유물·시대·재질·크기·이미지를 창작 리서치에 연결합니다. 공공누리 유형이 자료마다 다르므로 개별 레코드 단위로 상업 이용과 변경 가능성을 판정합니다." },
  { name: "문화포털·문화데이터광장", category: "문화·문양·행사", status: "연동 예정", commercial: "조건부 상업 이용", url: "https://www.culture.go.kr/data/openapi/openapiInfo.do", note: "전통문양·문화행사·교육·지원사업을 연구실과 캘린더에 연결할 후보입니다. API별 이용조건과 공공누리 유형을 따로 기록합니다." },
  { name: "공유마당", category: "이미지·음원", status: "권리 매핑 예정", commercial: "조건부 상업 이용", url: "https://gongu.copyright.or.kr/", note: "저작물별 CCL·공공누리와 원문 제공 범위를 확인합니다. 번역문·삽화·음원의 권리를 원작과 동일하게 간주하지 않습니다." },
  { name: "IIIF 제공기관", category: "고해상도 자료", status: "표준 어댑터 예정", commercial: "조건부 상업 이용", url: "https://iiif.io/api/presentation/3.0/", note: "Manifest의 rights와 requiredStatement를 그대로 보존하고, 확대 보기·다중 뷰·주석 기능에 사용합니다." },
  { name: "Openverse", freeKeyless: true, category: "오픈 라이선스 검색", status: "discovery 어댑터 구현·원제공처 재검증", commercial: "비상업·내부 검토", url: "https://openverse.org/", note: "발견 인덱스로만 사용합니다. Openverse 표시만으로 Studio 가져오기를 승인하지 않고 원 제공기관의 현재 라이선스를 다시 확인합니다." },
  { name: "Poly Haven", freeKeyless: true, category: "3D·HDRI·텍스처", status: "무료·키 없는 검색 구현", commercial: "상업 핵심 후보", url: "https://polyhaven.com/our-api", note: "2026-07-18 공개된 무료 API를 서버 프록시로 호출해 고유 User-Agent와 Poly Haven 출처 표시 조건을 지킵니다. CC0 3D 모델·HDRI·텍스처의 미리보기와 메타데이터만 검색하며, 대용량 파일은 원문에서 포맷·크기·의존성을 확인한 뒤 내려받습니다." },
  { name: "ambientCG", freeKeyless: true, integration: "운영 연결", auth: "없음", rights: "CC0·퍼블릭 도메인", importMode: "Studio 직접 가져오기", termsReviewedAt: "2026-09-25", productRoute: "/research/material-assets", category: "PBR·3D·HDRI·지형", status: "API v3 무료·키 없는 검색 구현", commercial: "상업 핵심 후보", url: "https://docs.ambientcg.com/api/v3/", note: "공식 API v3에서 재질·HDRI·데칼·아틀라스·3D 모델·지형을 검색합니다. CC0 미리보기와 출처를 보존하고 실제 파일 형식·해상도·맵 구성을 원문에서 확인합니다." },
  { name: "NASA Images", freeKeyless: true, integration: "운영 연결", auth: "없음", rights: "레코드별 확인", importMode: "레퍼런스 보드", termsReviewedAt: "2026-09-25", productRoute: "/research/space-assets", category: "우주·과학·항공", status: "무료·키 없는 이미지 검색 구현", commercial: "조건부 상업 이용", url: "https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf", note: "NASA Images API의 공식 메타데이터와 미리보기만 저장합니다. NASA 표장, 인물, 제3자 자료와 개별 미디어 사용 지침을 확인하기 전 원본 반입·재배포는 차단합니다." },
  { name: "V&A Collections", freeKeyless: true, integration: "운영 연결", auth: "없음", rights: "레코드별 확인", importMode: "레퍼런스 보드", termsReviewedAt: "2026-09-25", productRoute: "/research/vam", category: "패션·직물·가구·디자인", status: "무료·키 없는 소장품 검색 구현", commercial: "조건부 상업 이용", url: "https://developers.vam.ac.uk/", note: "V&A Collections API에서 이미지가 있는 소장품을 검색합니다. 미리보기와 소장 메타데이터만 보드에 저장하며 작품별 권리와 V&A 웹사이트 약관을 최종 기준으로 사용합니다." },
  { name: "Rijksmuseum Data Services", freeKeyless: true, integration: "운영 연결", auth: "없음", rights: "레코드별 확인", importMode: "레퍼런스 보드", termsReviewedAt: "2026-09-25", productRoute: "/research/rijksmuseum", category: "미술·복식·장식·고증", status: "Search·Linked Data 검색 구현", commercial: "조건부 상업 이용", url: "https://data.rijksmuseum.nl/docs/search", note: "키 없는 Search API와 Linked Data Resolver를 연결해 제목·제작자·설명·권리 표시를 확인합니다. 첫 100건 안에서 사람 중심 탐색을 제공하고 레코드별 권리를 보존합니다." },
  { name: "Library of Congress", freeKeyless: true, integration: "기술 검토", auth: "없음", rights: "레코드별 확인", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "역사 사진·지도·신문", status: "공식 JSON 요청 403 재검증 대기", commercial: "조건부 상업 이용", url: "https://www.loc.gov/apis/json-and-yaml/", note: "역사 사진·지도·신문·포스터 발견 후보입니다. 현재 서버 네트워크에서 공식 JSON 요청이 403으로 차단되어 운영 어댑터를 활성화하지 않았으며 우회 수집은 하지 않습니다." },
  { name: "Smithsonian Open Access", freeAccess: true, integration: "운영 연결", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", productRoute: "/research/open-data/smithsonian", category: "박물관·과학·3D", status: "무료 키 발급·운영 비밀 등록·검색 어댑터 구현", commercial: "조건부 상업 이용", url: "https://www.si.edu/openaccess/devtools", note: "역사·자연사·과학·2D·3D 레코드 메타데이터를 검색합니다. 메타데이터 CC0 표시와 이미지·3D·인물·상표 등 미디어 권리를 분리하고 원본 파일은 직접 반입하지 않습니다." },
  { name: "Europeana", freeAccess: true, integration: "어댑터 구현", auth: "API 키", rights: "레코드별 확인", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", productRoute: "/research/open-data/europeana", category: "유럽 문화유산", status: "검색 어댑터 구현·개인 계정 API 키 등록 대기", commercial: "조건부 상업 이용", url: "https://pro.europeana.eu/page/apis", note: "유럽 박물관·도서관·아카이브 통합 메타데이터를 검색합니다. 결과별 rights statement와 원 제공기관 정보를 최종 기준으로 삼고 에셋 직접 반입은 차단합니다." },
  { name: "OpenStreetMap", category: "장소·건축", status: "자체·계약형 인프라 검토", commercial: "조건부 상업 이용", url: "https://www.openstreetmap.org/copyright", note: "장소·도로·건물 구조 연구에 사용합니다. ODbL 출처표시와 데이터베이스 공유 조건을 따르며 공개 타일 서버에 운영 트래픽을 의존하지 않습니다." },
  { name: "KOSIS", category: "공식 통계", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://kosis.kr/openapi/", note: "출판·콘텐츠·문화·인구 통계를 데이터 스토리에 사용합니다. 조사연도·작성기관·단위·집계범위를 함께 표시합니다." },
  { name: "K-Startup", category: "창작 기회", status: "공공데이터 서비스키 예정", commercial: "조건부 상업 이용", url: "https://www.k-startup.go.kr/", note: "예비창업·초기창업·지역·업력 조건을 Creator Compass에 연결합니다. 지원 가능 여부는 확정하지 않고 원문 근거를 표시합니다." },
  { name: "한국콘텐츠진흥원", category: "창작 기회", status: "공식 API·RSS 검토", commercial: "조건부 상업 이용", url: "https://www.kocca.kr/", note: "웹툰·콘텐츠 제작·번역·해외진출 공고를 공식 인터페이스나 검토된 최소 메타데이터로 연결할 후보입니다." },
  { name: "KOPIS·KMDb·KOBIS", category: "IP 확장", status: "인증키 신청 예정", commercial: "조건부 상업 이용", url: "https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00074", note: "공연·영화·개봉·박스오피스 데이터를 작품의 영상화·공연화 관계와 캘린더에 연결할 후보입니다." },
  { name: "AniList", category: "글로벌 만화·애니", status: "어댑터 구현·운영 비활성(상업 라이선스 문의)", commercial: "계약 후 이용", url: "https://docs.anilist.co/guide/terms-of-use", note: "만화·애니·인물·관계 메타데이터 후보입니다. 상업 라이선스가 확인되기 전 운영 기능은 비활성화합니다." },
  { name: "TMDB", category: "해외 영상화", status: "상업 라이선스 문의", commercial: "계약 후 이용", url: "https://developer.themoviedb.org/docs/faq", note: "해외 영화·TV 각색 정보 후보입니다. 상업 계약·출처표시·이미지 캐시 조건을 확인한 뒤 활성화합니다." },
  { name: "Freesound", category: "효과음·환경음", status: "어댑터 구현·운영 비활성(API·개별 라이선스 확인)", commercial: "계약 후 이용", url: "https://freesound.org/docs/api/terms_of_use.html", note: "Sound Lab 후보입니다. API 계약과 개별 음원 라이선스를 모두 통과한 경우에만 다운로드·프로젝트 포함을 허용합니다." },
  { name: "Open-Meteo", category: "날씨·빛", status: "어댑터 구현·운영 비활성(상업 플랜 필요)", commercial: "계약 후 이용", url: "https://open-meteo.com/", note: "Scene Lab의 날씨·일출·일몰 참고 후보입니다. 상업 운영 플랜과 데이터 출처표시 조건을 확인한 뒤 활성화합니다." },
  { name: "YouTube Data API", freeAccess: true, category: "공식 영상", status: "무료 제한키 발급·운영 연결 대기", commercial: "조건부 상업 이용", url: "https://developers.google.com/youtube/v3", note: "공식 예고편·인터뷰·학습 영상의 원문 연결 후보입니다. 영상 파일 수집·재편집·외부 지표와의 임의 합산은 하지 않습니다." },
  { name: "AI Hub", category: "데이터셋", status: "별도 신청·용도 검토", commercial: "비상업·내부 검토", url: "https://www.aihub.or.kr/", note: "데이터셋별 사용 목적과 상업·재배포·모델 학습 권리를 별도로 검토합니다. 완성 에셋 생성 API처럼 취급하지 않습니다." },
  { name: "Jikan·비공식 웹툰 API", category: "작품 탐색", status: "핵심 연동에서 제외", commercial: "운영 제외", url: "https://jikan.moe/", note: "비공식 중계 데이터의 안정성과 권리 범위가 불명확하므로 상용 서비스의 기준 카탈로그로 사용하지 않습니다." },
  { name: "알라딘 OpenAPI", category: "작품 탐색", status: "신규 연동 제외", commercial: "운영 제외", url: "https://www.aladin.co.kr/home/welcome.aspx", note: "서비스 종료 공지를 기준으로 새 의존성을 추가하지 않습니다." },
  { name: "네이버 책 검색", category: "작품 탐색", status: "신규 연동 제외", commercial: "운영 제외", url: "https://developers.naver.com/", note: "종료·이관된 기능에 새 의존성을 추가하지 않고 다른 공식 서지 공급자로 대체합니다." },  { name: "국가유산청 국가유산 Open API", freeKeyless: true, integration: "운영 연결", auth: "없음", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", productRoute: "/research/open-data/kheritage", category: "국가유산·장소·고증", status: "키 없는 공식 XML 검색 어댑터 구현", commercial: "조건부 상업 이용", url: "https://www.khs.go.kr/html/HtmlPage.do?mn=NS_04_04_03&pg=%2Fpublicinfo%2Fpbinfo3_0201.jsp", note: "국가유산 명칭·분류·지역·관리기관·좌표를 고증 보드에 연결합니다. 사진·영상·음성·해설은 자동 반입하지 않고 상세 원문의 공공누리와 제3자 권리를 확인합니다." },
  { name: "국가유산 지식이음", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "레코드별 확인", importMode: "레퍼런스 보드", termsReviewedAt: "2026-09-25", category: "전통건축·유적·조사", status: "서비스키·자료 권리 매핑 준비", commercial: "조건부 상업 이용", url: "https://portal.nrich.go.kr/kor/apiView.do?idx=55&menuIdx=665", note: "향교·전통건축·유적 조사 자료를 배경 구조와 시대 고증에 연결합니다. 공공누리 유형과 출처표시 문구를 결과별로 보존합니다." },
  { name: "한국관광공사 TourAPI", freeAccess: true, integration: "어댑터 구현", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", productRoute: "/research/open-data/tourapi", category: "장소·행사·관광", status: "검색 어댑터 구현·무료 서비스키 등록 대기", commercial: "조건부 상업 이용", url: "https://api.visitkorea.or.kr/", note: "관광지·문화시설·주소·좌표를 실제 지역 배경과 이동 동선 브리프에 연결합니다. 영업·행사·사진 이용조건은 공식 원문을 다시 확인합니다." },
  { name: "Odii 오디오 관광해설", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "레코드별 확인", importMode: "레퍼런스 보드", termsReviewedAt: "2026-09-25", category: "장소 스토리·음성 해설", status: "공공데이터 서비스키 신청 준비", commercial: "조건부 상업 이용", url: "https://www.data.go.kr/data/15101971/openapi.do", note: "관광 스토리·사진·해설 대본·오디오를 장소별 장면 설정과 다국어 내레이션 초안에 연결합니다. 음원 재사용 범위는 별도 확인합니다." },
  { name: "VWorld 공간정보", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "출처표시", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "지도·지오코딩·건물", status: "API 키·요청 한도 검토", commercial: "조건부 상업 이용", url: "https://www.vworld.kr/dev/v4dv_geocoderguide2_s001.do", note: "주소 좌표 변환과 국가 공간정보를 배경 블로킹·이동 동선·장소 엔티티에 연결할 후보입니다. 지도 타일과 데이터 이용조건을 분리합니다." },
  { name: "도로명주소 Open API", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "주소 정규화", status: "승인키 신청 준비", commercial: "조건부 상업 이용", url: "https://business.juso.go.kr/addrlink/openApi/apiReqst.do", note: "사용자 입력 장소의 도로명·지번 표기를 정규화하고 TourAPI·VWorld 결과를 동일 장소로 묶는 보조 데이터로 사용합니다." },
  { name: "국립국어원 사전 Open API", freeAccess: true, integration: "어댑터 구현", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", productRoute: "/research/open-data/korean", category: "대사·말투·용어", status: "표제어 검색 어댑터 구현·무료 키 등록 대기", commercial: "조건부 상업 이용", url: "https://stdict.korean.go.kr/openapi/openApiInfo.do", note: "표제어·품사·뜻풀이를 캐릭터 어휘 사전과 작품 용어집에 연결합니다. 사전 예문은 작품 대사로 복제하지 않습니다." },
  { name: "국립생물자원관 생물다양성", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "레코드별 확인", importMode: "레퍼런스 보드", termsReviewedAt: "2026-09-25", category: "동식물·생태·분포", status: "서비스키·이미지 권리 매핑 준비", commercial: "조건부 상업 이용", url: "https://species.nibr.go.kr/", note: "국명·학명·분류·분포·생태·이미지를 크리처 디자인과 계절·지역 생물 검수에 연결할 후보입니다." },
  { name: "기상청 공공데이터 API", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "출처표시", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "날씨·기후·빛", status: "서비스키·관측/예보 스키마 설계 준비", commercial: "조건부 상업 이용", url: "https://data.kma.go.kr/api/selectApiList.do?pgmNo=42", note: "단기예보·관측·과거 기후를 작품 타임라인의 날씨 연속성과 장면 광원·비·눈·안개 연출에 연결할 후보입니다." },
  { name: "네이버 DataLab", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "키워드 관심 신호", status: "개발자 앱·Client ID 발급 준비", commercial: "조건부 상업 이용", url: "https://developers.naver.com/docs/serviceapi/datalab/search/search.md", note: "검색어 관심도 변화만 별도 신호로 표시합니다. 독자 수·매출·작품 성공 확률이나 다른 플랫폼 지표와 합산하지 않습니다." },
  { name: "서울 열린데이터광장", freeAccess: true, integration: "신청·승인 필요", auth: "API 키", rights: "레코드별 확인", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", category: "도시·교통·공원·시설", status: "필요 데이터셋별 승인키 검토", commercial: "조건부 상업 이용", url: "https://data.seoul.go.kr/", note: "서울 교통·문화·공원·환경·공공시설을 도시 배경과 캐릭터 이동 동선에 연결하되 데이터셋별 조건과 시점을 표시합니다." },
  { name: "NEIS 교육정보 Open API", freeAccess: true, integration: "어댑터 구현", auth: "API 키", rights: "메타데이터 전용", importMode: "검색·원문 링크", termsReviewedAt: "2026-09-25", productRoute: "/research/open-data/neis", category: "학교·학사일정·시간표", status: "학교 기본정보 검색 구현·무료 키 등록 대기", commercial: "조건부 상업 이용", url: "https://open.neis.go.kr/portal/guide/apiGuidePage.do", note: "학교명·학교급·설립구분·주소를 학교물 설정에 연결합니다. 실제 학사일정·시간표·행사는 학교와 교육청의 최신 공지를 확인하고 개인 식별정보는 사용하지 않습니다." },
  ...ADDITIONAL_RESOURCE_SOURCES,
];
