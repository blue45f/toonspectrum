import type { SkiaDocumentFontSource } from "@toonspectrum/studio-engine-skia";
import {
  buildGoogleFontCss2Url,
  findStudioGoogleFont,
  firstFontFamilyName,
} from "../studio-google-fonts";
import {
  buildStudioPresetFontsCss2Url,
  findStudioPresetFont,
} from "../studio-preset-font-loading";

export const STUDIO_SKIA_PRETENDARD_FONT_URL = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2";

function cssFontSource(
  family: string,
  url: string,
): SkiaDocumentFontSource {
  return { key: `css:${url}`, family };
}

export function resolveStudioSkiaDocumentFontSource(
  cssValue: string | null | undefined,
  weight: 400 | 700,
): SkiaDocumentFontSource {
  const family = firstFontFamilyName(cssValue || "Pretendard") || "Pretendard";
  if (["pretendard", "pretendard variable"].includes(family.toLowerCase())) {
    return {
      key: `font:${STUDIO_SKIA_PRETENDARD_FONT_URL}`,
      family: "Pretendard",
    };
  }
  const google = findStudioGoogleFont(family);
  if (google) {
    const requested = google.weights.includes(weight)
      ? weight
      : google.weights.includes(400) ? 400 : google.weights[0]!;
    return cssFontSource(family, buildGoogleFontCss2Url(family, [requested]));
  }
  const preset = findStudioPresetFont(family);
  if (preset) {
    const requested = preset.weights?.includes(weight)
      ? weight
      : preset.weights?.includes(400) ? 400 : preset.weights?.[0];
    const url = buildStudioPresetFontsCss2Url([{
      family: preset.family,
      ...(requested ? { weights: [requested] } : {}),
    }]);
    if (url) return cssFontSource(family, url);
  }
  return { key: `custom:${family}`, family };
}
