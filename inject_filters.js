const fs = require('fs');
const file = '/Users/hjunkim/WebstormProjects/toonspectrum/src/domains/creator/studio-advanced-pixel-filters.ts';
let content = fs.readFileSync(file, 'utf8');

const types = `
export type StudioPosterize = {
  /** Number of color levels per channel, 2..256. */
  levels: number;
};

export type StudioEdgeDetect = {
  mode: "sobel" | "prewitt";
  /** 0..255 minimum edge magnitude. */
  threshold: number;
  invert: boolean;
};

export type StudioHistogramEqualize = {
  /** 0..1 blend with the original image. */
  strength: number;
};
`;

const defaults = `
const DEFAULT_POSTERIZE: StudioPosterize = { levels: 256 };
const DEFAULT_EDGE_DETECT: StudioEdgeDetect = { mode: "sobel", threshold: 0, invert: false };
const DEFAULT_HISTOGRAM_EQUALIZE: StudioHistogramEqualize = { strength: 0 };
`;

const normalizers = `
export function normalizeStudioPosterize(value?: unknown): StudioPosterize {
  const source = asRecord(value);
  return {
    levels: clampInteger(source.levels, 2, 256, DEFAULT_POSTERIZE.levels),
  };
}

export function isIdentityStudioPosterize(value?: unknown): boolean {
  return normalizeStudioPosterize(value).levels === 256;
}

export function normalizeStudioEdgeDetect(value?: unknown): StudioEdgeDetect {
  const source = asRecord(value);
  return {
    mode: source.mode === "prewitt" ? "prewitt" : DEFAULT_EDGE_DETECT.mode,
    threshold: clamp(finite(source.threshold, DEFAULT_EDGE_DETECT.threshold), 0, 255),
    invert: Boolean(source.invert ?? DEFAULT_EDGE_DETECT.invert),
  };
}

export function isIdentityStudioEdgeDetect(value?: unknown): boolean {
  return false;
}

export function normalizeStudioHistogramEqualize(value?: unknown): StudioHistogramEqualize {
  const source = asRecord(value);
  return {
    strength: clamp(finite(source.strength, DEFAULT_HISTOGRAM_EQUALIZE.strength), 0, 1),
  };
}

export function isIdentityStudioHistogramEqualize(value?: unknown): boolean {
  return normalizeStudioHistogramEqualize(value).strength === 0;
}
`;

const applyAndAdapters = `
export function applyStudioPosterize(image: StudioImageDataLike, value: StudioPosterize): void {
  const normalized = normalizeStudioPosterize(value);
  if (isIdentityStudioPosterize(normalized)) return;
  const levels = normalized.levels;
  const step = 255 / (levels - 1);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[index + channel] = Math.round(data[index + channel]! / 255 * (levels - 1)) * step;
    }
  }
}

export function applyStudioEdgeDetect(image: StudioImageDataLike, value: StudioEdgeDetect): void {
  const normalized = normalizeStudioEdgeDetect(value);
  const { data, width, height } = image;
  const isSobel = normalized.mode === "sobel";
  
  const kx = isSobel ? [-1, 0, 1, -2, 0, 2, -1, 0, 1] : [-1, 0, 1, -1, 0, 1, -1, 0, 1];
  const ky = isSobel ? [-1, -2, -1, 0, 0, 0, 1, 2, 1] : [-1, -1, -1, 0, 0, 0, 1, 1, 1];

  withStudioFilterScratchBuffer(data.length, (source) => {
    source.set(data);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const targetIndex = (y * width + x) * 4;
        let sumX = 0;
        let sumY = 0;
        
        for (let kernelY = 0; kernelY < 3; kernelY += 1) {
          const sourceY = clamp(y + kernelY - 1, 0, height - 1);
          for (let kernelX = 0; kernelX < 3; kernelX += 1) {
            const sourceX = clamp(x + kernelX - 1, 0, width - 1);
            const sourceIndex = (sourceY * width + sourceX) * 4;
            const luminance = source[sourceIndex]! * 0.299 + source[sourceIndex + 1]! * 0.587 + source[sourceIndex + 2]! * 0.114;
            const weightIndex = kernelY * 3 + kernelX;
            sumX += luminance * kx[weightIndex]!;
            sumY += luminance * ky[weightIndex]!;
          }
        }
        
        const magnitude = Math.sqrt(sumX * sumX + sumY * sumY);
        let edgeValue = magnitude >= normalized.threshold ? magnitude : 0;
        if (normalized.invert) edgeValue = 255 - edgeValue;
        const finalValue = clamp(edgeValue, 0, 255);
        
        data[targetIndex] = finalValue;
        data[targetIndex + 1] = finalValue;
        data[targetIndex + 2] = finalValue;
      }
    }
  });
}

export function applyStudioHistogramEqualize(image: StudioImageDataLike, value: StudioHistogramEqualize): void {
  const normalized = normalizeStudioHistogramEqualize(value);
  if (isIdentityStudioHistogramEqualize(normalized)) return;
  const { data, width, height } = image;
  const pixelCount = width * height;
  
  const histogram = new Int32Array(256);
  const luminanceData = new Uint8Array(pixelCount);
  
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const luminance = Math.round(data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114);
    luminanceData[i] = luminance;
    histogram[luminance]!++;
  }
  
  const cdf = new Int32Array(256);
  let cumulative = 0;
  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i]!;
    cdf[i] = cumulative;
  }
  
  let cdfMin = 0;
  for (let i = 0; i < 256; i++) {
    if (cdf[i]! > 0) {
      cdfMin = cdf[i]!;
      break;
    }
  }
  
  const denom = pixelCount - cdfMin;
  const equalizedLuminance = new Uint8Array(256);
  if (denom > 0) {
    for (let i = 0; i < 256; i++) {
      equalizedLuminance[i] = Math.round(((cdf[i]! - cdfMin) / denom) * 255);
    }
  } else {
    for (let i = 0; i < 256; i++) {
      equalizedLuminance[i] = i;
    }
  }

  const strength = normalized.strength;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const oldLuminance = luminanceData[i]!;
    const newLuminance = equalizedLuminance[oldLuminance]!;
    const ratio = oldLuminance > 0 ? newLuminance / oldLuminance : 0;
    
    for (let channel = 0; channel < 3; channel += 1) {
      const v = data[idx + channel]!;
      data[idx + channel] = clamp(v + (v * ratio - v) * strength, 0, 255);
    }
  }
}

export function posterizeKonvaFilter(this: FilterThis, image: StudioImageDataLike): void {
  applyStudioPosterize(image, normalizeStudioPosterize({
    levels: this.attrs?.posterizeLevels,
  }));
}

export function edgeDetectKonvaFilter(this: FilterThis, image: StudioImageDataLike): void {
  applyStudioEdgeDetect(image, normalizeStudioEdgeDetect({
    mode: this.attrs?.edgeDetectMode,
    threshold: this.attrs?.edgeDetectThreshold,
    invert: this.attrs?.edgeDetectInvert,
  }));
}

export function histogramEqualizeKonvaFilter(this: FilterThis, image: StudioImageDataLike): void {
  applyStudioHistogramEqualize(image, normalizeStudioHistogramEqualize({
    strength: this.attrs?.histogramEqualizeStrength,
  }));
}
`;

content = content.replace(
  'export type StudioClouds = {',
  types + '\nexport type StudioClouds = {'
);

content = content.replace(
  'const DEFAULT_CLOUDS: StudioClouds = {',
  defaults + '\nconst DEFAULT_CLOUDS: StudioClouds = {'
);

content = content.replace(
  'export function normalizeStudioClouds',
  normalizers + '\nexport function normalizeStudioClouds'
);

content = content + '\n' + applyAndAdapters + '\n';

fs.writeFileSync(file, content, 'utf8');
console.log('Filters injected.');
