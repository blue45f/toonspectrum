import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// 앱 전역에서 쓰는 다국어 사전.
// 기본 번역은 ko/en만 제공하고, 다른 locale은 fallback 체인(en → ko)으로 처리한다.
export type Lang = string;

export interface LanguageLocaleOption {
  code: string;
  label: string;
  nativeLabel: string;
  englishLabel: string;
}

type Dict = Record<string, string>;
type DictByLocale = Record<string, Dict>;

const DICT: DictByLocale = {
  ko: {
    // 앱 공통
    "app.name": "툰스펙트럼",
    "app.brandBeta": "베타 서비스 — 데이터·기능이 변경될 수 있습니다",
    "app.loading": "불러오는 중",

    "lang.ko": "한국어",
    "lang.en": "English",
    "lang.switch": "언어",
    "lang.auto": "자동",
    "lang.change": "언어 변경",

    "common.loading": "불러오는 중",
    "common.loading.short": "로딩",
    "common.close": "닫기",
    "common.open": "열기",
    "common.search": "검색",
    "common.retry": "재시도",
    "common.retry.short": "재시도",
    "common.backToTop": "맨 위로 이동",
    "common.backToHome": "홈으로",
    "common.loading.search": "검색 중…",
    "common.notFoundWithQuery": "'{query}' 검색 결과가 없습니다.",
    "common.openSearch": "전체 검색에서 다시 찾기 →",
    "common.loading.empty": "응답 데이터가 비어 있습니다.",
    "common.retry.all": "다시 시도하거나 홈으로 이동해 주세요.",
    "search.badge": "통합 검색",
    "search.title": "작품을 바로 찾는 작업공간",
    "search.subtitle": "작품명, 작가, 태그를 한 번에 찾고 플랫폼과 가격 조건으로 바로 좁혀보세요.",
    "search.filterButton": "필터로 좁히기",
    "search.compareFromRanking": "랭킹에서 비교하기",
    "search.currentQuery": "현재 검색어",
    "search.queryAll": "전체",
    "search.freeOnlyLabel": "무료·기다무 중심",
    "search.explorer.sort.label": "정렬 기준",
    "search.explorer.sort.relevance": "관련도",
    "search.explorer.sort.rating": "평점순",
    "search.explorer.sort.popular": "인기순",
    "search.explorer.sort.trending": "급상승순",
    "search.explorer.sort.bookmarks": "관심순",
    "search.explorer.sort.completion": "완독률순",
    "search.explorer.sort.newest": "최신순",
    "search.explorer.sort.title": "가나다순",
    "search.explorer.year.all": "전체",
    "search.explorer.year.2022plus": "2022+",
    "search.explorer.year.2018-21": "2018-21",
    "search.explorer.year.2014-17": "2014-17",
    "search.explorer.year.upto2013": "~2013",
    "search.explorer.type.webtoon": "웹툰",
    "search.explorer.type.webnovel": "웹소설",
    "search.explorer.status.ongoing": "연재중",
    "search.explorer.status.completed": "완결",
    "search.explorer.status.hiatus": "휴재",
    "search.explorer.age.all": "전체",
    "search.explorer.age.12": "12세 이상",
    "search.explorer.age.15": "15세 이상",
    "search.explorer.age.19": "19세 이상",
    "search.explorer.ratingAll": "전체",
    "search.explorer.facet.type": "유형",
    "search.explorer.facet.genre": "장르",
    "search.explorer.facet.tag": "태그",
    "search.explorer.facet.year": "연재 연도",
    "search.explorer.facet.status": "연재 상태",
    "search.explorer.facet.platform": "플랫폼",
    "search.explorer.facet.minRating": "최소 평점",
    "search.explorer.facet.age": "이용가",
    "search.explorer.facet.option": "옵션",
    "search.explorer.option.freeOnly": "무료·기다무만",
    "search.explorer.option.adapted": "원작·2차창작 연결",
    "search.explorer.filter": "필터",
    "search.explorer.filterReset": "전체 초기화",
    "search.explorer.search.label": "작품, 작가, 태그 검색",
    "search.explorer.search.placeholder": "작품, 작가, 태그 검색",
    "search.explorer.search.clear": "검색어 지우기",
    "search.explorer.search.reload": "검색 새로고침",
    "search.explorer.savedOnly": "내 찜만",
    "search.explorer.view.grid": "그리드 보기",
    "search.explorer.view.list": "리스트 보기",
    "search.explorer.refresh": "갱신",
    "search.explorer.loading": "로딩 중",
    "search.explorer.resultCount": "{count}개 작품",
    "search.explorer.noResult": "결과가 없습니다",
    "search.explorer.recent": "최근 검색",
    "search.explorer.recent.clearAll": "전체 지우기",
    "search.explorer.recent.delete": "최근 검색어 {query} 삭제",
    "search.explorer.recent.searchAgain": "최근 검색에서 다시 찾기",
    "search.explorer.catalog.label": "서버 색인",
    "search.explorer.catalog.empty": "DB 비어 있음",
    "search.explorer.currentFilter": "현재 필터",
    "search.explorer.token.remove": "{label} 필터 제거",
    "search.explorer.error.title": "검색 데이터를 불러오지 못했어요.",
    "search.explorer.error.description": "검색 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    "search.explorer.retry": "다시 시도",
    "search.explorer.noResults": "조건에 맞는 작품이 없어요.",
    "search.explorer.hint.search": "검색어를 바꾸거나 필터를 줄여보세요.",
    "search.explorer.hint.filter": "필터를 줄이거나 다른 조건으로 찾아보세요.",
    "search.explorer.typeSummary.empty": "유형 없음",
    "search.explorer.separator": " · ",
    "search.explorer.unit.itemSuffix": "개",
    "ageGate.title": "성인 작품 열람 확인",
    "ageGate.description": "만 19세 이상인지 확인할 수 있는 생년월일을 입력해 주세요.",
    "ageGate.birthDateLabel": "생년월일",
    "ageGate.birthYearLabel": "출생 연도",
    "ageGate.birthYearPlaceholder": "연도",
    "ageGate.birthMonthLabel": "출생 월",
    "ageGate.birthMonthPlaceholder": "월",
    "ageGate.birthDayLabel": "출생 일",
    "ageGate.birthDayPlaceholder": "일",
    "ageGate.yearSuffix": "년",
    "ageGate.monthSuffix": "월",
    "ageGate.daySuffix": "일",
    "ageGate.deniedMessage": "연령 기준을 통과하지 못했습니다.",
    "ageGate.cancel": "취소",
    "ageGate.confirm": "확인",
    "share.triggerAria": "공유 메뉴 열기",
    "share.triggerLabel": "공유",
    "share.copy": "링크 복사",
    "share.copySuccess": "복사됨",
    "share.social.x": "X로 공유",
    "share.social.facebook": "페이스북으로 공유",
    "bookmark.add": "찜하기",
    "bookmark.remove": "찜 취소",
    "toast.bookmarkAdded": "내 서재에 담았습니다",
    "toast.bookmarkRemoved": "서재에서 제거했습니다",
    "ad.creativeFallbackAlt": "광고 이미지",
    "ad.slotAriaLabel": "광고 슬롯",
    "ad.slotLabel": "스폰서 추천",
    "ad.slotTitle": "스폰서 콘텐츠",
    "ad.ctaDetails": "자세히 보기",
    "ad.placeholderAriaLabel": "광고 자리표시자",
    "ad.placeholderText": "광고 슬롯이 비어 있습니다",
    "ad.tag": "광고",
    "avatar.error.invalidType": "지원되지 않는 이미지 형식입니다.",
    "avatar.error.processFailed": "이미지를 처리하지 못했습니다.",
    "avatar.processing": "처리 중…",
    "avatar.select": "이미지 변경",
    "avatar.remove": "이미지 삭제",
    "avatar.uploadHint": "JPG/PNG/WEBP 이미지만 사용 가능하며 크롭 후 미리보기가 표시됩니다.",
    "avatar.changeAria": "프로필 이미지 변경",
    "titleFilter.header": "필터",
    "titleFilter.remember": "필터 기억",
    "titleFilter.rememberTitle": "내 필터 저장",
    "titleFilter.reset": "전체 초기화",
    "titleFilter.facet.saved": "저장함",
    "titleFilter.facet.type": "유형",
    "titleFilter.facet.genre": "장르",
    "titleFilter.facet.status": "연재 상태",
    "titleFilter.facet.platform": "플랫폼",
    "titleFilter.facet.age": "이용가",
    "titleFilter.facet.pricing": "가격",
    "titleFilter.facet.minRating": "최소 평점",
    "titleFilter.facet.year": "연재 시작",
    "titleFilter.facet.tag": "태그",
    "titleFilter.facet.adapted": "원작 연결",
    "titleFilter.savedOnly": "내 찜만",
    "titleFilter.option.type.webtoon": "웹툰",
    "titleFilter.option.type.webnovel": "웹소설",
    "titleFilter.option.status.ongoing": "연재중",
    "titleFilter.option.status.completed": "완결",
    "titleFilter.option.status.hiatus": "휴재",
    "titleFilter.option.age.all": "전체",
    "titleFilter.option.age.12": "12세",
    "titleFilter.option.age.15": "15세",
    "titleFilter.option.age.19": "19세",
    "titleFilter.option.pricing.free": "무료",
    "titleFilter.option.pricing.wait-free": "기다무",
    "titleFilter.option.pricing.paid": "유료",
    "titleFilter.option.pricing.subscription": "구독",
    "titleFilter.option.minRating.all": "전체",
    "titleFilter.option.minRating.3": "3★+",
    "titleFilter.option.minRating.4": "4★+",
    "titleFilter.option.minRating.45": "4.5★+",
    "titleFilter.option.year.2022plus": "2022+",
    "titleFilter.option.year.2018-21": "2018-21",
    "titleFilter.option.year.2014-17": "2014-17",
    "titleFilter.option.year.upto2013": "~2013",
    "titleFilter.option.adaptedOnly": "원작·2차창작",
    "search.explorer.time.noData": "갱신 정보 없음",
    "search.explorer.time.justNow": "방금 갱신",
    "search.explorer.time.minutesAgo": "{count}분 전 갱신",
    "search.explorer.time.hoursAgo": "{count}시간 전 갱신",
    "search.explorer.time.daysAgo": "{count}일 전 갱신",
    "search.explorer.loadMore": "더 보기",
    "command.palette.placeholder": "작품, 작가, 태그를 검색하세요…",
    "command.palette.label": "통합 검색",
    "command.palette.group.shortcuts": "바로가기",
    "command.palette.group.recent": "최근 본 작품",
    "command.palette.group.results": "작품",
    "command.palette.quick.search": "통합 검색",
    "command.palette.quick.ranking": "통합 랭킹",
    "command.palette.quick.recommend": "맞춤 추천",
    "command.palette.quick.fortune": "캐릭터 운세",
    "command.palette.quick.random": "랜덤 작품",
    "command.palette.quick.calendar": "연재 캘린더",
    "command.palette.quick.compare": "작품 비교",
    "command.palette.quick.explore": "탐색 / 장르",
    "command.palette.quick.insights": "트렌드 대시보드",
    "command.palette.quick.library": "내 서재",
    "command.palette.quick.searchHint": "작품·작가·태그",
    "command.palette.quick.rankingHint": "6개 축 랭킹",
    "command.palette.quick.recommendHint": "취향 기반 추천",
    "command.palette.quick.fortuneHint": "사주·타로·궁합",
    "command.palette.quick.randomHint": "무작위로 한 편",
    "command.palette.quick.calendarHint": "요일별 연재",
    "command.palette.quick.compareHint": "두 작품 맞대보기",
    "command.palette.quick.exploreHint": "스펙트럼 탐색",
    "command.palette.quick.insightsHint": "데이터로 보는 시장",
    "command.palette.quick.libraryHint": "관심·평점·취향",

    // 리뷰
    "review.progress.complete": "완독",
    "review.progress.binge": "정주행중",
    "review.progress.upcoming": "정주행 예정",
    "review.progress.abandoned": "하차",
    "review.progress.unknown": "진행 상태 미공개",
    "review.spoilerRevealLabel": "스포일러 보기",

    // 랭킹 상세
    "ranking.detailTitle": "순위 세부 기여도 보기",
    "ranking.metric.views": "조회수",
    "ranking.why": "근거",
    "ranking.breakdownTitle": "점수 구성",
    "ranking.totalScore": "총점",
    "ranking.breakdownDescription": "축 가중치와 작품별 보정치를 반영한 점수로 계산됐습니다.",

    "control.language.label": "언어 선택",
    "control.sound.enable": "효과음 켜기",
    "control.sound.disable": "효과음 끄기",
    "control.theme.dark": "야간 모드 전환",
    "control.theme.light": "주간 모드 전환",
    "control.settings.open": "설정 열기",
    "control.settings.close": "설정 닫기",
    "control.cluster.settings": "사운드·테마·언어 설정",
    "control.cluster.open": "설정 열기",
    "control.cluster.tooltip": "사운드·테마·언어 설정",

    // 라우트 제목(탭 제목)
    "route.home": "",
    "route.ranking": "통합 랭킹",
    "route.search": "검색",
    "route.recommend": "맞춤 추천",
    "route.explore": "스펙트럼 탐색",
    "route.random": "랜덤 발견",
    "route.feedback": "의견 게시판",
    "route.tags": "태그로 찾기",
    "route.calendar": "연재 캘린더",
    "route.reviews": "리뷰",
    "route.community": "커뮤니티",
    "route.community_cafes": "장르 카페",
    "route.adminCommunity": "커뮤니티 관리",
    "route.adminMembers": "회원 관리",
    "route.library": "내 서재",
    "route.compare": "작품 비교",
    "route.insights": "트렌드 인사이트",
    "route.authors": "작가별 보기",
    "route.news": "웹툰·웹소설 소식",
    "route.about": "소개",
    "route.design": "디자인 시스템",
    "route.sitemap": "사이트맵",
    "route.guide": "랭킹 산정 방식",
  "route.settings": "설정",
  "route.admin": "관리자 콘솔",
  "route.terms": "이용약관",
  "route.privacy": "개인정보처리방침",
  "route.copyright": "저작권·콘텐츠 안내",
  "route.contact": "광고·제휴 문의",
    "home.hero.eyebrow": "WEBTOON × WEBNOVEL",
    "home.hero.titleLine1": "흩어진 이야기를,",
    "home.hero.titleShimmer": "한 권의 색인",
    "home.hero.titleSuffix": "으로.",
    "home.hero.description":
      "네이버 웹툰·시리즈와 카카오웹툰을 가로질러 검색하고, 실시간 신호와 독자 취향을 함께 읽어 무엇을 볼지 빠르게 좁힙니다.",
    "home.hero.searchButton": "작품·작가·태그 검색",
    "home.hero.rankingButton": "통합 랭킹 보기",
    "home.hero.studioLink": "창작 스튜디오",
    "home.hero.createLink": "창작 게시판",
    "home.hero.stats.titles": "수록 작품",
    "home.hero.stats.platforms": "연재 플랫폼",
    "home.hero.stats.genres": "장르 스펙트럼",
    "home.hero.stats.reviews": "독자 리뷰",
    "home.loadError": "홈 데이터를 불러오지 못했습니다.",
    "route.support": "문의",
    "route.create": "창작 게시판",
    "route.studio": "Studio",
    "route.me": "내 정보",
    "route.fortune": "캐릭터 운세",
    "route.play": "놀이터",
    "route.unknown": "페이지",
    "route.pencafeSuffix": "펜카페",

    // 스튜디오 튜토리얼/도움말






















    // 배경 패널



    // 캔버스 설정 패널(가이드/그리드/규격)











    "auth.menu.triggerLabel": "계정 메뉴",
    "auth.menu.adminPanel": "관리자 콘솔",
    "auth.menu.profile": "내 정보",
    "auth.menu.settings": "설정",
    "auth.menu.signOut": "로그아웃",
    "auth.menu.fallbackName": "독자",
    "auth.callback.message.working": "로그인을 마무리하는 중…",
    "auth.callback.error.badState": "잘못된 상태값입니다.",
    "auth.callback.error.noCode": "인증 코드가 없습니다.",
    "auth.callback.error.oauthFailed": "OAuth 처리에 실패했습니다.",
    "auth.callback.error.unsupported": "지원하지 않는 로그인 방식입니다.",
    "auth.callback.error.accessDenied": "로그인이 취소되었습니다.",
    "auth.callback.error.generic": "로그인 처리에 실패했습니다.",
    "auth.callback.error.noUser": "사용자 정보를 확인할 수 없습니다.",
    "auth.callback.error.invalidAccess": "잘못된 접근입니다.",
    "auth.callback.error.failed": "처리 중 오류가 발생했습니다.",
    "auth.callback.message.done": "로그인 처리가 완료되었습니다. 잠시 후 이동합니다.",
    "auth.callback.message.doneDemo": "데모 로그인 처리가 완료되었습니다. 잠시 후 이동합니다.",
    "auth.callback.demo.message": "데모 계정으로 로그인했습니다. 일부 기능은 제한될 수 있어요.",

    // 계정 페이지
    "account.tabs.posts": "내 게시물",
    "account.tabs.activity": "내 활동",
    "account.tabs.profile": "프로필",
    "account.signIn.title": "로그인이 필요해요",
    "account.signIn.message": "내 게시물과 활동, 프로필을 확인하려면 로그인해 주세요.",
    "account.signIn.cta": "로그인",
    "account.posts.errorTitle": "내 게시물을 불러오지 못했어요.",
    "account.posts.emptyTitle": "아직 올린 창작물이 없어요.",
    "account.posts.emptyMessage": "창작 스튜디오에서 첫 작품을 만들어 보세요.",
    "account.posts.cta": "창작 스튜디오로 만들기",
    "account.posts.emptyReviewText": "이 회원이 작성한 리뷰가 없습니다.",
    "account.activity.emptyTitle": "아직 활동 기록이 없어요.",
    "account.activity.emptyMessage": "작품에 별점·리뷰를 남기거나 찜·서재에 담아 보세요.",
    "account.activity.viewTitlesCta": "작품 둘러보기",
    "account.activity.stat.reviews": "작성한 리뷰",
    "account.activity.stat.want": "찜(보고 싶어요)",
    "account.activity.stat.reading": "보는 중",
    "account.activity.stat.done": "완독",
    "account.activity.stat.collections": "컬렉션",
    "account.activity.recentReviewsTitle": "최근 리뷰",
    "account.activity.recentNoText": "별점만 남긴 리뷰",
    "account.activity.storageHint": "활동 기록은 이 브라우저(및 로그인 시 계정)에 저장됩니다. 자세한 목록은 {link}에서 볼 수 있어요.",
    "account.profile.photoTitle": "프로필 사진",
    "account.profile.photoDesc": "메뉴와 댓글 등 내 이름이 보이는 곳에 표시돼요.",
    "account.profile.nameLabel": "이름",
    "account.profile.namePlaceholder": "표시할 이름",
    "account.profile.bioLabel": "소개",
    "account.profile.bioPlaceholder": "나를 한 줄로 소개해 보세요.",
    "account.profile.bioLength": "{length}/280",
    "account.profile.saveButton": "프로필 저장",
    "account.profile.saving": "저장 중…",
    "account.profile.saved": "저장됨",
    "account.profile.nameRequired": "이름을 입력해 주세요.",
    "account.profile.deleteTitle": "계정 탈퇴",
    "account.profile.deleteDesc": "프로필과 로그인 정보가 삭제되고 기존 세션이 만료됩니다. 작성한 글과 댓글은 탈퇴한 사용자로 남습니다.",
    "account.profile.deleting": "처리 중...",
    "account.profile.confirmDelete": "계정을 탈퇴 처리할까요? 프로필과 로그인 정보가 삭제되고 현재 세션이 만료됩니다.",
    "account.profile.errorSave": "프로필을 저장하지 못했어요.",
    "account.profile.errorDelete": "계정을 탈퇴 처리하지 못했어요.",
    "account.profile.loadingError": "프로필을 불러오지 못했어요.",
    "account.page.eyebrow": "MY ACCOUNT",
    "account.page.title": "내 정보",
    "account.page.subtitle": "내가 올린 게시물과 활동 기록을 확인하고 프로필을 관리합니다.",
    "account.page.tabsAria": "내 정보 탭",

    // 사용자 공개 프로필
    "userProfile.eyebrow": "독자 프로필",
    "userProfile.tabs.reviews": "리뷰",
    "userProfile.tabs.works": "창작 작품",
    "userProfile.tabs.series": "시리즈",
    "userProfile.works.empty": "이 회원이 아직 공개한 창작 작품이 없습니다.",
    "userProfile.series.empty": "이 회원이 아직 만든 연재 시리즈가 없습니다.",
    "userProfile.fetchError": "프로필을 불러오지 못했습니다.",
    "userProfile.authorFallback": "사용자",
    "userProfile.metaTemplate": "{author} 님의 리뷰 {reviews}편 · 작품 {works}편 · 평균 별점 {avg} — 툰스펙트럼.",
    "userProfile.bioFallback": "독자가 남긴 리뷰와 창작 활동",
    "userProfile.followHint": "로그인 후 팔로우할 수 있습니다.",
    "userProfile.follow": "팔로우",
    "userProfile.following": "팔로잉",
    "userProfile.stat.followers": "팔로워",
    "userProfile.stat.totalReviews": "작성한 리뷰",
    "userProfile.stat.avgRating": "평균 별점",
    "userProfile.stat.works": "창작 작품",
    "userProfile.stat.series": "연재 시리즈",
    "userProfile.tabsLabel": "프로필 콘텐츠",
    "userProfile.refresh": "갱신",
    "userProfile.emptyReviews": "이 회원이 아직 작성한 리뷰가 없습니다.",

    // 내비게이션 라벨
    "nav.home": "홈",
    "nav.ranking": "랭킹",
    "nav.calendar": "연재",
    "nav.recommend": "추천",
    "nav.explore": "탐색",
    "nav.fortune": "운세",
    "nav.play": "놀이터",
    "nav.reviews": "리뷰",
    "nav.community": "커뮤니티",
    "nav.insights": "인사이트",
    "nav.create": "창작",
    "nav.library": "내 서재",
    "nav.login": "로그인",
    "nav.search": "작품·작가·태그 검색",
    "nav.searchOpen": "작품·작가·태그 검색 열기",
    "nav.quickAccess": "빠른 이동",
    "nav.menu": "메뉴",
    "nav.allMenu": "전체 메뉴",

    // 푸터
    "footer.explore": "탐색",
    "footer.community": "커뮤니티",
    "footer.brand": "툰스펙트럼",
    "footer.section.browse": "탐색",
    "footer.section.community": "커뮤니티",
    "footer.section.brand": "툰스펙트럼",
    "footer.section.help": "이용 안내",
    "footer.section.business": "사업자 정보",
    "footer.tagline": "활자와 스펙트럼",
    "footer.link.search": "통합 검색",
    "footer.link.ranking": "통합 랭킹",
    "footer.link.calendar": "연재 캘린더",
    "footer.link.recommend": "맞춤 추천",
    "footer.link.explore": "장르 스펙트럼",
    "footer.link.tags": "태그로 찾기",
    "footer.link.community": "커뮤니티 허브",
    "footer.link.pencafes": "장르 카페",
    "footer.link.reviews": "리뷰 피드",
    "footer.link.compare": "작품 비교",
    "footer.link.dashboard": "트렌드 대시보드",
    "footer.link.feedback": "의견 게시판",
    "footer.link.library": "내 서재",
    "footer.link.taste": "취향 분석",
    "footer.link.news": "웹툰·웹소설 소식",
    "footer.link.about": "서비스 소개",
    "footer.link.guide": "랭킹 산정 방식",
    "footer.link.sitemap": "사이트맵",
    "footer.link.settings": "설정",
    "footer.link.support": "문의",
    "footer.link.terms": "이용약관",
    "footer.link.privacy": "개인정보처리방침",
    "footer.link.copyright": "저작권·콘텐츠 안내",
    "footer.description.primary":
      "네이버 웹툰·시리즈와 카카오웹툰을 가로지르는 웹툰·웹소설 통합 인덱스. 무엇을, 어디서, 왜 봐야 하는지 한 곳에서 답합니다.",
    "footer.description.secondary":
      "작품 메타데이터·표지는 여러 국내 웹툰·웹소설 플랫폼의 공개 카탈로그에서 수집한 실데이터입니다. 네이버 웹툰의 별점은 실수집값이며, 조회·관심수는 네이버가 공개 집계를 비공개로 전환해 추정값(≈)으로 표기합니다. 그 외 플랫폼의 평점·조회·평가 수·완독률 등 일부 지표는 추정값(≈)으로 표기합니다.",
    "footer.business.company": "상호",
    "footer.business.representative": "대표자",
    "footer.business.privacyOfficer": "개인정보보호책임자",
    "footer.business.registrationNumber": "사업자등록번호",
    "footer.business.address": "주소",
    "footer.business.email": "이메일",
    "footer.business.phone": "전화번호",
    "footer.business.hosting": "호스팅 서비스",
    "footer.business.serviceType": "플랫폼 형태",
    "footer.copyrightLine": "© {year} 툰스펙트럼 (Beta). All rights reserved.",
    "footer.logoTag": "Type & Spectrum",

    // 404
    "page.notFound.title": "페이지를 찾을 수 없어요",
    "page.notFound.message": "주소를 다시 확인하거나 홈에서 작품을 탐색해 주세요.",
    "page.notFound.home": "홈으로 돌아가기",

    // 설정 페이지
    "settings.eyebrow": "SETTINGS",
    "settings.title": "설정",
    "settings.subtitle": "표시 방식과 필터를 저장하거나 초기화합니다. 모든 설정은 이 브라우저에만 저장됩니다.",
    "settings.section.display": "표시",
    "settings.section.filters": "필터",
    "settings.section.age": "연령 확인",
    "settings.section.data": "내 데이터",
    "settings.section.account": "계정",
    "settings.rating.star": "별점 ★",
    "settings.rating.ten": "10점",
    "settings.rating.hundred": "100점",
    "settings.rating.title": "평점 표시 단위",
    "settings.rating.desc": "별점을 어떤 척도로 보여줄지 선택",
    "settings.language.title": "언어",
    "settings.language.desc":
      "메뉴·버튼 표기 언어입니다. (작품 본문 데이터는 한국어 원문 우선으로 제공합니다.)",
    "settings.filters.remember": "필터 기억",
    "settings.filters.remember.desc": "랭킹·추천·캘린더에서 설정한 필터를 다음 방문에도 유지합니다.",
    "settings.filters.clear": "저장된 필터 초기화",
    "settings.filters.clear.desc": "모든 페이지의 저장된 필터 값을 지웁니다.",
    "settings.filters.saved": "저장됨",
    "settings.filters.clearNow": "필터 초기화",
    "settings.age.title": "19금 표지 열람",
    "settings.age.descriptionVerified": "만 19세 이상으로 확인됨",
    "settings.age.descriptionVerifiedWithBirthdate": "만 19세 이상으로 확인됨 ({date})",
    "settings.age.description": "생년월일로 만 19세 이상을 확인하면 19금 표지가 보입니다.",
    "settings.age.reset": "확인 해제",
    "settings.age.verify": "연령 확인",
    "settings.data.export": "내 서재 백업 내보내기",
    "settings.data.exportDesc": "별점·읽음·구독·컬렉션을 JSON 파일로 저장합니다.",
    "settings.data.import": "백업 가져오기",
    "settings.data.importDesc": "내보낸 JSON으로 복원합니다. 현재 이 브라우저의 데이터를 덮어씁니다.",
    "settings.data.recent": "최근 본 기록 지우기",
    "settings.data.recentDesc": "홈·서재·검색에 표시되는 최근 본 작품 기록을 지웁니다.",
    "settings.data.search": "최근 검색어 지우기",
    "settings.data.searchDesc": "검색 화면에 표시되는 최근 검색어를 지웁니다.",
    "settings.data.reset": "내 활동 초기화",
    "settings.data.resetDesc": "별점·읽음 상태·구독·컬렉션을 모두 지웁니다. 되돌릴 수 없습니다.",
    "settings.data.stats": "방문 통계",
    "settings.data.statsToday": "오늘",
    "settings.data.statsTotal": "누적",
    "settings.data.now": "현재",
    "settings.data.clear": "지움",
    "settings.data.cleared": "초기화됨",
    "settings.data.confirmReset": "정말 초기화",
    "settings.data.cancel": "취소",
    "settings.data.confirmed": "확인",
    "settings.data.confirmDelete": "초기화",
    "settings.data.statsDesc": "방문 통계입니다.",
    "settings.data.importError": "파일을 읽을 수 없어요. 올바른 백업 파일인지 확인해주세요.",
    "settings.account.title": "계정 관리 · 회원 탈퇴",
    "settings.account.desc":
      "프로필 수정과 회원 탈퇴는 내 정보 페이지에서 할 수 있어요. 탈퇴 시 로그인 정보가 삭제되고 세션이 만료됩니다.",
    "settings.account.manage": "내 정보",
    "settings.account.toProfile": "내 정보",

    // 저자 페이지
    "authors.eyebrow": "AUTHOR DIRECTORY",
    "authors.title": "작가별 보기",
    "authors.desc":
      "작품을 많이 낸 작가 순으로 모았습니다. 작가를 누르면 그 작가의 작품·평점·펜카페를 한곳에서 봅니다.",
    "authors.search": "작가 이름 검색",
    "authors.error": "작가 목록을 불러오지 못했습니다.",
    "authors.empty": "와 일치하는 작가가 없습니다.",
    "authors.allOf": "전체",
    "authors.topOf": "명 중 상위",
    "authors.people": "명",
    "authors.works": "작",
    "authors.views": "뷰",
    "authors.pencafe": "작가 팬카페",
    "authors.stats": "전체 {total}명 중 상위 {shown}명",
    "authors.noName": "작가",
  },
  en: {
    "app.name": "ToonSpectrum",
    "app.brandBeta": "Beta service — data and features may change",
    "app.loading": "Loading",

    "lang.ko": "Korean",
    "lang.en": "English",
    "lang.switch": "Language",
    "lang.auto": "Auto",
    "lang.change": "Change language",

    "common.loading": "Loading",
    "common.loading.short": "Loading",
    "common.close": "Close",
    "common.open": "Open",
    "common.search": "Search",
    "common.retry": "Retry",
    "common.retry.short": "Retry",
    "common.backToTop": "Back to top",
    "common.backToHome": "Go home",
    "common.loading.search": "Searching…",
    "common.notFoundWithQuery": "No results for '{query}'.",
    "common.openSearch": "Find it in Search →",
    "common.loading.empty": "No data returned.",
    "common.retry.all": "Try again or go back to home.",
    "search.badge": "Global search",
    "search.title": "A focused workspace to find titles quickly",
    "search.subtitle": "Search titles, creators, and tags together and narrow results with platform and pricing filters.",
    "search.filterButton": "Narrow with filters",
    "search.compareFromRanking": "Compare in ranking",
    "search.currentQuery": "Current query",
    "search.queryAll": "All",
    "search.freeOnlyLabel": "Free-first focus",
    "search.explorer.sort.label": "Sort by",
    "search.explorer.sort.relevance": "Relevance",
    "search.explorer.sort.rating": "Rating",
    "search.explorer.sort.popular": "Popularity",
    "search.explorer.sort.trending": "Trending",
    "search.explorer.sort.bookmarks": "Favorites",
    "search.explorer.sort.completion": "Completion rate",
    "search.explorer.sort.newest": "Newest",
    "search.explorer.sort.title": "Alphabetical",
    "search.explorer.year.all": "All",
    "search.explorer.year.2022plus": "2022+",
    "search.explorer.year.2018-21": "2018-21",
    "search.explorer.year.2014-17": "2014-17",
    "search.explorer.year.upto2013": "Until 2013",
    "search.explorer.type.webtoon": "Webtoon",
    "search.explorer.type.webnovel": "Novel",
    "search.explorer.status.ongoing": "Ongoing",
    "search.explorer.status.completed": "Completed",
    "search.explorer.status.hiatus": "Hiatus",
    "search.explorer.age.all": "All",
    "search.explorer.age.12": "12+",
    "search.explorer.age.15": "15+",
    "search.explorer.age.19": "19+",
    "search.explorer.ratingAll": "All",
    "search.explorer.facet.type": "Type",
    "search.explorer.facet.genre": "Genre",
    "search.explorer.facet.tag": "Tag",
    "search.explorer.facet.year": "Publication year",
    "search.explorer.facet.status": "Serial status",
    "search.explorer.facet.platform": "Platform",
    "search.explorer.facet.minRating": "Minimum rating",
    "search.explorer.facet.age": "Age",
    "search.explorer.facet.option": "Options",
    "search.explorer.option.freeOnly": "Free only",
    "search.explorer.option.adapted": "Adapted/Derivative links",
    "search.explorer.filter": "Filters",
    "search.explorer.filterReset": "Clear all",
    "search.explorer.search.label": "Search titles, authors, and tags",
    "search.explorer.search.placeholder": "Search titles, authors, tags",
    "search.explorer.search.clear": "Clear keyword",
    "search.explorer.search.reload": "Reload search",
    "search.explorer.savedOnly": "Saved only",
    "search.explorer.view.grid": "Grid view",
    "search.explorer.view.list": "List view",
    "search.explorer.refresh": "Refresh",
    "search.explorer.loading": "Loading",
    "search.explorer.resultCount": "{count} titles",
    "search.explorer.noResult": "No results",
    "search.explorer.recent": "Recent searches",
    "search.explorer.recent.clearAll": "Clear all",
    "search.explorer.recent.delete": "Delete recent query {query}",
    "search.explorer.recent.searchAgain": "Search again from recent keywords",
    "search.explorer.catalog.label": "Catalog",
    "search.explorer.catalog.empty": "Catalog is empty",
    "search.explorer.currentFilter": "Current filters",
    "search.explorer.token.remove": "Remove {label} filter",
    "search.explorer.error.title": "Failed to load search data.",
    "search.explorer.error.description": "Unable to load search data. Please try again later.",
    "search.explorer.retry": "Retry",
    "search.explorer.noResults": "No titles match the conditions.",
    "search.explorer.hint.search": "Try changing the keyword or reducing filters.",
    "search.explorer.hint.filter": "Reduce filters or try different conditions.",
    "search.explorer.typeSummary.empty": "No type",
    "search.explorer.separator": " · ",
    "search.explorer.unit.itemSuffix": " items",
    "ageGate.title": "Adult content check",
    "ageGate.description": "Enter your date of birth to verify you are 19 or older.",
    "ageGate.birthDateLabel": "Date of birth",
    "ageGate.birthYearLabel": "Birth year",
    "ageGate.birthYearPlaceholder": "Year",
    "ageGate.birthMonthLabel": "Birth month",
    "ageGate.birthMonthPlaceholder": "Month",
    "ageGate.birthDayLabel": "Birth day",
    "ageGate.birthDayPlaceholder": "Day",
    "ageGate.yearSuffix": "",
    "ageGate.monthSuffix": "",
    "ageGate.daySuffix": "",
    "ageGate.deniedMessage": "You did not meet the age requirement.",
    "ageGate.cancel": "Cancel",
    "ageGate.confirm": "Confirm",
    "share.triggerAria": "Open share menu",
    "share.triggerLabel": "Share",
    "share.copy": "Copy link",
    "share.copySuccess": "Copied",
    "share.social.x": "Share on X",
    "share.social.facebook": "Share on Facebook",
    "bookmark.add": "Add to library",
    "bookmark.remove": "Remove from library",
    "toast.bookmarkAdded": "Added to library",
    "toast.bookmarkRemoved": "Removed from library",
    "ad.creativeFallbackAlt": "Sponsored image",
    "ad.slotAriaLabel": "Advertising slot",
    "ad.slotLabel": "Sponsored",
    "ad.slotTitle": "Sponsored content",
    "ad.ctaDetails": "View details",
    "ad.placeholderAriaLabel": "Ad placeholder",
    "ad.placeholderText": "No sponsored content available.",
    "ad.tag": "Ad",
    "avatar.error.invalidType": "Unsupported image type.",
    "avatar.error.processFailed": "Failed to process image.",
    "avatar.processing": "Processing…",
    "avatar.select": "Change image",
    "avatar.remove": "Remove image",
    "avatar.uploadHint": "Only JPG, PNG, and WEBP images are supported, then cropped for preview.",
    "avatar.changeAria": "Change profile image",
    "titleFilter.header": "Filters",
    "titleFilter.remember": "Remember filters",
    "titleFilter.rememberTitle": "Save filters",
    "titleFilter.reset": "Reset all",
    "titleFilter.facet.saved": "Saved",
    "titleFilter.facet.type": "Type",
    "titleFilter.facet.genre": "Genre",
    "titleFilter.facet.status": "Serial status",
    "titleFilter.facet.platform": "Platform",
    "titleFilter.facet.age": "Age",
    "titleFilter.facet.pricing": "Pricing",
    "titleFilter.facet.minRating": "Minimum rating",
    "titleFilter.facet.year": "Start year",
    "titleFilter.facet.tag": "Tag",
    "titleFilter.facet.adapted": "Adapted",
    "titleFilter.savedOnly": "Saved only",
    "titleFilter.option.type.webtoon": "Webtoon",
    "titleFilter.option.type.webnovel": "Web novel",
    "titleFilter.option.status.ongoing": "Ongoing",
    "titleFilter.option.status.completed": "Completed",
    "titleFilter.option.status.hiatus": "Hiatus",
    "titleFilter.option.age.all": "All",
    "titleFilter.option.age.12": "12+",
    "titleFilter.option.age.15": "15+",
    "titleFilter.option.age.19": "19+",
    "titleFilter.option.pricing.free": "Free",
    "titleFilter.option.pricing.wait-free": "Wait-free",
    "titleFilter.option.pricing.paid": "Paid",
    "titleFilter.option.pricing.subscription": "Subscription",
    "titleFilter.option.minRating.all": "All",
    "titleFilter.option.minRating.3": "3★+",
    "titleFilter.option.minRating.4": "4★+",
    "titleFilter.option.minRating.45": "4.5★+",
    "titleFilter.option.year.2022plus": "2022+",
    "titleFilter.option.year.2018-21": "2018-21",
    "titleFilter.option.year.2014-17": "2014-17",
    "titleFilter.option.year.upto2013": "~2013",
    "titleFilter.option.adaptedOnly": "Original and derivatives",
    "search.explorer.time.noData": "No update info",
    "search.explorer.time.justNow": "Updated just now",
    "search.explorer.time.minutesAgo": "{count}m ago",
    "search.explorer.time.hoursAgo": "{count}h ago",
    "search.explorer.time.daysAgo": "{count}d ago",
    "search.explorer.loadMore": "Load more",
    "command.palette.placeholder": "Search titles, creators, and tags…",
    "command.palette.label": "Search",
    "command.palette.group.shortcuts": "Quick access",
    "command.palette.group.recent": "Recent titles",
    "command.palette.group.results": "Titles",
    "command.palette.quick.search": "Global search",
    "command.palette.quick.ranking": "Ranking",
    "command.palette.quick.recommend": "Personal recommendations",
    "command.palette.quick.fortune": "Character horoscope",
    "command.palette.quick.random": "Random title",
    "command.palette.quick.calendar": "Publication calendar",
    "command.palette.quick.compare": "Title comparison",
    "command.palette.quick.explore": "Explore / Genres",
    "command.palette.quick.insights": "Trend dashboard",
    "command.palette.quick.library": "My library",
    "command.palette.quick.searchHint": "Titles, creators, tags",
    "command.palette.quick.rankingHint": "Ranking across 6 axes",
    "command.palette.quick.recommendHint": "Based on your tastes",
    "command.palette.quick.fortuneHint": "Saju, tarot, compatibility",
    "command.palette.quick.randomHint": "One random title",
    "command.palette.quick.calendarHint": "Weekly publishing",
    "command.palette.quick.compareHint": "Compare two works side by side",
    "command.palette.quick.exploreHint": "Explore spectrum",
    "command.palette.quick.insightsHint": "Market insights from data",
    "command.palette.quick.libraryHint": "Interests, ratings, taste",

    // Reviews
    "review.progress.complete": "Completed",
    "review.progress.binge": "Binging",
    "review.progress.upcoming": "Planned",
    "review.progress.abandoned": "Dropped",
    "review.progress.unknown": "Progress hidden",
    "review.spoilerRevealLabel": "Show spoiler",

    // Ranking details
    "ranking.detailTitle": "View score breakdown",
    "ranking.metric.views": "Views",
    "ranking.why": "Why",
    "ranking.breakdownTitle": "Score breakdown",
    "ranking.totalScore": "Total score",
    "ranking.breakdownDescription": "Calculated with axis weights and title-specific normalization.",

    "control.language.label": "Language",
    "control.sound.enable": "Enable sound effects",
    "control.sound.disable": "Disable sound effects",
    "control.theme.dark": "Switch to light mode",
    "control.theme.light": "Switch to dark mode",
    "control.settings.open": "Open settings",
    "control.settings.close": "Close settings",
    "control.cluster.settings": "Sound, theme, language controls",
    "control.cluster.open": "Open settings",
    "control.cluster.tooltip": "Sound, theme, and language settings",

    "route.home": "",
    "route.ranking": "Unified ranking",
    "route.search": "Search",
    "route.recommend": "Personalized Picks",
    "route.explore": "Spectrum Explore",
    "route.random": "Random discovery",
    "route.feedback": "Feedback board",
    "route.tags": "Search by tag",
    "route.calendar": "Publication calendar",
    "route.reviews": "Reviews",
    "route.community": "Community",
    "route.community_cafes": "Genre cafes",
    "route.adminCommunity": "Community admin",
    "route.adminMembers": "Member management",
    "route.library": "Library",
    "route.compare": "Compare titles",
    "route.insights": "Trend insights",
    "route.authors": "Authors",
    "route.news": "Toon & web novel news",
    "route.about": "About",
    "route.design": "Design system",
    "route.sitemap": "Sitemap",
    "route.guide": "Ranking policy",
    "route.settings": "Settings",
    "route.admin": "Admin console",
    "route.terms": "Terms of service",
    "route.privacy": "Privacy policy",
    "route.copyright": "Copyright & content policy",
    "route.contact": "Ads and partnerships",
    "home.hero.eyebrow": "WEBTOON × WEBNOVEL",
    "home.hero.titleLine1": "Scattered stories,",
    "home.hero.titleShimmer": "A single index",
    "home.hero.titleSuffix": ".",
    "home.hero.description":
      "Search across Naver Webtoon, Series, and Kakao Webtoon, then quickly narrow down what to read using real-time signals and reader preferences.",
    "home.hero.searchButton": "Search titles, creators, tags",
    "home.hero.rankingButton": "View unified ranking",
    "home.hero.studioLink": "Creator studio",
    "home.hero.createLink": "Creator board",
    "home.hero.stats.titles": "Titles",
    "home.hero.stats.platforms": "Publishing platforms",
    "home.hero.stats.genres": "Genre spectrum",
    "home.hero.stats.reviews": "Reader reviews",
    "home.loadError": "Could not load home data.",
    "route.support": "Support",
    "route.create": "Creator board",
    "route.studio": "Studio",
    "route.me": "My profile",
    "route.fortune": "Character horoscope",
    "route.play": "Arcade",
    "route.unknown": "Page",
    "route.pencafeSuffix": "fan cafe",

    // Studio tutorials and help

    // Background editor



    // Canvas settings panel (guides/grid/webtoon guides)












    "auth.menu.triggerLabel": "Account menu",
    "auth.menu.adminPanel": "Admin console",
    "auth.menu.profile": "My profile",
    "auth.menu.settings": "Settings",
    "auth.menu.signOut": "Sign out",
    "auth.menu.fallbackName": "Reader",
    "auth.callback.message.working": "Finalizing sign-in…",
    "auth.callback.error.badState": "Invalid state parameter.",
    "auth.callback.error.noCode": "Missing authorization code.",
    "auth.callback.error.oauthFailed": "OAuth exchange failed.",
    "auth.callback.error.unsupported": "Unsupported sign-in provider.",
    "auth.callback.error.accessDenied": "Sign-in was cancelled.",
    "auth.callback.error.generic": "Sign-in failed.",
    "auth.callback.error.noUser": "Unable to verify user information.",
    "auth.callback.error.invalidAccess": "Invalid access.",
    "auth.callback.error.failed": "An error occurred while signing in.",
    "auth.callback.message.done": "Sign-in completed. Redirecting shortly.",
    "auth.callback.message.doneDemo": "Demo sign-in completed. Redirecting shortly.",
    "auth.callback.demo.message": "You are signed in with a demo account. Some features may be limited.",

    // Account page
    "account.tabs.posts": "Posts",
    "account.tabs.activity": "Activity",
    "account.tabs.profile": "Profile",
    "account.signIn.title": "Sign in required",
    "account.signIn.message": "Please sign in to view your posts, activity, and profile.",
    "account.signIn.cta": "Sign in",
    "account.posts.errorTitle": "Failed to load your posts.",
    "account.posts.emptyTitle": "No works have been posted yet.",
    "account.posts.emptyMessage": "Create your first title from the studio.",
    "account.posts.cta": "Go to studio",
    "account.posts.emptyReviewText": "No reviews by this user.",
    "account.activity.emptyTitle": "No activity yet.",
    "account.activity.emptyMessage": "Try rating, reviewing, or saving titles to your library.",
    "account.activity.viewTitlesCta": "Browse titles",
    "account.activity.stat.reviews": "Reviews written",
    "account.activity.stat.want": "Want to read",
    "account.activity.stat.reading": "Reading",
    "account.activity.stat.done": "Completed",
    "account.activity.stat.collections": "Collections",
    "account.activity.recentReviewsTitle": "Recent reviews",
    "account.activity.recentNoText": "Rating only",
    "account.activity.storageHint": "Activity is stored in this browser (and in your account when signed in). Full list is available in {link}.",
    "account.profile.photoTitle": "Profile image",
    "account.profile.photoDesc": "This image appears where your name is shown, like comments and menus.",
    "account.profile.nameLabel": "Name",
    "account.profile.namePlaceholder": "Display name",
    "account.profile.bioLabel": "Bio",
    "account.profile.bioPlaceholder": "Tell us about yourself in one line.",
    "account.profile.bioLength": "{length}/280",
    "account.profile.saveButton": "Save profile",
    "account.profile.saving": "Saving…",
    "account.profile.saved": "Saved",
    "account.profile.nameRequired": "Please enter a name.",
    "account.profile.deleteTitle": "Delete account",
    "account.profile.deleteDesc":
      "Your profile and login information will be deleted and the current session will end. Your posts/comments remain as deleted-user content.",
    "account.profile.deleting": "Deleting…",
    "account.profile.confirmDelete":
      "Do you want to delete your account? Your profile and login information will be removed and your session will be terminated.",
    "account.profile.errorSave": "Failed to save profile.",
    "account.profile.errorDelete": "Failed to delete account.",
    "account.profile.loadingError": "Failed to load profile.",
    "account.page.eyebrow": "MY ACCOUNT",
    "account.page.title": "My profile",
    "account.page.subtitle":
      "Check your posts and activity, and manage your profile details.",
    "account.page.tabsAria": "Profile tabs",

    // Public user profile
    "userProfile.eyebrow": "Reader profile",
    "userProfile.tabs.reviews": "Reviews",
    "userProfile.tabs.works": "Created works",
    "userProfile.tabs.series": "Series",
    "userProfile.works.empty": "This user has no public works yet.",
    "userProfile.series.empty": "This user has no series yet.",
    "userProfile.fetchError": "Unable to load profile.",
    "userProfile.authorFallback": "User",
    "userProfile.metaTemplate": "{author} profile · {reviews} reviews · {works} works · avg rating {avg} — ToonSpectrum.",
    "userProfile.bioFallback": "Reader profile and published works",
    "userProfile.followHint": "You can follow users after signing in.",
    "userProfile.follow": "Follow",
    "userProfile.following": "Following",
    "userProfile.stat.followers": "Followers",
    "userProfile.stat.totalReviews": "Reviews",
    "userProfile.stat.avgRating": "Average rating",
    "userProfile.stat.works": "Created works",
    "userProfile.stat.series": "Series",
    "userProfile.tabsLabel": "Profile content",
    "userProfile.refresh": "Refresh",
    "userProfile.emptyReviews": "No reviews published by this user yet.",

    // 데스크탑 헤더는 nav 9개+검색을 한 줄에 수용해야 한다 — EN 라벨은 짧게 유지
    // (헤더 폭 예산: lib/__tests__/header-width-budget.test.ts 참조).
    "nav.home": "Home",
    "nav.ranking": "Ranking",
    "nav.calendar": "Series",
    "nav.recommend": "Picks",
    "nav.explore": "Explore",
    "nav.fortune": "Horoscope",
    "nav.play": "Arcade",
    "nav.reviews": "Reviews",
    "nav.community": "Forum",
    "nav.insights": "Stats",
    "nav.create": "Create",
    "nav.library": "Library",
    "nav.login": "Sign in",
    // 검색 트리거 힌트 — sm(w-48)·lg(w-40) 폭에 잘림 없이 들어가는 길이 유지(상세 힌트는
    // 열린 팔레트 placeholder와 nav.searchOpen aria-label이 담당)
    "nav.search": "Find webtoons",
    "nav.searchOpen": "Open search (titles, authors, tags)",
    "nav.quickAccess": "Quick access",
    "nav.menu": "Menu",
    "nav.allMenu": "All menu",

    // 푸터
    "footer.explore": "Explore",
    "footer.community": "Community",
    "footer.brand": "ToonSpectrum",
    "footer.tagline": "Type & Spectrum",
    "footer.section.browse": "Explore",
    "footer.section.community": "Community",
    "footer.section.brand": "ToonSpectrum",
    "footer.section.help": "Support",
    "footer.section.business": "Business information",
    "footer.link.search": "Global search",
    "footer.link.ranking": "Unified ranking",
    "footer.link.calendar": "Publication calendar",
    "footer.link.recommend": "Recommended",
    "footer.link.explore": "Genre spectrum",
    "footer.link.tags": "Search by tag",
    "footer.link.community": "Community hub",
    "footer.link.pencafes": "Genre cafes",
    "footer.link.reviews": "Review feed",
    "footer.link.compare": "Compare titles",
    "footer.link.dashboard": "Trend dashboard",
    "footer.link.feedback": "Feedback board",
    "footer.link.library": "My library",
    "footer.link.taste": "Taste analysis",
    "footer.link.news": "Toon & web novel news",
    "footer.link.about": "About ToonSpectrum",
    "footer.link.guide": "Ranking policy",
    "footer.link.sitemap": "Sitemap",
    "footer.link.settings": "Settings",
    "footer.link.support": "Support",
    "footer.link.terms": "Terms of service",
    "footer.link.privacy": "Privacy policy",
    "footer.link.copyright": "Copyright & content policy",
    "footer.description.primary":
      "A unified index of webtoons and web novels across Naver Webtoon, Lezhin Series, and Kakao Webtoon, helping you decide what to read, where, and why.",
    "footer.description.secondary":
      "Metadata and covers are sourced from publicly available catalog data from major domestic platforms. Naver Webtoon ratings are collected directly; views and interest counts are shown as estimates (≈) where Naver publishes only aggregated data in non-public mode. Some other metrics (ratings, views, reads, completion rate) are also shown as estimates (≈).",
    "footer.business.company": "Company",
    "footer.business.representative": "Representative",
    "footer.business.privacyOfficer": "Privacy officer",
    "footer.business.registrationNumber": "Business registration number",
    "footer.business.address": "Address",
    "footer.business.email": "Email",
    "footer.business.phone": "Phone",
    "footer.business.hosting": "Hosting service",
    "footer.business.serviceType": "Platform type",
    "footer.copyrightLine": "© {year} ToonSpectrum (Beta). All rights reserved.",
    "footer.logoTag": "Type & Spectrum",

    // 404
    "page.notFound.title": "Page not found",
    "page.notFound.message": "Check the URL again or explore titles from the home page.",
    "page.notFound.home": "Go back home",

    // 설정 페이지
    "settings.eyebrow": "SETTINGS",
    "settings.title": "Settings",
    "settings.subtitle":
      "Store display and filter preferences or reset them. All settings are saved only in this browser.",
    "settings.section.display": "Display",
    "settings.section.filters": "Filters",
    "settings.section.age": "Age check",
    "settings.section.data": "My data",
    "settings.section.account": "Account",
    "settings.rating.star": "Star ★",
    "settings.rating.ten": "10 points",
    "settings.rating.hundred": "100 points",
    "settings.rating.title": "Rating scale",
    "settings.rating.desc": "Choose how ratings are shown.",
    "settings.language.title": "Language",
    "settings.language.desc": "UI language for menus and labels. (Work content remains in Korean original order.)",
    "settings.filters.remember": "Remember filters",
    "settings.filters.remember.desc": "Keep ranking, recommendations, and calendar filters across visits.",
    "settings.filters.clear": "Clear saved filters",
    "settings.filters.clear.desc": "Remove saved filters from all pages.",
    "settings.filters.saved": "Saved",
    "settings.filters.clearNow": "Clear filters",
    "settings.age.title": "Adult badge visibility",
    "settings.age.descriptionVerified": "Verified as 19+",
    "settings.age.descriptionVerifiedWithBirthdate": "Verified as 19+ ({date})",
    "settings.age.description": "Adult badges appear after age verification.",
    "settings.age.reset": "Revoke verification",
    "settings.age.verify": "Age check",
    "settings.data.export": "Export library backup",
    "settings.data.exportDesc": "Save ratings, read status, subscriptions, and collections to JSON.",
    "settings.data.import": "Import backup",
    "settings.data.importDesc": "Restore from a backup file and overwrite current browser data.",
    "settings.data.recent": "Clear recent list",
    "settings.data.recentDesc": "Clear recent titles shown on Home, Library, and Search.",
    "settings.data.search": "Clear search history",
    "settings.data.searchDesc": "Clear recent keywords on the search screen.",
    "settings.data.reset": "Reset my activity",
    "settings.data.resetDesc": "Remove ratings, read history, subscriptions, and collections. Cannot be undone.",
    "settings.data.importError": "Unable to read the file. Make sure this is a valid backup export.",
    "settings.data.stats": "Visit stats",
    "settings.data.statsToday": "Today",
    "settings.data.statsTotal": "Total",
    "settings.data.now": "Current",
    "settings.data.clear": "Cleared",
    "settings.data.cleared": "Reset",
    "settings.data.confirmReset": "Confirm reset",
    "settings.data.cancel": "Cancel",
    "settings.data.confirmed": "Done",
    "settings.data.confirmDelete": "Reset all",
    "settings.data.statsDesc": "Visit statistics.",
    "settings.account.title": "Account management · leave service",
    "settings.account.desc":
      "Profile edits and account deletion are available on your profile page. Deletion logs you out immediately.",
    "settings.account.manage": "Account management",
    "settings.account.toProfile": "Go to profile",

    // 저자 페이지
    "authors.eyebrow": "AUTHOR DIRECTORY",
    "authors.title": "Authors",
    "authors.desc":
      "Authors ranked by number of works. Tap an author to see their titles, ratings, and fan cafe in one place.",
    "authors.search": "Search author name",
    "authors.error": "Couldn't load the author list.",
    "authors.empty": " — no matching author.",
    "authors.allOf": "of",
    "authors.topOf": "· top",
    "authors.people": "",
    "authors.works": " works",
    "authors.views": "views",
    "authors.pencafe": "Creator fan cafe",
    "authors.stats": "Top {shown} out of {total} authors",
    "authors.noName": "Creator",
  },
};

interface I18nState {
  lang: Lang;
  translationBundleRevision: number;
  setLang: (lang: Lang) => void;
}

const RUNTIME_TRANSLATION_SOURCE = "en";
const RUNTIME_TRANSLATION_CACHE_VERSION = 1;
const I18N_TRANSLATION_ENDPOINT = "https://api.mymemory.translated.net/get";
const I18N_TRANSLATION_TARGET_LOCALE_FALLBACK = "en";
const I18N_TRANSLATION_CONCURRENCY = 4;
const RUNTIME_TRANSLATION_TIMEOUT_MS = 8000;
const RUNTIME_TRANSLATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const RUNTIME_TRANSLATION_STORAGE_PREFIX = "toonspectrum-i18n-runtime";

const runtimeTranslationBundles = new Map<string, Dict>();
const runtimeTranslationLoads = new Map<string, Promise<void>>();

type RuntimeTranslationCachePayload = {
  v: number;
  locale: string;
  updatedAt: number;
  dict: Dict;
};

export const GOOGLE_PLAY_LOCALE_LIST: readonly string[] = [
  "af",
  "am",
  "ar",
  "as",
  "az",
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "ceb",
  "cs",
  "cy",
  "da",
  "de",
  "de-AT",
  "de-CH",
  "de-DE",
  "el",
  "en",
  "en-AU",
  "en-GB",
  "en-IN",
  "en-US",
  "es",
  "es-419",
  "es-ES",
  "es-MX",
  "et",
  "eu",
  "fa",
  "fi",
  "fil",
  "fr",
  "fr-CA",
  "fr-CH",
  "gl",
  "gu",
  "ha",
  "he",
  "hi",
  "hi-IN",
  "hr",
  "hu",
  "hy",
  "id",
  "ig",
  "is",
  "it",
  "ja",
  "jv",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "ku",
  "ky",
  "lo",
  "lt",
  "lv",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "nb",
  "ne",
  "nl",
  "nl-BE",
  "pa",
  "pl",
  "ps",
  "pt",
  "pt-BR",
  "pt-PT",
  "ro",
  "ru",
  "si",
  "sk",
  "sl",
  "so",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "uz",
  "vi",
  "zh",
  "zh-CN",
  "zh-Hans",
  "zh-Hant",
  "zh-HK",
  "zh-TW",
  "zu",
];

const FALLBACK_LANG: Lang = "ko";
const FALLBACK_CHAIN: readonly string[] = ["en", FALLBACK_LANG];
const DEFAULT_COLLATOR_LOCALE = "en";

const DICT_LOCALES = Object.keys(DICT);

const NORMALIZED_LOCALE_OPTIONS = (() => {
  const set = new Set<string>();
  for (const locale of DICT_LOCALES) {
    const normalized = normalizeLocaleCode(locale);
    if (normalized) set.add(normalized);
  }
  for (const locale of GOOGLE_PLAY_LOCALE_LIST) {
    const normalized = normalizeLocaleCode(locale);
    if (normalized) set.add(normalized);
  }
  set.add("en");
  set.add(FALLBACK_LANG);
  return [...set];
})();

const displayNameCache = new Map<string, Intl.DisplayNames>();
const collatorCache = new Map<string, Intl.Collator>();

function normalizeLocaleCode(raw: string): string {
  const normalized = raw.trim().replace(/_/g, "-");
  return normalized.toLowerCase();
}

function getLocaleCandidateChain(raw: string, fallbackChain: readonly string[]): string[] {
  const normalized = normalizeLocaleCode(raw);
  const candidates = new Set<string>();

  if (!normalized) {
    for (const fallback of fallbackChain) {
      candidates.add(fallback);
    }
    return [...candidates];
  }

  const parts = normalized.split("-");
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join("-");
    candidates.add(candidate);
  }

  for (const fallback of fallbackChain) {
    candidates.add(fallback);
  }

  return [...candidates];
}

export function getLocaleCandidates(raw: string, fallbackChain: readonly string[] = FALLBACK_CHAIN): string[] {
  return getLocaleCandidateChain(raw, fallbackChain);
}

function getSupportedIntlLocale(raw: string, fallback: string): string {
  const candidates = getLocaleCandidateChain(raw, [fallback]);
  for (const candidate of candidates) {
    if (Intl.Collator.supportedLocalesOf([candidate]).length > 0) return candidate;
  }
  return fallback;
}

function getDisplayNamesFormatter(locale: string): Intl.DisplayNames {
  const key = normalizeLocaleCode(locale) || FALLBACK_LANG;
  const cached = displayNameCache.get(key);
  if (cached) return cached;

  let formatter: Intl.DisplayNames | undefined;
  const candidates = getLocaleCandidateChain(key, [DEFAULT_COLLATOR_LOCALE]);
  for (const candidate of candidates) {
    try {
      if (Intl.Collator.supportedLocalesOf([candidate]).length === 0) continue;
      formatter = new Intl.DisplayNames([candidate], { type: "language" });
      break;
    } catch {
      // 해당 locale 포맷터 미지원이면 다음 후보 사용
    }
  }
  if (!formatter) {
    formatter = new Intl.DisplayNames(["en"], { type: "language" });
  }
  displayNameCache.set(key, formatter);
  return formatter;
}

function getCollator(locale: string): Intl.Collator {
  const key = locale || FALLBACK_LANG;
  const cached = collatorCache.get(key);
  if (cached) return cached;

  const localeForCollator = getSupportedIntlLocale(key, DEFAULT_COLLATOR_LOCALE);
  const collator = new Intl.Collator(localeForCollator, { sensitivity: "base" });
  collatorCache.set(key, collator);
  return collator;
}

function detectBrowserLocale(): string {
  // Node 24+ exposes navigator.language even during SSR. A navigator-only guard therefore makes
  // server markup depend on the host machine's locale and can disagree with the browser during
  // hydration. Only consult the browser locale when an actual Window is present.
  if (typeof window === "undefined" || typeof navigator === "undefined") return FALLBACK_LANG;
  return normalizeLocaleCode(navigator.language) || FALLBACK_LANG;
}

function getLanguageDisplayName(locale: string, inLocale: string): string {
  const formatter = getDisplayNamesFormatter(inLocale);
  return formatter.of(locale) || formatter.of(locale.split("-")[0]) || locale;
}

function normalizeTranslatorLocale(raw: string): string {
  const normalized = normalizeLocaleCode(raw);
  if (!normalized) return I18N_TRANSLATION_TARGET_LOCALE_FALLBACK;

  const parts = normalized.split("-");
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^\d{3}$/.test(part)) return part;
      if (part.length === 4) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      return part.toUpperCase();
    })
    .join("-");
}

function getTranslatorLocaleCandidates(locale: string): string[] {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return [I18N_TRANSLATION_TARGET_LOCALE_FALLBACK];

  const parts = normalized.split("-");
  const candidates = new Set<string>();

  if (parts.length > 0) {
    candidates.add(normalizeTranslatorLocale(parts.join("-")));
  }

  if (parts.length >= 2) {
    candidates.add(normalizeTranslatorLocale(parts[0]));
  }

  if (parts.length >= 3) {
    candidates.add(normalizeTranslatorLocale(`${parts[0]}-${parts[1]}`));
    candidates.add(normalizeTranslatorLocale(`${parts[0]}-${parts[parts.length - 1]}`));
  }

  // 항상 en을 최후의 폴백으로 남겨두고, 정합성/중복을 정리.
  candidates.add(I18N_TRANSLATION_TARGET_LOCALE_FALLBACK);

  return [...candidates];
}

function shouldTranslateLocale(locale: string): boolean {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return false;
  if (normalized === FALLBACK_LANG) return false;
  if (normalized === RUNTIME_TRANSLATION_SOURCE) return false;
  if (DICT[normalized]) return false;

  const root = normalized.split("-")[0];
  if (DICT[root]) return false;

  return true;
}

function parseMymemoryResponse(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const typed = data as {
    responseData?: {
      translatedText?: unknown;
    };
    responseStatus?: number | string;
  };

  if (typeof typed.responseData?.translatedText !== "string") return null;
  if (typed.responseStatus !== undefined) {
    const status =
      typeof typed.responseStatus === "string"
        ? Number.parseInt(typed.responseStatus, 10)
        : typed.responseStatus;
    if (status !== 200) return null;
  }
  return typed.responseData.translatedText.trim() || null;
}

function getRuntimeTranslationStorageKey(locale: string): string {
  return `${RUNTIME_TRANSLATION_STORAGE_PREFIX}:v${RUNTIME_TRANSLATION_CACHE_VERSION}:${locale}`;
}

function clearInvalidRuntimeTranslationCache(locale: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(getRuntimeTranslationStorageKey(locale));
}

function readCachedRuntimeTranslation(locale: string): Dict | null {
  if (typeof localStorage === "undefined") return null;
  const key = getRuntimeTranslationStorageKey(locale);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeTranslationCachePayload;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.v !== RUNTIME_TRANSLATION_CACHE_VERSION ||
      parsed.locale !== locale ||
      typeof parsed.updatedAt !== "number" ||
      Date.now() - parsed.updatedAt > RUNTIME_TRANSLATION_CACHE_TTL_MS ||
      typeof parsed.dict !== "object" ||
      parsed.dict === null
    ) {
      clearInvalidRuntimeTranslationCache(locale);
      return null;
    }

    return parsed.dict;
  } catch {
    clearInvalidRuntimeTranslationCache(locale);
    return null;
  }
}

function writeRuntimeTranslationCache(locale: string, dict: Dict): void {
  if (typeof localStorage === "undefined") return;
  const key = getRuntimeTranslationStorageKey(locale);
  const payload: RuntimeTranslationCachePayload = {
    v: RUNTIME_TRANSLATION_CACHE_VERSION,
    locale,
    updatedAt: Date.now(),
    dict,
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage 용량 초과/차단 시 폴백으로 캐시만 스킵.
  }
}

async function translateViaMymemory(source: string, targetLocale: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUNTIME_TRANSLATION_TIMEOUT_MS);

  try {
    const url = `${I18N_TRANSLATION_ENDPOINT}?${new URLSearchParams({
      q: source,
      langpair: `${RUNTIME_TRANSLATION_SOURCE}|${normalizeTranslatorLocale(targetLocale)}`,
    }).toString()}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const payload = await response.json();
    return parseMymemoryResponse(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateViaMymemoryWithFallback(source: string, targetLocale: string): Promise<string | null> {
  for (const candidate of getTranslatorLocaleCandidates(targetLocale)) {
    const translated = await translateViaMymemory(source, candidate);
    if (translated) return translated;
  }

  return null;
}

function getRuntimeTranslationBundle(locale: string): Dict | undefined {
  return runtimeTranslationBundles.get(normalizeLocaleCode(locale));
}

async function loadRuntimeTranslationBundle(locale: string): Promise<void> {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized || !shouldTranslateLocale(normalized)) return;

  const existing = getRuntimeTranslationBundle(normalized);
  if (existing) return;

  const cached = readCachedRuntimeTranslation(normalized);
  if (cached) {
    runtimeTranslationBundles.set(normalized, cached);
    useI18n.setState((state) => ({
      translationBundleRevision: state.translationBundleRevision + 1,
    }));
    return;
  }

  const existingLoad = runtimeTranslationLoads.get(normalized);
  if (existingLoad) {
    await existingLoad;
    return;
  }

  const allKeys = Object.keys(DICT[RUNTIME_TRANSLATION_SOURCE]);
  const bundle: Dict = {};

  const loadJob = (async () => {
    for (let index = 0; index < allKeys.length; index += I18N_TRANSLATION_CONCURRENCY) {
      const chunkKeys = allKeys.slice(index, index + I18N_TRANSLATION_CONCURRENCY);
      const translated = await Promise.all(
        chunkKeys.map(async (key) => {
          const source = DICT[RUNTIME_TRANSLATION_SOURCE][key];
          if (!source) return null;
          const translatedText = await translateViaMymemoryWithFallback(source, normalized);
          if (!translatedText) return null;
          return [key, translatedText] as const;
        })
      );

      for (const entry of translated) {
        if (!entry) continue;
        const [key, value] = entry;
        bundle[key] = value;
      }
    }

    runtimeTranslationBundles.set(normalized, bundle);
    writeRuntimeTranslationCache(normalized, bundle);
    if (Object.keys(bundle).length > 0) {
      useI18n.setState((state) => ({
        translationBundleRevision: state.translationBundleRevision + 1,
      }));
    }
  })();

  runtimeTranslationLoads.set(normalized, loadJob);
  await loadJob;
  runtimeTranslationLoads.delete(normalized);
}

export async function ensureRuntimeLocaleBundle(locale: string): Promise<void> {
  await loadRuntimeTranslationBundle(locale);
}

export function getLanguageOptions(displayLocale?: string): LanguageLocaleOption[] {
  const inLocale = normalizeLocaleCode(displayLocale || FALLBACK_LANG);
  const collator = getCollator(inLocale);
  return NORMALIZED_LOCALE_OPTIONS.map((code) => {
    const nativeLabel = getLanguageDisplayName(code, code);
    const englishLabel = getLanguageDisplayName(code, "en");
    const label = nativeLabel === englishLabel || !englishLabel ? nativeLabel : `${nativeLabel} / ${englishLabel}`;
    return {
      code,
      label,
      nativeLabel,
      englishLabel,
    };
  }).sort((left, right) => collator.compare(left.label, right.label));
}

export function getLanguageOptionLookup(locale: string): Record<string, string> {
  const normalized = normalizeLocaleCode(locale);
  return {
    native: getLanguageDisplayName(normalized, normalized || FALLBACK_LANG) || normalized,
    english: getLanguageDisplayName(normalized, "en"),
  };
}

function resolveTranslation(
  lang: string,
  key: string,
  fallbackChain: readonly string[] = FALLBACK_CHAIN,
): string {
  const candidates = getLocaleCandidates(lang, fallbackChain);
  for (const candidate of candidates) {
    const runtimeBundle = getRuntimeTranslationBundle(candidate);
    if (runtimeBundle?.[key]) return runtimeBundle[key];

    const bundle = DICT[candidate];
    if (bundle?.[key]) return bundle[key];
  }

  return DICT[FALLBACK_LANG][key] ?? key;
}

/**
 * Registers a route-owned dictionary without forcing its strings into the
 * application shell bundle. Route modules call this synchronously while their
 * lazy chunk is evaluated, so the first committed render already sees the
 * localized labels.
 */
export function registerI18nLocaleEntries(
  locale: string,
  entries: Readonly<Record<string, string>>,
): void {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;

  const target = DICT[normalized] ?? (DICT[normalized] = {});
  let changed = false;
  for (const [key, value] of Object.entries(entries)) {
    if (target[key] === value) continue;
    target[key] = value;
    changed = true;
  }
  if (!changed) return;
}

type TranslationResolver = (key: string) => string;

// A translator is part of effect dependencies in data-fetching and OAuth surfaces. Returning a
// fresh closure from useT() on every render would restart those effects (and can create a render /
// request loop when an effect updates local state). Cache one resolver per normalized locale so
// callers get referential stability without coupling the hook to React memoization. Runtime bundle
// updates remain visible because resolveTranslation reads the bundle map at call time.
const translationResolvers = new Map<string, TranslationResolver>();

function getTranslationResolver(lang: string): TranslationResolver {
  const normalized = normalizeLocaleCode(lang) || FALLBACK_LANG;
  const cached = translationResolvers.get(normalized);
  if (cached) return cached;

  const resolver: TranslationResolver = (key) => resolveTranslation(normalized, key);
  translationResolvers.set(normalized, resolver);
  return resolver;
}

function applyHtmlLang(lang: string) {
  if (typeof document !== "undefined") document.documentElement.lang = normalizeLocaleCode(lang) || FALLBACK_LANG;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: detectBrowserLocale(),
      translationBundleRevision: 0,
      setLang: (lang) => {
        const normalized = normalizeLocaleCode(lang) || FALLBACK_LANG;
        applyHtmlLang(normalized);
        set({ lang: normalized });
        void loadRuntimeTranslationBundle(normalized);
      },
    }),
    {
      name: "toonspectrum-lang",
      onRehydrateStorage: () => (state) => {
        if (state) {
          const normalized = normalizeLocaleCode(state.lang || FALLBACK_LANG);
          state.lang = normalized;
          applyHtmlLang(normalized);
          void loadRuntimeTranslationBundle(normalized);
        }
      },
    }
  )
);

export function useT(): (key: string) => string {
  const lang = useI18n((s) => s.lang);
  const translationBundleRevision = useI18n((s) => s.translationBundleRevision);
  void translationBundleRevision;
  useEffect(() => {
    void loadRuntimeTranslationBundle(lang);
  }, [lang]);
  return getTranslationResolver(lang);
}

export {
  DICT as i18nDict,
  FALLBACK_LANG,
  FALLBACK_CHAIN,
  resolveTranslation as resolveI18nValue,
};
