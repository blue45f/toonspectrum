import type { FanCafePostKind } from "@/shared/lib/types";

export const KIND_LABEL: Record<FanCafePostKind, string> = {
  talk: "잡담",
  theory: "해석",
  fanart: "팬아트",
  cosplay: "코스프레",
  event: "행사 · 모임",
  cheer: "응원",
};
