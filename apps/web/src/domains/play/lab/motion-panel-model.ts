import type { ComicMood } from "@/shared/components/comic/comic-cast";

export const MOTION_PRESETS = [
  { id: "focus", label: "주인공 클로즈업", description: "조금씩 다가가며 표정에 집중해요.", sfx: "두근!" },
  { id: "pan", label: "장면 따라가기", description: "옆으로 이동하며 배경의 단서를 발견해요.", sfx: "스윽—" },
  { id: "reveal", label: "반전 드러내기", description: "가까운 장면에서 시작해 전체 모습을 보여 줘요.", sfx: "짜잔!" },
  { id: "rest", label: "여백과 호흡", description: "작은 움직임만으로 조용한 여운을 남겨요.", sfx: "후우—" },
] as const;
export type MotionPresetId = (typeof MOTION_PRESETS)[number]["id"];
export const MOTION_DURATION = 5000;
export function motionPreset(value: unknown) { return MOTION_PRESETS.find((p) => p.id === value) ?? MOTION_PRESETS[0]; }
export function motionProgress(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
export function cameraTransform(preset: MotionPresetId, progress: number): string {
  const t = motionProgress(progress); const ease = t * t * (3 - 2 * t);
  const scale = preset === "focus" ? 1 + ease * .13 : preset === "reveal" ? 1.16 - ease * .16 : preset === "pan" ? 1.14 : 1.03 + Math.sin(t * Math.PI) * .015;
  const dx = preset === "pan" ? (ease - .5) * 100 : 0;
  const dy = preset === "rest" ? -Math.sin(t * Math.PI) * 5 : 0;
  return `translate(${480 + dx} ${300 + dy}) scale(${scale}) translate(-480 -300)`;
}
export function cleanMotionCaption(value: string): string { return Array.from(value).slice(0, 60).map((char) => { const code = char.codePointAt(0)!; return code < 32 || code === 127 ? " " : char; }).join(""); }
export function motionCaptionLines(value: string): string[] {
  const chars = Array.from(cleanMotionCaption(value));
  return [0, 20, 40].map((offset) => chars.slice(offset, offset + 20).join("")).filter(Boolean);
}
export function motionMoodDefaults(mood: ComicMood): { preset: MotionPresetId; caption: string } {
  const defaults: Record<ComicMood, { preset: MotionPresetId; caption: string }> = { heart: { preset: "focus", caption: "우리의 다음 대사는, 서로에게 물어보기로 했다." }, quest: { preset: "reveal", caption: "오늘의 퀘스트: 거창한 결심 대신, 작은 한 걸음." }, rest: { preset: "rest", caption: "잠깐 쉬어 가는 컷도, 내 이야기의 일부니까." }, spark: { preset: "pan", caption: "그날의 작은 낙서가, 새로운 이야기의 시작이었다." } };
  return defaults[mood];
}
export const MOTION_IMAGE_BYTES = 8 * 1024 * 1024;
export const MOTION_IMAGE_PIXELS = 16_000_000;
export function motionImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([82, 73, 70, 70].every((v, i) => bytes[i] === v) && [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v)) return "image/webp";
  return null;
}
