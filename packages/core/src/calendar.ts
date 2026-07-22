// 연재 캘린더 공용 순수 로직 — 웹과 API가 동일 함수를 공유합니다.
// React/DOM/Node/Drizzle/env 의존 없음. KST 요일 계산과 '요일별 그룹화'를 한 곳에 모은다.
import { WEEK_DAYS } from "./taxonomy";

import type { Title } from "./types";

// 한국 표준시(KST) 기준 요일 (0=일 … 6=토). 서버 타임존(UTC 등)과 무관하게 한국 날짜로 계산.
// getDay()는 서버 로컬 TZ를 쓰므로 UTC 배포 시 KST 자정 부근에 요일이 어긋난다 → 이 헬퍼로 통일.
export function kstDayOfWeek(): number {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
}

// JS getDay()/getUTCDay()(0=일) → WEEK_DAYS 인덱스(0=월 … 6=일) 변환 테이블.
// 캘린더는 '월요일 시작' 주차로 표시하므로 일요일(getDay 0)을 6번 칸으로 매핑한다.
export const DAY_IDX_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5] as const;

// KST 기준 '오늘' 의 WEEK_DAYS 인덱스(0=월 … 6=일).
export function kstTodayIdx(): number {
  return DAY_IDX_FROM_GETDAY[kstDayOfWeek()];
}

// 연재 작품을 요일(월~일)별로 그룹화 — 각 요일 칸은 조회수 내림차순. 웹 서버 read-model(getCalendarData)·
// NestJS 캘린더 라우트와 웹 화면이 같은 함수를 호출하도록 순수 함수로 분리합니다.
// 입력 titles 는 이미 연재 캘린더 대상(웹툰·연재중·updateDays 보유)으로 필터된 목록을 기대한다.
export function groupByWeekday(titles: Title[]): Title[][] {
  return WEEK_DAYS.map((day) =>
    titles
      .filter((t) => t.updateDays!.includes(day))
      .sort((a, b) => b.stats.views - a.stats.views)
  );
}
