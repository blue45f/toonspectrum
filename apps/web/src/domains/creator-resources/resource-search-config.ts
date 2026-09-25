import type { ResourceProvider } from "@/shared/lib/creator-resources";

export type ResourceSearchProvider = Extract<ResourceProvider, "met" | "kakao" | "bizinfo" | "polyhaven" | "ambientcg" | "nasa" | "vam" | "rijksmuseum" | "googlefonts" | "gbif" | "musicbrainz" | "internetarchive" | "metweather" | "kheritage" | "neis" | "tourapi" | "korean" | "smithsonian" | "wikimedia" | "europeana" | "dpla">;
export interface ResourceSearchConfig {
  title: string;
  intro: string;
  hint: string;
  url: string;
  examples: string[];
}
export const RESOURCE_SEARCH_CONFIG: Record<ResourceSearchProvider, ResourceSearchConfig> = {
  met: { title: "창작 레퍼런스", intro: "복식·장식·가구·미술 자료를 찾아 출처와 함께 저장하세요. 공개 이용이 확인된 Met 자료만 미리보기를 제공합니다.", hint: "예: armor, costume, furniture, Korea", url: "https://www.metmuseum.org/art/collection", examples: ["armor", "costume", "furniture", "Korea"] },
  kakao: { title: "만화·작법서 탐색", intro: "만화 단행본, 작법서와 참고 도서를 검색하세요. 작품과 판본의 관계는 원출처에서 확인하며 자동으로 동일 작품으로 합치지 않습니다.", hint: "예: 만화 작법, 웹툰, 스토리", url: "https://search.daum.net/search?w=book&q=%EB%A7%8C%ED%99%94", examples: ["만화 작법", "웹툰", "스토리"] },
  bizinfo: { title: "작가 기회센터", intro: "기업마당 최근 최대 100건에서 지원사업을 찾습니다. 모든 공모전을 포함하지 않으며, 개인 작가와 사업자의 신청 자격은 공고 원문을 확인해야 합니다.", hint: "예: 웹툰, 만화, 콘텐츠", url: "https://www.bizinfo.go.kr/", examples: ["웹툰", "만화", "콘텐츠"] },
  polyhaven: { title: "무료 3D·HDRI·텍스처 재료실", intro: "Poly Haven의 CC0 3D 모델·HDRI·텍스처를 검색해 배경과 소품 제작 자료로 저장하세요. 미리보기와 메타데이터만 불러오며 실제 파일 포맷·크기·의존성은 원문에서 확인합니다.", hint: "예: chair, architecture, forest, concrete", url: "https://polyhaven.com/", examples: ["chair", "architecture", "forest", "concrete"] },
  ambientcg: { title: "CC0 PBR·3D 소재 검색", intro: "ambientCG API v3에서 PBR 재질·HDRI·데칼·3D 모델·지형을 찾아 출처와 함께 저장하세요. 검색 결과는 CC0지만 실제 다운로드 형식과 텍스처 구성을 원문에서 확인합니다.", hint: "예: wood, brick, fabric, terrain", url: "https://ambientcg.com/", examples: ["wood", "brick", "fabric", "terrain"] },
  nasa: { title: "NASA 우주·과학 레퍼런스", intro: "NASA Images에서 행성·우주선·과학·지구 관측 이미지를 찾아 레퍼런스 보드에 저장하세요. 미리보기는 참고용이며 표장·인물·제3자 권리는 원문 정책을 확인합니다.", hint: "예: moon, Mars, nebula, spacecraft", url: "https://images.nasa.gov/", examples: ["moon", "Mars", "nebula", "spacecraft"] },
  vam: { title: "V&A 패션·디자인 자료실", intro: "V&A 소장품에서 복식·직물·가구·장식미술·무대 디자인을 탐색합니다. 작품별 이미지 조건이 다르므로 레퍼런스 저장만 허용하고 직접 가져오기는 차단합니다.", hint: "예: armor, costume, textile, furniture", url: "https://collections.vam.ac.uk/", examples: ["armor", "costume", "textile", "furniture"] },
  googlefonts: { title: "Google Fonts 레터링 매처", intro: "폰트 가족·장르·굵기·한글 지원 범위를 검색하고 실제 글꼴로 대사와 타이틀 문구를 미리보세요. 상세 페이지의 개별 라이선스를 확인한 뒤 작품과 배포본에 포함하세요.", hint: "예: 한글 고딕, 손글씨, Noto, display", url: "https://fonts.google.com/", examples: ["한글 고딕", "한글 명조", "손글씨", "display"] },
  rijksmuseum: { title: "Rijksmuseum 고증 자료실", intro: "Rijksmuseum의 제목 검색과 Linked Open Data 상세 정보를 연결해 회화·복식·장식·제작자·시대 정보를 찾습니다. 레코드별 권리 표시와 원문을 최종 기준으로 사용합니다.", hint: "예: armor, costume, interior, portrait", url: "https://www.rijksmuseum.nl/en/collection", examples: ["armor", "costume", "interior", "portrait"] },
  gbif: { title: "생물·크리처 디자인 도감", intro: "GBIF에서 분류군을 확인한 뒤 이미지가 등록된 관찰 기록의 종·지역·시기·권리 메타데이터를 찾습니다. 미디어 권리가 제공처마다 달라 원본 이미지는 직접 가져오지 않습니다.", hint: "예: 여우, 호랑이, Vulpes vulpes, Ginkgo biloba", url: "https://www.gbif.org/", examples: ["여우", "호랑이", "Vulpes vulpes", "Ginkgo biloba"] },
  musicbrainz: { title: "음악가·BGM 메타데이터", intro: "MusicBrainz에서 음악가·그룹의 국가·활동 기간·동명이인 정보를 찾아 BGM 레퍼런스 보드에 저장하세요. 음원 파일이나 음악 사용 허가를 제공하는 기능은 아닙니다.", hint: "예: Nujabes, Joe Hisaishi, BTS, Yoko Kanno", url: "https://musicbrainz.org/", examples: ["Nujabes", "Joe Hisaishi", "BTS", "Yoko Kanno"] },
  internetarchive: { title: "역사 자료 아카이브", intro: "Internet Archive에서 도서·잡지·영상·음원·이미지 항목의 메타데이터를 검색합니다. 컬렉션과 파일마다 권리가 달라 원문 링크만 저장하고 직접 다운로드는 제공하지 않습니다.", hint: "예: armor, street photography, fashion, newspaper", url: "https://archive.org/", examples: ["armor", "street photography", "fashion", "newspaper"] },
  metweather: { title: "날씨·빛 연출 도우미", intro: "MET Norway의 위치 예보를 장면의 기온·구름·습도·바람·강수·빛 연속성 참고로 변환합니다. 도시 이름 또는 위도·경도를 입력하며 실제 안전 판단에는 현지 공식 경보를 확인하세요.", hint: "예: 서울, 부산, 37.5665,126.9780, 파리", url: "https://api.met.no/", examples: ["서울", "부산", "37.5665,126.9780", "파리"] },
  kheritage: { title: "국가유산 고증 검색", intro: "국가유산청 공식 Open API에서 명칭·분류·지역·관리기관·좌표를 검색해 한국 시대·장소 고증 보드에 저장하세요. 사진·해설·공공누리 유형은 상세 원문에서 별도로 확인합니다.", hint: "예: 경복궁, 불국사, 성곽, 고분", url: "https://www.khs.go.kr/", examples: ["경복궁", "불국사", "성곽", "고분"] },
  neis: { title: "학교물 배경 설정", intro: "NEIS 학교 기본정보에서 학교명·학교급·설립구분·주소를 찾아 작품의 학교 배경 설정에 연결합니다. 실제 학사일정과 행사는 학교·교육청 최신 공지를 다시 확인하세요.", hint: "예: 서울고등학교, 부산중학교", url: "https://open.neis.go.kr/", examples: ["서울고등학교", "부산중학교", "제주고등학교"] },
  tourapi: { title: "한국 장소 장면 설계", intro: "한국관광공사 TourAPI에서 관광지·문화시설·주소·좌표를 검색해 실제 장소 기반 장면과 이동 동선 브리프로 저장합니다. 영업·행사·사진 이용조건은 공식 원문을 확인하세요.", hint: "예: 성수동, 경복궁, 제주 오름, 부산 해변", url: "https://api.visitkorea.or.kr/", examples: ["성수동", "경복궁", "제주 오름", "부산 해변"] },
  korean: { title: "한국어 대사·말투 연구", intro: "국립국어원 표준국어대사전의 표제어·품사·뜻풀이를 캐릭터 어휘 사전과 작품 용어집에 연결합니다. 사전 예문은 작품 대사로 복제하지 않습니다.", hint: "예: 서늘하다, 능청스럽다, 사투리", url: "https://stdict.korean.go.kr/", examples: ["서늘하다", "능청스럽다", "사투리", "고풍스럽다"] },
  smithsonian: { title: "Smithsonian 문화유산 검색", intro: "Smithsonian Open Access에서 박물관·과학·문화유산 메타데이터를 탐색합니다. 레코드 메타데이터와 미디어 권리를 분리해 원본 파일은 직접 가져오지 않습니다.", hint: "예: kimono, armor, space, insects", url: "https://www.si.edu/openaccess", examples: ["kimono", "armor", "space", "insects"] },
  wikimedia: { title: "백과 조회 관심 신호", intro: "한국어 위키백과 문서의 최근 30일 조회 추이를 검색 관심 참고 신호로 확인합니다. 독자 수·매출·작품 성공 가능성이나 사실 검증 지표로 사용하지 않습니다.", hint: "예: 경복궁, 웹툰, 조선, 우주", url: "https://pageviews.wmcloud.org/", examples: ["경복궁", "웹툰", "조선", "우주"] },
  europeana: { title: "Europeana 문화유산 통합검색", intro: "유럽 박물관·도서관·아카이브의 통합 메타데이터를 찾습니다. 각 원 제공기관의 rights statement를 최종 기준으로 사용하고 원본 에셋 직접 반입은 차단합니다.", hint: "예: costume, castle, manuscript, poster", url: "https://www.europeana.eu/", examples: ["costume", "castle", "manuscript", "poster"] },
  dpla: { title: "DPLA 역사 자료 통합검색", intro: "미국 도서관·박물관·아카이브의 통합 메타데이터를 탐색합니다. 원 제공기관의 현재 권리와 이용조건을 확인하도록 원문 링크만 저장합니다.", hint: "예: street photography, newspaper, fashion, architecture", url: "https://dp.la/", examples: ["street photography", "newspaper", "fashion", "architecture"] },
};

export const OPEN_DATA_PROVIDERS = [
  "ambientcg", "vam", "nasa", "gbif", "musicbrainz", "internetarchive",
  "kheritage", "neis", "tourapi", "korean", "smithsonian", "wikimedia",
  "europeana", "dpla",
] as const satisfies readonly ResourceSearchProvider[];
