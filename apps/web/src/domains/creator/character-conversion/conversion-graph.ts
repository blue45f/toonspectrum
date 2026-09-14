import { CONVERSION_STYLES, QUALITY_PROFILES, validateConversionSettings, type CharacterView, type ConversionSettings } from "./conversion-contract";

export type CharacterGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
/** Native ComfyUI nodes only. Model filenames are explicit, never URLs or partner APIs. */
export function buildCharacterImageGraph(settings: ConversionSettings, view: CharacterView): CharacterGraph {
  validateConversionSettings(settings);
  const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
  const graph: CharacterGraph = {
    "1": node("CheckpointLoaderSimple", { ckpt_name: settings.checkpoint }),
    "2": node("LoadImage", { image: `input/${view}.png` }),
    "3": node("VAEEncode", { pixels: ["2", 0], vae: ["1", 2] }),
    "4": node("CLIPTextEncode", { clip: ["1", 1], text: `${CONVERSION_STYLES[settings.style].prompt}. Preserve the reference character's face, outfit, silhouette, pose, proportions and framing. ${settings.prompt}` }),
    "5": node("CLIPTextEncode", { clip: ["1", 1], text: `photorealistic, 3D render, extra limbs, changed clothing, altered face, watermark, text, ${settings.negative}` }),
    "6": node("KSampler", { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], latent_image: ["3", 0], seed: settings.seed, steps: QUALITY_PROFILES[settings.quality].steps, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: settings.strength }),
    "7": node("VAEDecode", { samples: ["6", 0], vae: ["1", 2] }),
    "8": node("SaveImage", { images: ["7", 0], filename_prefix: `toonstudio-character/${view}` }),
  };
  if (settings.controlNet) {
    graph["9"] = node("ControlNetLoader", { control_net_name: settings.controlNet });
    graph["10"] = node("LoadImage", { image: `depth/${view}.png` });
    graph["11"] = node("ControlNetApplyAdvanced", { positive: ["4", 0], negative: ["5", 0], control_net: ["9", 0], image: ["10", 0], strength: settings.controlStrength, start_percent: 0, end_percent: 0.85 });
    graph["6"].inputs.positive = ["11", 0]; graph["6"].inputs.negative = ["11", 1];
  }
  return graph;
}
