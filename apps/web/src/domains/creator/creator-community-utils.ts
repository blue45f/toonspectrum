import type { SeriesStatus, WorkSummary } from "@/infrastructure/creator-client";

export const FORMAT_LABEL: Record<WorkSummary["format"], string> = {
  cuttoon: "컷툰",
  upload: "업로드",
};

export const SERIES_STATUS_LABEL: Record<SeriesStatus, string> = {
  ongoing: "연재중",
  hiatus: "휴재",
  completed: "완결",
};

export const SERIES_STATUS_CLASS: Record<SeriesStatus, string> = {
  ongoing: "border-[color:oklch(0.8_0.15_150/0.3)] bg-[oklch(0.8_0.15_150/0.12)] text-good",
  hiatus: "border-warn/35 bg-warn/10 text-warn",
  completed: "border-line bg-raised text-fg-2",
};
