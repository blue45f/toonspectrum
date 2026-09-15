/**
 * Independent reference for the restricted Character PSD raster stack. It never reads the
 * document's merged image or imports its producer/math. Layer order follows ag-psd's documented
 * top-to-bottom children; compositing follows W3C Compositing Level 1 sections 6, 8 and 10.
 * https://www.w3.org/TR/compositing-1/
 * https://github.com/Agamnentzar/ag-psd/blob/master/README_PSD.md#layers-and-groups
 * This is a byte/sRGB reference, not a Photoshop/CSP application-compatibility claim.
 */
export function compositeCharacterPsdLayers(psd) {
  const { width, height } = psd;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 2048 || height > 2048) throw new Error('Invalid reference dimensions');
  const size = width * height * 4;

  function over(destination, source, mode) {
    if (!['normal', 'multiply', 'screen'].includes(mode)) throw new Error(`Unsupported reference blend: ${mode}`);
    for (let i = 0; i < size; i += 4) {
      const ab = destination[i + 3] / 255;
      const as = source[i + 3] / 255;
      const ao = as + ab * (1 - as);
      for (let c = 0; c < 3; c++) {
        const cb = destination[i + c] / 255;
        const cs = source[i + c] / 255;
        const blend = mode === 'multiply' ? cb * cs : mode === 'screen' ? cb + cs - cb * cs : cs;
        destination[i + c] = ao === 0 ? 0
          : 255 * ((1 - as) * ab * cb + (1 - ab) * as * cs + ab * as * blend) / ao;
      }
      destination[i + 3] = 255 * ao;
    }
  }

  function raster(image, left = 0, top = 0) {
    const out = new Uint8ClampedArray(size);
    if (!image || !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray)
      || image.data.length !== image.width * image.height * 4) throw new Error('Missing RGBA8 layer pixels');
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (x + left < 0 || x + left >= width || y + top < 0 || y + top >= height) continue;
      const source = (y * image.width + x) * 4;
      out.set(image.data.subarray(source, source + 4), ((y + top) * width + x + left) * 4);
    }
    return out;
  }

  function scope(layers, depth = 0) {
    if (depth > 8 || !Array.isArray(layers) || layers.length > 32) throw new Error('Unsupported reference layer tree');
    const out = new Uint8ClampedArray(size);
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      if (layer.hidden) continue;
      if (layer.clipping || layer.adjustment || layer.effects || layer.vectorMask)
        throw new Error('Unsupported reference layer feature');
      const pixels = layer.children ? scope(layer.children, depth + 1) : raster(layer.imageData, layer.left, layer.top);
      const opacity = layer.opacity ?? 1;
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Invalid reference opacity');
      const mask = layer.mask?.disabled ? undefined : layer.mask;
      if (mask && (mask.positionRelativeToLayer || mask.userMaskDensity !== undefined || mask.userMaskFeather))
        throw new Error('Unsupported reference mask feature');
      if (mask && !mask.imageData) throw new Error('Missing reference raster mask');
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let coverage = 255;
        if (mask) {
          const mx = x - (mask.left ?? 0);
          const my = y - (mask.top ?? 0);
          coverage = mx < 0 || my < 0 || mx >= mask.imageData.width || my >= mask.imageData.height
            ? (mask.defaultColor ?? 0) : mask.imageData.data[(my * mask.imageData.width + mx) * 4];
        }
        const alpha = (y * width + x) * 4 + 3;
        pixels[alpha] *= opacity * coverage / 255;
      }
      over(out, pixels, layer.blendMode ?? 'normal');
    }
    return out;
  }
  return scope(psd.children);
}
