import type { RatingScale } from "@/lib/store";

// 0~5(store) → 표시 스케일
export function toScale(v: number, scale: RatingScale): string {
  if (scale === "ten") return (v * 2).toFixed(1).replace(/\.0$/, "");
  if (scale === "hundred") return String(Math.round(v * 20));
  return v.toFixed(1);
}
export function scaleMax(scale: RatingScale): string {
  return scale === "ten" ? "10" : scale === "hundred" ? "100" : "5";
}
