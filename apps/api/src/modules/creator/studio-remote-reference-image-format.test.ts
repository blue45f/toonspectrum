import { describe, expect, it } from "vitest";

import {
  inspectStudioRemoteReferenceImage,
  STUDIO_REMOTE_REFERENCE_MAX_GIF_BLOCKS,
  STUDIO_REMOTE_REFERENCE_MAX_GIF_SUB_BLOCKS,
  STUDIO_REMOTE_REFERENCE_MAX_JPEG_SEGMENTS,
  STUDIO_REMOTE_REFERENCE_MAX_WEBP_CHUNKS,
  StudioRemoteReferenceImageFormatError,
} from "./studio-remote-reference-image-format";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const GIF_1X1 = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

function structuralGifWithFrames(
  frameCount: number,
  canvasWidth = 1,
  canvasHeight = 1
): Uint8Array {
  const headerAndPalette = Buffer.from(GIF_1X1.subarray(0, 19));
  headerAndPalette.writeUInt16LE(canvasWidth, 6);
  headerAndPalette.writeUInt16LE(canvasHeight, 8);
  const frame = GIF_1X1.subarray(19, GIF_1X1.byteLength - 1);
  return Buffer.concat([
    headerAndPalette,
    ...Array.from({ length: frameCount }, () => frame),
    Buffer.of(0x3b),
  ]);
}

function structuralGifWithExtensionBlocks(extensionCount: number): Uint8Array {
  return Buffer.concat([
    GIF_1X1.subarray(0, 19),
    ...Array.from({ length: extensionCount }, () => Buffer.of(0x21, 0xfe, 0x00)),
    GIF_1X1.subarray(19),
  ]);
}

function structuralGifWithExtensionSubBlocks(extensionSubBlockCount: number): Uint8Array {
  if (extensionSubBlockCount < 1) throw new Error("fixture needs a terminator sub-block");
  return Buffer.concat([
    GIF_1X1.subarray(0, 19),
    Buffer.of(0x21, 0xfe),
    ...Array.from(
      { length: extensionSubBlockCount - 1 },
      () => Buffer.of(0x01, 0x00)
    ),
    Buffer.of(0x00),
    GIF_1X1.subarray(19),
  ]);
}

function structuralJpeg(width = 1, height = 1): Uint8Array {
  return Uint8Array.of(
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9
  );
}

function structuralJpegWithAppSegments(appSegmentCount: number): Uint8Array {
  const base = structuralJpeg();
  return Buffer.concat([
    base.subarray(0, 2),
    ...Array.from({ length: appSegmentCount }, () => Buffer.of(0xff, 0xe0, 0x00, 0x02)),
    base.subarray(8),
  ]);
}

function structuralJpegWithDuplicateSof(): Uint8Array {
  const base = structuralJpeg();
  return Buffer.concat([
    base.subarray(0, 21),
    base.subarray(8, 21),
    base.subarray(21),
  ]);
}

function uint24Le(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32LE(data.byteLength, 4);
  return Buffer.concat([header, data, ...(data.byteLength % 2 ? [Buffer.of(0)] : [])]);
}

function losslessWebpPayload(width = 1, height = 1): Uint8Array {
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  return Uint8Array.of(
    0x2f,
    encodedWidth & 0xff,
    ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6),
    (encodedHeight >> 2) & 0xff,
    (encodedHeight >> 10) & 0x0f
  );
}

function webpContainer(chunks: readonly Uint8Array[]): Uint8Array {
  const body = Buffer.concat([Buffer.from("WEBP", "ascii"), ...chunks]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, 4, "ascii");
  riff.writeUInt32LE(body.byteLength, 4);
  return Buffer.concat([riff, body]);
}

function extendedWebp({
  canvasWidth = 1,
  canvasHeight = 1,
  payloadWidth = canvasWidth,
  payloadHeight = canvasHeight,
  duplicatePayload = false,
}: {
  canvasWidth?: number;
  canvasHeight?: number;
  payloadWidth?: number;
  payloadHeight?: number;
  duplicatePayload?: boolean;
} = {}): Uint8Array {
  const vp8x = Buffer.concat([
    Buffer.of(0, 0, 0, 0),
    uint24Le(canvasWidth - 1),
    uint24Le(canvasHeight - 1),
  ]);
  const payload = webpChunk("VP8L", losslessWebpPayload(payloadWidth, payloadHeight));
  return webpContainer([
    webpChunk("VP8X", vp8x),
    payload,
    ...(duplicatePayload ? [payload] : []),
  ]);
}

function animatedWebp({
  canvasWidth = 1,
  canvasHeight = 1,
  frameCount = 1,
  includeAnimationHeader = true,
  duplicateAnimationHeader = false,
  includeDirectPayload = false,
}: {
  canvasWidth?: number;
  canvasHeight?: number;
  frameCount?: number;
  includeAnimationHeader?: boolean;
  duplicateAnimationHeader?: boolean;
  includeDirectPayload?: boolean;
} = {}): Uint8Array {
  const vp8x = Buffer.concat([
    Buffer.of(0x02, 0, 0, 0),
    uint24Le(canvasWidth - 1),
    uint24Le(canvasHeight - 1),
  ]);
  const animationHeader = webpChunk("ANIM", new Uint8Array(6));
  const frameHeader = Buffer.concat([
    uint24Le(0),
    uint24Le(0),
    uint24Le(0),
    uint24Le(0),
    uint24Le(0),
    Buffer.of(0),
  ]);
  const frame = webpChunk("ANMF", Buffer.concat([
    frameHeader,
    webpChunk("VP8L", losslessWebpPayload()),
  ]));
  return webpContainer([
    webpChunk("VP8X", vp8x),
    ...(includeDirectPayload ? [webpChunk("VP8L", losslessWebpPayload())] : []),
    ...(includeAnimationHeader ? [animationHeader] : []),
    ...(duplicateAnimationHeader ? [animationHeader] : []),
    ...Array.from({ length: frameCount }, () => frame),
  ]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.byteLength, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function structuralApng(canvasWidth: number, canvasHeight: number, frameCount: number): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvasWidth, 0);
  ihdr.writeUInt32BE(canvasHeight, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(frameCount, 0);
  const frameControls = Array.from({ length: frameCount }, (_, index) => {
    const control = Buffer.alloc(26);
    control.writeUInt32BE(index, 0);
    control.writeUInt32BE(1, 4);
    control.writeUInt32BE(1, 8);
    return pngChunk("fcTL", control);
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("acTL", animationControl),
    ...frameControls,
    pngChunk("IDAT", Buffer.of(0)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function structuralLosslessWebp(width = 1, height = 1): Uint8Array {
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  const b0 = encodedWidth & 0xff;
  const b1 = ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
  const b2 = (encodedHeight >> 2) & 0xff;
  const b3 = (encodedHeight >> 10) & 0x0f;
  return Uint8Array.of(
    0x52, 0x49, 0x46, 0x46,
    18, 0, 0, 0,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x4c,
    5, 0, 0, 0,
    0x2f, b0, b1, b2, b3,
    0
  );
}

describe("remote reference image header admission", () => {
  it.each([
    ["image/png", PNG_1X1],
    ["image/jpeg", structuralJpeg()],
    ["image/webp", structuralLosslessWebp()],
    ["image/gif", GIF_1X1],
  ] as const)("admits a structurally bounded %s image", (mediaType, bytes) => {
    expect(inspectStudioRemoteReferenceImage(mediaType, bytes)).toEqual({
      mediaType,
      width: 1,
      height: 1,
      decodedRgbaBytes: 4,
    });
  });

  it("rejects a declared MIME that does not match the magic bytes", () => {
    expect(() => inspectStudioRemoteReferenceImage("image/jpeg", PNG_1X1))
      .toThrowError(new StudioRemoteReferenceImageFormatError("mime_magic_mismatch"));
  });

  it("rejects dimensions above the decoded pixel/axis budget before browser decoding", () => {
    const oversizedPng = Buffer.from(PNG_1X1);
    oversizedPng.writeUInt32BE(20_000, 16);
    expect(() => inspectStudioRemoteReferenceImage("image/png", oversizedPng))
      .toThrowError(new StudioRemoteReferenceImageFormatError("decoded_image_too_large"));
  });

  it("rejects truncated containers even when their leading magic is valid", () => {
    expect(() => inspectStudioRemoteReferenceImage("image/png", PNG_1X1.subarray(0, 32)))
      .toThrowError(new StudioRemoteReferenceImageFormatError("invalid_png"));
    expect(() => inspectStudioRemoteReferenceImage("image/gif", GIF_1X1.subarray(0, -1)))
      .toThrowError(new StudioRemoteReferenceImageFormatError("invalid_gif"));
    expect(() => inspectStudioRemoteReferenceImage("image/webp", structuralLosslessWebp().subarray(0, -1)))
      .toThrowError(new StudioRemoteReferenceImageFormatError("invalid_webp"));
  });

  it("rejects animations that exceed the bounded reference-frame budget", () => {
    expect(() => inspectStudioRemoteReferenceImage(
      "image/gif",
      structuralGifWithFrames(241)
    )).toThrowError(new StudioRemoteReferenceImageFormatError("gif_animation_too_large"));
  });

  it.each([
    ["image/png", structuralApng(4_096, 4_096, 5), "animation_too_large"],
    ["image/webp", animatedWebp({ canvasWidth: 4_096, canvasHeight: 4_096, frameCount: 5 }), "animation_too_large"],
    ["image/gif", structuralGifWithFrames(5, 4_096, 4_096), "gif_animation_too_large"],
  ] as const)(
    "bounds full-canvas frame-cache work for tiny-delta %s animations",
    (mediaType, bytes, errorCode) => {
      expect(() => inspectStudioRemoteReferenceImage(mediaType, bytes))
        .toThrowError(new StudioRemoteReferenceImageFormatError(errorCode));
    }
  );

  it("requires an extended static WebP payload to exactly match its VP8X canvas", () => {
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      extendedWebp({ canvasWidth: 1, canvasHeight: 1, payloadWidth: 16_384 })
    )).toThrowError(new StudioRemoteReferenceImageFormatError("invalid_webp"));
  });

  it("rejects duplicate static WebP payloads and animation/static chunk mixing", () => {
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      extendedWebp({ duplicatePayload: true })
    )).toThrowError(new StudioRemoteReferenceImageFormatError("invalid_webp"));
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      animatedWebp({ includeDirectPayload: true })
    )).toThrowError(new StudioRemoteReferenceImageFormatError("invalid_webp"));
  });

  it("requires one ANIM before ANMF and rejects a duplicate animation header", () => {
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      animatedWebp({ includeAnimationHeader: false })
    )).toThrowError(new StudioRemoteReferenceImageFormatError("invalid_webp"));
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      animatedWebp({ duplicateAnimationHeader: true })
    )).toThrowError(new StudioRemoteReferenceImageFormatError("invalid_webp"));
  });

  it("rejects a second JPEG start-of-frame segment instead of overwriting dimensions", () => {
    expect(() => inspectStudioRemoteReferenceImage("image/jpeg", structuralJpegWithDuplicateSof()))
      .toThrowError(new StudioRemoteReferenceImageFormatError("invalid_jpeg"));
  });

  it("admits the JPEG segment iteration limit and rejects one segment beyond it", () => {
    expect(inspectStudioRemoteReferenceImage(
      "image/jpeg",
      structuralJpegWithAppSegments(STUDIO_REMOTE_REFERENCE_MAX_JPEG_SEGMENTS - 2)
    )).toMatchObject({ width: 1, height: 1 });
    expect(() => inspectStudioRemoteReferenceImage(
      "image/jpeg",
      structuralJpegWithAppSegments(STUDIO_REMOTE_REFERENCE_MAX_JPEG_SEGMENTS - 1)
    )).toThrowError(new StudioRemoteReferenceImageFormatError("jpeg_structure_too_complex"));
  });

  it("admits the WebP chunk iteration limit and rejects one top-level chunk beyond it", () => {
    const fixture = (chunkCount: number) => webpContainer([
      ...Array.from({ length: chunkCount - 1 }, () => webpChunk("JUNK", new Uint8Array())),
      webpChunk("VP8L", losslessWebpPayload()),
    ]);
    expect(inspectStudioRemoteReferenceImage(
      "image/webp",
      fixture(STUDIO_REMOTE_REFERENCE_MAX_WEBP_CHUNKS)
    )).toMatchObject({ width: 1, height: 1 });
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      fixture(STUDIO_REMOTE_REFERENCE_MAX_WEBP_CHUNKS + 1)
    )).toThrowError(new StudioRemoteReferenceImageFormatError("webp_structure_too_complex"));
  });

  it("counts nested ANMF chunks against the same WebP structure budget", () => {
    const vp8x = webpChunk("VP8X", Buffer.concat([Buffer.of(0x02, 0, 0, 0), uint24Le(0), uint24Le(0)]));
    const anim = webpChunk("ANIM", new Uint8Array(6));
    const frameHeader = Buffer.concat([
      uint24Le(0), uint24Le(0), uint24Le(0), uint24Le(0), uint24Le(0), Buffer.of(0),
    ]);
    const frame = webpChunk("ANMF", Buffer.concat([
      frameHeader,
      webpChunk("VP8L", losslessWebpPayload()),
    ]));
    const metadataChunks = Array.from(
      { length: STUDIO_REMOTE_REFERENCE_MAX_WEBP_CHUNKS - 3 },
      () => webpChunk("JUNK", new Uint8Array())
    );
    expect(() => inspectStudioRemoteReferenceImage(
      "image/webp",
      webpContainer([vp8x, ...metadataChunks, anim, frame])
    ))
      .toThrowError(new StudioRemoteReferenceImageFormatError("webp_structure_too_complex"));
  });

  it("admits the GIF top-level block limit and rejects one block beyond it", () => {
    expect(inspectStudioRemoteReferenceImage(
      "image/gif",
      structuralGifWithExtensionBlocks(STUDIO_REMOTE_REFERENCE_MAX_GIF_BLOCKS - 2)
    )).toMatchObject({ width: 1, height: 1 });
    expect(() => inspectStudioRemoteReferenceImage(
      "image/gif",
      structuralGifWithExtensionBlocks(STUDIO_REMOTE_REFERENCE_MAX_GIF_BLOCKS - 1)
    )).toThrowError(new StudioRemoteReferenceImageFormatError("gif_structure_too_complex"));
  });

  it("admits the GIF sub-block iteration limit and rejects one sub-block beyond it", () => {
    // The trailing image contributes one data sub-block plus its terminator.
    expect(inspectStudioRemoteReferenceImage(
      "image/gif",
      structuralGifWithExtensionSubBlocks(STUDIO_REMOTE_REFERENCE_MAX_GIF_SUB_BLOCKS - 2)
    )).toMatchObject({ width: 1, height: 1 });
    expect(() => inspectStudioRemoteReferenceImage(
      "image/gif",
      structuralGifWithExtensionSubBlocks(STUDIO_REMOTE_REFERENCE_MAX_GIF_SUB_BLOCKS - 1)
    )).toThrowError(new StudioRemoteReferenceImageFormatError("gif_structure_too_complex"));
  });
});
