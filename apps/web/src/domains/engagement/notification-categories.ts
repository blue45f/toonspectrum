import { BellRing, PackageCheck, Sparkles, Store, Users, Workflow } from "lucide-react";

import type { EngagementNotificationCategory } from "./engagement-model";

/** 알림 종류별 표시 메타 — 알림 센터(카드·빈 상태)와 알림 설정 페이지가 함께 쓴다. */
export const NOTIFICATION_CATEGORY_META: Record<EngagementNotificationCategory, {
  readonly label: string;
  readonly icon: typeof BellRing;
  readonly description: string;
}> = {
  release: { label: "연재", icon: Sparkles, description: "구독 작품의 연재일 알림" },
  availability: { label: "가격·제공처", icon: PackageCheck, description: "제공처·이용 방식 변화" },
  production: { label: "제작", icon: Workflow, description: "마감·검수·인수인계" },
  market: { label: "마켓", icon: Store, description: "소재 업데이트·권리 변경" },
  community: { label: "커뮤니티", icon: Users, description: "팔로우·댓글·리스트 반응" },
  system: { label: "서비스", icon: BellRing, description: "공지·점검·정책 안내" },
};

export const NOTIFICATION_CATEGORY_ORDER: readonly EngagementNotificationCategory[] = [
  "release",
  "availability",
  "production",
  "market",
  "community",
  "system",
];
