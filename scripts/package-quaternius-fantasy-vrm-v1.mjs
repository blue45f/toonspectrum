/** Add explicit VRM1 humanoid metadata without rewriting assembled skin/geometry bytes. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "artifacts/studio-asset-expansion/assembled-fantasy-v1");
const output = path.join(root, "apps/web/public/vrm/quaternius-fantasy-v1");
const ids = ["quaternius-female-peasant", "quaternius-male-peasant", "quaternius-female-ranger", "quaternius-male-ranger"];
const bones = { hips: "pelvis", spine: "spine_01", chest: "spine_02", upperChest: "spine_03", neck: "neck_01", head: "Head" };
for (const [side, suffix] of [["left", "l"], ["right", "r"]]) {
  for (const [human, source] of Object.entries({ UpperLeg: "thigh", LowerLeg: "calf", Foot: "foot", Toes: "ball", Shoulder: "clavicle", UpperArm: "upperarm", LowerArm: "lowerarm", Hand: "hand" })) bones[side + human] = `${source}_${suffix}`;
  for (const [finger, source] of [["Index", "index"], ["Middle", "middle"], ["Ring", "ring"], ["Little", "pinky"], ["Thumb", "thumb"]]) {
    const segments = finger === "Thumb" ? ["Metacarpal", "Proximal", "Distal"] : ["Proximal", "Intermediate", "Distal"];
    segments.forEach((segment, index) => { bones[side + finger + segment] = `${source}_0${index + 1}_${suffix}`; });
  }
}
const hash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const pad = (buffer, value = 0) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, value)]);
fs.mkdirSync(output, { recursive: true });
const records = [];
for (const id of ids) {
  const source = fs.readFileSync(path.join(input, `${id}.glb`));
  assert.equal(source.readUInt32LE(0), 0x46546c67);
  const jsonBytes = source.readUInt32LE(12);
  const document = JSON.parse(source.subarray(20, 20 + jsonBytes).toString());
  const binaryChunks = source.subarray(20 + jsonBytes);
  const humanBones = {};
  for (const [human, name] of Object.entries(bones)) {
    const node = document.nodes.findIndex((item) => item.name === name);
    assert.notEqual(node, -1, `${id}: missing ${human}/${name}`);
    assert.ok(document.skins.some((skin) => skin.joints.includes(node)), `${id}: ${name} is not a skinned joint`);
    humanBones[human] = { node };
  }
  const meta = {
    name: id.replace("quaternius-", "").replaceAll("-", " "), version: "1.0",
    authors: ["Quaternius"], copyrightInformation: "Original assets by Quaternius, CC0 1.0 Universal. Assembly and VRM1 mapping by ToonStudio.",
    licenseUrl: "https://vrm.dev/licenses/1.0/", otherLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    references: ["https://quaternius.com/packs/universalbasecharacters.html", "https://quaternius.com/packs/modularcharacteroutfitsfantasy.html"],
    thirdPartyLicenses: "CC0 1.0 Universal (CC0 1.0), Public Domain Dedication. Models by Quaternius. Free Standard archives only; no paid Source assets.",
    avatarPermission: "everyone", allowExcessivelyViolentUsage: true, allowExcessivelySexualUsage: true,
    commercialUsage: "corporation", allowPoliticalOrReligiousUsage: true, allowAntisocialOrHateUsage: true,
    creditNotation: "unnecessary", allowRedistribution: true, modification: "allowModificationRedistribution",
  };
  document.extensions = { ...document.extensions, VRMC_vrm: { specVersion: "1.0", meta, humanoid: { humanBones } } };
  document.extensionsUsed = [...new Set([...(document.extensionsUsed ?? []), "VRMC_vrm"])];
  document.asset.extras = { ...document.asset.extras, studioSourceLicense: "CC0-1.0", studioAssembly: id, originalExpressionCapability: "none" };
  const json = pad(Buffer.from(JSON.stringify(document)), 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + json.length + binaryChunks.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const vrm = Buffer.concat([header, json, binaryChunks]);
  assert.ok(vrm.length <= 15 * 1024 * 1024, `${id}: exceeds the 15 MiB web hero budget`);
  assert.ok(vrm.subarray(20 + json.length).equals(binaryChunks));
  assert.ok((document.images ?? []).every((image) => !image.uri));
  const file = path.join(output, `${id}.vrm`);
  fs.writeFileSync(file, vrm);
  records.push({ id, url: `/vrm/quaternius-fantasy-v1/${id}.vrm`, bytes: vrm.length, sha256: hash(vrm), assembledGlbSha256: hash(source), binaryChunksPreserved: true, humanBones: Object.keys(humanBones).length, skins: document.skins.length, meshes: document.meshes.length, animations: document.animations?.length ?? 0, images: document.images?.length ?? 0, expressions: false });
}
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ version: 1, sourceLicense: "CC0-1.0", entries: records }, null, 2) + "\n");
fs.writeFileSync(path.join(output, "LICENSE.txt"), "CC0 1.0 Universal (CC0 1.0)\nPublic Domain Dedication\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\nOriginal models by Quaternius.\nhttps://quaternius.com/packs/universalbasecharacters.html\nhttps://quaternius.com/packs/modularcharacteroutfitsfantasy.html\n\nToonStudio modifications: assembled four free Standard outfits with their authored skinned heads and hairstyles; corrected one source texture URI typo; limited textures to 1024px; added explicit VRM1 humanoid mapping and license metadata. No facial expression morphs were added or claimed.\n");
process.stdout.write(JSON.stringify(records, null, 2) + "\n");
