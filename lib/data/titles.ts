// 자동 생성 — scripts/crawl.mjs (네이버 웹툰/시리즈 + 카카오웹툰 실데이터 벤치마킹)
// 재생성: node scripts/crawl.mjs
// 네이버 웹툰/시리즈: 조회·관심·별점·장르·시놉시스·연재요일·표지·연재연도 실수집. 카카오웹툰: 제목·작가·태그·표지 실수집(평점·조회는 추정). 일부 파생지표(평가수·분포·완독률)는 추정.
import type { Title } from "../types";

export const TITLES: Title[] = [
  {
    "id": "nw-25455",
    "slug": "nw-25455",
    "type": "webtoon",
    "title": "노블레스",
    "author": "손제호",
    "artist": "이광수",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "먼치킨",
      "완결판타지"
    ],
    "synopsis": "820년간의 긴 수면기. 드디어 새로운 세상에 눈을 뜨다. 그리고 새로운 세상의 새로운 사람들을 만나다.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F25455%2Fthumbnail%2Fthumbnail_IMAG21_4122592688643585123.jpg",
    "status": "completed",
    "ageRating": "12",
    "releaseYear": 2007,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=25455"
      }
    ],
    "stats": {
      "views": 1527620874,
      "likes": 1381103,
      "bookmarks": 1381103,
      "ratingAvg": 4.8,
      "ratingCount": 441953,
      "ratingDist": [
        0,
        1,
        1554,
        118441,
        321957
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 95
    },
    "featured": true,
    "editorNote": "누적 조회 15.3억, 별점 4.8의 대표작."
  },
  {
    "id": "nw-183559",
    "slug": "nw-183559",
    "type": "webtoon",
    "title": "신의 탑",
    "author": "SIU",
    "artist": "SIU",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "명작",
      "이능력",
      "배틀",
      "모험",
      "전쟁"
    ],
    "synopsis": "자신의 모든 것이었던 소녀를 쫓아 탑에 들어온 소년 그리고 그런 소년을 시험하는 탑",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F183559%2Fthumbnail%2Fthumbnail_IMAG21_5f3fec31-5c95-4afe-a73f-3046288edb47.jpg",
    "status": "hiatus",
    "ageRating": "12",
    "releaseYear": 2010,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=183559"
      }
    ],
    "stats": {
      "views": 881614870,
      "likes": 1897242,
      "bookmarks": 1897242,
      "ratingAvg": 4.9,
      "ratingCount": 607117,
      "ratingDist": [
        0,
        0,
        1189,
        126402,
        479526
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 96
    },
    "featured": true,
    "editorNote": "누적 조회 8.8억, 별점 4.9의 대표작."
  },
  {
    "id": "nw-318995",
    "slug": "nw-318995",
    "type": "webtoon",
    "title": "갓 오브 하이스쿨",
    "author": "박용제",
    "artist": "박용제",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "명작",
      "이능력배틀물",
      "먼치킨",
      "완결판타지"
    ],
    "synopsis": "전국, 전세계 고등학생 중 가장 쎈 녀석을 뽑는 대회가 열린다. 허구 100% 막장 액션의 끝!! 기대하시라!!!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F318995%2Fthumbnail%2Fthumbnail_IMAG21_38f18e00-09f2-4a0c-b36a-3aa56dfe0b3b.jpg",
    "status": "completed",
    "ageRating": "12",
    "releaseYear": 2011,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=318995"
      }
    ],
    "stats": {
      "views": 774860256,
      "likes": 1386425,
      "bookmarks": 1386425,
      "ratingAvg": 4.8,
      "ratingCount": 443656,
      "ratingDist": [
        0,
        1,
        1560,
        118898,
        323197
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 95
    },
    "featured": true,
    "editorNote": "누적 조회 7.7억, 별점 4.8의 대표작."
  },
  {
    "id": "nw-119874",
    "slug": "nw-119874",
    "type": "webtoon",
    "title": "덴마",
    "author": "양영순",
    "artist": "양영순",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "명작",
      "완결판타지"
    ],
    "synopsis": "특수능력을 지닌 악당 덴마가 꼬마의 몸에 갇혀 우주택배 업무를 하며 겪는 기상천외한 모험이야기.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F119874%2Fthumbnail%2Fthumbnail_IMAG21_3762587498966376754.jpg",
    "status": "completed",
    "ageRating": "15",
    "releaseYear": 2010,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=119874"
      }
    ],
    "stats": {
      "views": 644053615,
      "likes": 323891,
      "bookmarks": 323891,
      "ratingAvg": 4.8,
      "ratingCount": 103645,
      "ratingDist": [
        0,
        0,
        365,
        27776,
        75504
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 95
    },
    "featured": true,
    "editorNote": "누적 조회 6.4억, 별점 4.8의 대표작."
  },
  {
    "id": "nw-641253",
    "slug": "nw-641253",
    "type": "webtoon",
    "title": "외모지상주의",
    "author": "박태준",
    "artist": "박태준",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "사이다",
      "학원액션",
      "소년물",
      "참교육",
      "성장물"
    ],
    "synopsis": "못생기고 뚱뚱하다고 괴롭힘을 당하며 루저 인생만 살아온 내가 잘생겨졌다는 이유로 인싸가 됐다. 어느 날 자고 일어났더니 갑자기 완벽한 외모와 몸을 지닌 사람이 되어 깨어난다면?",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F641253%2Fthumbnail%2Fthumbnail_IMAG21_01672165-03c8-44b1-ba0e-ef82c9cfcd10.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2014,
    "updateDays": [
      "금"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=641253"
      }
    ],
    "stats": {
      "views": 354266224,
      "likes": 2463318,
      "bookmarks": 2463318,
      "ratingAvg": 4.7,
      "ratingCount": 788262,
      "ratingDist": [
        0,
        3,
        4868,
        265760,
        517631
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 91,
      "bingeIndex": 94
    },
    "featured": true,
    "editorNote": "누적 조회 3.5억, 별점 4.7의 대표작."
  },
  {
    "id": "nw-570503",
    "slug": "nw-570503",
    "type": "webtoon",
    "title": "연애혁명",
    "author": "232",
    "artist": "232",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "명작",
      "다정남",
      "혐관로맨스",
      "하이틴",
      "학원로맨스"
    ],
    "synopsis": "평범하면서 금사빠인 고등학생 순정남 공주영은 까칠하고 차가운 여학생 왕자림을 보고 사랑에 빠져버린다. 너무 다른 둘, 괜찮을까?",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F570503%2Fthumbnail%2Fthumbnail_IMAG21_7b907ee6-a61e-495b-9b8f-be2f0a4be44b.jpeg",
    "status": "completed",
    "ageRating": "15",
    "releaseYear": 2013,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=570503"
      }
    ],
    "stats": {
      "views": 343529092,
      "likes": 2740945,
      "bookmarks": 2740945,
      "ratingAvg": 4.9,
      "ratingCount": 877102,
      "ratingDist": [
        0,
        1,
        1717,
        182613,
        692772
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 96
    },
    "featured": true,
    "editorNote": "누적 조회 3.4억, 별점 4.9의 대표작."
  },
  {
    "id": "nw-21815",
    "slug": "nw-21815",
    "type": "webtoon",
    "title": "히어로메이커",
    "author": "빤쓰",
    "artist": "빤쓰",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "판타지개그",
      "서양",
      "모험",
      "전쟁",
      "정치"
    ],
    "synopsis": "왕은 영웅이 되고 싶어하는 공주의 소원을 들어주기로 전격 결심! 공주를 속이고 마치 영웅이 된 것처럼 만들기 위해 온 나라가 연극을 하게 되는데..파란만장한 그들만의 눈물겨운 영웅만들기의 대장정이 펼쳐집니다~",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F21815%2Fthumbnail%2Fthumbnail_IMAG21_7292511306663934265.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2006,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=21815"
      }
    ],
    "stats": {
      "views": 257694256,
      "likes": 80886,
      "bookmarks": 80886,
      "ratingAvg": 5,
      "ratingCount": 25884,
      "ratingDist": [
        0,
        0,
        28,
        4108,
        21749
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": true,
    "editorNote": "누적 조회 2.6억, 별점 5.0의 대표작."
  },
  {
    "id": "nw-131385",
    "slug": "nw-131385",
    "type": "webtoon",
    "title": "쿠베라",
    "author": "카레곰",
    "artist": "카레곰",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "절망적인",
      "신화",
      "마법",
      "크리처",
      "로맨스"
    ],
    "synopsis": "신의 이름을 가진 소녀 쿠베라 리즈. 15세 생일에 외출에서 돌아오다가 초토화되어버린 마을을 목격하게 되는데..! 신, 수라, 마법사들 사이에서 펼쳐지는 소속불명 장르 혼합 판타지.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F131385%2Fthumbnail%2Fthumbnail_IMAG21_1d44dd99-4fef-48b5-81f0-083e83b6c048.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2010,
    "updateDays": [
      "목"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=131385"
      }
    ],
    "stats": {
      "views": 253649540,
      "likes": 485805,
      "bookmarks": 485805,
      "ratingAvg": 5,
      "ratingCount": 155458,
      "ratingDist": [
        0,
        0,
        166,
        24671,
        130621
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": true,
    "editorNote": "누적 조회 2.5억, 별점 5.0의 대표작."
  },
  {
    "id": "nw-64997",
    "slug": "nw-64997",
    "type": "webtoon",
    "title": "나이트런",
    "author": "김성민",
    "artist": "김성민",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "절망적인",
      "전쟁",
      "정치",
      "크리처",
      "세계관"
    ],
    "synopsis": "우주력 430년. 성간이동이 가능해져 별과 별을 이동하는 시대 인간은 괴수와 싸우고 있다. 기사와 함께.광활한 우주를 배경으로 판타지 SF가 다가온다.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F64997%2Fthumbnail%2Fthumbnail_IMAG21_b6873cef-633a-4f8a-8e15-e20d326bad16.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2009,
    "updateDays": [
      "토"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=64997"
      }
    ],
    "stats": {
      "views": 225292680,
      "likes": 257002,
      "bookmarks": 257002,
      "ratingAvg": 5,
      "ratingCount": 82241,
      "ratingDist": [
        0,
        0,
        88,
        13052,
        69101
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": true,
    "editorNote": "누적 조회 2.3억, 별점 5.0의 대표작."
  },
  {
    "id": "nw-103759",
    "slug": "nw-103759",
    "type": "webtoon",
    "title": "이말년씨리즈",
    "author": "이말년",
    "artist": "이말년",
    "genres": [
      "코미디"
    ],
    "tags": [
      "개그",
      "완결무료",
      "완결개그"
    ],
    "synopsis": "독특한 이야기 전개 방식을 확립한 이말년 작가가 선보이는 엉뚱한 상상과 황당한 설정의 새로운 개그 웹툰",
    "cover": [
      "oklch(0.45 0.14 100)",
      "oklch(0.28 0.1 140)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F103759%2Fthumbnail%2Fthumbnail_IMAG21_de9d2eb5-0ac7-40d3-9b74-0139edf793d2.jpg",
    "status": "completed",
    "ageRating": "all",
    "releaseYear": 2009,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=103759"
      }
    ],
    "stats": {
      "views": 218908912,
      "likes": 159838,
      "bookmarks": 159838,
      "ratingAvg": 4.5,
      "ratingCount": 51148,
      "ratingDist": [
        0,
        1,
        896,
        25125,
        25125
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 93
    },
    "featured": true,
    "editorNote": "누적 조회 2.2억, 별점 4.5의 대표작."
  },
  {
    "id": "nw-651673",
    "slug": "nw-651673",
    "type": "webtoon",
    "title": "유미의 세포들",
    "author": "이동건",
    "artist": "이동건",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "컷툰",
      "명작",
      "드라마&영화 원작웹툰",
      "완결로맨스"
    ],
    "synopsis": "유미는 지금 무슨 생각을 하고 있을까? 그녀의 머릿속에서 바쁘게 움직이는 세포들 이야기!",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F651673%2Fthumbnail%2Fthumbnail_IMAG21_fba9683b-260e-4a07-984c-deda6d87f62d.jpg",
    "status": "completed",
    "ageRating": "12",
    "releaseYear": 2015,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=651673"
      }
    ],
    "stats": {
      "views": 211127300,
      "likes": 1309692,
      "bookmarks": 1309692,
      "ratingAvg": 5,
      "ratingCount": 419101,
      "ratingDist": [
        0,
        0,
        448,
        66511,
        352142
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-570506",
    "slug": "nw-570506",
    "type": "webtoon",
    "title": "최강전설 강해효",
    "author": "최병열",
    "artist": "최병열",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "학원액션",
      "소년물",
      "참교육",
      "성장물",
      "격투기"
    ],
    "synopsis": "맹수같이 거친 문제아 학생들만 모여있는 최강고등학교!! 그곳에서 변화가 시작되었다.",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F570506%2Fthumbnail%2Fthumbnail_IMAG21_3630857206429464627.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2013,
    "updateDays": [
      "목"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=570506"
      }
    ],
    "stats": {
      "views": 162951846,
      "likes": 588395,
      "bookmarks": 588395,
      "ratingAvg": 4.8,
      "ratingCount": 188286,
      "ratingDist": [
        0,
        0,
        662,
        50460,
        137164
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-72497",
    "slug": "nw-72497",
    "type": "webtoon",
    "title": "비흔",
    "author": "정재한",
    "artist": "황영찬",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "완결무료",
      "완결무협/사극"
    ],
    "synopsis": "잊혀진 나라 백제, 그리고 싸울아비. 패자의 역사 뒤로 전설이 되어 사라진 검은 이리 '흑랑' '비흔'이라는 이름으로 새로운 전설을 시작한다.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F72497%2Fthumbnail%2Fthumbnail_IMAG21_3474581212867617334.jpg",
    "status": "completed",
    "ageRating": "12",
    "releaseYear": 2009,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=72497"
      }
    ],
    "stats": {
      "views": 156759386,
      "likes": 157036,
      "bookmarks": 157036,
      "ratingAvg": 5,
      "ratingCount": 50252,
      "ratingDist": [
        0,
        0,
        54,
        7975,
        42223
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-662774",
    "slug": "nw-662774",
    "type": "webtoon",
    "title": "고수",
    "author": "류기운",
    "artist": "문정후",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "명작",
      "복수극",
      "먼치킨",
      "완결판타지"
    ],
    "synopsis": "<용비불패> 최강의 콤비가 무협의 전설을 다시 쓰다! 천하제일의 고수 강룡. 그리고 수많은 다른 고수들의 이야기.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F662774%2Fthumbnail%2Fthumbnail_IMAG21_3618421729916171318.jpg",
    "status": "completed",
    "ageRating": "15",
    "releaseYear": 2015,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=662774"
      }
    ],
    "stats": {
      "views": 141372969,
      "likes": 896449,
      "bookmarks": 896449,
      "ratingAvg": 5,
      "ratingCount": 286864,
      "ratingDist": [
        0,
        0,
        307,
        45525,
        241032
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-648419",
    "slug": "nw-648419",
    "type": "webtoon",
    "title": "뷰티풀 군바리",
    "author": "설이",
    "artist": "윤성원",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "직업드라마",
      "밀리터리",
      "완결드라마"
    ],
    "synopsis": "'여자도 군대에 간다면?'본격 여자도 군대 가는 만화!",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F648419%2Fthumbnail%2Fthumbnail_IMAG21_d9398229-cbfd-47dc-9208-0a6fb936f3a7.jpg",
    "status": "completed",
    "ageRating": "15",
    "releaseYear": 2015,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=648419"
      }
    ],
    "stats": {
      "views": 129213391,
      "likes": 791766,
      "bookmarks": 791766,
      "ratingAvg": 4.9,
      "ratingCount": 253365,
      "ratingDist": [
        0,
        0,
        496,
        52751,
        200118
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-650305",
    "slug": "nw-650305",
    "type": "webtoon",
    "title": "호랑이형님",
    "author": "이상규",
    "artist": "이상규",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "명작",
      "세계관",
      "동양풍판타지",
      "판무",
      "동물"
    ],
    "synopsis": "신비한 힘을 가진 아이를 이용하여 세상을 지배하려는 반인반수 흰눈썹! 그리고 얼떨결에 아이의 보호자가 된 괴물호랑이 빠르와 착호갑사 지망생 가우리! 이제 힘을 합쳐 흰눈썹으로부터 아이와 세상을 지켜라!!!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F650305%2Fthumbnail%2Fthumbnail_IMAG21_9e070729-5990-4653-90dd-1158847c1c68.jpg",
    "status": "hiatus",
    "ageRating": "15",
    "releaseYear": 2015,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=650305"
      }
    ],
    "stats": {
      "views": 112350625,
      "likes": 917291,
      "bookmarks": 917291,
      "ratingAvg": 4.9,
      "ratingCount": 293533,
      "ratingDist": [
        0,
        0,
        575,
        61114,
        231845
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-478261",
    "slug": "nw-478261",
    "type": "webtoon",
    "title": "선천적 얼간이들",
    "author": "가스파드",
    "artist": "가스파드",
    "genres": [
      "코미디"
    ],
    "tags": [
      "개그",
      "무해한",
      "러블리",
      "힐링",
      "4차원",
      "하이퍼리얼리즘"
    ],
    "synopsis": "뭘 해도 안되는 얼간이 신인류가 떴다! 낙천적 우유부단 거북이 가스파드와 말초적 친구들의 좌충우돌 라이프. 이미 화제의 중심! 'Natural Born Idiots'의 새로운 이름, '선천적 얼간이들'",
    "cover": [
      "oklch(0.45 0.14 100)",
      "oklch(0.28 0.1 140)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F478261%2Fthumbnail%2Fthumbnail_IMAG21_7fbd8610-0a97-40e3-9c63-101ea07fc4b4.jpg",
    "status": "completed",
    "ageRating": "all",
    "releaseYear": 2012,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=478261"
      }
    ],
    "stats": {
      "views": 107824492,
      "likes": 456665,
      "bookmarks": 456665,
      "ratingAvg": 5,
      "ratingCount": 146133,
      "ratingDist": [
        0,
        0,
        156,
        23191,
        122786
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-616239",
    "slug": "nw-616239",
    "type": "webtoon",
    "title": "윌유메리미",
    "author": "마인드C",
    "artist": "마인드C",
    "genres": [
      "일상"
    ],
    "tags": [
      "일상",
      "공감",
      "결혼생활",
      "가족",
      "연애/결혼공감",
      "가벼운"
    ],
    "synopsis": "외모는 상남자, 마음은 감성소녀 윌.외모는 청순녀, 마음은 터프가이 메리! 서울 부산 띠동갑 커플의 리얼 연애 일기",
    "cover": [
      "oklch(0.45 0.14 162)",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F616239%2Fthumbnail%2Fthumbnail_IMAG21_b412e69f-b6dc-40eb-b022-0f2c0991389b.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2014,
    "updateDays": [
      "화",
      "토"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=616239"
      }
    ],
    "stats": {
      "views": 103340238,
      "likes": 325082,
      "bookmarks": 325082,
      "ratingAvg": 5,
      "ratingCount": 104026,
      "ratingDist": [
        0,
        0,
        111,
        16509,
        87406
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-400739",
    "slug": "nw-400739",
    "type": "webtoon",
    "title": "에이머",
    "author": "구동인",
    "artist": "구동인",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "현대",
      "이능력",
      "배틀",
      "전쟁",
      "크리처"
    ],
    "synopsis": "작은 우연은 역사를 만든다. 지구를 침공한 이성인 팜킨 일당과, 그들을 막아선 초월자 에이머와 지구인의 이야기!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F400739%2Fthumbnail%2Fthumbnail_IMAG21_b5046846-5af7-48a9-9b20-b0b07cf0c904.jpeg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2011,
    "updateDays": [
      "화"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=400739"
      }
    ],
    "stats": {
      "views": 84216016,
      "likes": 148105,
      "bookmarks": 148105,
      "ratingAvg": 4.9,
      "ratingCount": 47394,
      "ratingDist": [
        0,
        0,
        93,
        9867,
        37434
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-654774",
    "slug": "nw-654774",
    "type": "webtoon",
    "title": "소녀의 세계",
    "author": "모랑지",
    "artist": "모랑지",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "설렘폭발",
      "공감",
      "우정",
      "청춘",
      "외유내강녀"
    ],
    "synopsis": "완벽해 보이지만 사실 외로웠던 백조들과 맘씨 착한 오리가 만나 여러 갈등을 함께 겪으며 진짜 친구가 되어가는 소녀들의 찐 우정물",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F654774%2Fthumbnail%2Fthumbnail_IMAG21_1209b520-bcd9-4031-b76f-bc8a7f5527fd.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2015,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=654774"
      }
    ],
    "stats": {
      "views": 69839914,
      "likes": 1124577,
      "bookmarks": 1124577,
      "ratingAvg": 5,
      "ratingCount": 359865,
      "ratingDist": [
        0,
        0,
        385,
        57110,
        302370
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-316909",
    "slug": "nw-316909",
    "type": "webtoon",
    "title": "그 판타지 세계에서 사는 법",
    "author": "촌장",
    "artist": "촌장",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지"
    ],
    "synopsis": "용사가 마왕을 물리친 후 100년 뒤, 과거의 상처를 잊은 그 판타지 세계 주민들 이야기",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F316909%2Fthumbnail%2Fthumbnail_IMAG21_3473513801691247160.jpg",
    "status": "hiatus",
    "ageRating": "all",
    "releaseYear": 2011,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=316909"
      }
    ],
    "stats": {
      "views": 60153936,
      "likes": 118134,
      "bookmarks": 118134,
      "ratingAvg": 5,
      "ratingCount": 37803,
      "ratingDist": [
        0,
        0,
        40,
        5999,
        31763
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-24530",
    "slug": "nw-24530",
    "type": "webtoon",
    "title": "MLB카툰",
    "author": "최훈",
    "artist": "최훈",
    "genres": [
      "스포츠"
    ],
    "tags": [
      "스포츠",
      "야구",
      "완결무료",
      "완결스포츠"
    ],
    "synopsis": "최훈 작가가 들려주는 생.생.M.L.B.뉴.스!! Major League Baseball Cartoon (Naver스포츠의 최훈스페셜에서 제공받는 컨텐츠로 업데이트일은 스포츠와 동일합니다.)",
    "cover": [
      "oklch(0.45 0.14 138)",
      "oklch(0.28 0.1 178)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F24530%2Fthumbnail%2Fthumbnail_IMAG21_3545234923782812772.jpg",
    "status": "completed",
    "ageRating": "all",
    "releaseYear": 2007,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=24530"
      }
    ],
    "stats": {
      "views": 51061931,
      "likes": 4008,
      "bookmarks": 4008,
      "ratingAvg": 4,
      "ratingCount": 1283,
      "ratingDist": [
        0,
        1,
        176,
        930,
        176
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 88
    },
    "featured": false
  },
  {
    "id": "nw-651664",
    "slug": "nw-651664",
    "type": "webtoon",
    "title": "밥 먹고 갈래요?",
    "author": "오묘",
    "artist": "오묘",
    "genres": [
      "드라마"
    ],
    "tags": [
      "감성",
      "컷툰",
      "음식&요리",
      "완결무료",
      "완결감성"
    ],
    "synopsis": "이리 뛰고 저리 뛰고 깨지고 구르고. 지칠대로 지친 주중을 보내고 나면 찾아오는 주말 힐링 타임. 오묘 작가의 컷툰 신작!",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F651664%2Fthumbnail%2Fthumbnail_IMAG21_3558468650043455030.jpg",
    "status": "completed",
    "ageRating": "all",
    "releaseYear": 2015,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=651664"
      }
    ],
    "stats": {
      "views": 42620145,
      "likes": 404688,
      "bookmarks": 404688,
      "ratingAvg": 5,
      "ratingCount": 129500,
      "ratingDist": [
        0,
        0,
        138,
        20552,
        108810
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-703307",
    "slug": "nw-703307",
    "type": "webtoon",
    "title": "신암행어사",
    "author": "윤인완",
    "artist": "양경일",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "슈퍼스트링",
      "완결판타지"
    ],
    "synopsis": "지금부터 일어나는 일은 모두 우연이다! 웹툰으로 돌아온 윤인완/양경일 작가 명작 <신암행어사> REBOOT!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F703307%2Fthumbnail%2Fthumbnail_IMAG21_3761460495319904354.jpg",
    "status": "completed",
    "ageRating": "15",
    "releaseYear": 2017,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=703307"
      }
    ],
    "stats": {
      "views": 38823639,
      "likes": 274676,
      "bookmarks": 274676,
      "ratingAvg": 5,
      "ratingCount": 87896,
      "ratingDist": [
        0,
        0,
        94,
        13949,
        73853
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-671421",
    "slug": "nw-671421",
    "type": "webtoon",
    "title": "언덕 위의 제임스",
    "author": "쿠당탕",
    "artist": "쿠당탕",
    "genres": [
      "코미디"
    ],
    "tags": [
      "개그",
      "열혈병맛개그",
      "블랙코미디",
      "옴니버스",
      "병맛",
      "가벼운"
    ],
    "synopsis": "제임스들이 펼치는 코믹 막장 에피소드! 지금 전세계의 제임스들이 몰려온다",
    "cover": [
      "oklch(0.45 0.14 100)",
      "oklch(0.28 0.1 140)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F671421%2Fthumbnail%2Fthumbnail_IMAG21_7643171d-08fb-40a8-9da1-813a3b7e784f.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2016,
    "updateDays": [
      "수"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=671421"
      }
    ],
    "stats": {
      "views": 24100237,
      "likes": 155584,
      "bookmarks": 155584,
      "ratingAvg": 5,
      "ratingCount": 49787,
      "ratingDist": [
        0,
        0,
        53,
        7901,
        41833
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-698918",
    "slug": "nw-698918",
    "type": "webtoon",
    "title": "원주민 공포만화",
    "author": "원주민",
    "artist": "원주민",
    "genres": [
      "스릴러"
    ],
    "tags": [
      "스릴러",
      "오컬트판타지",
      "병맛",
      "개그",
      "오컬트",
      "4차원"
    ],
    "synopsis": "끝날 때까지 끝난 것이 아니다! 마지막까지 방심할 수 없는 다양한 에피소드. 당신의 상상을 뛰어넘는 본격 반전 공포 스릴러가 온다!",
    "cover": [
      "oklch(0.45 0.14 195)",
      "oklch(0.28 0.1 235)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F698918%2Fthumbnail%2Fthumbnail_IMAG21_3689346629442483042.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2017,
    "updateDays": [
      "화"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=698918"
      }
    ],
    "stats": {
      "views": 21435315,
      "likes": 297765,
      "bookmarks": 297765,
      "ratingAvg": 4.9,
      "ratingCount": 95285,
      "ratingDist": [
        0,
        0,
        187,
        19838,
        75260
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-644112",
    "slug": "nw-644112",
    "type": "webtoon",
    "title": "몽홀",
    "author": "장태산",
    "artist": "장태산",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "역사판타지",
      "시리어스",
      "절망적인",
      "과거",
      "소년물"
    ],
    "synopsis": "차갑고 척박한 땅 몽홀 그 곳에서 펼쳐지는 감동의 대서사시",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F644112%2Fthumbnail%2Fthumbnail_IMAG21_3618981192359294768.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2015,
    "updateDays": [
      "금"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=644112"
      }
    ],
    "stats": {
      "views": 17565586,
      "likes": 95557,
      "bookmarks": 95557,
      "ratingAvg": 4.9,
      "ratingCount": 30578,
      "ratingDist": [
        0,
        0,
        60,
        6366,
        24152
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-690502",
    "slug": "nw-690502",
    "type": "webtoon",
    "title": "2017 사이다를 부탁해!",
    "author": "네이버웹툰 작가",
    "artist": "네이버웹툰 작가",
    "genres": [
      "일상"
    ],
    "tags": [
      "일상",
      "완결무료",
      "완결일상"
    ],
    "synopsis": "고구마 10000개를 삼킨 것 같은 실제 사연을 독자들로부터 직접 받아서 네이버 웹툰 작가들이 새롭게 들려드립니다!",
    "cover": [
      "oklch(0.45 0.14 162)",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F690502%2Fthumbnail%2Fthumbnail_IMAG21_4122263036984637539.jpg",
    "status": "completed",
    "ageRating": "all",
    "releaseYear": 2017,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=690502"
      }
    ],
    "stats": {
      "views": 17131272,
      "likes": 107549,
      "bookmarks": 107549,
      "ratingAvg": 4.9,
      "ratingCount": 34416,
      "ratingDist": [
        0,
        0,
        67,
        7165,
        27183
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-677452",
    "slug": "nw-677452",
    "type": "webtoon",
    "title": "체크포인트",
    "author": "송가",
    "artist": "은소",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "이능력",
      "자본주의",
      "판타지",
      "타임슬립",
      "회귀"
    ],
    "synopsis": "내 인생에 세이브 포인트가 있다면? 하루에도 수십 번씩 시간을 되돌리는 남자.",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F677452%2Fthumbnail%2Fthumbnail_IMAG21_05f30a57-88b9-4798-8987-4851f1b28f5a.jpg",
    "status": "hiatus",
    "ageRating": "12",
    "releaseYear": 2016,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=677452"
      }
    ],
    "stats": {
      "views": 14985196,
      "likes": 323923,
      "bookmarks": 323923,
      "ratingAvg": 5,
      "ratingCount": 103655,
      "ratingDist": [
        0,
        0,
        111,
        16450,
        87094
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-670145",
    "slug": "nw-670145",
    "type": "webtoon",
    "title": "킬더킹",
    "author": "마사토끼",
    "artist": "joana",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "두뇌싸움"
    ],
    "synopsis": "왕의 재능이란 무엇일까? 왕좌의 새로운 주인, 진정한 왕에 걸맞는 재능을 가려내는 게임이 시작된다!",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F670145%2Fthumbnail%2Fthumbnail_IMAG21_3905854744587100517.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2016,
    "updateDays": [
      "목"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=670145"
      }
    ],
    "stats": {
      "views": 13381599,
      "likes": 73919,
      "bookmarks": 73919,
      "ratingAvg": 4.8,
      "ratingCount": 23654,
      "ratingDist": [
        0,
        0,
        83,
        6339,
        17232
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-703845",
    "slug": "nw-703845",
    "type": "webtoon",
    "title": "죽음에 관하여",
    "author": "시니",
    "artist": "혀노",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "감성드라마",
      "완결드라마"
    ],
    "synopsis": "삶과 죽음의 경계선, 그 곳엔 누가 있을까? \"가는 길에 심심한데 네 이야기나 한번 듣지\"",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F703845%2Fthumbnail%2Fthumbnail_IMAG21_4120902941892752226.JPEG",
    "status": "completed",
    "ageRating": "12",
    "releaseYear": 2018,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=703845"
      }
    ],
    "stats": {
      "views": 13319379,
      "likes": 547780,
      "bookmarks": 547780,
      "ratingAvg": 5,
      "ratingCount": 175290,
      "ratingDist": [
        0,
        0,
        187,
        27818,
        147284
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-602916",
    "slug": "nw-602916",
    "type": "webtoon",
    "title": "칼부림",
    "author": "고일권",
    "artist": "고일권",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "시리어스",
      "과거",
      "동양",
      "시대물",
      "전쟁"
    ],
    "synopsis": "뜻을 품고 한을 품은 팔도의 자제들아 서슬퍼런 칼날 내보이라! 이괄의 난을 배경으로 펼쳐지는 함이의 복수와 성장",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F602916%2Fthumbnail%2Fthumbnail_IMAG21_43cf1d1e-d265-464d-83db-f92dbc3fcf43.jpg",
    "status": "ongoing",
    "ageRating": "12",
    "releaseYear": 2013,
    "updateDays": [
      "수"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=602916"
      }
    ],
    "stats": {
      "views": 12394615,
      "likes": 78886,
      "bookmarks": 78886,
      "ratingAvg": 5,
      "ratingCount": 25244,
      "ratingDist": [
        0,
        0,
        27,
        4006,
        21211
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-701535",
    "slug": "nw-701535",
    "type": "webtoon",
    "title": "격기3반",
    "author": "이학",
    "artist": "이학",
    "genres": [
      "스포츠"
    ],
    "tags": [
      "스포츠",
      "환골탈태",
      "격투기"
    ],
    "synopsis": "한국이 세계 격투기의 중심이 된 세상. 전국 탑 클래스 격투기 학생들만 모인 남일고에 약골 소년 주지태가 돌연 투입된다. 신체적 약점이 상쇄되는 무술 ‘주짓수’를 통해, 주지태는 격기반의 정점에 오를 수 있을 것인가…?",
    "cover": [
      "oklch(0.45 0.14 138)",
      "oklch(0.28 0.1 178)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F701535%2Fthumbnail%2Fthumbnail_IMAG21_2abe5b1a-9104-417f-9995-0db15c6db7be.jpg",
    "status": "hiatus",
    "ageRating": "15",
    "releaseYear": 2017,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=701535"
      }
    ],
    "stats": {
      "views": 11202926,
      "likes": 376713,
      "bookmarks": 376713,
      "ratingAvg": 4.7,
      "ratingCount": 120548,
      "ratingDist": [
        0,
        0,
        744,
        40642,
        79161
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 94
    },
    "featured": false
  },
  {
    "id": "nw-710751",
    "slug": "nw-710751",
    "type": "webtoon",
    "title": "약한영웅",
    "author": "서패스",
    "artist": "김진석",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "드라마&영화 원작웹툰",
      "힘숨찐",
      "학원물",
      "완결액션"
    ],
    "synopsis": "“비겁하다…? 애초에 동등한 시작이 아닌데... 체급도 쪽수도 안 맞잖아- 이 X끼들아!!” 선천적으로 약한 소년이 상대보다 몇 수 앞을 예측하는 심리전과 지형지물을 이용하고, 도구로 살벌하게 끝장내는 파이터로 성장한다. 이제 그의 또 다른 이름은 '은장백사'다.",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F710751%2Fthumbnail%2Fthumbnail_IMAG21_53aefc06-6bdf-40fb-93ac-fab7242146c6.jpg",
    "status": "completed",
    "ageRating": "15",
    "releaseYear": 2018,
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=710751"
      }
    ],
    "stats": {
      "views": 10409921,
      "likes": 705963,
      "bookmarks": 705963,
      "ratingAvg": 4.8,
      "ratingCount": 225908,
      "ratingDist": [
        0,
        0,
        795,
        60542,
        164571
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 90,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-703630",
    "slug": "nw-703630",
    "type": "webtoon",
    "title": "어글리후드",
    "author": "미애",
    "artist": "미애",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "이능력",
      "배틀",
      "우정",
      "가족",
      "세계관"
    ],
    "synopsis": "외계인이 유일신으로 군림한 미친 세상, 바꾸고싶다면 사탄이 되어라",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F703630%2Fthumbnail%2Fthumbnail_IMAG21_5501365b-0934-4683-b4a8-cc76ef1ec585.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2017,
    "updateDays": [
      "토"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=703630"
      }
    ],
    "stats": {
      "views": 9610578,
      "likes": 313830,
      "bookmarks": 313830,
      "ratingAvg": 5,
      "ratingCount": 100426,
      "ratingDist": [
        0,
        0,
        107,
        15938,
        84381
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-717481",
    "slug": "nw-717481",
    "type": "webtoon",
    "title": "일렉시드",
    "author": "손제호",
    "artist": "제나",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "이능력",
      "배틀",
      "아카데미물",
      "세계관",
      "학원물"
    ],
    "synopsis": "<노블레스> 손제호 작가와 <소녀더와일즈> 제나 작가가 만났다! 고양이 몸에 깃든 각성자 카이든과 각성능력을 숨겨온 고등학생 지우 러블리 2인조의 액션 판타지",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F717481%2Fthumbnail%2Fthumbnail_IMAG21_3545800975505057126.jpg",
    "status": "ongoing",
    "ageRating": "12",
    "releaseYear": 2018,
    "updateDays": [
      "수"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=717481"
      }
    ],
    "stats": {
      "views": 1464454,
      "likes": 599515,
      "bookmarks": 599515,
      "ratingAvg": 4.9,
      "ratingCount": 191845,
      "ratingDist": [
        0,
        0,
        376,
        39942,
        151527
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-721948",
    "slug": "nw-721948",
    "type": "webtoon",
    "title": "스터디그룹",
    "author": "신형욱",
    "artist": "유승연",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "입시",
      "블루스트링",
      "드라마&영화 원작웹툰",
      "힘숨찐",
      "학원물"
    ],
    "synopsis": "우등생을 꿈꾸는 최강 소년의 고교액션활극. 공부를 잘 하고 싶지만 애석하게도 싸움 실력에만 재능이 몰빵된 고등학생 윤가민. 똥통학교 유성공고에서 스터디그룹을 만드는데…. 그와 스터디 멤버들의 (진짜로) 피튀기는 입시이야기!",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F721948%2Fthumbnail%2Fthumbnail_IMAG21_27c5cd48-f221-4449-8687-041952061daf.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2019,
    "updateDays": [
      "토"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=721948"
      }
    ],
    "stats": {
      "views": 294030,
      "likes": 729162,
      "bookmarks": 729162,
      "ratingAvg": 5,
      "ratingCount": 233332,
      "ratingDist": [
        0,
        0,
        250,
        37030,
        196053
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-844058",
    "slug": "nw-844058",
    "type": "webtoon",
    "title": "신체",
    "author": "엄세윤",
    "artist": "정썸머",
    "genres": [
      "스릴러"
    ],
    "tags": [
      "스릴러",
      "바디 호러",
      "흑백",
      "자극적인",
      "블랙코미디",
      "이능력"
    ],
    "synopsis": "사채업자, 재벌, 꿈에 그리던 첫사랑까지... 모두가 내 몸을 원한다. 대체 왜?",
    "cover": [
      "oklch(0.45 0.14 195)",
      "oklch(0.28 0.1 235)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F844058%2Fthumbnail%2Fthumbnail_IMAG21_18e663e7-b2bc-4c26-8163-ea7fb31b64a9.jpg",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=844058"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 196680,
      "bookmarks": 196680,
      "ratingAvg": 5,
      "ratingCount": 62938,
      "ratingDist": [
        0,
        0,
        67,
        9988,
        52882
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-822657",
    "slug": "nw-822657",
    "type": "webtoon",
    "title": "환생천마",
    "author": "JP",
    "artist": "부겸",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "사이다",
      "동양",
      "환생",
      "액션",
      "고인물"
    ],
    "synopsis": "철혈의 맹주, 강호의 절대자 '천하진'. 가문의 수치라 불리는 망나니 '벽리단'의 몸으로 깨어나다! 취미는 사기도박, 검은 창고에 박아둔지 오래. 하루아침에 천하제일인에서 천하의 쓰레기가 된 그는 다시 검을 잡고, 전생에서 이루지 못한 경지에 오르고자 한다.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F822657%2Fthumbnail%2Fthumbnail_IMAG21_99e49512-e05d-48c3-846d-d898f78523df.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=822657"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 251225,
      "bookmarks": 251225,
      "ratingAvg": 5,
      "ratingCount": 80392,
      "ratingDist": [
        0,
        0,
        86,
        12758,
        67548
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-1683810545"
  },
  {
    "id": "nw-758037",
    "slug": "nw-758037",
    "type": "webtoon",
    "title": "참교육",
    "author": "채용택",
    "artist": "한가람",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "사이다",
      "학원액션",
      "자극적인",
      "사회고발",
      "참교육"
    ],
    "synopsis": "무너진 교권을 지키기 위해 교권보호국 소속 나화진의 참교육이 시작된다! <부활남> 채용택 작가 X <신석기녀> 한가람 작가의 신작!",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F758037%2Fthumbnail%2Fthumbnail_IMAG21_6323d62f-2b2d-4668-9373-156f16487568.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2020,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=758037"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 959690,
      "bookmarks": 959690,
      "ratingAvg": 4.9,
      "ratingCount": 307101,
      "ratingDist": [
        0,
        0,
        601,
        63938,
        242561
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-840014",
    "slug": "nw-840014",
    "type": "webtoon",
    "title": "샤MONEY즘",
    "author": "나락",
    "artist": "영기",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "오컬트판타지",
      "자본주의",
      "인생역전"
    ],
    "synopsis": "“진짜 일류 무당은 여의도에서 논다.” 주가의 오르내림을 예측하는 것만으로 수십, 수백 억을 벌 수 있는 여의도의 투자사들은 신통력이 있는 무당들을 고용했고, 그것은 여의도를 일류 무당들의 무대로 만들었다. 가난한 소년이었던 천지승은 그런 여의도에 살굿으로 주가를 내리는 무당으로 고용되고… 이 이야기는 그의 일대기를 다룬다.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F840014%2Fthumbnail%2Fthumbnail_IMAG21_d0d4b1c4-bfe7-43e5-8f02-0a911652e2dc.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=840014"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 346221,
      "bookmarks": 346221,
      "ratingAvg": 5,
      "ratingCount": 110791,
      "ratingDist": [
        0,
        0,
        118,
        17582,
        93090
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-796075",
    "slug": "nw-796075",
    "type": "webtoon",
    "title": "절대검감",
    "author": "김두루미",
    "artist": "티아이",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "동양",
      "이능력",
      "모험",
      "액션",
      "성장물"
    ],
    "synopsis": "단전이 부숴졌다는 이유로 집에서는 내놓은 자식 취급을 받던 소운휘는 혈교에 납치되어서도 삼류 첩자로 살아왔다. 어느 날, 전설로만 알려진 검선비록을 찾는데 이용당하다 죽은 운휘는 10년 전, 혈교에 납치되던 그 날로 돌아가게 되고 검의 목소리를 듣는 신비한 능력을 얻는다.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F796075%2Fthumbnail%2Fthumbnail_IMAG21_31f75c4c-81c9-454a-8d92-9e23b577e1a5.jpg",
    "status": "hiatus",
    "ageRating": "12",
    "releaseYear": 2022,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=796075"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 304465,
      "bookmarks": 304465,
      "ratingAvg": 5,
      "ratingCount": 97429,
      "ratingDist": [
        0,
        0,
        104,
        15462,
        81863
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-1570987400"
  },
  {
    "id": "nw-733074",
    "slug": "nw-733074",
    "type": "webtoon",
    "title": "백수세끼",
    "author": "치즈",
    "artist": "치즈",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "리얼로맨스",
      "공감",
      "캠퍼스",
      "오피스",
      "평범남"
    ],
    "synopsis": "백수 시절 내 곁을 지켜줬던 그녀... 돌아와 주면 안 되겠니? 음식 메뉴마다 담겨 있는 우리들의 연애 흑역사!",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F733074%2Fthumbnail%2Fthumbnail_IMAG21_80df3e76-47af-4007-b57c-e8f2830835e5.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2019,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=733074"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 507838,
      "bookmarks": 507838,
      "ratingAvg": 4.9,
      "ratingCount": 162508,
      "ratingDist": [
        0,
        0,
        318,
        33834,
        128356
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-774866",
    "slug": "nw-774866",
    "type": "webtoon",
    "title": "똑 닮은 딸",
    "author": "이담",
    "artist": "이담",
    "genres": [
      "스릴러"
    ],
    "tags": [
      "스릴러",
      "입시",
      "명작",
      "고자극드라마",
      "자극적인",
      "시리어스"
    ],
    "synopsis": "'우리 엄마가 살인마인 것 같다.' 성적 우수, 품행 단정, 모범적인 자식인 길소명은 엄마가 요구하는 기준에 맞춰 완벽한 딸로 살아왔다. 그러나 남동생이 강물에서 시체로 떠오른 그 날, 소명의 머릿속엔 섬뜩한 의혹이 피어오른다. 자식의 인생에 방해되는 모든 것을 없애려는 엄마와 그녀에게서 벗어나려는 딸, 두 사람의 잔혹한 모녀 스릴러! 2020 지상최대공모전 2기 우수상 수상작.",
    "cover": [
      "oklch(0.45 0.14 195)",
      "oklch(0.28 0.1 235)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F774866%2Fthumbnail%2Fthumbnail_IMAG21_b03cd4bd-bc74-4469-a501-20896bcc887f.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2021,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=774866"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 739575,
      "bookmarks": 739575,
      "ratingAvg": 5,
      "ratingCount": 236664,
      "ratingDist": [
        0,
        0,
        253,
        37558,
        198852
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-822573",
    "slug": "nw-822573",
    "type": "webtoon",
    "title": "귀촌리",
    "author": "황양",
    "artist": "이대한",
    "genres": [
      "스릴러"
    ],
    "tags": [
      "스릴러",
      "고자극스릴러",
      "자극적인",
      "시리어스",
      "피카레스크",
      "범죄"
    ],
    "synopsis": "평범한 시골 마을 '귀촌리'를 찾은 '허무명'. 그는 돌아가신 할머니의 빈 집에 조용히 숨어든다. 그런데 집이 이상하리만큼 깔끔하다. 할머니가 돌아가신 건 3년 전인데? 어쩐지 마을 사람들은 이방인 무명의 방문을 달가워 하는 것 같지 않다. 아니, 실은 경계하는 것 같다. 그리고 그 날을 기점으로 마을 사람들이 하나, 둘 씩 사라지기 시작한다.",
    "cover": [
      "oklch(0.45 0.14 195)",
      "oklch(0.28 0.1 235)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F822573%2Fthumbnail%2Fthumbnail_IMAG21_d5b20239-59d8-4274-85ef-3d096420738c.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=822573"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 362643,
      "bookmarks": 362643,
      "ratingAvg": 5,
      "ratingCount": 116046,
      "ratingDist": [
        0,
        0,
        124,
        18416,
        97505
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-849260",
    "slug": "nw-849260",
    "type": "webtoon",
    "title": "샤워 순서 너마저...!",
    "author": "유기",
    "artist": "유기",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "일상개그힐링",
      "자극적인",
      "중년",
      "가벼운",
      "하이퍼리얼리즘"
    ],
    "synopsis": "52세 오란희는 적적한 마음을 해소하고자 수영에 다시 도전한다. 하지만 수영장 물에 들어가기도 전부터 펼쳐진 ‘샤워실 규칙’에 오란희는 당황하고, 기존 회원들의 ‘텃세’에 정신없이 휩쓰리게 되는데…! 수영장 물살보다 거센 아줌마들의 하이퍼리얼리즘, 휴머니즘 드라마!",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F849260%2Fthumbnail%2Fthumbnail_IMAG21_2e162cb2-c0fb-467b-8c98-07d6bde40a89.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2026,
    "updateDays": [
      "월",
      "금"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=849260"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 23275,
      "bookmarks": 23275,
      "ratingAvg": 4.8,
      "ratingCount": 7448,
      "ratingDist": [
        0,
        0,
        26,
        1996,
        5426
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-833702",
    "slug": "nw-833702",
    "type": "webtoon",
    "title": "파브르 in 사천당가",
    "author": "지대공마법소년",
    "artist": "크라켄",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "동양",
      "액션",
      "판타지",
      "판무",
      "빙의"
    ],
    "synopsis": "독물과 독충을 다루던 백만 스트리머 매운 파브르. 아프리카 현지촬영중 블랙맘바에 물려 무림에 전생하게 된다. 정글에서 자신이 좋아하는 독물들을 키우며 자연인 생활을 하던 주인공은 독공을 사용하는 사천당가의 눈에 띄게 된다. \"자네. 우리 식구(食口)가 되게!\"",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F833702%2Fthumbnail%2Fthumbnail_IMAG21_aad66c46-90fc-4d2d-8cb9-46fc0ff0abc2.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=833702"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 168061,
      "bookmarks": 168061,
      "ratingAvg": 5,
      "ratingCount": 53780,
      "ratingDist": [
        0,
        0,
        58,
        8535,
        45188
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-979745232"
  },
  {
    "id": "nw-845271",
    "slug": "nw-845271",
    "type": "webtoon",
    "title": "먹는 인생2",
    "author": "홍끼",
    "artist": "홍끼",
    "genres": [
      "일상"
    ],
    "tags": [
      "일상",
      "컷툰",
      "공감",
      "결혼생활",
      "가족",
      "연애/결혼공감"
    ],
    "synopsis": "행복한 일상에는 맛있는 음식이 빠질 수 없지! 맛있는 음식을 탐험하며 이어지는 일상 이야기",
    "cover": [
      "oklch(0.45 0.14 162)",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F845271%2Fthumbnail%2Fthumbnail_IMAG21_b5f0f7d6-3527-4afb-8d66-f4de65d4d0ff.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2025,
    "updateDays": [
      "월",
      "목"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=845271"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 70754,
      "bookmarks": 70754,
      "ratingAvg": 5,
      "ratingCount": 22641,
      "ratingDist": [
        0,
        0,
        24,
        3593,
        19024
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-821195",
    "slug": "nw-821195",
    "type": "webtoon",
    "title": "회귀한 공작가의 막내도련님은 암살자",
    "author": "스윙뱃",
    "artist": "스윙뱃",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "레드아이스 스튜디오",
      "액션판타지",
      "왕족/귀족",
      "아카데미물",
      "고인물"
    ],
    "synopsis": "대륙 제일의 암살자 시안 베르트 평생을 믿고 따랐던 형에게 배신당한 뒤, 비참한 최후를 맞이한다. 만약 내게 한 번 더 생이 주어진다면 그때는 다른 삶을 살 것이다. 오로지 나 하나만을 바라보면서, 내 스스로 모든 것을 이룰 수 있는 누구도 섬기지 않는 그런 삶을. 그렇게 맞이하게 된 두 번째 삶. 더 이상 남을 위해 살던 그림자 시안 베르트는 없다. 다시 쓰는 인생 나를 위한 모든 것을 이룩하리라!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F821195%2Fthumbnail%2Fthumbnail_IMAG21_4eff0192-8237-4ec7-b74c-bd66cfd25d51.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=821195"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 288133,
      "bookmarks": 288133,
      "ratingAvg": 5,
      "ratingCount": 92203,
      "ratingDist": [
        0,
        0,
        99,
        14633,
        77472
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-891604163"
  },
  {
    "id": "nw-807775",
    "slug": "nw-807775",
    "type": "webtoon",
    "title": "천재 타자가 강속구를 숨김",
    "author": "황지성",
    "artist": "스튜디오MW, 김성은",
    "genres": [
      "스포츠"
    ],
    "tags": [
      "스포츠",
      "청춘",
      "인생역전",
      "성장물",
      "고인물",
      "타임슬립"
    ],
    "synopsis": "부와 명예, 모든 걸 얻은 천재 메이저리거 강건우. 그런 그조차도 아내와의 행복한 결혼 생활만큼은 이어갈 수 없었다. 아내의 빈자리를 느끼며 후회하던 그가 신비한 반지의 힘으로 과거에 돌아왔다. 풋풋한 연애시절의 고등학생이 된 그는 이번에야말로 사랑을 쟁취할 수 있을까.",
    "cover": [
      "oklch(0.45 0.14 138)",
      "oklch(0.28 0.1 178)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F807775%2Fthumbnail%2Fthumbnail_IMAG21_3c8e26fe-0df1-46b8-b874-e1a986995864.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=807775"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 174420,
      "bookmarks": 174420,
      "ratingAvg": 4.9,
      "ratingCount": 55814,
      "ratingDist": [
        0,
        0,
        109,
        11620,
        44084
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-965363360"
  },
  {
    "id": "nw-850109",
    "slug": "nw-850109",
    "type": "webtoon",
    "title": "조선야차",
    "author": "두엽, 지존세호",
    "artist": "미노",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "액션판타지",
      "동양",
      "이능력",
      "배틀",
      "소년물"
    ],
    "synopsis": "\"조선의 개가 되어라, 어명이다.\" 한순간에 깨진 평화. 왕의 부름에 야차가 된 두 사람, 얘네한테 조선의 운명을 맡겨도 되는걸까...?",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F850109%2Fthumbnail%2Fthumbnail_IMAG21_75b7a482-2f0f-4da2-a26c-4aa1e82c965b.jpg",
    "status": "ongoing",
    "ageRating": "12",
    "releaseYear": 2026,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=850109"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 53061,
      "bookmarks": 53061,
      "ratingAvg": 4.9,
      "ratingCount": 16980,
      "ratingDist": [
        0,
        0,
        33,
        3535,
        13412
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-844810",
    "slug": "nw-844810",
    "type": "webtoon",
    "title": "죽여주는 변호사",
    "author": "김정현",
    "artist": "김정현",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "액션판타지",
      "개그"
    ],
    "synopsis": "킬러 조직 ‘글로리 클럽’의 C급 킬러 변호길. 어쩌다 보니 ‘변호사’가 되어버렸다. 하늘이 있으면 바닥도 있는 법! [킬러 배드로]와 세계관을 공유하지만 배드로는 구경도 못한 우리의 소시민 ‘킬러 변호길’의 이야기.",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F844810%2Fthumbnail%2Fthumbnail_IMAG21_cb5b50a4-1529-439e-bae6-951651d14d89.jpeg",
    "status": "hiatus",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=844810"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 156198,
      "bookmarks": 156198,
      "ratingAvg": 5,
      "ratingCount": 49983,
      "ratingDist": [
        0,
        0,
        53,
        7932,
        41997
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-834686",
    "slug": "nw-834686",
    "type": "webtoon",
    "title": "시리도록 불꽃처럼",
    "author": "김인호",
    "artist": "김인호",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "정통무협",
      "열혈",
      "동양",
      "시대물",
      "소년물"
    ],
    "synopsis": "\"강호로 내려가면 세상이 너의 적이 될 것이야...\" 쇠락한 가문의 젊은 가주 '백무진'은 가세를 바로 잡기 위해 세상 밖으로의 여정을 준비한다. 세상은 그의 적이 될 것이라는 예견된 미래에도 불구하고, 무진은 외로운 싸움을 시작한다. <장씨세가 호위무사> 김인호 작가의 2024 무협 신작.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F834686%2Fthumbnail%2Fthumbnail_IMAG21_5100418c-ad0f-4c77-b3fb-6b8b7f585888.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=834686"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 67211,
      "bookmarks": 67211,
      "ratingAvg": 4.9,
      "ratingCount": 21508,
      "ratingDist": [
        0,
        0,
        42,
        4478,
        16988
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-365493576"
  },
  {
    "id": "nw-825332",
    "slug": "nw-825332",
    "type": "webtoon",
    "title": "아포칼립스에 집을 숨김",
    "author": "DD",
    "artist": "송지형",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "생존",
      "크리처",
      "고인물",
      "서바이벌",
      "아포칼립스"
    ],
    "synopsis": "3년 뒤, 이 세상이 멸망하리라 예측하고 온갖 대비를 해온 '멸망주의자' 박규. 그리고 그의 예상대로, 어느 날 서울 핵 공습을 시작으로 전 세계는 핵 전쟁에 돌입. 미증유의 아포칼립스가 펼쳐진다. 모두의 비웃음에도 불구하고 전 재산을 털어 3년 전부터 묵묵히 자신만의 방공호를 파내려 간 보람이 있는 주인공 박규. 과연 그가 이 모든 일들을 내다본 것은 단순한 우연의 일치일까?",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F825332%2Fthumbnail%2Fthumbnail_IMAG21_303156ff-1e4d-4c2a-954e-515ae0c65bbe.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=825332"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 127047,
      "bookmarks": 127047,
      "ratingAvg": 4.9,
      "ratingCount": 40655,
      "ratingDist": [
        0,
        0,
        80,
        8464,
        32111
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-697669952"
  },
  {
    "id": "nw-849510",
    "slug": "nw-849510",
    "type": "webtoon",
    "title": "변경백의 10클래스 망나니",
    "author": "양평",
    "artist": "시연",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "액션판타지",
      "감성적인",
      "시리어스",
      "중세",
      "마법"
    ],
    "synopsis": "칠십대의 늙고 추레한 마법사는 육십 년 전으로 돌아온다. 아주 오래된 그리워하던 어떤 날로…….",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F849510%2Fthumbnail%2Fthumbnail_IMAG21_6e5604e7-13fd-4e78-8455-fdd5b3ec1ecb.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2026,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=849510"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 72064,
      "bookmarks": 72064,
      "ratingAvg": 4.9,
      "ratingCount": 23060,
      "ratingDist": [
        0,
        0,
        45,
        4801,
        18214
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-1539418320"
  },
  {
    "id": "nw-818780",
    "slug": "nw-818780",
    "type": "webtoon",
    "title": "영업 천재가 되었다",
    "author": "혜림",
    "artist": "혜림",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "감성적인",
      "현대",
      "오피스",
      "직업드라마",
      "회귀"
    ],
    "synopsis": "나는 빚을 갚기 위해 당장 할 수 있는 일을 선택했고, 그게 내겐 영업이었다. 그리고 내게 다시 한 번의 기회가 주어졌다.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F818780%2Fthumbnail%2Fthumbnail_IMAG21_3280cf30-80e7-407b-bd9a-5028cb8850e9.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=818780"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 91059,
      "bookmarks": 91059,
      "ratingAvg": 5,
      "ratingCount": 29139,
      "ratingDist": [
        0,
        0,
        31,
        4624,
        24483
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-422145112"
  },
  {
    "id": "nw-768536",
    "slug": "nw-768536",
    "type": "webtoon",
    "title": "잔불의 기사",
    "author": "환댕",
    "artist": "환댕",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "중세판타지액션",
      "마법",
      "액션",
      "성장물",
      "세계관"
    ],
    "synopsis": "유일한 가족이자, 최고의 기사 유망주였던 쌍둥이 동생이 살해당했다. 천재적이었던 동생과는 달리 무예에 재능이 전혀 없지만, 동생의 복수를 위해 '강함'을 연기하기로 결심했다. 약해빠진 나는 복수에 성공할 수 있을까.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F768536%2Fthumbnail%2Fthumbnail_IMAG21_06774772-8958-4f9b-ad2c-895567ec11bc.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2021,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=768536"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 317883,
      "bookmarks": 317883,
      "ratingAvg": 5,
      "ratingCount": 101723,
      "ratingDist": [
        0,
        0,
        109,
        16143,
        85471
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-850526",
    "slug": "nw-850526",
    "type": "webtoon",
    "title": "망플루언서",
    "author": "망순",
    "artist": "망순",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "고자극드라마",
      "우정",
      "참교육",
      "집착물",
      "소꿉친구"
    ],
    "synopsis": "대중의 관심을 먹고 사는 빛나는 직업 '인플루언서!' 보여지는 모습과 달리 그들의 숨겨진 추악한 비밀들을 폭로하는 유명 렉카 너튜브 채널 '셀럽 쓰레기통' 그 채널을 운영하는 두 여자, 선미와 주원의 이야기. \"거짓으로 돈을 버는 건 당신들이나 우리나 똑같아\"",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F850526%2Fthumbnail%2Fthumbnail_IMAG21_7727c256-0b3a-4243-b3cf-fbfec5bfb984.jpg",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=850526"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 19851,
      "bookmarks": 19851,
      "ratingAvg": 4.8,
      "ratingCount": 6352,
      "ratingDist": [
        0,
        0,
        22,
        1702,
        4627
      ],
      "rankDelta": 0,
      "trendingScore": 87,
      "completionRate": 92,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-795297",
    "slug": "nw-795297",
    "type": "webtoon",
    "title": "신화급 귀속 아이템을 손에 넣었다",
    "author": "판테라",
    "artist": "헤스",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "사이다",
      "아카데미물",
      "아포칼립스",
      "게임판타지",
      "회귀"
    ],
    "synopsis": "D급 무투계 레이더로 마법계 레이더들의 고기방패나 하며 별 볼 일 없이 살던 재현. 그러던 어느 날, 던전에서 우연히 \"오딘의 눈\" 이라는 최강의 귀속 아이템을 얻게 됐다. 신의 눈을 가진 자, 세계를 구할 신의 대적자의 운명을 개척하라!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F795297%2Fthumbnail%2Fthumbnail_IMAG21_2011c0f2-3b1c-4e32-9076-ee0eb9c6f684.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2022,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=795297"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 389080,
      "bookmarks": 389080,
      "ratingAvg": 4.9,
      "ratingCount": 124506,
      "ratingDist": [
        0,
        0,
        244,
        25922,
        98340
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-749954619"
  },
  {
    "id": "nw-840845",
    "slug": "nw-840845",
    "type": "webtoon",
    "title": "몬스터와 힐링하는 S급 헌터",
    "author": "팀 더 지크",
    "artist": "손이도",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "액션판타지",
      "힐링",
      "이세계",
      "인외존재",
      "음식&요리"
    ],
    "synopsis": "키메라 헌터로 이용당하며 이지를 잃고 살아오길 수십 년. 게이트 안에 버려진 후, 인간의 모습으로 부활했다. 인간 '천도운'으로 살아갈 기회를 얻은 만큼 유유자적 힐링 라이프를 즐기려 했건만, 집 앞마당으로 마계 생물들과 과거의 인연들이 하나 둘 모여들어 도움을 청하는데... 복수? 처리? ...일단 옷부터 입고 시작하자. 척박한 마계 집 앞마당에서 펼쳐지는 천도운의 본격 힐링(?) 라이프!",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F840845%2Fthumbnail%2Fthumbnail_IMAG21_4f467d2a-6c56-48d3-8054-13f63b314c95.jpg",
    "status": "ongoing",
    "ageRating": "12",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=840845"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 92239,
      "bookmarks": 92239,
      "ratingAvg": 5,
      "ratingCount": 29516,
      "ratingDist": [
        0,
        0,
        32,
        4684,
        24800
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-1695445903"
  },
  {
    "id": "nw-840839",
    "slug": "nw-840839",
    "type": "webtoon",
    "title": "다정한 침입자",
    "author": "이니",
    "artist": "정유한",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "현대",
      "능글남",
      "소심녀",
      "청춘로맨스"
    ],
    "synopsis": "\"우리가 이성으로 보일 확률? 절대 없지.\" 어린 시절 사고로 가족을 잃고 한치오 가족의 보살핌 속에 자란 정이한. 커갈수록 어색함만 쌓여갔던 옆집 오빠와의 동거가 시작되는데... 꼭꼭 숨겨둔 마음에 자꾸만 침입하는 서로의 관계는 어떻게 변하게 될까.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F840839%2Fthumbnail%2Fthumbnail_IMAG21_641363d0-0259-4fff-bba2-5ad5f9522771.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=840839"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 293933,
      "bookmarks": 293933,
      "ratingAvg": 5,
      "ratingCount": 94059,
      "ratingDist": [
        0,
        0,
        101,
        14927,
        79031
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-849297",
    "slug": "nw-849297",
    "type": "webtoon",
    "title": "상사폭행",
    "author": "레블스튜디오",
    "artist": "이도엽",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "사이다",
      "공감",
      "오피스",
      "드라마",
      "요즘핫한추천작"
    ],
    "synopsis": "18살, 서울 전역 고등학교를 평정하며 폭력의 정점에 오른 ‘레전드’ 권승호. 하지만, 정점에 오른 뒤 권승호는 소리 소문 없이 사라졌는데.. 그로부터 10년이 지난 지금, 사람들은 그가 적어도 전국구 조폭 두목이 되었을 거라는 모두의 예상을 뒤엎고 삼진 상사의 신입사원으로 모습을 드러냈다!",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F849297%2Fthumbnail%2Fthumbnail_IMAG21_7fc55449-f3de-4bf1-a178-60dce4923f71.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2026,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=849297"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 48255,
      "bookmarks": 48255,
      "ratingAvg": 4.9,
      "ratingCount": 15442,
      "ratingDist": [
        0,
        0,
        30,
        3215,
        12197
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-846616",
    "slug": "nw-846616",
    "type": "webtoon",
    "title": "이혼자녀",
    "author": "051",
    "artist": "051",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "2025 지상최대공모전",
      "감성적인",
      "시리어스",
      "눈물샘자극",
      "결혼생활"
    ],
    "synopsis": "오랫동안 연을 끊었던 아버지의 죽음. 장례식장에서 마주한 건 눈물이 아닌, 파도처럼 밀려 드는 기억과 상처였다. 그 끝에서 '제훈'은 삶과 용서에 대해 다시 고민하게 된다.",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F846616%2Fthumbnail%2Fthumbnail_IMAG21_fd584595-1fe8-4895-8fe7-a8d0c0f23ef5.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2026,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=846616"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 37189,
      "bookmarks": 37189,
      "ratingAvg": 5,
      "ratingCount": 11900,
      "ratingDist": [
        0,
        0,
        13,
        1889,
        9999
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-841126",
    "slug": "nw-841126",
    "type": "webtoon",
    "title": "대공비가 체질입니다",
    "author": "LICO",
    "artist": "챰이",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "설렘폭발",
      "서양",
      "능력녀",
      "판타지",
      "러블리"
    ],
    "synopsis": "1년 후, 처형당할 소설 속 악녀에 빙의한 아네트. 어떻게든 살기 위해 저주받은 북부 대공과 계약 결혼을 한다. 그런데... “오늘 밤도 안아주시면 안 됩니까?” 손만 닿아도 질색하던 남편이 요망해졌다! 게다가! “북부, 제국 최고의 핫플레이스 등극?” “대공비, 특산품 완판??” 왜 이렇게 술술 잘 풀리는 거지? 혹시 나, 대공비가 체질인가?",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F841126%2Fthumbnail%2Fthumbnail_IMAG21_e2200d45-f256-4c5b-a259-97fae1d607a3.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=841126"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 108028,
      "bookmarks": 108028,
      "ratingAvg": 5,
      "ratingCount": 34569,
      "ratingDist": [
        0,
        0,
        37,
        5486,
        29046
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-1605341444"
  },
  {
    "id": "nw-817945",
    "slug": "nw-817945",
    "type": "webtoon",
    "title": "어린이집 다니는 구나",
    "author": "구나",
    "artist": "구나",
    "genres": [
      "일상"
    ],
    "tags": [
      "일상",
      "컷툰",
      "공감",
      "무해한",
      "러블리",
      "힐링"
    ],
    "synopsis": "\"노는 게 제일 좋아!\" 라고 했더니 정말 노는 게 직업이 됐다?! 매일 동심의 세계로 출퇴근한지 어쩌다 10년째! 아이들이라면 알 만큼 안다고 생각했는데... 예측불가한 말과 행동들은 여전히 새롭기만 하다. 그런 아이들에게 언제나 \"그랬구나\" 라고 말해주는, 10년차 프로공감러 구나가 들려주는 어린이집 선생님 이야기",
    "cover": [
      "oklch(0.45 0.14 162)",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F817945%2Fthumbnail%2Fthumbnail_IMAG21_c90a6d9e-3df5-41c4-b11a-7c6e61a89174.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "updateDays": [
      "월",
      "수"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=817945"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 118832,
      "bookmarks": 118832,
      "ratingAvg": 5,
      "ratingCount": 38026,
      "ratingDist": [
        0,
        0,
        41,
        6035,
        31951
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-829195",
    "slug": "nw-829195",
    "type": "webtoon",
    "title": "우주천마 3077",
    "author": "산하",
    "artist": "김대영",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "무협/사극",
      "액션",
      "고인물",
      "아포칼립스",
      "동양풍판타지",
      "힘숨찐"
    ],
    "synopsis": "오랜 세월이 흘러 태산에 봉인된 천마가 눈을 떴을 때, 이미 인류는 방사능에 절여진 지구를 떠나 은하를 누비고 있었다.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F829195%2Fthumbnail%2Fthumbnail_IMAG21_70e13aca-ac81-4e47-b856-6c5d8651a0c5.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=829195"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 71068,
      "bookmarks": 71068,
      "ratingAvg": 4.9,
      "ratingCount": 22742,
      "ratingDist": [
        0,
        0,
        45,
        4735,
        17963
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-447110155"
  },
  {
    "id": "nw-845918",
    "slug": "nw-845918",
    "type": "webtoon",
    "title": "검 먹는 소드마스터",
    "author": "양명",
    "artist": "양명",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "중세판타지액션",
      "소년물",
      "성장물",
      "소설원작",
      "원작소설"
    ],
    "synopsis": "영문조차 모른 채 소드마스터에게 모든 것을 잃은 아르한. 죽음 같은 절망 속에서, 전설로만 전해지던 선조 리암 카라반이 모습을 드러낸다. 리암이 제시한 아르한의 유일한 복수 방법은 바로- “검을 먹고, 그 안에 깃든 힘을 자신의 것으로 만들어라.” 그 순간 소년 아르한의 복수는 시작되었고, 잊혀진 가문 ‘카라반’의 이름도 다시 깨어나기 시작한다.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F845918%2Fthumbnail%2Fthumbnail_IMAG21_02da73d3-890e-4778-8148-4b02da0c9ba7.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=845918"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 66663,
      "bookmarks": 66663,
      "ratingAvg": 4.9,
      "ratingCount": 21332,
      "ratingDist": [
        0,
        0,
        42,
        4441,
        16849
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-11414761"
  },
  {
    "id": "nw-835082",
    "slug": "nw-835082",
    "type": "webtoon",
    "title": "연애리뷰",
    "author": "송채윤, 평강",
    "artist": "라희",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "레드스트링",
      "캠퍼스로맨스"
    ],
    "synopsis": "평소엔 누구보다 이성적! 그러나 연애만 하면 상호구가 되는 기주. 이번엔 다를 거라 믿었던 남자친구와의 다툼 중 계단에서 굴러 떨어지게 되는데.. 병원에서 깨어난 기주의 눈 앞에 수상한 리뷰창이 보인다! '이게 뭐지? 남자친구를 평가한 듯한 전여친들의 리뷰..?' 이 리뷰창… 기주의 연애에 구원이 되어줄 수 있을까?",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F835082%2Fthumbnail%2Fthumbnail_IMAG21_96693197-aa8f-4cd5-8228-3957cbaf586f.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=835082"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 279802,
      "bookmarks": 279802,
      "ratingAvg": 4.9,
      "ratingCount": 89537,
      "ratingDist": [
        0,
        0,
        175,
        18642,
        70720
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-814742",
    "slug": "nw-814742",
    "type": "webtoon",
    "title": "좀비묵시록 82-08",
    "author": "달아",
    "artist": "아쿠아콘, 경우",
    "genres": [
      "액션"
    ],
    "tags": [
      "액션",
      "자극적인",
      "시리어스",
      "절망적인",
      "현대",
      "스릴러"
    ],
    "synopsis": "탕-! 의문의 선박 속 '그것'으로부터 시작된 괴이한 전염병은 서울을 죽음의 도시로 만들어버린다. 예고 없이 닥쳐온 심판의 그날부터 세상의 모든 질서는 완전히 리셋되었다. 처절한 생존 경쟁 속에서 프로젝트명 [좀비묵시록 82-08]이 시작된다.",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F814742%2Fthumbnail%2Fthumbnail_IMAG21_78eadccd-67fa-4657-be55-365b69520a45.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=814742"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 94744,
      "bookmarks": 94744,
      "ratingAvg": 4.9,
      "ratingCount": 30318,
      "ratingDist": [
        0,
        0,
        59,
        6312,
        23946
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-447779892"
  },
  {
    "id": "nw-845531",
    "slug": "nw-845531",
    "type": "webtoon",
    "title": "빌런의 순정",
    "author": "수민",
    "artist": "수민",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "첫사랑",
      "능력남",
      "재벌남",
      "집착남",
      "사연녀"
    ],
    "synopsis": "비서인 연우는 부사장 윤석의 가스라이팅과 괴롭힘에 고향인 목산군으로 도망간다. 그곳에서 설양 건설의 전무 성헌을 만나게 되고, 얼음장 같던 성헌의 마음은 따스한 봄과 닮은 연우에게 녹아 스며든다. 한편 윤석은 연우를 찾으러 나서는데...",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F845531%2Fthumbnail%2Fthumbnail_IMAG21_965eb180-1ea8-4aae-af26-433008b051db.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=845531"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 141592,
      "bookmarks": 141592,
      "ratingAvg": 5,
      "ratingCount": 45309,
      "ratingDist": [
        0,
        0,
        48,
        7191,
        38070
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-800959187"
  },
  {
    "id": "nw-843310",
    "slug": "nw-843310",
    "type": "webtoon",
    "title": "장편단편선",
    "author": "기주주",
    "artist": "기주주",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "흑백",
      "독자PICK",
      "로맨스",
      "괴담"
    ],
    "synopsis": "장편의 감상이 느껴지는 다양한 장르의 단편 모음집. 스릴러와 개그, 드라마와 로맨스 등 장르를 넘나드는 다양한 단편을 한 번에 즐겨보세요.",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F843310%2Fthumbnail%2Fthumbnail_IMAG21_3cf6d1eb-a9e8-4c2b-8598-fbe7c57e4b04.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=843310"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 83530,
      "bookmarks": 83530,
      "ratingAvg": 5,
      "ratingCount": 26730,
      "ratingDist": [
        0,
        0,
        29,
        4242,
        22459
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-832243",
    "slug": "nw-832243",
    "type": "webtoon",
    "title": "정신 차려, 전승연",
    "author": "제민",
    "artist": "제민",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스"
    ],
    "synopsis": "예쁜 얼굴, 큰 키, 특유의 분위기 덕에 인기가 많은 승연은 PC방에서 알바하며, 자신에게 호의를 보이는 남자 손님들에게 값싼 자존감을 얻곤 한다. 4학년이 된 지금은 학업에 매진해야 하는 걸 알지만, 쉽게 PC방 알바를 그만두지 못하는 승연은 은근 매력있는 이범을 만나게 되는데...",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F832243%2Fthumbnail%2Fthumbnail_IMAG21_10198941-e7d8-4a0e-abc5-cabc6759cca9.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=832243"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 100580,
      "bookmarks": 100580,
      "ratingAvg": 4.8,
      "ratingCount": 32186,
      "ratingDist": [
        0,
        0,
        113,
        8626,
        23447
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-850236",
    "slug": "nw-850236",
    "type": "webtoon",
    "title": "1인칭 혈육시점",
    "author": "모카빵",
    "artist": "모카빵",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "가족",
      "혐관",
      "로맨틱코미디",
      "성별반전",
      "캠퍼스로맨스"
    ],
    "synopsis": "어릴 적부터 가영의 연애를 방해하는 혈육이자 웬수, 차강현. 왜인지 이번 짝사랑도 차강현 때문에 망할 것 같은 불길한 예감에 용하다는 타로집에서 수상한 팔찌를 사 오게 되는데… 왜 내가 차강현이 된 거지?",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F850236%2Fthumbnail%2Fthumbnail_IMAG21_c2762e7a-ad6f-4637-b36f-cbd7b49c1773.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2026,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=850236"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 37487,
      "bookmarks": 37487,
      "ratingAvg": 4.9,
      "ratingCount": 11996,
      "ratingDist": [
        0,
        0,
        23,
        2498,
        9475
      ],
      "rankDelta": 0,
      "trendingScore": 87,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-843017",
    "slug": "nw-843017",
    "type": "webtoon",
    "title": "포도가 익기 전에",
    "author": "삼태",
    "artist": "삼태",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "오피스",
      "감성",
      "드라마",
      "오피스로맨스",
      "성장드라마"
    ],
    "synopsis": "어릴적 사건으로 수영의 집에 빚을 진 태은의 아버지는 매달 100만원을 수영의 집에 보낸다. 시간이 흘러 성인이 된 두사람은 새로 부임한 팀장과 팀의 막내로 만나게 되고 아슬아슬한 회사 생활을 이어간다.. “팀장님, 저한테 왜 잘해줘요?” “너한테 빚이 있어서.” “그럼 저 왜 미워하세요?” “그게 내 빚인지는 잘 모르겠어서.”",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F843017%2Fthumbnail%2Fthumbnail_IMAG21_b411c7f4-e8ee-4bc5-868a-5a9f5cdeb0d0.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=843017"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 127951,
      "bookmarks": 127951,
      "ratingAvg": 5,
      "ratingCount": 40944,
      "ratingDist": [
        0,
        0,
        44,
        6498,
        34402
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-849898",
    "slug": "nw-849898",
    "type": "webtoon",
    "title": "페일 블루 아이즈",
    "author": "LICO",
    "artist": "당도삼십",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "예술",
      "고자극드라마",
      "리얼로맨스",
      "감성적인",
      "자극적인"
    ],
    "synopsis": "주은은 자신을 늘 외롭게 만드는 가족을 떠나 홀연히 영국으로 향한다. 그곳에서 만난 창백한 푸른눈의 남자, 에덴. 조악한 문신으로 온몸을 뒤덮은, 쓰레기 같은 펑크를 노래하는, 주변의 모든 여자를 열병에 들끓게 만드는, 하지만 살면서 본 가장 다정하고 가장 아름다운 남자. 주은은 그가 위험하다는 걸 알면서도 불가항력으로 그에게 끌리게 되는데…",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F849898%2Fthumbnail%2Fthumbnail_IMAG21_a2bb0dde-6ec3-46f1-8e69-3ab35a6f863f.jpg",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=849898"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 24710,
      "bookmarks": 24710,
      "ratingAvg": 4.9,
      "ratingCount": 7907,
      "ratingDist": [
        0,
        0,
        15,
        1646,
        6245
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false,
    "adaptedFrom": "nv-1629294240"
  },
  {
    "id": "nw-828167",
    "slug": "nw-828167",
    "type": "webtoon",
    "title": "구야는 신입",
    "author": "구야",
    "artist": "구야",
    "genres": [
      "일상"
    ],
    "tags": [
      "일상",
      "컷툰",
      "2024 연재직행열차",
      "일상개그힐링",
      "공감",
      "오피스"
    ],
    "synopsis": "평생 학생일 줄 알았던 내가 어느새 직장인이 되어버렸다. 직장인이 된 기쁨도 잠시... 이제는 일하다가 몰래 잡코리x만 뒤져보는 직장인이 되어버렸다는데... 사회초년생 구야의 웃픈(?) 홀로서기",
    "cover": [
      "oklch(0.45 0.14 162)",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F828167%2Fthumbnail%2Fthumbnail_IMAG21_c081fdf4-bd84-4195-a806-8c4db7603308.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2024,
    "updateDays": [
      "월",
      "금"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=828167"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 29352,
      "bookmarks": 29352,
      "ratingAvg": 5,
      "ratingCount": 9393,
      "ratingDist": [
        0,
        0,
        10,
        1491,
        7892
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false
  },
  {
    "id": "nw-842977",
    "slug": "nw-842977",
    "type": "webtoon",
    "title": "1초에 100만원",
    "author": "이지호, 도보리",
    "artist": "웨이브",
    "genres": [
      "판타지"
    ],
    "tags": [
      "판타지",
      "사이다",
      "고자극드라마",
      "자극적인",
      "공감",
      "하이퍼리얼리즘"
    ],
    "synopsis": "1초마다 100만원씩 한도가 올라가는 신비의 지갑. 단, 조건이 있다. 지갑에서 돈을 꺼내 쓰는 만큼 나와 관련된 무언가가 줄어든다는 것! 문제는, 줄어드는 것이 무엇인지는 알 수 없다고 하는데...? 그럼에도 지갑의 소유주가 되겠다고 결심한 사람들. 오늘 하루만, 이번 달까지만… 1초마다 100만원씩 생기는 달달한 현실에 이들은 자신이 어떤 대가를 치르고 있는지도 모른 채 돈을 꺼내고 또 꺼낸다. 불로소득으로 얻은 천문학적인 금액으로 원하는 행복을 살 수 있을까? 혹은, 그들이 잃고 있는 것이야",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F842977%2Fthumbnail%2Fthumbnail_IMAG21_c4db8bbe-1c56-47e1-a9bd-4807cc4477a7.jpg",
    "status": "hiatus",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=842977"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 54798,
      "bookmarks": 54798,
      "ratingAvg": 4.8,
      "ratingCount": 17535,
      "ratingDist": [
        0,
        0,
        62,
        4699,
        12774
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 92,
      "bingeIndex": 95
    },
    "featured": false
  },
  {
    "id": "nw-826381",
    "slug": "nw-826381",
    "type": "webtoon",
    "title": "피폐물을 힐링물로 만드는 방법",
    "author": "류호",
    "artist": "양담",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "설렘폭발",
      "집착남",
      "명랑녀",
      "햇살녀",
      "로맨틱코미디"
    ],
    "synopsis": "[살아생전 즐겨보던 소설에 환생했다.] 너무 진부하다구요? 아닐 걸요! 왜냐면 그 소설이... 19금 피폐물이거든요...! ̗̀(ꀬ⏖ꀬ∴) 예쁘고 상냥한 여주인공의 동생으로 환생했지만, 언니의 새드엔딩을 지켜볼 수 없었던 레나티스는 언니 대신 잘생긴 찐 광기남주 테오도르에게 잡혀간다. 그런데 이 남주... 생각보다 그냥 '짐승(animal)'이잖아? '제가 짐승남이 취향이긴 한데... 그렇다고 짐승을 바란 건 아니거든요!' 햇살을 넘어선 태양광 여주의 짐승(남) 조련기가 시작됩니다.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F826381%2Fthumbnail%2Fthumbnail_IMAG21_217f89e9-1191-4674-b248-44aec3e7f69c.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=826381"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 186519,
      "bookmarks": 186519,
      "ratingAvg": 5,
      "ratingCount": 59686,
      "ratingDist": [
        0,
        0,
        64,
        9472,
        50150
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 93,
      "bingeIndex": 97
    },
    "featured": false,
    "adaptedFrom": "nv-710603139"
  },
  {
    "id": "nw-840329",
    "slug": "nw-840329",
    "type": "webtoon",
    "title": "십이지소녀",
    "author": "지지, MAJOR",
    "artist": "지지",
    "genres": [
      "드라마"
    ],
    "tags": [
      "드라마",
      "하렘",
      "러브코미디",
      "동양풍로맨스",
      "이능력",
      "청춘"
    ],
    "synopsis": "십이지 신을 정하는 게임에서 13위로 순위에 들지 못한 고양이 니나, 니나에 의해 몇 천년만에 십이지 게임은 다시 시작되고 열두 신이 세상에 강림하게 된다. 유쾌하고 러블리한 본격 초능력 판타지 소녀 액션!!",
    "cover": [
      "oklch(0.45 0.14 35)",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F840329%2Fthumbnail%2Fthumbnail_IMAG21_98526ab3-c032-4a67-8512-ac19ab5ed9c5.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2025,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=840329"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 119779,
      "bookmarks": 119779,
      "ratingAvg": 4.9,
      "ratingCount": 38329,
      "ratingDist": [
        0,
        0,
        75,
        7980,
        30274
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "nw-850709",
    "slug": "nw-850709",
    "type": "webtoon",
    "title": "헤어져서 팝니다",
    "author": "헛둘",
    "artist": "정동생",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "로맨스",
      "햇살남",
      "후회남",
      "미친작화",
      "다정남",
      "청춘로맨스"
    ],
    "synopsis": "대학교 4학년, ‘서정하’. 그녀는 과거 사귀었던 전남친이 준 스피커를 중고판매하기로 한다. 이유는 간단하다. 잘생기고 다정한 썸남, ‘박민준’이 생긴 그녀에게 그 스피커는 골칫덩이니까. 후련한 마음으로 중고 거래를 하는 ‘서정하’에게 찾아온 것은… 거래를 하러 온 전남친, ‘최서훈’. “이게 얼마짜리인데 고작 18만원에 팔아!?” 본격 중고거래로 시작하는 삼각관계 로맨스드라마!",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F850709%2Fthumbnail%2Fthumbnail_IMAG21_481ba875-be9e-4168-b63e-f9cba5ae10e2.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2026,
    "updateDays": [
      "월"
    ],
    "availability": [
      {
        "platformId": "naver-webtoon",
        "pricing": "free",
        "isOriginal": true,
        "url": "https://comic.naver.com/webtoon/list?titleId=850709"
      }
    ],
    "stats": {
      "views": 0,
      "likes": 28241,
      "bookmarks": 28241,
      "ratingAvg": 4.9,
      "ratingCount": 9037,
      "ratingDist": [
        0,
        0,
        18,
        1882,
        7138
      ],
      "rankDelta": 0,
      "trendingScore": 87,
      "completionRate": 92,
      "bingeIndex": 96
    },
    "featured": false
  },
  {
    "id": "ns-11263589",
    "slug": "ns-11263589",
    "type": "webnovel",
    "title": "두번째 사랑과 결혼하려는 이유",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "두번째 사랑과 결혼하려는 이유 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260601_230%2Fpocket_1780275043319UVa7e_PNG%2F1780275042787.png%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=11263589"
      }
    ],
    "stats": {
      "views": 9267655,
      "likes": 463383,
      "bookmarks": 463383,
      "ratingAvg": 4.6,
      "ratingCount": 185353,
      "ratingDist": [
        0,
        2,
        1957,
        76554,
        106840
      ],
      "rankDelta": 0,
      "trendingScore": 92,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-14209404",
    "slug": "ns-14209404",
    "type": "webnovel",
    "title": "계약 결혼, 사냥개가 되겠습니다",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "계약 결혼, 사냥개가 되겠습니다 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260530_56%2Fpocket_1780122683785TKNNI_PNG%2F1780122683152.png%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14209404"
      }
    ],
    "stats": {
      "views": 9102192,
      "likes": 455110,
      "bookmarks": 455110,
      "ratingAvg": 4.56,
      "ratingCount": 182044,
      "ratingDist": [
        0,
        2,
        2362,
        80885,
        98794
      ],
      "rankDelta": 0,
      "trendingScore": 91,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-14113723",
    "slug": "ns-14113723",
    "type": "webnovel",
    "title": "러브스토리 인 캐나다",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "러브스토리 인 캐나다 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14113723"
      }
    ],
    "stats": {
      "views": 8833624,
      "likes": 441681,
      "bookmarks": 441681,
      "ratingAvg": 4.52,
      "ratingCount": 176672,
      "ratingDist": [
        0,
        3,
        2805,
        84035,
        89829
      ],
      "rankDelta": 0,
      "trendingScore": 90,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-14113835",
    "slug": "ns-14113835",
    "type": "webnovel",
    "title": "청춘약국",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "청춘약국 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14113835"
      }
    ],
    "stats": {
      "views": 8682630,
      "likes": 434132,
      "bookmarks": 434132,
      "ratingAvg": 4.4799999999999995,
      "ratingCount": 173653,
      "ratingDist": [
        0,
        5,
        3355,
        87984,
        82309
      ],
      "rankDelta": 0,
      "trendingScore": 89,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14204953",
    "slug": "ns-14204953",
    "type": "webnovel",
    "title": "가락지놀음",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "가락지놀음 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14204953"
      }
    ],
    "stats": {
      "views": 8796188,
      "likes": 439809,
      "bookmarks": 439809,
      "ratingAvg": 4.4399999999999995,
      "ratingCount": 175924,
      "ratingDist": [
        0,
        6,
        4116,
        94462,
        77339
      ],
      "rankDelta": 0,
      "trendingScore": 88,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14143911",
    "slug": "ns-14143911",
    "type": "webnovel",
    "title": "들키면 안 되는 사이",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "들키면 안 되는 사이 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260508_61%2Fpocket_1778215301383lToOF_JPEG%2F%25C3%25D6%25C1%25BE%25BF%25AC%25C0%25E7%25BA%25BB%25B5%25E9%25C5%25B0%25B8%25E9_%25BE%25C8_%25B5%25C7%25B4%25C2_%25BB%25E7%25C0%25CC.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14143911"
      }
    ],
    "stats": {
      "views": 8411172,
      "likes": 420559,
      "bookmarks": 420559,
      "ratingAvg": 4.3999999999999995,
      "ratingCount": 168224,
      "ratingDist": [
        0,
        8,
        4741,
        95235,
        68239
      ],
      "rankDelta": 0,
      "trendingScore": 87,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14170752",
    "slug": "ns-14170752",
    "type": "webnovel",
    "title": "화이트 시크릿",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "화이트 시크릿 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260521_90%2Fpocket_1779346173880pExYe_JPEG%2Fcover.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14170752"
      }
    ],
    "stats": {
      "views": 8381779,
      "likes": 419089,
      "bookmarks": 419089,
      "ratingAvg": 4.359999999999999,
      "ratingCount": 167636,
      "ratingDist": [
        0,
        11,
        5663,
        99541,
        62421
      ],
      "rankDelta": 0,
      "trendingScore": 86,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14205132",
    "slug": "ns-14205132",
    "type": "webnovel",
    "title": "가락지놀음",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "가락지놀음 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14205132"
      }
    ],
    "stats": {
      "views": 8324148,
      "likes": 416207,
      "bookmarks": 416207,
      "ratingAvg": 4.319999999999999,
      "ratingCount": 166483,
      "ratingDist": [
        0,
        16,
        6705,
        103152,
        56611
      ],
      "rankDelta": 0,
      "trendingScore": 85,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14205138",
    "slug": "ns-14205138",
    "type": "webnovel",
    "title": "김똘 사람 만들기",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "김똘 사람 만들기 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14205138"
      }
    ],
    "stats": {
      "views": 8174142,
      "likes": 408707,
      "bookmarks": 408707,
      "ratingAvg": 4.279999999999999,
      "ratingCount": 163483,
      "ratingDist": [
        0,
        21,
        7810,
        105149,
        50504
      ],
      "rankDelta": 0,
      "trendingScore": 84,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14205237",
    "slug": "ns-14205237",
    "type": "webnovel",
    "title": "김똘 사람 만들기",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "김똘 사람 만들기 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14205237"
      }
    ],
    "stats": {
      "views": 8023182,
      "likes": 401159,
      "bookmarks": 401159,
      "ratingAvg": 4.239999999999999,
      "ratingCount": 160464,
      "ratingDist": [
        0,
        27,
        9046,
        106587,
        44804
      ],
      "rankDelta": 0,
      "trendingScore": 83,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14201226",
    "slug": "ns-14201226",
    "type": "webnovel",
    "title": "취중주의보",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "취중주의보 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260526_25%2Fpocket_1779778828417o2OHL_JPEG%2F%25C3%25EB%25C1%25DF%25C1%25D6%25C0%25C7%25BA%25B8_%25C7%25A5%25C1%25F6_%25C3%25D6%25C1%25BE%25BA%25BB_1120x1708.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14201226"
      }
    ],
    "stats": {
      "views": 7992378,
      "likes": 399619,
      "bookmarks": 399619,
      "ratingAvg": 4.199999999999999,
      "ratingCount": 159848,
      "ratingDist": [
        0,
        37,
        10579,
        109097,
        40135
      ],
      "rankDelta": 0,
      "trendingScore": 82,
      "completionRate": 72,
      "bingeIndex": 89
    },
    "featured": false
  },
  {
    "id": "ns-14202702",
    "slug": "ns-14202702",
    "type": "webnovel",
    "title": "채무자 아저씨",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "채무자 아저씨 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260521_259%2Fpocket_1779360810254NOrFi_JPEG%2F000.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=14202702"
      }
    ],
    "stats": {
      "views": 7807848,
      "likes": 390392,
      "bookmarks": 390392,
      "ratingAvg": 4.159999999999999,
      "ratingCount": 156157,
      "ratingDist": [
        0,
        48,
        12073,
        108957,
        35080
      ],
      "rankDelta": 0,
      "trendingScore": 81,
      "completionRate": 72,
      "bingeIndex": 89
    },
    "featured": false
  },
  {
    "id": "ns-14205047",
    "slug": "ns-14205047",
    "type": "webnovel",
    "title": "은밀한 친구 오빠",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "은밀한 친구 오빠 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=14205047"
      }
    ],
    "stats": {
      "views": 7575073,
      "likes": 378754,
      "bookmarks": 378754,
      "ratingAvg": 4.6,
      "ratingCount": 151502,
      "ratingDist": [
        0,
        1,
        1599,
        62573,
        87328
      ],
      "rankDelta": 0,
      "trendingScore": 80,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-14163333",
    "slug": "ns-14163333",
    "type": "webnovel",
    "title": "당돌한 결혼 계약",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "당돌한 결혼 계약 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260521_186%2Fpocket_1779347042607yrjFd_JPEG%2Fcover.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14163333"
      }
    ],
    "stats": {
      "views": 7469832,
      "likes": 373492,
      "bookmarks": 373492,
      "ratingAvg": 4.56,
      "ratingCount": 149397,
      "ratingDist": [
        0,
        2,
        1939,
        66380,
        81076
      ],
      "rankDelta": 0,
      "trendingScore": 79,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-13833569",
    "slug": "ns-13833569",
    "type": "webnovel",
    "title": "유해한 결혼",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "유해한 결혼 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13833569"
      }
    ],
    "stats": {
      "views": 6987998,
      "likes": 349400,
      "bookmarks": 349400,
      "ratingAvg": 4.52,
      "ratingCount": 139760,
      "ratingDist": [
        0,
        3,
        2219,
        66478,
        71061
      ],
      "rankDelta": 0,
      "trendingScore": 78,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-14153357",
    "slug": "ns-14153357",
    "type": "webnovel",
    "title": "기다림은 지루하지 않았다",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "기다림은 지루하지 않았다 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14153357"
      }
    ],
    "stats": {
      "views": 7393287,
      "likes": 369664,
      "bookmarks": 369664,
      "ratingAvg": 4.4799999999999995,
      "ratingCount": 147866,
      "ratingDist": [
        0,
        4,
        2857,
        74918,
        70087
      ],
      "rankDelta": 0,
      "trendingScore": 77,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14123655",
    "slug": "ns-14123655",
    "type": "webnovel",
    "title": "목숨값",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "목숨값 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14123655"
      }
    ],
    "stats": {
      "views": 7210969,
      "likes": 360548,
      "bookmarks": 360548,
      "ratingAvg": 4.4399999999999995,
      "ratingCount": 144219,
      "ratingDist": [
        0,
        5,
        3374,
        77438,
        63401
      ],
      "rankDelta": 0,
      "trendingScore": 76,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14187560",
    "slug": "ns-14187560",
    "type": "webnovel",
    "title": "잊혀진 청혼",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "잊혀진 청혼 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260519_116%2Fpocket_1779169065980HFe84_JPEG%2F%25C3%25D6%25C1%25BE%25C0%25D8%25C7%25F4%25C1%25F8-%25C3%25BB%25C8%25A5_%25C0%25CC%25C6%25E0.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14187560"
      }
    ],
    "stats": {
      "views": 7001614,
      "likes": 350081,
      "bookmarks": 350081,
      "ratingAvg": 4.3999999999999995,
      "ratingCount": 140032,
      "ratingDist": [
        0,
        7,
        3947,
        79275,
        56803
      ],
      "rankDelta": 0,
      "trendingScore": 75,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-13605749",
    "slug": "ns-13605749",
    "type": "webnovel",
    "title": "호랑 선비님",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "호랑 선비님 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13605749"
      }
    ],
    "stats": {
      "views": 6855421,
      "likes": 342771,
      "bookmarks": 342771,
      "ratingAvg": 4.359999999999999,
      "ratingCount": 137108,
      "ratingDist": [
        0,
        9,
        4631,
        81414,
        51054
      ],
      "rankDelta": 0,
      "trendingScore": 74,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-13456173",
    "slug": "ns-13456173",
    "type": "webnovel",
    "title": "불건전 오빠 친구",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "불건전 오빠 친구 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260105_27%2Fpocket_1767589693433LTLlc_JPEG%2F676442_80.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13456173"
      }
    ],
    "stats": {
      "views": 6822006,
      "likes": 341100,
      "bookmarks": 341100,
      "ratingAvg": 4.319999999999999,
      "ratingCount": 136440,
      "ratingDist": [
        0,
        13,
        5495,
        84537,
        46395
      ],
      "rankDelta": 0,
      "trendingScore": 73,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14179736",
    "slug": "ns-14179736",
    "type": "webnovel",
    "title": "연에 나리는 눈",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "연에 나리는 눈 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260518_91%2Fpocket_17790717309945aFpk_JPEG%2Fcover.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14179736"
      }
    ],
    "stats": {
      "views": 6013718,
      "likes": 300686,
      "bookmarks": 300686,
      "ratingAvg": 4.279999999999999,
      "ratingCount": 120274,
      "ratingDist": [
        0,
        15,
        5746,
        77358,
        37155
      ],
      "rankDelta": 0,
      "trendingScore": 72,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-13551805",
    "slug": "ns-13551805",
    "type": "webnovel",
    "title": "짙은 흔적",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "짙은 흔적 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20251223_171%2Fpocket_1766469645299X3x6O_JPEG%2F680112_60.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13551805"
      }
    ],
    "stats": {
      "views": 6035298,
      "likes": 301765,
      "bookmarks": 301765,
      "ratingAvg": 4.239999999999999,
      "ratingCount": 120706,
      "ratingDist": [
        0,
        21,
        6804,
        80178,
        33703
      ],
      "rankDelta": 0,
      "trendingScore": 71,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14164835",
    "slug": "ns-14164835",
    "type": "webnovel",
    "title": "아내 연습",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "아내 연습 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260521_296%2Fpocket_1779348347294dP3Sj_JPEG%2Fcover.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14164835"
      }
    ],
    "stats": {
      "views": 6085234,
      "likes": 304262,
      "bookmarks": 304262,
      "ratingAvg": 4.199999999999999,
      "ratingCount": 121705,
      "ratingDist": [
        0,
        28,
        8055,
        83064,
        30558
      ],
      "rankDelta": 0,
      "trendingScore": 70,
      "completionRate": 72,
      "bingeIndex": 89
    },
    "featured": false
  },
  {
    "id": "ns-14192579",
    "slug": "ns-14192579",
    "type": "webnovel",
    "title": "뒤틀린 거짓말",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "뒤틀린 거짓말 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260520_12%2Fpocket_1779247905057dVeaz_JPEG%2F%25B5%25DA%25C6%25B2%25B8%25B0_%25B0%25C5%25C1%25FE%25B8%25BB_0%25B1%25C7.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=14192579"
      }
    ],
    "stats": {
      "views": 6027008,
      "likes": 301350,
      "bookmarks": 301350,
      "ratingAvg": 4.159999999999999,
      "ratingCount": 120540,
      "ratingDist": [
        0,
        37,
        9319,
        84106,
        27078
      ],
      "rankDelta": 0,
      "trendingScore": 69,
      "completionRate": 72,
      "bingeIndex": 89
    },
    "featured": false
  },
  {
    "id": "ns-10917208",
    "slug": "ns-10917208",
    "type": "webnovel",
    "title": "개족보",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "개족보 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=10917208"
      }
    ],
    "stats": {
      "views": 5666458,
      "likes": 283323,
      "bookmarks": 283323,
      "ratingAvg": 4.6,
      "ratingCount": 113329,
      "ratingDist": [
        0,
        1,
        1196,
        46807,
        65324
      ],
      "rankDelta": 0,
      "trendingScore": 68,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-11741868",
    "slug": "ns-11741868",
    "type": "webnovel",
    "title": "새까맣게",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "새까맣게 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20241016_168%2Fpocket_1729059593844djUbl_JPEG%2F%25C7%25A5%25C1%25F6.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=11741868"
      }
    ],
    "stats": {
      "views": 5359606,
      "likes": 267980,
      "bookmarks": 267980,
      "ratingAvg": 4.56,
      "ratingCount": 107192,
      "ratingDist": [
        0,
        1,
        1391,
        47627,
        58172
      ],
      "rankDelta": 0,
      "trendingScore": 67,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-13323238",
    "slug": "ns-13323238",
    "type": "webnovel",
    "title": "상사와의 불순한 관계",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "상사와의 불순한 관계 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20251029_35%2Fpocket_1761715948089E7cM6_JPEG%2F%25BB%25F3%25BB%25E7%25BF%25CD%25C0%25C7_%25BA%25D2%25BC%25F8%25C7%25D1_%25B0%25FC%25B0%25E8_%25C3%25D6%25C1%25BE.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13323238"
      }
    ],
    "stats": {
      "views": 5760251,
      "likes": 288013,
      "bookmarks": 288013,
      "ratingAvg": 4.52,
      "ratingCount": 115205,
      "ratingDist": [
        0,
        2,
        1829,
        54798,
        58576
      ],
      "rankDelta": 0,
      "trendingScore": 66,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-13859736",
    "slug": "ns-13859736",
    "type": "webnovel",
    "title": "나쁜 놀이",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "나쁜 놀이 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260305_278%2Fpocket_1772695359487o2BOy_JPEG%2F%25BC%25D2%25C0%25CC%25B9%25CC%25B5%25F0%25BE%25EE_%25B3%25AA%25BB%25DB_%25B3%25EE%25C0%25CC_%25C5%25B8%25C0%25CC%25C6%25F7_%25C3%25D6%25C1%25BE%25BA%25BB.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=13859736"
      }
    ],
    "stats": {
      "views": 5110384,
      "likes": 255519,
      "bookmarks": 255519,
      "ratingAvg": 4.4799999999999995,
      "ratingCount": 102208,
      "ratingDist": [
        0,
        3,
        1975,
        51785,
        48445
      ],
      "rankDelta": 0,
      "trendingScore": 65,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14201248",
    "slug": "ns-14201248",
    "type": "webnovel",
    "title": "세상에서 제일 미운 남자",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "세상에서 제일 미운 남자 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260521_285%2Fpocket_17793469714030Cdlu_JPEG%2F15.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14201248"
      }
    ],
    "stats": {
      "views": 5292314,
      "likes": 264616,
      "bookmarks": 264616,
      "ratingAvg": 4.4399999999999995,
      "ratingCount": 105846,
      "ratingDist": [
        0,
        4,
        2476,
        56834,
        46532
      ],
      "rankDelta": 0,
      "trendingScore": 64,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14208087",
    "slug": "ns-14208087",
    "type": "webnovel",
    "title": "설산 마을 저택의 제물이 되었다",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "설산 마을 저택의 제물이 되었다 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14208087"
      }
    ],
    "stats": {
      "views": 4935576,
      "likes": 246779,
      "bookmarks": 246779,
      "ratingAvg": 4.3999999999999995,
      "ratingCount": 98712,
      "ratingDist": [
        0,
        5,
        2782,
        55883,
        40042
      ],
      "rankDelta": 0,
      "trendingScore": 63,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-13864557",
    "slug": "ns-13864557",
    "type": "webnovel",
    "title": "멸망로맨스",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "멸망로맨스 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260309_222%2Fpocket_1773029636193VBoPR_JPEG%2F%25BD%25BA%25C5%25E4%25B8%25AE%25C0%25DB_%25B8%25EA%25B8%25C1%25B7%25CE%25B8%25C7%25BD%25BA_%25BD%25C3%25B8%25AE%25C1%25EE_%25BB%25E7%25C0%25CC%25C1%25EE.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=13864557"
      }
    ],
    "stats": {
      "views": 4587677,
      "likes": 229384,
      "bookmarks": 229384,
      "ratingAvg": 4.359999999999999,
      "ratingCount": 91754,
      "ratingDist": [
        0,
        6,
        3099,
        54483,
        34166
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-13621300",
    "slug": "ns-13621300",
    "type": "webnovel",
    "title": "호랑 선비님",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "호랑 선비님 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13621300"
      }
    ],
    "stats": {
      "views": 4581520,
      "likes": 229076,
      "bookmarks": 229076,
      "ratingAvg": 4.319999999999999,
      "ratingCount": 91630,
      "ratingDist": [
        0,
        9,
        3690,
        56773,
        31158
      ],
      "rankDelta": 0,
      "trendingScore": 61,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14193475",
    "slug": "ns-14193475",
    "type": "webnovel",
    "title": "해를 따라 피어나는 꽃",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "해를 따라 피어나는 꽃 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14193475"
      }
    ],
    "stats": {
      "views": 4648182,
      "likes": 232409,
      "bookmarks": 232409,
      "ratingAvg": 4.279999999999999,
      "ratingCount": 92964,
      "ratingDist": [
        0,
        12,
        4441,
        59793,
        28719
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14195289",
    "slug": "ns-14195289",
    "type": "webnovel",
    "title": "아이가 아파서요",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "아이가 아파서요 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=14195289"
      }
    ],
    "stats": {
      "views": 4440487,
      "likes": 222024,
      "bookmarks": 222024,
      "ratingAvg": 4.239999999999999,
      "ratingCount": 88810,
      "ratingDist": [
        0,
        15,
        5006,
        58991,
        24797
      ],
      "rankDelta": 0,
      "trendingScore": 59,
      "completionRate": 72,
      "bingeIndex": 90
    },
    "featured": false
  },
  {
    "id": "ns-14207417",
    "slug": "ns-14207417",
    "type": "webnovel",
    "title": "완벽한 비서의 속사정",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "완벽한 비서의 속사정 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=14207417"
      }
    ],
    "stats": {
      "views": 4211740,
      "likes": 210587,
      "bookmarks": 210587,
      "ratingAvg": 4.199999999999999,
      "ratingCount": 84235,
      "ratingDist": [
        0,
        19,
        5575,
        57491,
        21150
      ],
      "rankDelta": 0,
      "trendingScore": 58,
      "completionRate": 72,
      "bingeIndex": 89
    },
    "featured": false
  },
  {
    "id": "ns-13629696",
    "slug": "ns-13629696",
    "type": "webnovel",
    "title": "흉액",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "흉액 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13629696"
      }
    ],
    "stats": {
      "views": 4440024,
      "likes": 222001,
      "bookmarks": 222001,
      "ratingAvg": 4.159999999999999,
      "ratingCount": 88800,
      "ratingDist": [
        0,
        27,
        6865,
        61959,
        19948
      ],
      "rankDelta": 0,
      "trendingScore": 57,
      "completionRate": 72,
      "bingeIndex": 89
    },
    "featured": false
  },
  {
    "id": "ns-13789825",
    "slug": "ns-13789825",
    "type": "webnovel",
    "title": "오빠 친구가 잘해서",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "오빠 친구가 잘해서 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260220_245%2Fpocket_177155940899804H94_JPEG%2Fcover.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13789825"
      }
    ],
    "stats": {
      "views": 3718043,
      "likes": 185902,
      "bookmarks": 185902,
      "ratingAvg": 4.6,
      "ratingCount": 74361,
      "ratingDist": [
        0,
        1,
        785,
        30712,
        42863
      ],
      "rankDelta": 0,
      "trendingScore": 56,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-13792724",
    "slug": "ns-13792724",
    "type": "webnovel",
    "title": "빼앗은 아내",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "빼앗은 아내 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13792724"
      }
    ],
    "stats": {
      "views": 3554021,
      "likes": 177701,
      "bookmarks": 177701,
      "ratingAvg": 4.56,
      "ratingCount": 71080,
      "ratingDist": [
        0,
        1,
        922,
        31582,
        38574
      ],
      "rankDelta": 0,
      "trendingScore": 55,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-14208099",
    "slug": "ns-14208099",
    "type": "webnovel",
    "title": "낭자를 그려도 되겠습니까",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "낭자를 그려도 되겠습니까 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fstatic%2Fnstore%2Fthumb%2F19over_book2_79x119.gif",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=14208099"
      }
    ],
    "stats": {
      "views": 3585543,
      "likes": 179277,
      "bookmarks": 179277,
      "ratingAvg": 4.52,
      "ratingCount": 71711,
      "ratingDist": [
        0,
        1,
        1138,
        34110,
        36461
      ],
      "rankDelta": 0,
      "trendingScore": 54,
      "completionRate": 72,
      "bingeIndex": 92
    },
    "featured": false
  },
  {
    "id": "ns-13789499",
    "slug": "ns-13789499",
    "type": "webnovel",
    "title": "오늘부터 등청합니다",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "오늘부터 등청합니다 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260220_79%2Fpocket_1771557132903A6Ruo_JPEG%2FLlog-work_from_today_cover-serial%2528cp_site_ver%2529.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/novel/detail.series?productNo=13789499"
      }
    ],
    "stats": {
      "views": 3271666,
      "likes": 163583,
      "bookmarks": 163583,
      "ratingAvg": 4.4799999999999995,
      "ratingCount": 65433,
      "ratingDist": [
        0,
        2,
        1264,
        33153,
        31014
      ],
      "rankDelta": 0,
      "trendingScore": 53,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-14202717",
    "slug": "ns-14202717",
    "type": "webnovel",
    "title": "친구 오빠의 나쁜 손",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "친구 오빠의 나쁜 손 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260521_123%2Fpocket_17793544206467JoyH_JPEG%2Fbadhand.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=14202717"
      }
    ],
    "stats": {
      "views": 3457812,
      "likes": 172891,
      "bookmarks": 172891,
      "ratingAvg": 4.4399999999999995,
      "ratingCount": 69156,
      "ratingDist": [
        0,
        3,
        1618,
        37133,
        30402
      ],
      "rankDelta": 0,
      "trendingScore": 52,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "ns-13694660",
    "slug": "ns-13694660",
    "type": "webnovel",
    "title": "님과 함께",
    "author": "미상",
    "genres": [
      "로맨스"
    ],
    "tags": [],
    "synopsis": "님과 함께 · 네이버 시리즈 인기 웹소설.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fcomicthumb-phinf.pstatic.net%2F20260126_227%2Fpocket_1769392576197KK22W_JPEG%2Fcover.jpg%3Ftype%3Dm79",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "wait-free",
        "url": "https://series.naver.com/novel/detail.series?productNo=13694660"
      }
    ],
    "stats": {
      "views": 3524431,
      "likes": 176222,
      "bookmarks": 176222,
      "ratingAvg": 4.3999999999999995,
      "ratingCount": 70489,
      "ratingDist": [
        0,
        4,
        1987,
        39905,
        28593
      ],
      "rankDelta": 0,
      "trendingScore": 51,
      "completionRate": 72,
      "bingeIndex": 91
    },
    "featured": false
  },
  {
    "id": "nv-1683810545",
    "slug": "nv-1683810545",
    "type": "webnovel",
    "title": "환생천마",
    "author": "장영훈",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "원작",
      "무협/사극",
      "사이다",
      "동양",
      "환생"
    ],
    "synopsis": "웹툰 「환생천마」의 원작 웹소설. 글 장영훈.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F822657%2Fthumbnail%2Fthumbnail_IMAG21_99e49512-e05d-48c3-846d-d898f78523df.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 1507350,
      "likes": 200980,
      "bookmarks": 200980,
      "ratingAvg": 5,
      "ratingCount": 80392,
      "ratingDist": [
        0,
        0,
        86,
        12758,
        67548
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-1570987400",
    "slug": "nv-1570987400",
    "type": "webnovel",
    "title": "절대검감",
    "author": "한중월야",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "원작",
      "무협/사극",
      "동양",
      "이능력",
      "모험"
    ],
    "synopsis": "웹툰 「절대검감」의 원작 웹소설. 글 한중월야.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F796075%2Fthumbnail%2Fthumbnail_IMAG21_31f75c4c-81c9-454a-8d92-9e23b577e1a5.jpg",
    "status": "ongoing",
    "ageRating": "12",
    "releaseYear": 2021,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 1826790,
      "likes": 243572,
      "bookmarks": 243572,
      "ratingAvg": 5,
      "ratingCount": 97429,
      "ratingDist": [
        0,
        0,
        104,
        15462,
        81863
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-979745232",
    "slug": "nv-979745232",
    "type": "webnovel",
    "title": "파브르 in 사천당가",
    "author": "에르훗",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "원작",
      "무협/사극",
      "동양",
      "액션",
      "판타지"
    ],
    "synopsis": "웹툰 「파브르 in 사천당가」의 원작 웹소설. 글 에르훗.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F833702%2Fthumbnail%2Fthumbnail_IMAG21_aad66c46-90fc-4d2d-8cb9-46fc0ff0abc2.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 1008366,
      "likes": 134449,
      "bookmarks": 134449,
      "ratingAvg": 5,
      "ratingCount": 53780,
      "ratingDist": [
        0,
        0,
        58,
        8535,
        45188
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-891604163",
    "slug": "nv-891604163",
    "type": "webnovel",
    "title": "회귀한 공작가의 막내도련님은 암살자",
    "author": "커피라임",
    "genres": [
      "판타지"
    ],
    "tags": [
      "원작",
      "판타지",
      "레드아이스 스튜디오",
      "액션판타지",
      "왕족/귀족"
    ],
    "synopsis": "웹툰 「회귀한 공작가의 막내도련님은 암살자」의 원작 웹소설. 글 커피라임.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F821195%2Fthumbnail%2Fthumbnail_IMAG21_4eff0192-8237-4ec7-b74c-bd66cfd25d51.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 1728798,
      "likes": 230506,
      "bookmarks": 230506,
      "ratingAvg": 5,
      "ratingCount": 92202,
      "ratingDist": [
        0,
        0,
        99,
        14632,
        77471
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-965363360",
    "slug": "nv-965363360",
    "type": "webnovel",
    "title": "천재 타자가 강속구를 숨김",
    "author": "이블라인",
    "genres": [
      "스포츠"
    ],
    "tags": [
      "원작",
      "스포츠",
      "청춘",
      "인생역전",
      "성장물"
    ],
    "synopsis": "웹툰 「천재 타자가 강속구를 숨김」의 원작 웹소설. 글 이블라인.",
    "cover": [
      "oklch(0.45 0.14 138)",
      "oklch(0.28 0.1 178)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F807775%2Fthumbnail%2Fthumbnail_IMAG21_3c8e26fe-0df1-46b8-b874-e1a986995864.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 1046520,
      "likes": 139536,
      "bookmarks": 139536,
      "ratingAvg": 5,
      "ratingCount": 55814,
      "ratingDist": [
        0,
        0,
        60,
        8858,
        46897
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-365493576",
    "slug": "nv-365493576",
    "type": "webnovel",
    "title": "시리도록 불꽃처럼",
    "author": "유진성",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "원작",
      "무협/사극",
      "정통무협",
      "열혈",
      "동양"
    ],
    "synopsis": "웹툰 「시리도록 불꽃처럼」의 원작 웹소설. 글 유진성.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F834686%2Fthumbnail%2Fthumbnail_IMAG21_5100418c-ad0f-4c77-b3fb-6b8b7f585888.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 403266,
      "likes": 53769,
      "bookmarks": 53769,
      "ratingAvg": 5,
      "ratingCount": 21508,
      "ratingDist": [
        0,
        0,
        23,
        3413,
        18072
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-697669952",
    "slug": "nv-697669952",
    "type": "webnovel",
    "title": "아포칼립스에 집을 숨김",
    "author": "로드워리어",
    "genres": [
      "액션"
    ],
    "tags": [
      "원작",
      "액션",
      "생존",
      "크리처",
      "고인물"
    ],
    "synopsis": "웹툰 「아포칼립스에 집을 숨김」의 원작 웹소설. 글 로드워리어.",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F825332%2Fthumbnail%2Fthumbnail_IMAG21_303156ff-1e4d-4c2a-954e-515ae0c65bbe.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 762282,
      "likes": 101638,
      "bookmarks": 101638,
      "ratingAvg": 5,
      "ratingCount": 40655,
      "ratingDist": [
        0,
        0,
        43,
        6452,
        34160
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-1539418320",
    "slug": "nv-1539418320",
    "type": "webnovel",
    "title": "변경백의 10클래스 망나니",
    "author": "플린",
    "genres": [
      "판타지"
    ],
    "tags": [
      "원작",
      "판타지",
      "액션판타지",
      "감성적인",
      "시리어스"
    ],
    "synopsis": "웹툰 「변경백의 10클래스 망나니」의 원작 웹소설. 글 플린.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F849510%2Fthumbnail%2Fthumbnail_IMAG21_6e5604e7-13fd-4e78-8455-fdd5b3ec1ecb.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2025,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 432384,
      "likes": 57651,
      "bookmarks": 57651,
      "ratingAvg": 5,
      "ratingCount": 23060,
      "ratingDist": [
        0,
        0,
        25,
        3660,
        19376
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-422145112",
    "slug": "nv-422145112",
    "type": "webnovel",
    "title": "영업 천재가 되었다",
    "author": "댄킴",
    "genres": [
      "판타지"
    ],
    "tags": [
      "원작",
      "판타지",
      "감성적인",
      "현대",
      "오피스"
    ],
    "synopsis": "웹툰 「영업 천재가 되었다」의 원작 웹소설. 글 댄킴.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F818780%2Fthumbnail%2Fthumbnail_IMAG21_3280cf30-80e7-407b-bd9a-5028cb8850e9.jpg",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 546354,
      "likes": 72847,
      "bookmarks": 72847,
      "ratingAvg": 5,
      "ratingCount": 29139,
      "ratingDist": [
        0,
        0,
        31,
        4624,
        24483
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-749954619",
    "slug": "nv-749954619",
    "type": "webnovel",
    "title": "신화급 귀속 아이템을 손에 넣었다",
    "author": "정선율",
    "genres": [
      "판타지"
    ],
    "tags": [
      "원작",
      "판타지",
      "사이다",
      "아카데미물",
      "아포칼립스"
    ],
    "synopsis": "웹툰 「신화급 귀속 아이템을 손에 넣었다」의 원작 웹소설. 글 정선율.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F795297%2Fthumbnail%2Fthumbnail_IMAG21_2011c0f2-3b1c-4e32-9076-ee0eb9c6f684.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2021,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 2334480,
      "likes": 311264,
      "bookmarks": 311264,
      "ratingAvg": 5,
      "ratingCount": 124506,
      "ratingDist": [
        0,
        0,
        133,
        19759,
        104614
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-1695445903",
    "slug": "nv-1695445903",
    "type": "webnovel",
    "title": "몬스터와 힐링하는 S급 헌터",
    "author": "다기205",
    "genres": [
      "판타지"
    ],
    "tags": [
      "원작",
      "판타지",
      "액션판타지",
      "힐링",
      "이세계"
    ],
    "synopsis": "웹툰 「몬스터와 힐링하는 S급 헌터」의 원작 웹소설. 글 다기205.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F840845%2Fthumbnail%2Fthumbnail_IMAG21_4f467d2a-6c56-48d3-8054-13f63b314c95.jpg",
    "status": "ongoing",
    "ageRating": "12",
    "releaseYear": 2024,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 553434,
      "likes": 73791,
      "bookmarks": 73791,
      "ratingAvg": 5,
      "ratingCount": 29516,
      "ratingDist": [
        0,
        0,
        32,
        4684,
        24800
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-1605341444",
    "slug": "nv-1605341444",
    "type": "webnovel",
    "title": "대공비가 체질입니다",
    "author": "레치모나",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "원작",
      "로맨스",
      "설렘폭발",
      "서양",
      "능력녀"
    ],
    "synopsis": "웹툰 「대공비가 체질입니다」의 원작 웹소설. 글 레치모나.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F841126%2Fthumbnail%2Fthumbnail_IMAG21_e2200d45-f256-4c5b-a259-97fae1d607a3.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 648168,
      "likes": 86422,
      "bookmarks": 86422,
      "ratingAvg": 5,
      "ratingCount": 34569,
      "ratingDist": [
        0,
        0,
        37,
        5486,
        29046
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-447110155",
    "slug": "nv-447110155",
    "type": "webnovel",
    "title": "우주천마 3077",
    "author": "녹색여우",
    "genres": [
      "역사",
      "무협"
    ],
    "tags": [
      "원작",
      "무협/사극",
      "액션",
      "고인물",
      "아포칼립스"
    ],
    "synopsis": "웹툰 「우주천마 3077」의 원작 웹소설. 글 녹색여우.",
    "cover": [
      "oklch(0.45 0.14 62)",
      "oklch(0.28 0.1 102)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F829195%2Fthumbnail%2Fthumbnail_IMAG21_70e13aca-ac81-4e47-b856-6c5d8651a0c5.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 426408,
      "likes": 56854,
      "bookmarks": 56854,
      "ratingAvg": 5,
      "ratingCount": 22742,
      "ratingDist": [
        0,
        0,
        24,
        3609,
        19109
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-11414761",
    "slug": "nv-11414761",
    "type": "webnovel",
    "title": "검 먹는 소드마스터",
    "author": "진범",
    "genres": [
      "판타지"
    ],
    "tags": [
      "원작",
      "판타지",
      "중세판타지액션",
      "소년물",
      "성장물"
    ],
    "synopsis": "웹툰 「검 먹는 소드마스터」의 원작 웹소설. 글 진범.",
    "cover": [
      "oklch(0.45 0.14 290)",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F845918%2Fthumbnail%2Fthumbnail_IMAG21_02da73d3-890e-4778-8148-4b02da0c9ba7.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 399978,
      "likes": 53330,
      "bookmarks": 53330,
      "ratingAvg": 5,
      "ratingCount": 21332,
      "ratingDist": [
        0,
        0,
        23,
        3385,
        17924
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-447779892",
    "slug": "nv-447779892",
    "type": "webnovel",
    "title": "좀비묵시록 82-08",
    "author": "박스오피스",
    "genres": [
      "액션"
    ],
    "tags": [
      "원작",
      "액션",
      "자극적인",
      "시리어스",
      "절망적인"
    ],
    "synopsis": "웹툰 「좀비묵시록 82-08」의 원작 웹소설. 글 박스오피스.",
    "cover": [
      "oklch(0.45 0.14 12)",
      "oklch(0.28 0.1 52)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F814742%2Fthumbnail%2Fthumbnail_IMAG21_78eadccd-67fa-4657-be55-365b69520a45.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2022,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 568464,
      "likes": 75795,
      "bookmarks": 75795,
      "ratingAvg": 5,
      "ratingCount": 30318,
      "ratingDist": [
        0,
        0,
        32,
        4811,
        25474
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-800959187",
    "slug": "nv-800959187",
    "type": "webnovel",
    "title": "빌런의 순정",
    "author": "로즈빈",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "원작",
      "로맨스",
      "첫사랑",
      "능력남",
      "재벌남"
    ],
    "synopsis": "웹툰 「빌런의 순정」의 원작 웹소설. 글 로즈빈.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F845531%2Fthumbnail%2Fthumbnail_IMAG21_965eb180-1ea8-4aae-af26-433008b051db.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2024,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 849552,
      "likes": 113274,
      "bookmarks": 113274,
      "ratingAvg": 5,
      "ratingCount": 45310,
      "ratingDist": [
        0,
        0,
        48,
        7191,
        38071
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-1629294240",
    "slug": "nv-1629294240",
    "type": "webnovel",
    "title": "페일 블루 아이즈",
    "author": "피숙혜",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "원작",
      "로맨스",
      "예술",
      "고자극드라마",
      "리얼로맨스"
    ],
    "synopsis": "웹툰 「페일 블루 아이즈」의 원작 웹소설. 글 피숙혜.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F849898%2Fthumbnail%2Fthumbnail_IMAG21_a2bb0dde-6ec3-46f1-8e69-3ab35a6f863f.jpg",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 148260,
      "likes": 19768,
      "bookmarks": 19768,
      "ratingAvg": 5,
      "ratingCount": 7907,
      "ratingDist": [
        0,
        0,
        8,
        1255,
        6644
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "nv-710603139",
    "slug": "nv-710603139",
    "type": "webnovel",
    "title": "피폐물을 힐링물로 만드는 방법",
    "author": "황도톨",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "원작",
      "로맨스",
      "설렘폭발",
      "집착남",
      "명랑녀"
    ],
    "synopsis": "웹툰 「피폐물을 힐링물로 만드는 방법」의 원작 웹소설. 글 황도톨.",
    "cover": [
      "oklch(0.45 0.14 5)",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F826381%2Fthumbnail%2Fthumbnail_IMAG21_217f89e9-1191-4674-b248-44aec3e7f69c.jpg",
    "status": "ongoing",
    "ageRating": "15",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "naver-series",
        "pricing": "paid",
        "url": "https://series.naver.com/"
      }
    ],
    "stats": {
      "views": 1119114,
      "likes": 149215,
      "bookmarks": 149215,
      "ratingAvg": 5,
      "ratingCount": 59686,
      "ratingDist": [
        0,
        0,
        64,
        9472,
        50150
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 80,
      "bingeIndex": 82
    },
    "featured": false
  },
  {
    "id": "kw-2589",
    "slug": "kw-2589",
    "type": "webtoon",
    "title": "대사형 선유",
    "author": "노경찬",
    "artist": "박창환",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "역동적인",
      "감동적인",
      "액션/무협",
      "가족물"
    ],
    "synopsis": "무영문의 대사형 선유. 그런 그의 우직한 강호이야기.",
    "cover": [
      "#3b0913",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2589%2Fbg%2F2x%2F42132304-83f9-44c5-8706-215dac2e7d99.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/대사형-선유/2589"
      }
    ],
    "stats": {
      "views": 6042276,
      "likes": 241691,
      "bookmarks": 241691,
      "ratingAvg": 4.4,
      "ratingCount": 676,
      "ratingDist": [
        0,
        0,
        19,
        383,
        274
      ],
      "rankDelta": 0,
      "trendingScore": 90,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2043",
    "slug": "kw-2043",
    "type": "webtoon",
    "title": "무지개다리 파수꾼",
    "author": "이서",
    "artist": "이서",
    "genres": [
      "판타지",
      "드라마"
    ],
    "tags": [
      "감동적인",
      "통쾌한",
      "판타지 드라마",
      "에피소드물"
    ],
    "synopsis": "돈과 명예만을 좇던 유명 수의사, 동물의 소리를 듣게 되다!",
    "cover": [
      "#78625b",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2043%2Fbg%2F2x%2F4d8ad7e7-8a55-4478-a858-4492878a747a.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/무지개다리-파수꾼/2043"
      }
    ],
    "stats": {
      "views": 5947341,
      "likes": 237894,
      "bookmarks": 237894,
      "ratingAvg": 4.4,
      "ratingCount": 541,
      "ratingDist": [
        0,
        0,
        15,
        306,
        219
      ],
      "rankDelta": 0,
      "trendingScore": 89,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2385",
    "slug": "kw-2385",
    "type": "webtoon",
    "title": "4000년 만에 귀환한 대마도사",
    "author": "따개비",
    "artist": "김덕용(REDICE STUDIO)",
    "genres": [
      "판타지",
      "학원"
    ],
    "tags": [
      "역동적인",
      "통쾌한",
      "학원/판타지",
      "환생물"
    ],
    "synopsis": "4000년의 시간을 넘어 귀환한 대마도사의 화려한 액션이 시작된다!",
    "cover": [
      "#121630",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2385%2Fbg%2F2x%2F605aac93-b2ab-47ba-a12b-c175cca41112.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/4000년-만에-귀환한-대마도사/2385"
      }
    ],
    "stats": {
      "views": 5860350,
      "likes": 234414,
      "bookmarks": 234414,
      "ratingAvg": 4.3,
      "ratingCount": 1150,
      "ratingDist": [
        0,
        0,
        50,
        726,
        373
      ],
      "rankDelta": 0,
      "trendingScore": 88,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2473",
    "slug": "kw-2473",
    "type": "webtoon",
    "title": "이번 생은 가주가 되겠습니다",
    "author": "ANTSTUDIO",
    "artist": "몬(ANTSTUDIO)",
    "genres": [
      "로판"
    ],
    "tags": [
      "통쾌한",
      "몰입되는",
      "로맨스 판타지",
      "회귀물"
    ],
    "synopsis": "환생에 회귀까지, 인생 3회차 피렌티아의 가주되기 프로젝트!",
    "cover": [
      "#ccbc9e",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2473%2Fbg%2F2x%2Faa78be30-53c0-47f2-bf25-84bcf324451b.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/이번-생은-가주가-되겠습니다/2473"
      }
    ],
    "stats": {
      "views": 5771278,
      "likes": 230851,
      "bookmarks": 230851,
      "ratingAvg": 4.6,
      "ratingCount": 878,
      "ratingDist": [
        0,
        0,
        9,
        363,
        506
      ],
      "rankDelta": 0,
      "trendingScore": 87,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3345",
    "slug": "kw-3345",
    "type": "webtoon",
    "title": "교룡의 주인",
    "author": " 박래모",
    "artist": " 박래모",
    "genres": [
      "로판"
    ],
    "tags": [
      "몰입되는",
      "가슴 먹먹한",
      "로맨스 판타지",
      "가상시대물"
    ],
    "synopsis": "내 교룡이 된 것을 후회하지 않게 해주마.",
    "cover": [
      "#162b42",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3345%2Fbg%2F2x%2F8f918dce-507d-4c8d-aa36-cbd3713a3f07.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/교룡의-주인/3345"
      }
    ],
    "stats": {
      "views": 5710017,
      "likes": 228401,
      "bookmarks": 228401,
      "ratingAvg": 4.5,
      "ratingCount": 817,
      "ratingDist": [
        0,
        0,
        14,
        401,
        401
      ],
      "rankDelta": 0,
      "trendingScore": 86,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2901",
    "slug": "kw-2901",
    "type": "webtoon",
    "title": "후작가의 역대급 막내아들",
    "author": "케이",
    "artist": "케이",
    "genres": [
      "판타지",
      "드라마"
    ],
    "tags": [
      "압도되는",
      "긴장감 있는",
      "판타지 드라마",
      "복수물"
    ],
    "synopsis": "이번 생엔 두 번 다시 내 사람들을 잃지 않겠다",
    "cover": [
      "#151d29",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2901%2Fbg%2F2x%2Fadbb1d6b-2d5e-44af-a45a-75247a3f1173.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/후작가의-역대급-막내아들/2901"
      }
    ],
    "stats": {
      "views": 5595864,
      "likes": 223835,
      "bookmarks": 223835,
      "ratingAvg": 4.7,
      "ratingCount": 664,
      "ratingDist": [
        0,
        0,
        4,
        224,
        436
      ],
      "rankDelta": 0,
      "trendingScore": 85,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3327",
    "slug": "kw-3327",
    "type": "webtoon",
    "title": "은행의 공녀님",
    "author": "송송",
    "artist": "퍄프리카가루",
    "genres": [
      "로판"
    ],
    "tags": [
      "설레는",
      "몰입되는",
      "로맨스 판타지",
      "회귀물"
    ],
    "synopsis": "은행의 말단직원이 되어버린 공녀님!",
    "cover": [
      "#645e59",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3327%2Fbg%2F2x%2F567ff4a3-898d-4ea2-9574-ec5a0263a22a.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/은행의-공녀님/3327"
      }
    ],
    "stats": {
      "views": 5529957,
      "likes": 221198,
      "bookmarks": 221198,
      "ratingAvg": 4.5,
      "ratingCount": 757,
      "ratingDist": [
        0,
        0,
        13,
        372,
        372
      ],
      "rankDelta": 0,
      "trendingScore": 84,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3293",
    "slug": "kw-3293",
    "type": "webtoon",
    "title": "흑막은 매일 밤 나를 찾아온다",
    "author": "우주연",
    "artist": "꿀망",
    "genres": [
      "로판"
    ],
    "tags": [
      "발랄한",
      "웃기는",
      "로맨스 판타지",
      "가상시대물"
    ],
    "synopsis": "오늘 밤에 당신이 나를 가졌으면 해요",
    "cover": [
      "#302b2e",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3293%2Fbg%2F2x%2Fa97826ce-668d-4f9d-9bbe-1d5d1e90e47e.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/흑막은-매일-밤-나를-찾아온다/3293"
      }
    ],
    "stats": {
      "views": 5439209,
      "likes": 217568,
      "bookmarks": 217568,
      "ratingAvg": 4.7,
      "ratingCount": 1209,
      "ratingDist": [
        0,
        0,
        7,
        408,
        794
      ],
      "rankDelta": 0,
      "trendingScore": 83,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2981",
    "slug": "kw-2981",
    "type": "webtoon",
    "title": "만 년 만에 귀환한 플레이어",
    "author": "손민섭",
    "artist": "빈",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "압도되는",
      "역동적인",
      "액션/무협",
      "레벨업물"
    ],
    "synopsis": "잔혹한 마왕의 지구 수호 프로젝트",
    "cover": [
      "#141216",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2981%2Fbg%2F2x%2F038fc2ed-fcfe-4155-9f9d-3438405cb61c.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/만-년-만에-귀환한-플레이어/2981"
      }
    ],
    "stats": {
      "views": 5326112,
      "likes": 213044,
      "bookmarks": 213044,
      "ratingAvg": 4.5,
      "ratingCount": 912,
      "ratingDist": [
        0,
        0,
        16,
        448,
        448
      ],
      "rankDelta": 0,
      "trendingScore": 82,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2745",
    "slug": "kw-2745",
    "type": "webtoon",
    "title": "세이렌: 악당과 계약 가족이 되었다",
    "author": "생얌",
    "artist": "포야",
    "genres": [
      "로판"
    ],
    "tags": [
      "압도되는",
      "환상적인",
      "로맨스 판타지",
      "회귀물"
    ],
    "synopsis": "아리아는 계약 결혼을 제안했다. 자신을 지키고, 그를 지키기 위해서.",
    "cover": [
      "#292647",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2745%2Fbg%2F2x%2F4257ca5d-23a1-414f-bafa-2c47d9d8d3c1.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/세이렌-악당과-계약-가족이-되었다/2745"
      }
    ],
    "stats": {
      "views": 5234070,
      "likes": 209363,
      "bookmarks": 209363,
      "ratingAvg": 4.3,
      "ratingCount": 1270,
      "ratingDist": [
        0,
        0,
        56,
        802,
        412
      ],
      "rankDelta": 0,
      "trendingScore": 81,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3067",
    "slug": "kw-3067",
    "type": "webtoon",
    "title": "남편은 됐고, 돈이나 벌렵니다",
    "author": "미상",
    "artist": "몰코",
    "genres": [
      "코미디",
      "로판"
    ],
    "tags": [
      "발랄한",
      "설레는",
      "로맨스 판타지",
      "로맨틱코미디물"
    ],
    "synopsis": "그런데 남편과 첫날밤에 침대를 부숴버렸다?!",
    "cover": [
      "#220d17",
      "oklch(0.28 0.1 140)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3067%2Fbg%2F2x%2F69762dfe-9607-480b-8383-1212dc848786.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/남편은-됐고-돈이나-벌렵니다/3067"
      }
    ],
    "stats": {
      "views": 5167198,
      "likes": 206688,
      "bookmarks": 206688,
      "ratingAvg": 4.6,
      "ratingCount": 1598,
      "ratingDist": [
        0,
        0,
        17,
        660,
        921
      ],
      "rankDelta": 0,
      "trendingScore": 80,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2477",
    "slug": "kw-2477",
    "type": "webtoon",
    "title": "레벨업 못하는 플레이어",
    "author": "앵무새",
    "artist": "스튜디오 크힛",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "역동적인",
      "긴장감 있는",
      "액션/무협",
      "레벨업물"
    ],
    "synopsis": "레벨1이라고 했지. 약하다고는 안 했다.",
    "cover": [
      "#29293b",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2477%2Fbg%2F2x%2F49eec6d1-8827-4de0-ad43-312aa565a66f.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/레벨업-못하는-플레이어/2477"
      }
    ],
    "stats": {
      "views": 5051282,
      "likes": 202051,
      "bookmarks": 202051,
      "ratingAvg": 4.5,
      "ratingCount": 882,
      "ratingDist": [
        0,
        0,
        15,
        433,
        433
      ],
      "rankDelta": 0,
      "trendingScore": 79,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2592",
    "slug": "kw-2592",
    "type": "webtoon",
    "title": "사장님의 특별지시",
    "author": "박한나",
    "artist": "지나",
    "genres": [
      "로맨스",
      "코미디"
    ],
    "tags": [
      "발랄한",
      "설레는",
      "로맨스",
      "로맨틱코미디물"
    ],
    "synopsis": "사장님, '결혼'을 하자고요?! 비서의 예측불허 연애담!",
    "cover": [
      "#725b4c",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2592%2Fbg%2F2x%2Fd17a3102-ae71-4919-a3c9-f80c29ccf488.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/사장님의-특별지시/2592"
      }
    ],
    "stats": {
      "views": 4962300,
      "likes": 198492,
      "bookmarks": 198492,
      "ratingAvg": 4.3,
      "ratingCount": 700,
      "ratingDist": [
        0,
        0,
        31,
        442,
        227
      ],
      "rankDelta": 0,
      "trendingScore": 78,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2329",
    "slug": "kw-2329",
    "type": "webtoon",
    "title": "환골탈태",
    "author": "마고(mago)",
    "artist": "마고(mago)",
    "genres": [
      "판타지",
      "드라마"
    ],
    "tags": [
      "귀여운",
      "개성있는",
      "판타지 드라마",
      "힐링물"
    ],
    "synopsis": "마계에서 벌어지는 해골이의 좌충우돌 아기 고양이 육아 대작전",
    "cover": [
      "#c1b19f",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2329%2Fbg%2F2x%2F82066b98-6452-4590-8619-f794c8d3c13b.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/환골탈태/2329"
      }
    ],
    "stats": {
      "views": 4870168,
      "likes": 194807,
      "bookmarks": 194807,
      "ratingAvg": 4.6,
      "ratingCount": 968,
      "ratingDist": [
        0,
        0,
        10,
        400,
        558
      ],
      "rankDelta": 0,
      "trendingScore": 77,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2785",
    "slug": "kw-2785",
    "type": "webtoon",
    "title": "패왕의 별",
    "author": "위드칸",
    "artist": "위드칸",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "압도되는",
      "긴장감 있는",
      "액션/무협",
      "성공성장물"
    ],
    "synopsis": "기다리는 자는 결코 얻을 수 없다 쟁취하는 자가 패왕의 별이 될 것이다",
    "cover": [
      "#3e2e27",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2785%2Fbg%2F2x%2F60c0b6ff-c4a0-4fe4-97f7-0f242b154dab.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/패왕의-별/2785"
      }
    ],
    "stats": {
      "views": 4784194,
      "likes": 191368,
      "bookmarks": 191368,
      "ratingAvg": 4.7,
      "ratingCount": 1394,
      "ratingDist": [
        0,
        0,
        9,
        470,
        915
      ],
      "rankDelta": 0,
      "trendingScore": 76,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3236",
    "slug": "kw-3236",
    "type": "webtoon",
    "title": "마왕의 아이로 살아남는 법",
    "author": "야옹짹",
    "artist": "kwvh",
    "genres": [
      "로판"
    ],
    "tags": [
      "몰입되는",
      "웃기는",
      "로맨스 판타지",
      "회귀물"
    ],
    "synopsis": "원수의 아이가 되었다. 그럼 이번 멸망의 원인은 나야?!",
    "cover": [
      "#202545",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3236%2Fbg%2F2x%2Fba619544-2167-4252-a82d-38ecb502de6f.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/마왕의-아이로-살아남는-법/3236"
      }
    ],
    "stats": {
      "views": 4719026,
      "likes": 188761,
      "bookmarks": 188761,
      "ratingAvg": 4.4,
      "ratingCount": 1026,
      "ratingDist": [
        0,
        0,
        29,
        581,
        416
      ],
      "rankDelta": 0,
      "trendingScore": 75,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2341",
    "slug": "kw-2341",
    "type": "webtoon",
    "title": "묵향 다크레이디",
    "author": "이재헌",
    "artist": "구깃",
    "genres": [
      "판타지",
      "학원"
    ],
    "tags": [
      "통쾌한",
      "몰입되는",
      "학원/판타지",
      "로드무비"
    ],
    "synopsis": "이세계에 떨어진 전설의 무림고수! 드래곤의 자식이 되다?!",
    "cover": [
      "#503b47",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2341%2Fbg%2F2x%2F8b6d3bc5-53b4-4eb9-bffd-6b0da158a8ba.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/묵향-다크레이디/2341"
      }
    ],
    "stats": {
      "views": 4600222,
      "likes": 184009,
      "bookmarks": 184009,
      "ratingAvg": 4.5,
      "ratingCount": 1022,
      "ratingDist": [
        0,
        0,
        18,
        502,
        502
      ],
      "rankDelta": 0,
      "trendingScore": 74,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-1768",
    "slug": "kw-1768",
    "type": "webtoon",
    "title": "타원을 그리는 법",
    "author": "섬멍",
    "artist": "섬멍",
    "genres": [
      "로맨스"
    ],
    "tags": [
      "기발한",
      "궁금하게 하는",
      "로맨스",
      "GL"
    ],
    "synopsis": "민성의 비밀은 두 사람을 예기치 못 한 사건에 휘말리게 한다.",
    "cover": [
      "#22272c",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F1768%2Fbg%2F2x%2F99e96916-d59e-434f-88a5-42eaccc605d1.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/타원을-그리는-법/1768"
      }
    ],
    "stats": {
      "views": 4484344,
      "likes": 179374,
      "bookmarks": 179374,
      "ratingAvg": 4.7,
      "ratingCount": 1544,
      "ratingDist": [
        0,
        0,
        10,
        521,
        1014
      ],
      "rankDelta": 0,
      "trendingScore": 73,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2727",
    "slug": "kw-2727",
    "type": "webtoon",
    "title": "뽑기로 강해진 SSS급 헌터",
    "author": "개작가",
    "artist": "윤석준",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "역동적인",
      "통쾌한",
      "액션/무협",
      "레이드물"
    ],
    "synopsis": "인생 최악의 날, 우주로부터 뽑기 스킬을 선물 받는다.",
    "cover": [
      "#0c1e36",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2727%2Fbg%2F2x%2F44520188-b43b-42a5-97f0-ad8d65462d66.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/뽑기로-강해진-SSS급-헌터/2727"
      }
    ],
    "stats": {
      "views": 4424010,
      "likes": 176960,
      "bookmarks": 176960,
      "ratingAvg": 4.3,
      "ratingCount": 1210,
      "ratingDist": [
        0,
        0,
        53,
        764,
        392
      ],
      "rankDelta": 0,
      "trendingScore": 72,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2467",
    "slug": "kw-2467",
    "type": "webtoon",
    "title": "튜토리얼이 너무 어렵다",
    "author": "이마에 다이키",
    "artist": "이마에 다이키",
    "genres": [
      "판타지",
      "학원"
    ],
    "tags": [
      "처절한",
      "긴장감 있는",
      "학원/판타지",
      "레벨업물"
    ],
    "synopsis": "튜토리얼의 세계, 과연 여기서 나는 살아남을 수 있을까?",
    "cover": [
      "#1f105d",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2467%2Fbg%2F2x%2Fadf530d8-4311-443d-93d3-59e9baed470d.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/튜토리얼이-너무-어렵다/2467"
      }
    ],
    "stats": {
      "views": 4331251,
      "likes": 173250,
      "bookmarks": 173250,
      "ratingAvg": 4.4,
      "ratingCount": 851,
      "ratingDist": [
        0,
        0,
        24,
        482,
        345
      ],
      "rankDelta": 0,
      "trendingScore": 71,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3138",
    "slug": "kw-3138",
    "type": "webtoon",
    "title": "아기 다람쥐가 다 잘해요",
    "author": "혹등고래",
    "artist": "한소영",
    "genres": [
      "로판"
    ],
    "tags": [
      "발랄한",
      "귀여운",
      "로맨스 판타지",
      "수인물"
    ],
    "synopsis": "다람쥐 생존 버라이어티",
    "cover": [
      "#825238",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3138%2Fbg%2F2x%2Fa7260ae1-fde7-411f-8b72-4b0bfc7f4a20.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/아기-다람쥐가-다-잘해요/3138"
      }
    ],
    "stats": {
      "views": 4268067,
      "likes": 170723,
      "bookmarks": 170723,
      "ratingAvg": 4.5,
      "ratingCount": 1267,
      "ratingDist": [
        0,
        0,
        22,
        622,
        622
      ],
      "rankDelta": 0,
      "trendingScore": 70,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2769",
    "slug": "kw-2769",
    "type": "webtoon",
    "title": "남주를 주웠더니 남편이 생겨버렸다",
    "author": "마리씨",
    "artist": "서촌",
    "genres": [
      "코미디",
      "로판"
    ],
    "tags": [
      "발랄한",
      "따뜻한",
      "로맨스 판타지",
      "로맨틱코미디물"
    ],
    "synopsis": "남주를 주웠는데! 남편까지 생겨버렸다?!",
    "cover": [
      "#718151",
      "oklch(0.28 0.1 140)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2769%2Fbg%2F2x%2F39ec778a-88d9-478f-ad51-e7242b29d8fd.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/남주를-주웠더니-남편이-생겨버렸다/2769"
      }
    ],
    "stats": {
      "views": 4154136,
      "likes": 166165,
      "bookmarks": 166165,
      "ratingAvg": 4.4,
      "ratingCount": 1336,
      "ratingDist": [
        0,
        0,
        38,
        756,
        542
      ],
      "rankDelta": 0,
      "trendingScore": 69,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-1392",
    "slug": "kw-1392",
    "type": "webtoon",
    "title": "아도니스",
    "author": "와파",
    "artist": "결정",
    "genres": [
      "로판"
    ],
    "tags": [
      "개성있는",
      "압도되는",
      "로맨스 판타지",
      "회귀물"
    ],
    "synopsis": "전생에서 파국을 맞이하게 된 두 사람 새로운 생에서도 또다시 만나게 되는데",
    "cover": [
      "#03050c",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F1392%2Fbg%2F2x%2F55ecca1b-9469-4277-83bb-17a0a7009017.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/아도니스/1392"
      }
    ],
    "stats": {
      "views": 4030587,
      "likes": 161223,
      "bookmarks": 161223,
      "ratingAvg": 4.5,
      "ratingCount": 1387,
      "ratingDist": [
        0,
        0,
        24,
        681,
        681
      ],
      "rankDelta": 0,
      "trendingScore": 68,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3070",
    "slug": "kw-3070",
    "type": "webtoon",
    "title": "뱀파이어의 아들들",
    "author": "아가",
    "artist": "아가",
    "genres": [
      "판타지",
      "드라마",
      "코미디"
    ],
    "tags": [
      "개성있는",
      "궁금하게 하는",
      "판타지 드라마",
      "로맨틱코미디물"
    ],
    "synopsis": "<뱀파이어의 아들들>은 인간 사이에서 행복해질 수 있을 것인가!!",
    "cover": [
      "#383d3f",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3070%2Fbg%2F2x%2F8c134e6d-1cde-45be-afc3-d1217f83bae0.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/뱀파이어의-아들들/3070"
      }
    ],
    "stats": {
      "views": 3997222,
      "likes": 159889,
      "bookmarks": 159889,
      "ratingAvg": 4.5,
      "ratingCount": 422,
      "ratingDist": [
        0,
        0,
        7,
        207,
        207
      ],
      "rankDelta": 0,
      "trendingScore": 67,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-2658",
    "slug": "kw-2658",
    "type": "webtoon",
    "title": "책 먹는 마법사",
    "author": "미상",
    "artist": "크루 이스트우드",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "몰입되는",
      "개성있는",
      "액션/무협",
      "성공성장물"
    ],
    "synopsis": "순도 99% 노력파 마법사에게 1%의 기연이 찾아왔다!",
    "cover": [
      "#a87640",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F2658%2Fbg%2F2x%2F25aeacfd-2a30-437e-a57b-fd599a0b9c33.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/책-먹는-마법사/2658"
      }
    ],
    "stats": {
      "views": 3883143,
      "likes": 155326,
      "bookmarks": 155326,
      "ratingAvg": 4.6,
      "ratingCount": 1543,
      "ratingDist": [
        0,
        0,
        16,
        637,
        889
      ],
      "rankDelta": 0,
      "trendingScore": 66,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3186",
    "slug": "kw-3186",
    "type": "webtoon",
    "title": "오늘도 램프를 주웠다",
    "author": "와이낫미프로덕션",
    "artist": "시키",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "몰입되는",
      "궁금하게 하는",
      "액션/무협",
      "회귀물"
    ],
    "synopsis": "무한한 회귀 여행 시작, 그렇게 오늘도 난 램프를 주웠다",
    "cover": [
      "#240c06",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3186%2Fbg%2F2x%2Fda183732-2740-4fa3-afd7-f9d07ceb19c0.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/오늘도-램프를-주웠다/3186"
      }
    ],
    "stats": {
      "views": 3818220,
      "likes": 152729,
      "bookmarks": 152729,
      "ratingAvg": 4.3,
      "ratingCount": 1420,
      "ratingDist": [
        0,
        0,
        62,
        897,
        461
      ],
      "rankDelta": 0,
      "trendingScore": 65,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3168",
    "slug": "kw-3168",
    "type": "webtoon",
    "title": "예쁜 애 옆에 예쁜 애",
    "author": "Ruda",
    "artist": "쵸디",
    "genres": [
      "로판"
    ],
    "tags": [
      "귀여운",
      "평온한",
      "로맨스 판타지",
      "빙의물"
    ],
    "synopsis": "인생역전을 위한 서브녀 돌보기 프로젝트!",
    "cover": [
      "#305d2f",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3168%2Fbg%2F2x%2Ff0173470-fc85-4579-b3c8-da46b791fe3a.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/예쁜-애-옆에-예쁜-애/3168"
      }
    ],
    "stats": {
      "views": 3728160,
      "likes": 149126,
      "bookmarks": 149126,
      "ratingAvg": 4.3,
      "ratingCount": 1360,
      "ratingDist": [
        0,
        0,
        60,
        859,
        441
      ],
      "rankDelta": 0,
      "trendingScore": 64,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-927",
    "slug": "kw-927",
    "type": "webtoon",
    "title": "밤의 베란다",
    "author": "이제",
    "artist": "이제",
    "genres": [
      "드라마"
    ],
    "tags": [
      "처절한",
      "슬픈",
      "드라마",
      "피폐물"
    ],
    "synopsis": "삶을 구원할 수 밖에 없는 여자와 그녀를 구원해 줄 수 있는 남자.",
    "cover": [
      "#4d3d48",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F927%2Fbg%2F2x%2F450e1063-ffe1-4707-9d66-b35a8c7239c4.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/밤의-베란다/927"
      }
    ],
    "stats": {
      "views": 3626382,
      "likes": 145055,
      "bookmarks": 145055,
      "ratingAvg": 4.5,
      "ratingCount": 1582,
      "ratingDist": [
        0,
        0,
        28,
        777,
        777
      ],
      "rankDelta": 0,
      "trendingScore": 63,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3185",
    "slug": "kw-3185",
    "type": "webtoon",
    "title": "여자인 걸 왜 모르지?",
    "author": "원펀치래빗",
    "artist": "원펀치래빗",
    "genres": [
      "로맨스",
      "코미디"
    ],
    "tags": [
      "웃기는",
      "몰입되는",
      "로맨스",
      "로맨틱코미디물"
    ],
    "synopsis": "열혈 여형사, 살인범의 남장비서 되다?!",
    "cover": [
      "#241e1c",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3185%2Fbg%2F2x%2F75a7a7b6-be39-43d5-af30-cded9b2315ab.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/여자인-걸-왜-모르지/3185"
      }
    ],
    "stats": {
      "views": 3548219,
      "likes": 141929,
      "bookmarks": 141929,
      "ratingAvg": 4.7,
      "ratingCount": 1419,
      "ratingDist": [
        0,
        0,
        9,
        478,
        932
      ],
      "rankDelta": 0,
      "trendingScore": 62,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4217",
    "slug": "kw-4217",
    "type": "webtoon",
    "title": "극한견주 시즌2",
    "author": "마일로",
    "artist": "마일로",
    "genres": [
      "일상"
    ],
    "tags": [
      "귀여운",
      "웃기는",
      "코믹/일상",
      "힐링물"
    ],
    "synopsis": "하이퍼 리얼리즘 멍집사 라이프! 밉지 않은 솜이의 우당탕탕 일상툰!",
    "cover": [
      "#ac88be",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4217%2Fbg%2F2x%2F59120375-e920-467a-aed4-57e105fa26b3.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/극한견주-시즌2/4217"
      }
    ],
    "stats": {
      "views": 3488756,
      "likes": 139550,
      "bookmarks": 139550,
      "ratingAvg": 4.4,
      "ratingCount": 756,
      "ratingDist": [
        0,
        0,
        21,
        428,
        307
      ],
      "rankDelta": 0,
      "trendingScore": 61,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4107",
    "slug": "kw-4107",
    "type": "webtoon",
    "title": "BLOCK",
    "author": "강형규",
    "artist": "강형규",
    "genres": [
      "스릴러",
      "공포"
    ],
    "tags": [
      "몰입되는",
      "미스테리한",
      "공포/스릴러",
      "조직/암흑가"
    ],
    "synopsis": "킬러로서 첫걸음을 내딛게 된 주시영 동네가 왜 이래? 나도 이상해지겠어!",
    "cover": [
      "#350f0f",
      "oklch(0.28 0.1 235)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4107%2Fbg%2F2x%2F26e68f7f-2f4b-487c-b0ff-ac988037fdbe.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/BLOCK/4107"
      }
    ],
    "stats": {
      "views": 3397764,
      "likes": 135911,
      "bookmarks": 135911,
      "ratingAvg": 4.7,
      "ratingCount": 964,
      "ratingDist": [
        0,
        0,
        6,
        325,
        633
      ],
      "rankDelta": 0,
      "trendingScore": 60,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4178",
    "slug": "kw-4178",
    "type": "webtoon",
    "title": "붉게 물들면",
    "author": "김라무",
    "artist": "김라무",
    "genres": [
      "로판"
    ],
    "tags": [
      "에로틱한",
      "몰입되는",
      "로맨스 판타지",
      "피폐물"
    ],
    "synopsis": "왕녀의 머리카락에 걸린 붉은 저주, 그리고 나타난 한 남자.",
    "cover": [
      "#292f44",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4178%2Fbg%2F2x%2F1372edd4-53dc-4cd5-bfaf-6578e61f5e47.webp",
    "status": "ongoing",
    "ageRating": "19",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/붉게-물들면/4178"
      }
    ],
    "stats": {
      "views": 3307982,
      "likes": 132319,
      "bookmarks": 132319,
      "ratingAvg": 4.5,
      "ratingCount": 1182,
      "ratingDist": [
        0,
        0,
        21,
        581,
        581
      ],
      "rankDelta": 0,
      "trendingScore": 59,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4787",
    "slug": "kw-4787",
    "type": "webtoon",
    "title": "너의 뜻대로",
    "author": "맥퀸스튜디오",
    "artist": "백하",
    "genres": [
      "드라마"
    ],
    "tags": [
      "두자매",
      "운명의장난",
      "드라마",
      "피폐물"
    ],
    "synopsis": "나도 모르는 새 피어난 마음 되돌릴 수 없는 운명의 장난",
    "cover": [
      "#879b9f",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4787%2Fbg%2F2x%2F1985c228-0d6c-463f-9e43-054329bb8497.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/너의-뜻대로/4787"
      }
    ],
    "stats": {
      "views": 3223778,
      "likes": 128951,
      "bookmarks": 128951,
      "ratingAvg": 4.6,
      "ratingCount": 978,
      "ratingDist": [
        0,
        0,
        10,
        404,
        564
      ],
      "rankDelta": 0,
      "trendingScore": 58,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4809",
    "slug": "kw-4809",
    "type": "webtoon",
    "title": "8반 예쁜이",
    "author": "권계림",
    "artist": "한이솔",
    "genres": [
      "로맨스",
      "학원"
    ],
    "tags": [
      "설레는",
      "발랄한",
      "로맨스",
      "학원로맨스물"
    ],
    "synopsis": "2009년, 그 시절 부산. 그리고 고등학생들의 풋풋한 사랑.",
    "cover": [
      "#f58ca6",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4809%2Fbg%2F2x%2Fe54e5ed6-f7c9-4933-b3e6-75d392125055.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/8반-예쁜이/4809"
      }
    ],
    "stats": {
      "views": 3134493,
      "likes": 125380,
      "bookmarks": 125380,
      "ratingAvg": 4.6,
      "ratingCount": 493,
      "ratingDist": [
        0,
        0,
        5,
        204,
        284
      ],
      "rankDelta": 0,
      "trendingScore": 57,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4768",
    "slug": "kw-4768",
    "type": "webtoon",
    "title": "진심으로",
    "author": "마영신",
    "artist": "권다희",
    "genres": [
      "드라마"
    ],
    "tags": [
      "미소년",
      "날것남주",
      "드라마",
      "영화판"
    ],
    "synopsis": "손가락을 잃은 피아니스트. 절망의 틈을 그가 완성시킨다.",
    "cover": [
      "#1e1e1e",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4768%2Fbg%2F2x%2F4d62cd73-8ed1-4f1c-b1b9-f71b0c6cccd8.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/진심으로/4768"
      }
    ],
    "stats": {
      "views": 3043717,
      "likes": 121749,
      "bookmarks": 121749,
      "ratingAvg": 4.5,
      "ratingCount": 917,
      "ratingDist": [
        0,
        0,
        16,
        450,
        450
      ],
      "rankDelta": 0,
      "trendingScore": 56,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4740",
    "slug": "kw-4740",
    "type": "webtoon",
    "title": "호롱포롱 동거일기",
    "author": "펜낙",
    "artist": "펜낙",
    "genres": [
      "일상"
    ],
    "tags": [
      "발랄한",
      "공감되는",
      "코믹/일상",
      "에피소드물"
    ],
    "synopsis": "장거리 연애만 6년 한 커플! 호롱이 포롱이의 얼렁뚱땅 동거 생활",
    "cover": [
      "#aa8264",
      "oklch(0.28 0.1 202)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4740%2Fbg%2F2x%2F28a6138a-2689-4649-a579-6d733556ad3b.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/호롱포롱-동거일기/4740"
      }
    ],
    "stats": {
      "views": 2953647,
      "likes": 118146,
      "bookmarks": 118146,
      "ratingAvg": 4.5,
      "ratingCount": 847,
      "ratingDist": [
        0,
        0,
        15,
        416,
        416
      ],
      "rankDelta": 0,
      "trendingScore": 55,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4346",
    "slug": "kw-4346",
    "type": "webtoon",
    "title": "우리 집에 갇혀버린 남주들",
    "author": "초바",
    "artist": "ROSAC",
    "genres": [
      "로판"
    ],
    "tags": [
      "발랄한",
      "궁금하게 하는",
      "로맨스 판타지",
      "재난물"
    ],
    "synopsis": "모두가 기다렸던 명작 웹툰화",
    "cover": [
      "#604934",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4346%2Fbg%2F2x%2Faf1db506-2d11-4ca5-bae1-fe0dfb1e3162.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/우리-집에-갇혀버린-남주들/4346"
      }
    ],
    "stats": {
      "views": 2859809,
      "likes": 114392,
      "bookmarks": 114392,
      "ratingAvg": 4.7,
      "ratingCount": 609,
      "ratingDist": [
        0,
        0,
        4,
        205,
        400
      ],
      "rankDelta": 0,
      "trendingScore": 54,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3866",
    "slug": "kw-3866",
    "type": "webtoon",
    "title": "투파창궁",
    "author": "천잠토두",
    "artist": "임상, 투파창궁 만화제작팀",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "통쾌한",
      "몰입되는",
      "액션/무협",
      "성공성장물"
    ],
    "synopsis": "대륙 최고의 자리에 오를 수 있을까?",
    "cover": [
      "#112034",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3866%2Fbg%2F2x%2Ff1302b29-e15c-4024-b04b-f3f08b1fedbd.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/투파창궁/3866"
      }
    ],
    "stats": {
      "views": 2744885,
      "likes": 109795,
      "bookmarks": 109795,
      "ratingAvg": 4.3,
      "ratingCount": 885,
      "ratingDist": [
        0,
        0,
        39,
        559,
        287
      ],
      "rankDelta": 0,
      "trendingScore": 53,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3352",
    "slug": "kw-3352",
    "type": "webtoon",
    "title": "재활용 머학생",
    "author": "수레기",
    "artist": "수레기",
    "genres": [
      "드라마",
      "일상"
    ],
    "tags": [
      "웃기는",
      "궁금하게 하는",
      "코믹/일상",
      "청춘드라마"
    ],
    "synopsis": "의대생이 된 수레기 늦깎이 신입생의 대학생활",
    "cover": [
      "#ab9167",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3352%2Fbg%2F2x%2F022ebc00-7ece-40c9-b9b1-09fcd0450edd.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/재활용-머학생/3352"
      }
    ],
    "stats": {
      "views": 2650045,
      "likes": 106002,
      "bookmarks": 106002,
      "ratingAvg": 4.3,
      "ratingCount": 845,
      "ratingDist": [
        0,
        0,
        37,
        534,
        274
      ],
      "rankDelta": 0,
      "trendingScore": 52,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4401",
    "slug": "kw-4401",
    "type": "webtoon",
    "title": "중도 빌라",
    "author": "심우도",
    "artist": "심우도",
    "genres": [
      "드라마"
    ],
    "tags": [
      "따뜻한",
      "공감되는",
      "드라마",
      "힐링물"
    ],
    "synopsis": "평범한 사람들의 울고 웃는 이야기",
    "cover": [
      "#7d8ca3",
      "oklch(0.28 0.1 75)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4401%2Fbg%2F2x%2F605c812e-3e7d-46f4-ace0-212dbc10ecbc.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/중도-빌라/4401"
      }
    ],
    "stats": {
      "views": 2590641,
      "likes": 103626,
      "bookmarks": 103626,
      "ratingAvg": 4.4,
      "ratingCount": 1441,
      "ratingDist": [
        0,
        0,
        41,
        816,
        585
      ],
      "rankDelta": 0,
      "trendingScore": 51,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4012",
    "slug": "kw-4012",
    "type": "webtoon",
    "title": "랭커를 위한 바른 생활 안내서",
    "author": "샘미",
    "artist": "직믹",
    "genres": [
      "로맨스",
      "코미디"
    ],
    "tags": [
      "역동적인",
      "귀여운",
      "로맨스",
      "로맨틱코미디물"
    ],
    "synopsis": "최초S급 각성자, 현실은 삼수생?!",
    "cover": [
      "#9879dd",
      "oklch(0.28 0.1 45)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4012%2Fbg%2F2x%2Fe5856ce6-8c99-4625-947a-4c4d6cf09daf.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/랭커를-위한-바른-생활-안내서/4012"
      }
    ],
    "stats": {
      "views": 2496829,
      "likes": 99873,
      "bookmarks": 99873,
      "ratingAvg": 4.7,
      "ratingCount": 1229,
      "ratingDist": [
        0,
        0,
        8,
        414,
        807
      ],
      "rankDelta": 0,
      "trendingScore": 50,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-3004",
    "slug": "kw-3004",
    "type": "webtoon",
    "title": "성자는 개뿔, 현대의학의 힘이다",
    "author": "로렌조",
    "artist": "함미",
    "genres": [
      "판타지",
      "학원"
    ],
    "tags": [
      "궁금하게 하는",
      "통쾌한",
      "학원/판타지",
      "환생물"
    ],
    "synopsis": "천재 의사, 성자로 환생하다!",
    "cover": [
      "#817777",
      "oklch(0.28 0.1 330)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F3004%2Fbg%2F2x%2F34da87b5-c472-4206-8784-4d698f65c908.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/성자는-개뿔-현대의학의-힘이다/3004"
      }
    ],
    "stats": {
      "views": 2377009,
      "likes": 95080,
      "bookmarks": 95080,
      "ratingAvg": 4.7,
      "ratingCount": 1409,
      "ratingDist": [
        0,
        0,
        9,
        475,
        925
      ],
      "rankDelta": 0,
      "trendingScore": 49,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4071",
    "slug": "kw-4071",
    "type": "webtoon",
    "title": "만년 서브남의 운명이 내 손에",
    "author": "춘우",
    "artist": "춘우",
    "genres": [
      "로판"
    ],
    "tags": [
      "발랄한",
      "귀여운",
      "로맨스 판타지",
      "빙의물"
    ],
    "synopsis": "만년 서브남을 주인공으로! 원작 최애의 운명이 내 손에",
    "cover": [
      "#1e213c",
      "oklch(0.28 0.1 20)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4071%2Fbg%2F2x%2F97f56072-ecad-4efe-995a-b8c174c19aeb.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/만년-서브남의-운명이-내-손에/4071"
      }
    ],
    "stats": {
      "views": 2317014,
      "likes": 92681,
      "bookmarks": 92681,
      "ratingAvg": 4.7,
      "ratingCount": 1414,
      "ratingDist": [
        0,
        0,
        9,
        477,
        929
      ],
      "rankDelta": 0,
      "trendingScore": 48,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  },
  {
    "id": "kw-4129",
    "slug": "kw-4129",
    "type": "webtoon",
    "title": "룬의 아이들",
    "author": "목인",
    "artist": "단호박먼치킨, 쿄나",
    "genres": [
      "무협",
      "액션"
    ],
    "tags": [
      "가슴 먹먹한",
      "처절한",
      "액션/무협",
      "성장물"
    ],
    "synopsis": "반드시 살아남아라! 겨울검 윈터러를 지키기 위한 보리스의 여정이 시작된다",
    "cover": [
      "#8198b3",
      "oklch(0.28 0.1 62)"
    ],
    "coverImage": "/api/cover?u=https%3A%2F%2Fkr-a.kakaopagecdn.com%2FP%2FC%2F4129%2Fbg%2F2x%2F96ddd7de-e988-4937-8173-8440c521dbf6.webp",
    "status": "ongoing",
    "ageRating": "all",
    "releaseYear": 2023,
    "availability": [
      {
        "platformId": "kakao-webtoon",
        "pricing": "wait-free",
        "isOriginal": true,
        "url": "https://webtoon.kakao.com/content/룬의-아이들/4129"
      }
    ],
    "stats": {
      "views": 2227828,
      "likes": 89113,
      "bookmarks": 89113,
      "ratingAvg": 4.6,
      "ratingCount": 1028,
      "ratingDist": [
        0,
        0,
        11,
        425,
        593
      ],
      "rankDelta": 0,
      "trendingScore": 47,
      "completionRate": 70,
      "bingeIndex": 72
    },
    "featured": false
  }
];
