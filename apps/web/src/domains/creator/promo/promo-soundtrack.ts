export type PromoSoundtrack = "ambient" | "pulse" | "suspense";
/** Original procedural synthesis; no samples, external services, or licensed stock music. */
export function createPromoSoundtrack(seconds: number, style: PromoSoundtrack): ArrayBuffer {
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new Error("사운드트랙 길이는 1~60초여야 합니다.");
  const rate = 16000;
  const count = Math.ceil(seconds * rate);
  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const ascii = (at: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(at + i, value.charCodeAt(i)); };
  ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, count * 2, true);
  const roots = style === "suspense" ? [110, 103.826, 110, 116.541] : [130.813, 110, 174.614, 146.832];
  for (let index = 0; index < count; index += 1) {
    const t = index / rate;
    const chordLength = 4;
    const chordTime = t % chordLength;
    const root = roots[Math.floor(t / chordLength) % roots.length]!;
    const edge = Math.min(1, chordTime / 0.15, (chordLength - chordTime) / 0.15);
    const envelope = Math.max(0, Math.min(1, t, (count - 1 - index) / rate)) * edge;
    const pulse = style === "pulse" ? 0.25 + 0.75 * Math.exp(-(t % 0.5) * 10) : 0.85;
    const pad = Math.sin(2 * Math.PI * root * t) * 0.24 + Math.sin(2 * Math.PI * root * 1.5 * t) * 0.12 + Math.sin(2 * Math.PI * root * (style === "suspense" ? 1.06 : 1.25) * t) * 0.07;
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, pad * envelope * pulse)) * 32767), true);
  }
  return bytes;
}
