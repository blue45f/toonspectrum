export interface StudioBrushMediaPixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioBrushMediaPixelImage {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: ArrayLike<number>;
}

export interface StudioBrushMediaPixelQualityInput {
  readonly baseline: StudioBrushMediaPixelImage;
  readonly frame: StudioBrushMediaPixelImage;
  readonly routePoints: readonly StudioBrushMediaPixelPoint[];
  readonly crossSectionRadius: number;
  readonly pixelTolerance?: number;
}

export interface StudioBrushMediaPixelQualityMetrics {
  readonly visiblePixels: number;
  readonly meanVisibleDelta: number;
  readonly p95VisibleDelta: number;
  /**
   * High-frequency cross-section width error after removing the local width trend.
   * This separates pressure/taper changes from the repeated bulges commonly called scalloping.
   */
  readonly scallopResidualCoefficient: number | null;
  readonly widthSampleCount: number;
  /**
   * Local prominence of the strongest horizontal/vertical autocorrelation peak.
   * A smooth stroke has a broad correlation curve; a tiled/grid artifact has a sharp peak.
   */
  readonly repetitionScore: number;
  readonly repetitionRawCorrelation: number;
  readonly repetitionAxis: "x" | "y" | null;
  readonly repetitionPeriodPx: number | null;
  readonly repetitionSamplePairs: number;
}

interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface AxisCorrelation {
  readonly axis: "x" | "y";
  readonly lag: number;
  readonly correlation: number;
  readonly samplePairs: number;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function createDeltaField(
  baseline: StudioBrushMediaPixelImage,
  frame: StudioBrushMediaPixelImage,
): Uint8Array {
  invariant(
    baseline.width === frame.width && baseline.height === frame.height,
    "brush-media pixel images have different dimensions",
  );
  invariant(
    baseline.channels >= 3 && frame.channels >= 3,
    "brush-media pixel images must contain RGB channels",
  );
  invariant(
    baseline.data.length >= baseline.width * baseline.height * baseline.channels,
    "brush-media baseline pixel buffer is truncated",
  );
  invariant(
    frame.data.length >= frame.width * frame.height * frame.channels,
    "brush-media frame pixel buffer is truncated",
  );

  const deltas = new Uint8Array(baseline.width * baseline.height);
  for (let pixel = 0; pixel < deltas.length; pixel += 1) {
    const beforeOffset = pixel * baseline.channels;
    const afterOffset = pixel * frame.channels;
    deltas[pixel] = Math.max(
      Math.abs((baseline.data[beforeOffset] ?? 0) - (frame.data[afterOffset] ?? 0)),
      Math.abs(
        (baseline.data[beforeOffset + 1] ?? 0)
          - (frame.data[afterOffset + 1] ?? 0),
      ),
      Math.abs(
        (baseline.data[beforeOffset + 2] ?? 0)
          - (frame.data[afterOffset + 2] ?? 0),
      ),
    );
  }
  return deltas;
}

function findVisibleBounds(
  deltas: Uint8Array,
  width: number,
  height: number,
  tolerance: number,
): PixelBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < deltas.length; pixel += 1) {
    if ((deltas[pixel] ?? 0) <= tolerance) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return right >= left && bottom >= top ? { left, top, right, bottom } : null;
}

function analyzeVisibleContrast(
  deltas: Uint8Array,
  tolerance: number,
): Pick<
  StudioBrushMediaPixelQualityMetrics,
  "visiblePixels" | "meanVisibleDelta" | "p95VisibleDelta"
> {
  const histogram = new Uint32Array(256);
  let visiblePixels = 0;
  let totalDelta = 0;
  for (const delta of deltas) {
    if (delta <= tolerance) continue;
    histogram[delta]! += 1;
    visiblePixels += 1;
    totalDelta += delta;
  }

  const target = Math.max(1, Math.ceil(visiblePixels * 0.95));
  let observed = 0;
  let p95VisibleDelta = 0;
  for (let delta = tolerance + 1; delta < histogram.length; delta += 1) {
    observed += histogram[delta] ?? 0;
    if (observed < target) continue;
    p95VisibleDelta = delta;
    break;
  }
  return {
    visiblePixels,
    meanVisibleDelta: totalDelta / Math.max(1, visiblePixels),
    p95VisibleDelta,
  };
}

function pixelDelta(
  deltas: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (
    roundedX < 0
    || roundedX >= width
    || roundedY < 0
    || roundedY >= height
  ) return 0;
  return deltas[roundedY * width + roundedX] ?? 0;
}

function analyzeScallopResidual(
  deltas: Uint8Array,
  width: number,
  height: number,
  routePoints: readonly StudioBrushMediaPixelPoint[],
  crossSectionRadius: number,
  tolerance: number,
): Pick<
  StudioBrushMediaPixelQualityMetrics,
  "scallopResidualCoefficient" | "widthSampleCount"
> {
  const widths: number[] = [];
  const radius = Math.max(1, Math.ceil(crossSectionRadius));
  for (let index = 1; index + 1 < routePoints.length; index += 1) {
    const previous = routePoints[index - 1]!;
    const current = routePoints[index]!;
    const next = routePoints[index + 1]!;
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const length = Math.hypot(tangentX, tangentY);
    if (length <= 0.0001) continue;
    const normalX = -tangentY / length;
    const normalY = tangentX / length;
    let minimum: number | null = null;
    let maximum: number | null = null;
    for (let offset = -radius; offset <= radius; offset += 1) {
      if (
        pixelDelta(
          deltas,
          width,
          height,
          current.x + normalX * offset,
          current.y + normalY * offset,
        ) <= tolerance
      ) continue;
      minimum = minimum === null ? offset : Math.min(minimum, offset);
      maximum = maximum === null ? offset : Math.max(maximum, offset);
    }
    if (minimum !== null && maximum !== null) widths.push(maximum - minimum + 1);
  }

  if (widths.length < 7) {
    return {
      scallopResidualCoefficient: null,
      widthSampleCount: widths.length,
    };
  }

  const trendRadius = Math.max(2, Math.min(5, Math.floor(widths.length / 12)));
  const residuals = widths.map((value, index) => {
    const from = Math.max(0, index - trendRadius);
    const to = Math.min(widths.length, index + trendRadius + 1);
    const trend = widths.slice(from, to).reduce((sum, widthValue) => (
      sum + widthValue
    ), 0) / Math.max(1, to - from);
    return value - trend;
  });
  const meanWidth = widths.reduce((sum, value) => sum + value, 0) / widths.length;
  const residualRms = Math.sqrt(
    residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length,
  );
  return {
    scallopResidualCoefficient: meanWidth > 0 ? residualRms / meanWidth : null,
    widthSampleCount: widths.length,
  };
}

function correlateAxis(
  deltas: Uint8Array,
  width: number,
  bounds: PixelBounds,
  tolerance: number,
  axis: "x" | "y",
  lag: number,
): AxisCorrelation {
  const stride = 2;
  const maxX = axis === "x" ? bounds.right - lag : bounds.right;
  const maxY = axis === "y" ? bounds.bottom - lag : bounds.bottom;
  let count = 0;
  let sumLeft = 0;
  let sumRight = 0;
  let sumLeftSquared = 0;
  let sumRightSquared = 0;
  let sumProduct = 0;

  for (let y = bounds.top; y <= maxY; y += stride) {
    for (let x = bounds.left; x <= maxX; x += stride) {
      const shiftedX = axis === "x" ? x + lag : x;
      const shiftedY = axis === "y" ? y + lag : y;
      const left = deltas[y * width + x] ?? 0;
      const right = deltas[shiftedY * width + shiftedX] ?? 0;
      if (left <= tolerance && right <= tolerance) continue;
      count += 1;
      sumLeft += left;
      sumRight += right;
      sumLeftSquared += left * left;
      sumRightSquared += right * right;
      sumProduct += left * right;
    }
  }

  if (count < 64) {
    return { axis, lag, correlation: 0, samplePairs: count };
  }
  const covariance = sumProduct - (sumLeft * sumRight) / count;
  const leftVariance = sumLeftSquared - (sumLeft * sumLeft) / count;
  const rightVariance = sumRightSquared - (sumRight * sumRight) / count;
  const denominator = Math.sqrt(Math.max(0, leftVariance * rightVariance));
  return {
    axis,
    lag,
    correlation: denominator > 0 ? clamp(covariance / denominator, -1, 1) : 0,
    samplePairs: count,
  };
}

function analyzeRepetition(
  deltas: Uint8Array,
  width: number,
  height: number,
  bounds: PixelBounds | null,
  tolerance: number,
): Pick<
  StudioBrushMediaPixelQualityMetrics,
  | "repetitionScore"
  | "repetitionRawCorrelation"
  | "repetitionAxis"
  | "repetitionPeriodPx"
  | "repetitionSamplePairs"
> {
  if (!bounds) {
    return {
      repetitionScore: 0,
      repetitionRawCorrelation: 0,
      repetitionAxis: null,
      repetitionPeriodPx: null,
      repetitionSamplePairs: 0,
    };
  }

  const boundsWidth = bounds.right - bounds.left + 1;
  const boundsHeight = bounds.bottom - bounds.top + 1;
  const correlations: AxisCorrelation[] = [];
  for (const axis of ["x", "y"] as const) {
    const extent = axis === "x" ? boundsWidth : boundsHeight;
    const maximumLag = Math.min(64, Math.floor(extent / 3));
    for (let lag = 2; lag <= maximumLag; lag += 1) {
      correlations.push(correlateAxis(
        deltas,
        width,
        bounds,
        tolerance,
        axis,
        lag,
      ));
    }
  }

  let best:
    | Readonly<{ candidate: AxisCorrelation; prominence: number }>
    | null = null;
  for (const candidate of correlations) {
    if (candidate.lag < 4 || candidate.samplePairs < 64) continue;
    const neighbors = correlations.filter((entry) => (
      entry.axis === candidate.axis
      && entry.lag !== candidate.lag
      && Math.abs(entry.lag - candidate.lag) <= 2
      && entry.samplePairs >= 64
    ));
    if (neighbors.length < 2) continue;
    const localBaseline = median(neighbors.map((entry) => entry.correlation));
    const prominence = Math.max(0, candidate.correlation - localBaseline);
    if (!best || prominence > best.prominence) best = { candidate, prominence };
  }

  if (!best) {
    return {
      repetitionScore: 0,
      repetitionRawCorrelation: 0,
      repetitionAxis: null,
      repetitionPeriodPx: null,
      repetitionSamplePairs: 0,
    };
  }
  return {
    repetitionScore: clamp(best.prominence, 0, 1),
    repetitionRawCorrelation: best.candidate.correlation,
    repetitionAxis: best.candidate.axis,
    repetitionPeriodPx: best.candidate.lag,
    repetitionSamplePairs: best.candidate.samplePairs,
  };
}

export function analyzeStudioBrushMediaPixelQuality(
  input: StudioBrushMediaPixelQualityInput,
): StudioBrushMediaPixelQualityMetrics {
  const tolerance = Math.max(0, Math.floor(input.pixelTolerance ?? 3));
  const deltas = createDeltaField(input.baseline, input.frame);
  const contrast = analyzeVisibleContrast(deltas, tolerance);
  const bounds = findVisibleBounds(
    deltas,
    input.baseline.width,
    input.baseline.height,
    tolerance,
  );
  const scallop = analyzeScallopResidual(
    deltas,
    input.baseline.width,
    input.baseline.height,
    input.routePoints,
    input.crossSectionRadius,
    tolerance,
  );
  const repetition = analyzeRepetition(
    deltas,
    input.baseline.width,
    input.baseline.height,
    bounds,
    tolerance,
  );
  return {
    ...contrast,
    ...scallop,
    ...repetition,
  };
}
