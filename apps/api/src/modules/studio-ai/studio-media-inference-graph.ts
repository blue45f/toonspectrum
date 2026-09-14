/** Fixed, auditable native ComfyUI graphs. Clients cannot submit nodes, paths, URLs or models. */
export type MediaInferenceKind = "image-to-video" | "image-to-3d" | "render-to-2d";
export type MediaGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export interface MediaInferenceInput {
  kind: MediaInferenceKind;
  image: string;
  prompt: string;
  negative: string;
  seed: number;
  frames: 49 | 81 | 121;
  aspect: "landscape" | "portrait" | "square";
  strength: number;
}
export interface MediaInferenceModels { wan: string; text: string; vae: string; shape: string; image: string }
export const DEFAULT_MEDIA_MODELS: MediaInferenceModels = {
  wan: "wan2.2_ti2v_5B_fp16.safetensors", text: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vae: "wan2.2_vae.safetensors", shape: "hunyuan3d-dit-v2-mv.safetensors", image: "sd_xl_base_1.0.safetensors",
};
export function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
export function parseMediaInferenceInput(value: unknown): MediaInferenceInput {
  if (!record(value)) throw new Error("입력 형식이 올바르지 않아요.");
  const { kind, image } = value;
  if (typeof kind !== "string" || !["image-to-video", "image-to-3d", "render-to-2d"].includes(kind)) throw new Error("지원하지 않는 변환이에요.");
  if (typeof image !== "string" || image.length > 5_600_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(image)) throw new Error("4MB 이하 PNG 이미지가 필요해요.");
  const prompt = value.prompt ?? ""; const negative = value.negative ?? "";
  if (typeof prompt !== "string" || prompt.length > 2000 || typeof negative !== "string" || negative.length > 1000) throw new Error("설명이 너무 길거나 올바르지 않아요.");
  const seed = value.seed ?? 42; const frames = value.frames ?? 81; const aspect = value.aspect ?? "landscape"; const strength = value.strength ?? 0.45;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > 2_147_483_647) throw new Error("시드는 0~2147483647 정수여야 해요.");
  if (![49, 81, 121].includes(Number(frames)) || typeof frames !== "number") throw new Error("지원하지 않는 프레임 수예요.");
  if (typeof aspect !== "string" || !["landscape", "portrait", "square"].includes(aspect)) throw new Error("지원하지 않는 화면 비율이에요.");
  if (typeof strength !== "number" || !Number.isFinite(strength) || strength < .15 || strength > .8) throw new Error("변환 강도는 0.15~0.8이어야 해요.");
  return { kind: kind as MediaInferenceKind, image, prompt, negative, seed, frames: frames as 49 | 81 | 121, aspect: aspect as MediaInferenceInput["aspect"], strength };
}
export function buildMediaInferenceGraph(input: MediaInferenceInput, filename: string, jobId: string, models: MediaInferenceModels): MediaGraph {
  if (!/^[a-f0-9-]{36}\.png$/u.test(filename) || !/^[a-f0-9-]{36}$/u.test(jobId)) throw new Error("Invalid internally generated identity");
  const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
  const image = node("LoadImage", { image: filename });
  const prefix = `toonstudio/${jobId}/result`;
  if (input.kind === "image-to-video") {
    const [width, height] = input.aspect === "portrait" ? [480, 832] : input.aspect === "square" ? [640, 640] : [832, 480];
    return {
      "1": node("UNETLoader", { unet_name: models.wan, weight_dtype: "default" }),
      "2": node("CLIPLoader", { clip_name: models.text, type: "wan", device: "default" }),
      "3": node("VAELoader", { vae_name: models.vae }), "4": image,
      "5": node("CLIPTextEncode", { clip: ["2", 0], text: `${input.prompt}. Preserve the reference character, face, outfit and panel composition. Coherent subtle character movement, clean drawn animation, no new text.` }),
      "6": node("CLIPTextEncode", { clip: ["2", 0], text: `deformed limbs, identity change, flicker, watermark, subtitles, blurry, ${input.negative}` }),
      "7": node("Wan22ImageToVideoLatent", { vae: ["3", 0], start_image: ["4", 0], width, height, length: input.frames, batch_size: 1 }),
      "8": node("ModelSamplingSD3", { model: ["1", 0], shift: 8 }),
      "9": node("KSampler", { model: ["8", 0], positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], seed: input.seed, steps: 20, cfg: 5, sampler_name: "uni_pc", scheduler: "simple", denoise: 1 }),
      "10": node("VAEDecode", { samples: ["9", 0], vae: ["3", 0] }),
      "11": node("SaveWEBM", { images: ["10", 0], filename_prefix: prefix, codec: "vp9", fps: 24, crf: 20 }),
    };
  }
  if (input.kind === "image-to-3d") {
    return {
      "1": node("ImageOnlyCheckpointLoader", { ckpt_name: models.shape }), "2": image,
      "3": node("CLIPVisionEncode", { clip_vision: ["1", 1], image: ["2", 0], crop: "center" }),
      "4": node("Hunyuan3Dv2ConditioningMultiView", { front: ["3", 0] }),
      "5": node("EmptyLatentHunyuan3Dv2", { resolution: 3072, batch_size: 1 }),
      "6": node("KSampler", { model: ["1", 0], positive: ["4", 0], negative: ["4", 1], latent_image: ["5", 0], seed: input.seed, steps: 30, cfg: 5, sampler_name: "euler", scheduler: "simple", denoise: 1 }),
      "7": node("VAEDecodeHunyuan3D", { samples: ["6", 0], vae: ["1", 2], num_chunks: 8000, octree_resolution: 256 }),
      "8": node("VoxelToMesh", { voxel: ["7", 0], algorithm: "surface net", threshold: .6 }),
      "9": node("SaveGLB", { mesh: ["8", 0], filename_prefix: prefix }),
    };
  }
  return {
    "1": node("CheckpointLoaderSimple", { ckpt_name: models.image }), "2": image,
    "3": node("VAEEncode", { pixels: ["2", 0], vae: ["1", 2] }),
    "4": node("CLIPTextEncode", { clip: ["1", 1], text: `2D webtoon character illustration, clean lineart, cel shading. Keep the reference pose, silhouette, proportions and framing. ${input.prompt}` }),
    "5": node("CLIPTextEncode", { clip: ["1", 1], text: `3d render, photorealistic, watermark, altered anatomy, extra fingers, ${input.negative}` }),
    "6": node("KSampler", { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["3", 0], seed: input.seed, steps: 28, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: input.strength }),
    "7": node("VAEDecode", { samples: ["6", 0], vae: ["1", 2] }),
    "8": node("SaveImage", { images: ["7", 0], filename_prefix: prefix }),
  };
}
/** Reject absent nodes/models before uploading artwork or consuming GPU time. */
export function mediaGraphAvailability(graph: MediaGraph, objectInfo: unknown): string[] {
  if (!record(objectInfo)) return ["ComfyUI 노드 정보를 확인하지 못했어요."];
  const missing = new Set<string>();
  for (const node of Object.values(graph)) {
    const schema = objectInfo[node.class_type];
    if (!record(schema)) { missing.add(node.class_type); continue; }
    const input = record(schema.input) ? schema.input : {};
    const required = record(input.required) ? input.required : {};
    const optional = record(input.optional) ? input.optional : {};
    for (const key of Object.keys(required)) if (!(key in node.inputs)) missing.add(`${node.class_type}.${key}`);
    for (const key of ["ckpt_name", "unet_name", "clip_name", "vae_name"]) {
      if (!(key in node.inputs)) continue;
      const spec = required[key] ?? optional[key];
      const options = Array.isArray(spec) ? spec[0] : undefined;
      if (!Array.isArray(options) || !options.includes(node.inputs[key])) missing.add(`${node.class_type}: ${String(node.inputs[key])}`);
    }
  }
  return [...missing];
}
