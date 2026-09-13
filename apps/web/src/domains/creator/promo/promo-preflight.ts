import { PROMO_FPS, promoTimeline } from "./promo-model";

import type { PromoProject } from "./promo-model";

export interface PromoPreflightIssue { id: string; severity: "warning" | "error"; message: string; frame?: number }
/** Editorial heuristics, not a quality score or a guarantee about encoded output. */
export function promoPreflight(project: PromoProject): PromoPreflightIssue[] {
  const issues: PromoPreflightIssue[] = [];
  if (!project.panels.length) issues.push({ id: "no-panels", severity: "error", message: "내보내려면 원고 컷을 먼저 추가해 주세요." });
  if (!project.title.trim()) issues.push({ id: "title", severity: "warning", message: "작품 제목이 비어 있어요. 시작 화면과 마지막 카드를 확인하세요." });
  if (!project.cta.trim()) issues.push({ id: "cta", severity: "warning", message: "마지막 2초의 안내 문구가 비어 있어요.", frame: (project.seconds - 2) * PROMO_FPS });
  for (const [index, scene] of promoTimeline(project).entries()) {
    const chars = Array.from(scene.panel.caption.trim());
    const duration = scene.duration / PROMO_FPS;
    if (chars.length / duration > 15) issues.push({ id: `reading-${scene.panel.id}`, severity: "warning", frame: scene.from, message: `컷 ${index + 1}: ${chars.length}자를 ${duration.toFixed(1)}초에 보여줘요. 자막을 줄이거나 상대 길이를 늘려 주세요. (편집 권장 기준: 초당 15자)` });
    const units = chars.reduce((sum, char) => sum + (/^[\x20-\x7e]$/u.test(char) ? 0.6 : 1), 0);
    const limit = project.ratio === "16:9" ? 72 : project.presentation?.safeArea === false ? 45 : 39;
    if (units > limit) issues.push({ id: `caption-${scene.panel.id}`, severity: "warning", frame: scene.from, message: `컷 ${index + 1}: 자막이 3줄 영역에서 잘릴 수 있어요. 미리보기에서 말줄임표를 확인하세요.` });
    if (scene.panel.fit === "cover" || (scene.panel.camera && Math.max(scene.panel.camera.from.zoom, scene.panel.camera.to.zoom) > 1.5)) issues.push({ id: `crop-${scene.panel.id}`, severity: "warning", frame: scene.from + Math.floor(scene.duration / 2), message: `컷 ${index + 1}: 화면 채우기·확대 연출로 얼굴이나 말풍선이 잘리지 않는지 확인하세요.` });
  }
  const voice = project.voiceover;
  if (voice && voice.volume > 0) {
    if (voice.startSec >= project.seconds) issues.push({ id: "voice-outside", severity: "warning", message: "내레이션 시작이 영상 밖에 있어 소리가 나오지 않아요. 시작 시간을 줄여 주세요." });
    else if (voice.startSec + voice.durationSec > project.seconds) issues.push({ id: "voice-trimmed", severity: "warning", message: `내레이션 끝 ${(voice.startSec + voice.durationSec - project.seconds).toFixed(1)}초가 영상 길이를 넘어 잘려요. 시작점이나 전체 길이를 조절해 주세요.` });
  }
  if (!project.audio && !project.voiceover) issues.push({ id: "silent", severity: "warning", message: "현재 무음 영상입니다. 의도한 구성이면 그대로 내보내도 됩니다." });
  return issues;
}
