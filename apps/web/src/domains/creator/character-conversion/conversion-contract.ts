/** A prepared conversion is not completed AI inference. */
export const CHARACTER_VIEWS = ["front", "left", "back", "right"] as const;
export type CharacterView = typeof CHARACTER_VIEWS[number];
export const VIEW_LABELS: Record<CharacterView, string> = { front: "정면", left: "왼쪽", back: "후면", right: "오른쪽" };
export const CONVERSION_STYLES = {
  webtoon: { label: "컬러 웹툰", prompt: "clean Korean webtoon illustration, expressive linework, controlled cel shading" },
  anime: { label: "애니 셀", prompt: "2D anime character, crisp keyframe, two-tone cel shading, clean silhouette" },
  ink: { label: "흑백 만화", prompt: "black and white manga illustration, expressive ink lineart, screentone shading" },
  watercolor: { label: "수채 일러스트", prompt: "watercolor character illustration, delicate pigment washes, restrained ink outlines" },
} as const;
export type ConversionStyle = keyof typeof CONVERSION_STYLES;
export type ConversionQuality = "draft" | "balanced" | "detail";
export type ShapeEngine = "triposr" | "trellis";
export const QUALITY_PROFILES = {
  draft: { label: "초안", size: 512, meshResolution: 128, steps: 16, trellisSteps: 8, textureSize: 1024 },
  balanced: { label: "균형", size: 768, meshResolution: 256, steps: 28, trellisSteps: 12, textureSize: 1024 },
  detail: { label: "정밀", size: 1024, meshResolution: 384, steps: 36, trellisSteps: 20, textureSize: 2048 },
} as const;
export interface ConversionSettings {
  quality: ConversionQuality; style: ConversionStyle; seed: number; strength: number;
  prompt: string; negative: string; checkpoint: string; controlNet: string; controlStrength: number;
}
export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  quality: "balanced", style: "webtoon", seed: 73, strength: 0.35, prompt: "", negative: "",
  checkpoint: "sd_xl_base_1.0.safetensors", controlNet: "", controlStrength: 0.8,
};
export function isModelFilename(value: string): boolean {
  return value.length > 0 && value.length <= 240 && /^[A-Za-z0-9_./-]+\.safetensors$/u.test(value)
    && !value.startsWith("/") && !value.split("/").some((part) => part === ".." || part === "." || part === "");
}
export function validateConversionSettings(settings: ConversionSettings): void {
  if (!Object.hasOwn(QUALITY_PROFILES, settings.quality) || !Object.hasOwn(CONVERSION_STYLES, settings.style)) throw new Error("지원하지 않는 품질 또는 스타일입니다.");
  if (!Number.isSafeInteger(settings.seed) || settings.seed < 0 || settings.seed > 2_147_483_647) throw new Error("시드는 0~2147483647 정수여야 합니다.");
  if (!Number.isFinite(settings.strength) || settings.strength < 0.15 || settings.strength > 0.75) throw new Error("변환 강도는 0.15~0.75 범위여야 합니다.");
  if (!Number.isFinite(settings.controlStrength) || settings.controlStrength < 0 || settings.controlStrength > 1.5) throw new Error("깊이 제어 강도는 0~1.5 범위여야 합니다.");
  if (typeof settings.prompt !== "string" || settings.prompt.length > 1200 || typeof settings.negative !== "string" || settings.negative.length > 800) throw new Error("프롬프트 길이를 확인해 주세요.");
  if (!isModelFilename(settings.checkpoint) || (settings.controlNet !== "" && !isModelFilename(settings.controlNet))) throw new Error("모델은 설치된 safetensors 파일 이름으로 지정해 주세요.");
}
export interface PreparedCharacterImage {
  view: CharacterView; png: Uint8Array; width: number; height: number; sha256: string; notices: readonly string[];
}
export type RenderPass = "beauty" | "cel" | "depth" | "normal" | "lineart" | "mask";
export const PASS_LABELS: Record<RenderPass, string> = { beauty: "원본 재질", cel: "셀 채색", depth: "깊이 제어", normal: "표면 법선", lineart: "선화", mask: "실루엣" };
export interface CharacterRender { view: CharacterView; passes: Record<RenderPass, Uint8Array> }
export function validateReferenceSet(engine: ShapeEngine, images: readonly PreparedCharacterImage[]): void {
  if (engine !== "triposr" && engine !== "trellis") throw new Error("지원하지 않는 AI 엔진입니다.");
  if (images.length < 1 || images.length > 4 || images[0]?.view !== "front") throw new Error("정면 원화가 필요합니다. 최대 4시점까지 사용할 수 있습니다.");
  if (engine === "triposr" && images.length !== 1) throw new Error("TripoSR은 정면 한 장을 사용합니다. 다중 시점은 TRELLIS를 선택해 주세요.");
  if (new Set(images.map((image) => image.view)).size !== images.length || images.some((image) => !CHARACTER_VIEWS.includes(image.view))) throw new Error("시점이 중복되거나 올바르지 않습니다.");
  if (new Set(images.map((image) => image.sha256)).size !== images.length) throw new Error("동일한 이미지를 다른 시점으로 사용할 수 없습니다. 실제 다른 시점 원화를 넣어 주세요.");
}
