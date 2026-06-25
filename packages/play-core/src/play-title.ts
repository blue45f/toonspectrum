// 공유 놀이터 엔진이 읽는 웹툰 타이틀의 최소 구조적 계약.
// 웹(PlayTitle)·토스(GameTitle) 양쪽 타입이 이 인터페이스에 구조적으로 할당 가능하면
// 어느 앱에서든 동일 엔진을 그대로 호출할 수 있다(앱별 전용 필드는 신경 쓰지 않음).
//
// 여기 선언된 필드는 4개 엔진이 실제로 읽는 것의 합집합이다:
//   - quiz/memory/duel: id
//   - memory: title, cover, coverImage
//   - roulette: genres, views, likes, bookmarks
//   - duel: views
export interface PlayCoreTitle {
  id: string;
  title: string;
  /** OKLCH 그라디언트 2색(커버 폴백/배경). */
  cover: [string, string];
  /** 프록시된 실제 커버 이미지 URL(있으면). */
  coverImage?: string;
  genres: string[];
  /** 누적 조회수(추정 포함). */
  views: number;
  likes: number;
  bookmarks: number;
}
