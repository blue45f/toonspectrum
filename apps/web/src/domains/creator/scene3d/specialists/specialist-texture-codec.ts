import { inspectSpecialistImage } from "./specialist-image-budget";
import { SpecialistError } from "./specialist-contract";

export interface SpecialistRgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}
export type SpecialistRasterDecoder = (
  bytes: Uint8Array,
  mime: string,
  width: number,
  height: number,
) => Promise<SpecialistRgbaImage>;

export function derivativeTextureSize(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  const factor = Math.min(1, maxSize / Math.max(width, height));
  // The glTF KTX2 subset requires 4x4 block-compatible base dimensions.
  return {
    width: Math.max(4, Math.floor((width * factor) / 4) * 4),
    height: Math.max(4, Math.floor((height * factor) / 4) * 4),
  };
}
/** No Canvas2D premultiplication or implicit color correction of data/normal textures. */
export const decodeSpecialistTexture: SpecialistRasterDecoder = async (
  bytes,
  mime,
  width,
  height,
) => {
  inspectSpecialistImage(bytes, mime);
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas !== "function"
  )
    throw new SpecialistError(
      "unsupported",
      "This browser cannot decode textures inside the processing Worker.",
    );
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(bytes)], { type: mime }),
    {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
      imageOrientation: "none",
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    },
  );
  let gl: WebGL2RenderingContext | null = null;
  let texture: WebGLTexture | null = null;
  let framebuffer: WebGLFramebuffer | null = null;
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new SpecialistError(
        "runtime",
        "The image decoder returned unexpected dimensions.",
      );
    const canvas = new OffscreenCanvas(1, 1);
    gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl)
      throw new SpecialistError(
        "unsupported",
        "Worker texture processing requires an isolated WebGL2 context.",
      );
    texture = gl.createTexture();
    framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer)
      throw new SpecialistError(
        "runtime",
        "Could not allocate bounded texture readback resources.",
      );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bitmap,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new SpecialistError(
        "runtime",
        "Texture readback framebuffer is incomplete.",
      );
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    if (gl.getError() !== gl.NO_ERROR)
      throw new SpecialistError("runtime", "Texture readback failed.");
    return { data, width, height };
  } finally {
    bitmap.close();
    if (gl) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
};
