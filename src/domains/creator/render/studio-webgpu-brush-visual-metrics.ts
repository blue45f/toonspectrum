/** Deterministic visual, continuity and texture metrics for RGBA16F brush surfaces. */

export interface StudioWebGpuBrushPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioWebGpuBrushFrequencyMetrics {
  readonly low: number;
  readonly mid: number;
  readonly high: number;
  readonly highFrequencyRatio: number;
  readonly repetitionPeak: number;
  readonly repetitionOffset: readonly [number, number];
}

export interface StudioWebGpuBrushVisualMetrics {
  readonly width: number;
  readonly height: number;
  readonly threshold: number;
  readonly coveredPixels: number;
  readonly coverageRatio: number;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  readonly centroid: Readonly<{ x: number; y: number }> | null;
  readonly alphaMean: number;
  readonly alphaStdDev: number;
  readonly alphaEntropyBits: number;
  readonly componentCount: number;
  readonly largestComponentRatio: number;
  readonly centerlineCoverageRatio: number | null;
  readonly centerlineMaximumGap: number | null;
  readonly thicknessMean: number | null;
  readonly thicknessStdDev: number | null;
  readonly thicknessCoefficientOfVariation: number | null;
  readonly thicknessMinimum: number | null;
  readonly thicknessMaximum: number | null;
  readonly localContrast: number;
  readonly laplacianEnergy: number;
  readonly frequency: StudioWebGpuBrushFrequencyMetrics;
}

export interface StudioWebGpuBrushVisualComparison {
  readonly comparedHalfWords: number;
  readonly exactHalfWordMismatches: number;
  readonly maximumAbsoluteHalfWordDelta: number;
  readonly floatMeanAbsoluteError: number;
  readonly floatRootMeanSquareError: number;
  readonly peakSignalToNoiseRatio: number | null;
  readonly alphaStructuralSimilarity: number;
}

export interface StudioWebGpuBrushAlphaMonotonicity {
  readonly comparedPixels: number;
  readonly decreasedPixels: number;
  readonly maximumDecrease: number;
  readonly meanDecrease: number;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function rounded(value: number, digits = 8): number {
  return Number(finite(value).toFixed(digits));
}

export function studioWebGpuFloat16ToNumber(bits: number): number {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  }
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

export function studioWebGpuDecodeRgba16F(words: Uint16Array): Float32Array {
  const decoded = new Float32Array(words.length);
  for (let index = 0; index < words.length; index += 1) {
    decoded[index] = studioWebGpuFloat16ToNumber(words[index]!);
  }
  return decoded;
}

function alphaPlane(words: Uint16Array, width: number, height: number): Float32Array {
  if (words.length !== width * height * 4) {
    throw new RangeError("rgba16f-size-mismatch");
  }
  const alpha = new Float32Array(width * height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    alpha[pixel] = Math.max(0, Math.min(1, studioWebGpuFloat16ToNumber(words[pixel * 4 + 3]!)));
  }
  return alpha;
}

function connectedComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let count = 0;
  let largest = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] !== 0) continue;
    count += 1;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++]!;
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) {
        const next = index - 1;
        if (mask[next] !== 0 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (x + 1 < width) {
        const next = index + 1;
        if (mask[next] !== 0 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y > 0) {
        const next = index - width;
        if (mask[next] !== 0 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (y + 1 < height) {
        const next = index + width;
        if (mask[next] !== 0 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return { count, largest };
}

function chamferDistance(mask: Uint8Array, width: number, height: number): Float32Array {
  const infinity = width + height + 1;
  const distance = new Float32Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    distance[index] = mask[index] === 0 ? 0 : infinity;
  }
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let value = distance[index]!;
      if (x > 0) value = Math.min(value, distance[index - 1]! + 1);
      if (y > 0) value = Math.min(value, distance[index - width]! + 1);
      if (x > 0 && y > 0) value = Math.min(value, distance[index - width - 1]! + diagonal);
      if (x + 1 < width && y > 0) value = Math.min(value, distance[index - width + 1]! + diagonal);
      distance[index] = value;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let value = distance[index]!;
      if (x + 1 < width) value = Math.min(value, distance[index + 1]! + 1);
      if (y + 1 < height) value = Math.min(value, distance[index + width]! + 1);
      if (x + 1 < width && y + 1 < height) value = Math.min(value, distance[index + width + 1]! + diagonal);
      if (x > 0 && y + 1 < height) value = Math.min(value, distance[index + width - 1]! + diagonal);
      distance[index] = value;
    }
  }
  return distance;
}

function bilinearSample(values: Float32Array, width: number, height: number, x: number, y: number): number {
  const safeX = Math.min(width - 1, Math.max(0, x));
  const safeY = Math.min(height - 1, Math.max(0, y));
  const x0 = Math.floor(safeX);
  const y0 = Math.floor(safeY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = safeX - x0;
  const ty = safeY - y0;
  const top = values[y0 * width + x0]! * (1 - tx) + values[y0 * width + x1]! * tx;
  const bottom = values[y1 * width + x0]! * (1 - tx) + values[y1 * width + x1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

function frequencyMetrics(alpha: Float32Array, width: number, height: number): StudioWebGpuBrushFrequencyMetrics {
  const size = 16;
  const sample = new Float64Array(size * size);
  let mean = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = bilinearSample(
        alpha,
        width,
        height,
        (x + 0.5) * width / size - 0.5,
        (y + 0.5) * height / size - 0.5,
      );
      sample[y * size + x] = value;
      mean += value;
    }
  }
  mean /= sample.length;
  for (let index = 0; index < sample.length; index += 1) sample[index] -= mean;
  let low = 0;
  let mid = 0;
  let high = 0;
  for (let v = 0; v < size; v += 1) {
    const fy = Math.min(v, size - v);
    for (let u = 0; u < size; u += 1) {
      const fx = Math.min(u, size - u);
      const radius = Math.hypot(fx, fy);
      if (radius === 0) continue;
      let real = 0;
      let imaginary = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const phase = -2 * Math.PI * (u * x + v * y) / size;
          const value = sample[y * size + x]!;
          real += value * Math.cos(phase);
          imaginary += value * Math.sin(phase);
        }
      }
      const energy = real * real + imaginary * imaginary;
      if (radius <= 2.5) low += energy;
      else if (radius <= 5.5) mid += energy;
      else high += energy;
    }
  }
  const total = low + mid + high;
  let repetitionPeak = 0;
  let repetitionOffset: [number, number] = [0, 0];
  let variance = 0;
  for (const value of sample) variance += value * value;
  if (variance > 0) {
    for (let dy = 0; dy <= 8; dy += 1) {
      for (let dx = dy === 0 ? 1 : -8; dx <= 8; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) < 2) continue;
        let dot = 0;
        let leftEnergy = 0;
        let rightEnergy = 0;
        for (let y = 0; y < size; y += 1) {
          const otherY = y + dy;
          if (otherY < 0 || otherY >= size) continue;
          for (let x = 0; x < size; x += 1) {
            const otherX = x + dx;
            if (otherX < 0 || otherX >= size) continue;
            const left = sample[y * size + x]!;
            const right = sample[otherY * size + otherX]!;
            dot += left * right;
            leftEnergy += left * left;
            rightEnergy += right * right;
          }
        }
        const correlation = leftEnergy > 0 && rightEnergy > 0
          ? Math.abs(dot / Math.sqrt(leftEnergy * rightEnergy))
          : 0;
        if (correlation > repetitionPeak) {
          repetitionPeak = correlation;
          repetitionOffset = [dx, dy];
        }
      }
    }
  }
  return Object.freeze({
    low: rounded(low, 6),
    mid: rounded(mid, 6),
    high: rounded(high, 6),
    highFrequencyRatio: rounded(total > 0 ? high / total : 0),
    repetitionPeak: rounded(repetitionPeak),
    repetitionOffset: Object.freeze(repetitionOffset),
  });
}

export function analyzeStudioWebGpuBrushRgba16F(
  words: Uint16Array,
  width: number,
  height: number,
  centerline: readonly StudioWebGpuBrushPoint[] = [],
  threshold = 1 / 255,
): StudioWebGpuBrushVisualMetrics {
  const alpha = alphaPlane(words, width, height);
  const mask = new Uint8Array(alpha.length);
  let coveredPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let weightedX = 0;
  let weightedY = 0;
  let alphaSum = 0;
  let alphaSquaredSum = 0;
  const histogram = new Uint32Array(64);
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index]!;
    alphaSum += value;
    alphaSquaredSum += value * value;
    histogram[Math.min(63, Math.floor(value * 64))] += 1;
    if (value < threshold) continue;
    mask[index] = 1;
    coveredPixels += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    weightedX += x * value;
    weightedY += y * value;
  }
  const alphaMean = alphaSum / alpha.length;
  const alphaVariance = Math.max(0, alphaSquaredSum / alpha.length - alphaMean * alphaMean);
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const probability = count / alpha.length;
    entropy -= probability * Math.log2(probability);
  }
  const components = connectedComponents(mask, width, height);
  let centerlineCovered = 0;
  let currentGap = 0;
  let maximumGap = 0;
  const distance = centerline.length > 0 ? chamferDistance(mask, width, height) : null;
  const thickness: number[] = [];
  for (const point of centerline) {
    const sample = bilinearSample(alpha, width, height, point.x, point.y);
    if (sample >= threshold) {
      centerlineCovered += 1;
      currentGap = 0;
    } else {
      currentGap += 1;
      maximumGap = Math.max(maximumGap, currentGap);
    }
    if (distance) thickness.push(bilinearSample(distance, width, height, point.x, point.y) * 2);
  }
  const thicknessMean = thickness.length > 0
    ? thickness.reduce((total, value) => total + value, 0) / thickness.length
    : null;
  const thicknessVariance = thicknessMean === null
    ? null
    : thickness.reduce((total, value) => total + (value - thicknessMean) ** 2, 0) / thickness.length;
  let localContrastSum = 0;
  let laplacianEnergySum = 0;
  let localSamples = 0;
  for (let y = 1; y + 1 < height; y += 1) {
    for (let x = 1; x + 1 < width; x += 1) {
      const index = y * width + x;
      const center = alpha[index]!;
      const left = alpha[index - 1]!;
      const right = alpha[index + 1]!;
      const top = alpha[index - width]!;
      const bottom = alpha[index + width]!;
      localContrastSum += Math.abs(right - left) + Math.abs(bottom - top);
      const laplacian = left + right + top + bottom - center * 4;
      laplacianEnergySum += laplacian * laplacian;
      localSamples += 1;
    }
  }
  return Object.freeze({
    width,
    height,
    threshold,
    coveredPixels,
    coverageRatio: rounded(coveredPixels / alpha.length),
    bounds: coveredPixels === 0 ? null : Object.freeze({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    }),
    centroid: alphaSum <= 0 ? null : Object.freeze({
      x: rounded(weightedX / alphaSum),
      y: rounded(weightedY / alphaSum),
    }),
    alphaMean: rounded(alphaMean),
    alphaStdDev: rounded(Math.sqrt(alphaVariance)),
    alphaEntropyBits: rounded(entropy),
    componentCount: components.count,
    largestComponentRatio: rounded(coveredPixels > 0 ? components.largest / coveredPixels : 0),
    centerlineCoverageRatio: centerline.length > 0
      ? rounded(centerlineCovered / centerline.length)
      : null,
    centerlineMaximumGap: centerline.length > 0 ? maximumGap : null,
    thicknessMean: thicknessMean === null ? null : rounded(thicknessMean),
    thicknessStdDev: thicknessVariance === null ? null : rounded(Math.sqrt(thicknessVariance)),
    thicknessCoefficientOfVariation:
      thicknessMean === null || thicknessMean <= 0 || thicknessVariance === null
        ? null
        : rounded(Math.sqrt(thicknessVariance) / thicknessMean),
    thicknessMinimum: thickness.length > 0 ? rounded(Math.min(...thickness)) : null,
    thicknessMaximum: thickness.length > 0 ? rounded(Math.max(...thickness)) : null,
    localContrast: rounded(localSamples > 0 ? localContrastSum / localSamples : 0),
    laplacianEnergy: rounded(localSamples > 0 ? laplacianEnergySum / localSamples : 0),
    frequency: frequencyMetrics(alpha, width, height),
  });
}

export function compareStudioWebGpuBrushRgba16F(
  left: Uint16Array,
  right: Uint16Array,
): StudioWebGpuBrushVisualComparison {
  if (left.length !== right.length || left.length % 4 !== 0) {
    throw new RangeError("rgba16f-comparison-size-mismatch");
  }
  let mismatches = 0;
  let maximumWordDelta = 0;
  let absolute = 0;
  let squared = 0;
  let alphaLeftMean = 0;
  let alphaRightMean = 0;
  const alphaCount = left.length / 4;
  const leftAlpha = new Float64Array(alphaCount);
  const rightAlpha = new Float64Array(alphaCount);
  for (let index = 0; index < left.length; index += 1) {
    const wordDelta = Math.abs(left[index]! - right[index]!);
    if (wordDelta !== 0) mismatches += 1;
    maximumWordDelta = Math.max(maximumWordDelta, wordDelta);
    const leftValue = finite(studioWebGpuFloat16ToNumber(left[index]!));
    const rightValue = finite(studioWebGpuFloat16ToNumber(right[index]!));
    const delta = leftValue - rightValue;
    absolute += Math.abs(delta);
    squared += delta * delta;
    if ((index & 3) === 3) {
      const pixel = index >>> 2;
      leftAlpha[pixel] = leftValue;
      rightAlpha[pixel] = rightValue;
      alphaLeftMean += leftValue;
      alphaRightMean += rightValue;
    }
  }
  alphaLeftMean /= alphaCount;
  alphaRightMean /= alphaCount;
  let leftVariance = 0;
  let rightVariance = 0;
  let covariance = 0;
  for (let index = 0; index < alphaCount; index += 1) {
    const leftCentered = leftAlpha[index]! - alphaLeftMean;
    const rightCentered = rightAlpha[index]! - alphaRightMean;
    leftVariance += leftCentered * leftCentered;
    rightVariance += rightCentered * rightCentered;
    covariance += leftCentered * rightCentered;
  }
  leftVariance /= alphaCount;
  rightVariance /= alphaCount;
  covariance /= alphaCount;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const ssim = ((2 * alphaLeftMean * alphaRightMean + c1) * (2 * covariance + c2))
    / ((alphaLeftMean ** 2 + alphaRightMean ** 2 + c1) * (leftVariance + rightVariance + c2));
  const mse = squared / left.length;
  return Object.freeze({
    comparedHalfWords: left.length,
    exactHalfWordMismatches: mismatches,
    maximumAbsoluteHalfWordDelta: maximumWordDelta,
    floatMeanAbsoluteError: rounded(absolute / left.length, 10),
    floatRootMeanSquareError: rounded(Math.sqrt(mse), 10),
    peakSignalToNoiseRatio: mse === 0 ? null : rounded(10 * Math.log10(1 / mse), 6),
    alphaStructuralSimilarity: rounded(ssim, 10),
  });
}

export function compareStudioWebGpuBrushAlphaMonotonicity(
  previous: Uint16Array,
  next: Uint16Array,
): StudioWebGpuBrushAlphaMonotonicity {
  if (previous.length !== next.length || previous.length % 4 !== 0) {
    throw new RangeError("rgba16f-monotonicity-size-mismatch");
  }
  let decreasedPixels = 0;
  let maximumDecrease = 0;
  let totalDecrease = 0;
  const pixelCount = previous.length / 4;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const before = studioWebGpuFloat16ToNumber(previous[pixel * 4 + 3]!);
    const after = studioWebGpuFloat16ToNumber(next[pixel * 4 + 3]!);
    const decrease = before - after;
    if (decrease > 0) {
      decreasedPixels += 1;
      maximumDecrease = Math.max(maximumDecrease, decrease);
      totalDecrease += decrease;
    }
  }
  return Object.freeze({
    comparedPixels: pixelCount,
    decreasedPixels,
    maximumDecrease: rounded(maximumDecrease, 10),
    meanDecrease: rounded(decreasedPixels > 0 ? totalDecrease / decreasedPixels : 0, 10),
  });
}

function linearToSrgb(value: number): number {
  const safe = Math.min(1, Math.max(0, value));
  return safe <= 0.0031308 ? safe * 12.92 : 1.055 * safe ** (1 / 2.4) - 0.055;
}

export function studioWebGpuRgba16FToRgba8(
  words: Uint16Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (words.length !== width * height * 4) throw new RangeError("rgba16f-size-mismatch");
  const output = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const alpha = Math.min(1, Math.max(0, studioWebGpuFloat16ToNumber(words[pixel * 4 + 3]!)));
    const denominator = Math.max(alpha, 1e-7);
    for (let channel = 0; channel < 3; channel += 1) {
      const premultiplied = Math.max(0, studioWebGpuFloat16ToNumber(words[pixel * 4 + channel]!));
      output[pixel * 4 + channel] = Math.round(linearToSrgb(premultiplied / denominator) * alpha * 255);
    }
    output[pixel * 4 + 3] = Math.round(alpha * 255);
  }
  return output;
}

export function studioWebGpuRgba16FDiffToRgba8(
  left: Uint16Array,
  right: Uint16Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (left.length !== right.length || left.length !== width * height * 4) {
    throw new RangeError("rgba16f-diff-size-mismatch");
  }
  const output = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    let maximum = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      maximum = Math.max(
        maximum,
        Math.abs(
          finite(studioWebGpuFloat16ToNumber(left[pixel * 4 + channel]!))
            - finite(studioWebGpuFloat16ToNumber(right[pixel * 4 + channel]!)),
        ),
      );
    }
    const intensity = Math.min(255, Math.round(maximum * 4096));
    output[pixel * 4] = intensity;
    output[pixel * 4 + 1] = Math.round(intensity * 0.2);
    output[pixel * 4 + 2] = 255 - intensity;
    output[pixel * 4 + 3] = 255;
  }
  return output;
}
