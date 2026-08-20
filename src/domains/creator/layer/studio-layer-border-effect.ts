export type StudioLayerBorderEffectType = "outer" | "inner" | "center";

export interface StudioLayerBorderEffectSettings {
  enabled: boolean;
  thickness: number; // 1..32 px
  color: string; // hex #RRGGBB or rgba
  type: StudioLayerBorderEffectType;
  antiAliased?: boolean;
}

function parseColor(colorStr: string): { r: number; g: number; b: number; a: number } {
  let r = 0, g = 0, b = 0, a = 255;
  const hexMatch = colorStr.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = parseInt(hex.slice(6, 8), 16);
    }
  } else {
    const rgbaMatch = colorStr.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if (rgbaMatch) {
      r = parseInt(rgbaMatch[1], 10);
      g = parseInt(rgbaMatch[2], 10);
      b = parseInt(rgbaMatch[3], 10);
      a = rgbaMatch[4] !== undefined ? Math.round(parseFloat(rgbaMatch[4]) * 255) : 255;
    }
  }
  return { r, g, b, a };
}

function edt1d(f: Float64Array, dt: Float64Array, n: number, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      if (k < 0) {
        k = 0;
        break;
      }
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    const dx = q - v[k];
    dt[q] = dx * dx + f[v[k]];
  }
}

function edt2d(grid: Float64Array, width: number, height: number) {
  const maxDim = Math.max(width, height);
  const f = new Float64Array(maxDim);
  const dt = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      f[x] = grid[offset + x];
    }
    edt1d(f, dt, width, v, z);
    for (let x = 0; x < width; x++) {
      grid[offset + x] = dt[x];
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      f[y] = grid[y * width + x];
    }
    edt1d(f, dt, height, v, z);
    for (let y = 0; y < height; y++) {
      grid[y * width + x] = dt[y];
    }
  }
}

export function applyStudioLayerBorderEffect(img: ImageData, settings: StudioLayerBorderEffectSettings): ImageData {
  if (!settings.enabled || settings.thickness <= 0) {
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  }

  const { width, height, data } = img;
  const outData = new Uint8ClampedArray(data);
  const outImg = new ImageData(outData, width, height);

  const parsedColor = parseColor(settings.color);
  const grid = new Float64Array(width * height);
  
  const THRESHOLD = 127;
  for (let i = 0; i < width * height; i++) {
    const alpha = data[i * 4 + 3];
    if (settings.type === "outer") {
      grid[i] = alpha > THRESHOLD ? 0 : 1e10;
    } else if (settings.type === "inner") {
      grid[i] = alpha <= THRESHOLD ? 0 : 1e10;
    } else {
      const x = i % width;
      const y = Math.floor(i / width);
      let isBoundary = false;
      const isInside = alpha > THRESHOLD;
      
      if (isInside) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          isBoundary = true;
        } else {
          const n1 = data[(i - 1) * 4 + 3] > THRESHOLD;
          const n2 = data[(i + 1) * 4 + 3] > THRESHOLD;
          const n3 = data[(i - width) * 4 + 3] > THRESHOLD;
          const n4 = data[(i + width) * 4 + 3] > THRESHOLD;
          if (!n1 || !n2 || !n3 || !n4) isBoundary = true;
        }
      } else {
         if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
            // Can check if neighbor is inside, but actually if a pixel is outside, 
            // the distance transform will compute distance to the boundary pixels which are "inside".
            // So for "center", we just set grid to 0 on boundary pixels (inside pixels that touch outside).
         }
      }
      grid[i] = isBoundary ? 0 : 1e10;
    }
  }

  edt2d(grid, width, height);

  const t = settings.thickness;
  const tSq = t * t;

  for (let i = 0; i < width * height; i++) {
    const dSq = grid[i];
    if (dSq <= tSq) {
      const origA = data[i * 4 + 3];
      const isInside = origA > THRESHOLD;
      
      let strokeAlpha = 255;
      if (settings.antiAliased) {
        const d = Math.sqrt(dSq);
        if (d > t - 1) {
          strokeAlpha = Math.max(0, Math.min(255, Math.round((t - d) * 255)));
        }
      }
      
      strokeAlpha = (strokeAlpha * parsedColor.a) / 255;
      
      if (strokeAlpha > 0) {
        let drawStroke = false;
        
        if (settings.type === "outer" && !isInside) {
          drawStroke = true;
        } else if (settings.type === "inner" && isInside) {
          drawStroke = true;
        } else if (settings.type === "center") {
          drawStroke = true;
        }

        if (drawStroke) {
          const idx = i * 4;
          
          if (settings.type === "outer" || settings.type === "center" && !isInside) {
            // Draw stroke ONLY on empty area
            outData[idx] = parsedColor.r;
            outData[idx + 1] = parsedColor.g;
            outData[idx + 2] = parsedColor.b;
            outData[idx + 3] = strokeAlpha;
          } else {
            // Inner or Center(inside): Composite Stroke over Orig (or basically replace inside with stroke color near edge)
            // Note: simple alpha compositing over original
            const origNormA = origA / 255;
            const strokeNormA = strokeAlpha / 255;
            const outNormA = strokeNormA + origNormA * (1 - strokeNormA);
            
            if (outNormA > 0) {
              outData[idx] = (parsedColor.r * strokeNormA + data[idx] * origNormA * (1 - strokeNormA)) / outNormA;
              outData[idx + 1] = (parsedColor.g * strokeNormA + data[idx + 1] * origNormA * (1 - strokeNormA)) / outNormA;
              outData[idx + 2] = (parsedColor.b * strokeNormA + data[idx + 2] * origNormA * (1 - strokeNormA)) / outNormA;
              outData[idx + 3] = Math.round(outNormA * 255);
            }
          }
        }
      }
    }
  }

  return outImg;
}
