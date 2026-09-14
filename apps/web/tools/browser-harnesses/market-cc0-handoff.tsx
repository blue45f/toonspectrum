import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { getStoredBg3dModelByHashV12 } from "../../src/domains/creator/bg3d/bg3d-model-library";
import { parseStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import { createStudioCommunityAssetRecord } from "../../src/domains/creator/studio-community-asset-runtime";
import { resolveStudioMarketplaceCc0Entry, studioMarketplaceCc0EntryRef } from "../../src/domains/creator/studio-marketplace-cc0-assets";
import { prepareStudioMarketplaceCc0ModelScene } from "../../src/domains/creator/studio-marketplace-cc0-model";
import { MarketCc0AssetPreview } from "../../src/domains/market/components/MarketCc0AssetPreview";

import type { CreatorMarketplaceResourceRecord } from "../../src/shared/lib/creator-marketplace-resource-contract";

let root: Root | null = null;
let disposeRender: (() => void) | null = null;
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** Runs only from the test HTML; this file is not an application entry or production endpoint. */
export async function verifyMarketCc0BrowserCase(record: CreatorMarketplaceResourceRecord, serializedScene?: string) {
  const asset = resolveStudioMarketplaceCc0Entry(record, record.entries[0]);
  if (!asset) throw new Error("Unresolved source fixture");
  root ??= createRoot(document.getElementById("preview")!);
  root.render(<MarketCc0AssetPreview record={record} />);
  await nextFrame(); await nextFrame();
  const displayed = document.querySelector<HTMLImageElement>("[data-market-cc0-preview] img");
  if (!displayed) throw new Error("Actual preview component did not render");
  await displayed.decode();
  if (!displayed.naturalWidth) throw new Error("Actual preview is empty");
  disposeRender?.(); disposeRender = null;
  if (asset.kind !== "model") {
    const image = await createStudioCommunityAssetRecord(asset);
    const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
    const pixels = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = pixels.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let transparent = 0, visible = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; else visible++; }
    bitmap.close();
    if (!visible || image.width !== asset.width || image.height !== asset.height) throw new Error("Raster decoding mismatch");
    if (asset.kind === "prop-image" && transparent === 0) throw new Error("Cutout lost transparency");
    return { id: asset.id, width: image.width, height: image.height, visible, transparent, rights: image.rights };
  }
  const runtimeRef = studioMarketplaceCc0EntryRef(record.entries[0]);
  if (!runtimeRef) throw new Error("Missing model reference");
  const sceneDocument = serializedScene ? parseStudioBg3dSceneDocument(serializedScene)
    : await prepareStudioMarketplaceCc0ModelScene(runtimeRef, { isCurrent: () => true });
  if (!sceneDocument || sceneDocument.nodes.length !== 1) throw new Error("Model scene did not survive serialization");
  const stored = await getStoredBg3dModelByHashV12(sceneDocument.attachments[0].hash);
  if (!stored || stored.contentHash !== `sha256:${asset.sha256}`) throw new Error("Durable model did not survive reload");
  const gltf = await new GLTFLoader().parseAsync(await stored.blob.arrayBuffer(), "");
  const canvas = document.getElementById("pixels") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(640, 480, false);
  renderer.setClearColor(0x182030, 1);
  const scene = new THREE.Scene();
  scene.add(gltf.scene, new THREE.HemisphereLight(0xffffff, 0x666666, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(5, 8, 5); scene.add(light);
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z) * 2.5;
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("Invalid model bounds");
  const camera = new THREE.PerspectiveCamera(42, 640 / 480, distance / 1000, distance * 100);
  const views: number[] = [];
  for (const angle of [0.6, 2.7, 4.6]) {
    camera.position.set(center.x + Math.sin(angle) * distance, center.y + distance * 0.5, center.z + Math.cos(angle) * distance);
    camera.lookAt(center);
    renderer.render(scene, camera);
    await nextFrame();
    const gl = renderer.getContext();
    const pixels = new Uint8Array(640 * 480 * 4);
    gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonBackground = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i + 1] - pixels[1]) + Math.abs(pixels[i + 2] - pixels[2]) > 24) nonBackground++;
    }
    if (nonBackground < 100) throw new Error("Empty model render");
    views.push(nonBackground);
  }
  disposeRender = () => {
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
    renderer.dispose(); renderer.forceContextLoss();
    canvas.replaceWith(Object.assign(document.createElement("canvas"), { id: "pixels", width: 640, height: 480 }));
  };
  return { id: asset.id, hash: stored.contentHash, views, reopened: Boolean(serializedScene), serializedScene: serializeStudioBg3dSceneDocument(sceneDocument) };
}
