import { KHRTextureBasisu } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptSimplifier  } from "meshoptimizer";
import {
  meshopt,
  getTextureColorSpace,
  listTextureSlots,
  weld,
  simplify,
} from "@gltf-transform/functions";
import { encodeToKTX2 } from "ktx2-encoder";
import { inspectStudioBg3dBasisKtx2 } from "../../bg3d/studio-bg3d-ktx2-validation";
import { inspectSpecialistImage } from "./specialist-image-budget";
import {
  decodeSpecialistTexture,
  derivativeTextureSize,
} from "./specialist-texture-codec";
import {
  glbArtifact,
  readSpecialistDocument,
  requireStatic,
  sha256,
} from "./specialist-gltf";
import { SpecialistError, SPECIALIST_LIMITS } from "./specialist-contract";
import type { SpecialistRasterDecoder } from "./specialist-texture-codec";
import type {
  SpecialistArtifact,
  SpecialistOptions,
} from "./specialist-contract";
import type { WebIO } from "@gltf-transform/core";

export async function processTextureDerivatives(
  io: WebIO,
  source: Uint8Array,
  options: Extract<SpecialistOptions, { kind: "textures" | "release" }>,
  decode: SpecialistRasterDecoder = decodeSpecialistTexture,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const document = await readSpecialistDocument(io, source);
  if (options.kind === "release") requireStatic(document);
  const textures = document.getRoot().listTextures();
  if (!textures.length)
    throw new SpecialistError(
      "unsupported",
      "This model has no embedded textures to convert.",
    );
  const receipts: Record<string, unknown>[] = [];
  let converted = 0;
  for (const [index, texture] of textures.entries()) {
    const image = texture.getImage();
    if (!image)
      throw new SpecialistError(
        "invalid-input",
        "An embedded texture has no image bytes.",
      );
    const mime = texture.getMimeType();
    const info = inspectSpecialistImage(image, mime);
    if (mime === "image/ktx2") {
      if (info.width > options.maxTextureSize || info.height > options.maxTextureSize) {
        throw new SpecialistError("unsupported",
          "An existing KTX2 texture exceeds the selected maximum edge. Choose a larger limit or re-encode from the original PNG/JPEG/WebP source.");
      }
      receipts.push({
        index,
        action: "preserved-ktx2",
        ...info,
        sha256: sha256(image),
      });
      continue;
    }
    const slots = listTextureSlots(texture);
    const srgb = getTextureColorSpace(texture) === "srgb";
    const usage = texture
      .getGraph()
      .listParentEdges(texture)
      .filter((edge) => edge.getParent() !== document.getRoot());
    const colorFlags = usage.map(
      (edge) =>
        edge.getAttributes().isColor === true ||
        /color|emissive|diffuse/i.test(edge.getName()),
    );
    if (colorFlags.includes(true) && colorFlags.includes(false))
      throw new SpecialistError(
        "unsupported",
        "One image is shared between color and data slots. Split those textures before KTX2 conversion.",
      );
    const normal = slots.some((slot) => /normal/i.test(slot));
    if (normal && slots.some((slot) => !/normal/i.test(slot)))
      throw new SpecialistError(
        "unsupported",
        "A normal map is shared with another material slot; split it before conversion.",
      );
    const size = derivativeTextureSize(
      info.width,
      info.height,
      options.maxTextureSize,
    );
    const rgba = await decode(image, mime, size.width, size.height);
    if (
      rgba.width !== size.width ||
      rgba.height !== size.height ||
      rgba.data.length !== size.width * size.height * 4
    )
      throw new SpecialistError(
        "runtime",
        "Texture decoder violated its bounded RGBA contract.",
      );
    // UASTC is always used for normal/data maps to avoid ETC1S color-block artifacts.
    const mode = normal || !srgb ? "uastc" : options.textureMode;
    const encoded = new Uint8Array(
      await encodeToKTX2(image, {
        isKTX2File: true,
        isUASTC: mode === "uastc",
        enableDebug: false,
        isYFlip: false,
        generateMipmap: true,
        isPerceptual: srgb,
        isSetKTX2SRGBTransferFunc: srgb,
        isNormalMap: normal,
        needSupercompression: false,
        uastcLDRQualityLevel: 2,
        qualityLevel: 180,
        compressionLevel: 2,
        outputBufferSize:
          Math.ceil((size.width * size.height * 16) / 3) + 65536,
        imageDecoder: async () => rgba,
      }),
    );
    if (encoded.length < 80)
      throw new SpecialistError(
        "runtime",
        "Encoder output has no KTX2 header.",
      );
    const header = new DataView(
      encoded.buffer,
      encoded.byteOffset,
      encoded.byteLength,
    );
    const dfd = header.getUint32(48, true);
    if (
      dfd < 80 ||
      dfd + 44 > encoded.length ||
      encoded[dfd + 14] !== (srgb ? 2 : 1)
    )
      throw new SpecialistError(
        "runtime",
        "KTX2 transfer function does not match its material slot.",
      );
    // Basis 2.50 defaults color primaries to BT709 even for non-color data. In glTF,
    // normal/roughness/etc have no color primaries; only the DFD metadata changes.
    // The encoded blocks, alpha, orientation and mip samples remain untouched.
    encoded[dfd + 13] = srgb ? 1 : 0;
    const validated = inspectStudioBg3dBasisKtx2(encoded);
    if (
      !validated ||
      validated.width !== size.width ||
      validated.height !== size.height ||
      validated.levelCount < 1
    )
      throw new SpecialistError(
        "runtime",
        "Encoder output does not match the admitted KTX2 contract.",
      );
    texture.setImage(encoded).setMimeType("image/ktx2").setURI("");
    converted++;
    receipts.push({
      index,
      action: "encoded",
      slots,
      mode,
      transfer: srgb ? "srgb" : "linear",
      normal,
      originalWidth: info.width,
      originalHeight: info.height,
      width: size.width,
      height: size.height,
      originalBytes: image.length,
      bytes: encoded.length,
      levels: validated.levelCount,
      sha256: sha256(encoded),
    });
  }
  document.createExtension(KHRTextureBasisu).setRequired(true);
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const artifacts: SpecialistArtifact[] = [];
  if (options.kind === "release") {
    // Encode texture images once, then derive each geometry LOD independently from those bytes.
    const textured = new Uint8Array(await io.writeBinary(document));
    for (const [index, ratio] of [1, 0.5, 0.2].entries()) {
      const lod = await readSpecialistDocument(io, textured);
      if (ratio < 1)
        await lod.transform(
          weld(),
          simplify({
            simplifier: MeshoptSimplifier,
            ratio,
            error: options.error,
            lockBorder: true,
          }),
        );
      await lod.transform(
        meshopt({ encoder: MeshoptEncoder, level: "medium" }),
      );
      artifacts.push(await glbArtifact(io, lod, `release-lod-${index}.glb`));
    }
  } else {
    await document.transform(
      meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    );
    artifacts.push(await glbArtifact(io, document, "textures-ktx2.glb"));
  }
  const report = new TextEncoder().encode(
    JSON.stringify(
      {
        version: 1,
        sourceSha256: sha256(source),
        options,
        encoder: "ktx2-encoder@0.6.0 CSP-static-invokers-v1",
        converted,
        textures: receipts,
        derivatives: artifacts.map(({ bytes, ...artifact }) => ({
          ...artifact,
          byteLength: bytes.length,
        })),
        productionAdmission: "requires-existing-visual-and-rights-evidence",
      },
      null,
      2,
    ),
  );
  if (
    report.length +
      artifacts.reduce((sum, artifact) => sum + artifact.bytes.length, 0) >
    SPECIALIST_LIMITS.outputBytes
  )
    throw new SpecialistError(
      "budget",
      "Release derivatives exceed the aggregate output budget.",
    );
  artifacts.push({
    name: "texture-release-receipt.json",
    mime: "application/json",
    bytes: report,
    sha256: sha256(report),
  });
  return {
    artifacts,
    warnings: [
      "Source files remain unchanged. KTX2 encoding is lossy: inspect material/alpha/normal appearance before catalog approval.",
      "Normal/data textures use linear UASTC; color textures use the selected transfer-aware codec. The longest edge is bounded by the selected resolution; base dimensions are 4x4-block aligned.",
      ...(options.kind === "release"
        ? [
            "LOD reductions obey the geometric error and border constraints; three files alone are not proof of adequate quality or reduced triangle counts.",
          ]
        : []),
    ],
  };
}
