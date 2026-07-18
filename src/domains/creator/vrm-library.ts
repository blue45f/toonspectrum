const DB_NAME = "toonspectrum-studio-vrm-library";
const DB_VERSION = 1;
const MODEL_STORE = "models";
const THUMBNAIL_STORE = "thumbnails";

const SHA256_CONTENT_HASH_PATTERN = /^sha256:([0-9a-f]{64})$/i;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const MAX_VRM_JSON_CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * 업로드 한 건을 검증·해시할 때 브라우저 메모리에 파일 전체가 한 번 올라간다.
 * 현재 번들 중 가장 큰 모델(약 20 MB)에 충분한 여유를 두되, 무제한 Blob 할당은 막는다.
 */
export const MAX_VRM_UPLOAD_BYTES = 128 * 1024 * 1024;
export const VRM_VALIDATION_VERSION = 1;

export type VrmContentHash = `sha256:${string}`;

export const SAMPLE_VRM_ID = "sample-vrm";
export const SAMPLE_VRM_URL = "/vrm/sample.vrm";

export type VrmStoredModelRecord = {
  id: string;
  name: string;
  blob: Blob;
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
  /** DB v1 레거시 행에는 없을 수 있다. */
  contentHash?: VrmContentHash;
  byteSize?: number;
  mimeType?: string;
  validationVersion?: number;
};

export type VrmStoredModelWithContentIdentity = VrmStoredModelRecord & {
  contentHash: VrmContentHash;
  byteSize: number;
  mimeType: string;
  validationVersion: number;
};

export type VrmLibraryEntry = {
  id: string;
  name: string;
  source: "sample" | "indexed-db";
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
  contentHash?: VrmContentHash;
  byteSize?: number;
  mimeType?: string;
};

export type SampleVrm = {
  id: string;
  name: string;
  url: string;
};

type VrmThumbnailRecord = {
  id: string;
  thumbnail: string;
  updatedAt: number;
};

// 기본 번들 VRM 캐릭터. 모든 엔트리는 public/vrm/ 아래 실파일과 1:1 대응한다.
// A-C는 pixiv VRoidPreset 조건, old beta 샘플 4종은 pixiv CC0 조건을 따른다.
// 모델별 출처 URL·라이선스 요약은 public/vrm/LICENSES.md 참고
// (2026-06: madjin/vrm-samples VRoid 공식 샘플 + UniVRM Alicia Solid,
//  2026-07: github.com/ToxSam/open-source-avatars 레지스트리의 Polygonal Mind
//  100Avatars R1~R3 CC0 모델 71종 — 캐릭터/로봇/동물/판타지/SF/푸드 마스코트,
//  그 중 OldMoustache·Eugenia는 "노인" 카테고리 보강).
export const SAMPLE_VRMS: SampleVrm[] = [
  { id: SAMPLE_VRM_ID, name: "루미", url: SAMPLE_VRM_URL },
  { id: "avatar-a", name: "하린", url: "/vrm/AvatarSample_A.vrm" },
  { id: "avatar-b", name: "세라", url: "/vrm/AvatarSample_B.vrm" },
  { id: "avatar-c", name: "유나", url: "/vrm/AvatarSample_C.vrm" },
  { id: "shion", name: "시온", url: "/vrm/Sendagaya_Shibu.vrm" },
  { id: "vivi", name: "비비", url: "/vrm/Vivi.vrm" },
  { id: "vita", name: "비타", url: "/vrm/Vita.vrm" },
  { id: "rubin", name: "루빈", url: "/vrm/Victoria_Rubin.vrm" },
  { id: "orion", name: "오리온 (로봇)", url: "/vrm/Avatar_Orion.vrm" },
  { id: "cryptovoxel", name: "크립토 (복셀봇)", url: "/vrm/cryptovoxels.vrm" },
  { id: "meebit", name: "미빗 (블록맨)", url: "/vrm/meebit_09842.vrm" },
  { id: "seedsan", name: "시드상 (마스코트)", url: "/vrm/Seed_san.vrm" },
  { id: "shino", name: "시노", url: "/vrm/Sendagaya_Shino.vrm" },
  { id: "fumi", name: "후미", url: "/vrm/Sakurada_Fumiriya.vrm" },
  { id: "kage", name: "카게 (다크)", url: "/vrm/Darkness_Shibu.vrm" },
  { id: "mio", name: "미오", url: "/vrm/fem_vroid.vrm" },
  { id: "noa", name: "노아", url: "/vrm/masc_vroid.vrm" },
  { id: "alicia", name: "아리시아", url: "/vrm/AliciaSolid.vrm" },
  { id: "devil", name: "데빌 (악마)", url: "/vrm/Devil.vrm" },
  { id: "polydancer", name: "폴리댄서", url: "/vrm/Polydancer.vrm" },
  { id: "rose", name: "로즈", url: "/vrm/Rose.vrm" },
  { id: "robert", name: "로버트", url: "/vrm/Robert.vrm" },
  { id: "bloody", name: "블러디 (빌런)", url: "/vrm/Bloody.vrm" },
  { id: "rabbit", name: "래빗 (토끼)", url: "/vrm/Rabbit.vrm" },
  { id: "eggplant", name: "에그플랜트 (가지)", url: "/vrm/Eggplant.vrm" },
  { id: "coolbanana", name: "쿨바나나", url: "/vrm/CoolBanana.vrm" },
  { id: "skull", name: "스컬 (해골)", url: "/vrm/Skull.vrm" },
  { id: "cool-alien", name: "쿨에일리언 (외계인)", url: "/vrm/CoolAlien.vrm" },
  { id: "jimmy", name: "지미", url: "/vrm/Jimmy.vrm" },
  { id: "froggy", name: "프로기 (개구리)", url: "/vrm/Froggy.vrm" },
  { id: "teddy", name: "테디 (곰인형)", url: "/vrm/Teddy.vrm" },
  { id: "nightmare", name: "나이트메어 (악몽)", url: "/vrm/Nightmare.vrm" },
  { id: "pumpkin", name: "펌킨 (호박)", url: "/vrm/Pumpkin.vrm" },
  { id: "wizzir", name: "위지르 (마법사)", url: "/vrm/Wizzir.vrm" },
  { id: "clown", name: "클라운 (광대)", url: "/vrm/Clown.vrm" },
  { id: "wolfman", name: "울프맨 (늑대인간)", url: "/vrm/Wolfman.vrm" },
  { id: "mummy", name: "머미 (미라)", url: "/vrm/Mummy.vrm" },
  { id: "kate", name: "케이트", url: "/vrm/Kate.vrm" },
  { id: "witch", name: "위치 (마녀)", url: "/vrm/Witch.vrm" },
  { id: "dracula", name: "드라큘라 (뱀파이어)", url: "/vrm/Dracula.vrm" },
  { id: "zombie", name: "좀비", url: "/vrm/Zombie.vrm" },
  { id: "dino-kid", name: "디노키드 (공룡)", url: "/vrm/DinoKid.vrm" },
  { id: "astronaut", name: "애스트로넛 (우주비행사)", url: "/vrm/Astronaut.vrm" },
  { id: "polybot", name: "폴리봇 (로봇)", url: "/vrm/Polybot.vrm" },
  { id: "jennifer", name: "제니퍼", url: "/vrm/Jennifer.vrm" },
  { id: "erika", name: "에리카", url: "/vrm/Erika.vrm" },
  { id: "olivia", name: "올리비아", url: "/vrm/Olivia.vrm" },
  { id: "avocado", name: "아보카도", url: "/vrm/Avocado.vrm" },
  { id: "ice-cream", name: "아이스크림", url: "/vrm/IceCream.vrm" },
  { id: "pyre-sorcerer", name: "파이어소서러 (화염술사)", url: "/vrm/PyreSorcerer.vrm" },
  { id: "unicorn-person", name: "유니콘퍼슨 (유니콘)", url: "/vrm/UnicornPerson.vrm" },
  { id: "lalo-bot", name: "랄로봇 (로봇)", url: "/vrm/LaloBot.vrm" },
  { id: "shark-person", name: "샤크퍼슨 (상어)", url: "/vrm/SharkPerson.vrm" },
  { id: "chill-penguin", name: "칠펭귄 (펭귄)", url: "/vrm/ChillPenguin.vrm" },
  { id: "cool-turtle", name: "쿨터틀 (거북이)", url: "/vrm/CoolTurtle.vrm" },
  { id: "moon-girl", name: "문걸 (달소녀)", url: "/vrm/MoonGirl.vrm" },
  { id: "eye-wizard", name: "아이위저드 (외눈 마법사)", url: "/vrm/EyeWizard.vrm" },
  { id: "cool-pizza", name: "쿨피자", url: "/vrm/CoolPizza.vrm" },
  { id: "cool-ramen", name: "쿨라멘", url: "/vrm/CoolRamen.vrm" },
  { id: "cool-taco", name: "쿨타코", url: "/vrm/CoolTaco.vrm" },
  { id: "cool-pirate", name: "쿨파이럿 (해적)", url: "/vrm/CoolPirate.vrm" },
  { id: "cosmic-dweller", name: "코스믹드웰러 (우주인)", url: "/vrm/CosmicDweller.vrm" },
  { id: "chill-palm", name: "칠팜 (야자수)", url: "/vrm/ChillPalm.vrm" },
  { id: "good-knight", name: "굿나이트 (기사)", url: "/vrm/GoodKnight.vrm" },
  { id: "bad-bot", name: "배드봇 (로봇)", url: "/vrm/BadBot.vrm" },
  { id: "pirate-bot", name: "파이럿봇 (해적 로봇)", url: "/vrm/PirateBot.vrm" },
  { id: "cyberpal", name: "사이버팔 (사이보그)", url: "/vrm/Cyberpal.vrm" },
  { id: "bao-samurai", name: "바오사무라이", url: "/vrm/BaoSamurai.vrm" },
  { id: "kiba", name: "키바 (늑대)", url: "/vrm/Kiba.vrm" },
  { id: "stitch-witch", name: "스티치위치 (마녀 인형)", url: "/vrm/StitchWitch.vrm" },
  { id: "mega-angel", name: "메가엔젤 (천사)", url: "/vrm/MegaAngel.vrm" },
  { id: "mushroom-fairy", name: "머시룸페어리 (버섯 요정)", url: "/vrm/MushroomFairy.vrm" },
  { id: "weird-cat", name: "위어드캣 (고양이)", url: "/vrm/WeirdCat.vrm" },
  { id: "cute-saurus", name: "큐트사우루스 (공룡)", url: "/vrm/CuteSaurus.vrm" },
  { id: "crowley", name: "크롤리", url: "/vrm/Crowley.vrm" },
  { id: "lady-koi", name: "레이디코이 (비단잉어)", url: "/vrm/LadyKoi.vrm" },
  { id: "yeti-dude", name: "예티듀드 (예티)", url: "/vrm/YetiDude.vrm" },
  { id: "anna", name: "안나", url: "/vrm/Anna.vrm" },
  { id: "megan-the-fox", name: "메간 (여우)", url: "/vrm/MeganTheFox.vrm" },
  { id: "cool-tiger", name: "쿨타이거 (호랑이)", url: "/vrm/CoolTiger.vrm" },
  { id: "lil-ram", name: "릴램 (양)", url: "/vrm/LilRam.vrm" },
  { id: "lady-fawn", name: "레이디폰 (아기사슴)", url: "/vrm/LadyFawn.vrm" },
  { id: "strawberry-princess", name: "스트로베리 프린세스 (공주)", url: "/vrm/StrawberryPrincess.vrm" },
  { id: "blue-pixie", name: "블루픽시 (요정)", url: "/vrm/BluePixie.vrm" },
  { id: "bot-bunny", name: "봇버니 (토끼 로봇)", url: "/vrm/BotBunny.vrm" },
  { id: "sport-mecha", name: "스포츠메카 (메카)", url: "/vrm/SportMecha.vrm" },
  { id: "cosmic-bot", name: "코스믹봇 (로봇)", url: "/vrm/CosmicBot.vrm" },
  { id: "old-moustache", name: "올드무스타치 (할아버지)", url: "/vrm/OldMoustache.vrm" },
  { id: "eugenia", name: "유제니아 (할머니)", url: "/vrm/Eugenia.vrm" },
];
export const SAMPLE_VRM_ENTRIES: VrmLibraryEntry[] = SAMPLE_VRMS.map((s) => ({
  id: s.id,
  name: s.name,
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
}));
export const SAMPLE_VRM_LIBRARY_ENTRY: VrmLibraryEntry = SAMPLE_VRM_ENTRIES[0];

export function sampleVrmUrl(id: string): string {
  return SAMPLE_VRMS.find((s) => s.id === id)?.url ?? SAMPLE_VRM_URL;
}

function isSampleVrmId(id: string) {
  return SAMPLE_VRMS.some((sample) => sample.id === id);
}

export function isUsableVrmAssetResponse(response: Pick<Response, "ok" | "headers">) {
  if (!response.ok) return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const contentDisposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";

  return !contentType.includes("text/html") && !/filename="?index\.html"?/.test(contentDisposition);
}

export type ValidatedVrmGlb = {
  vrmVersion: 0 | 1;
};

export function canonicalizeVrmContentHash(value: unknown): VrmContentHash | null {
  if (typeof value !== "string") return null;
  const match = SHA256_CONTENT_HASH_PATTERN.exec(value.trim());
  return match ? `sha256:${match[1].toLowerCase()}` : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** GLB 2.0 컨테이너와 첫 JSON 청크 안의 VRM 0.x/1.x 확장을 검증한다. */
export function validateVrmGlbBytes(input: ArrayBuffer | Uint8Array): ValidatedVrmGlb {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    throw new TypeError("VRM 파일이 너무 짧거나 GLB 헤더가 없습니다.");
  }
  if (bytes.byteLength > MAX_VRM_UPLOAD_BYTES) {
    throw new RangeError(`VRM 파일은 ${MAX_VRM_UPLOAD_BYTES / (1024 * 1024)}MB 이하여야 합니다.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new TypeError("VRM 파일이 아닙니다. GLB 'glTF' 헤더를 확인해 주세요.");
  }
  if (view.getUint32(4, true) !== GLB_VERSION) {
    throw new TypeError("지원하지 않는 GLB 버전입니다. GLB 2.0 기반 VRM만 업로드할 수 있습니다.");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new TypeError("VRM 파일 길이 정보가 실제 바이트 길이와 일치하지 않습니다.");
  }

  let offset = GLB_HEADER_BYTES;
  let json: unknown = null;
  let chunkIndex = 0;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < GLB_CHUNK_HEADER_BYTES) {
      throw new TypeError("VRM GLB 청크 헤더가 잘렸습니다.");
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (chunkLength % 4 !== 0) {
      throw new TypeError("VRM GLB 청크 길이는 4바이트 경계에 맞아야 합니다.");
    }
    const payloadStart = offset + GLB_CHUNK_HEADER_BYTES;
    const payloadEnd = payloadStart + chunkLength;
    if (payloadEnd > bytes.byteLength) {
      throw new TypeError("VRM GLB 청크 길이가 파일 범위를 벗어납니다.");
    }

    if (chunkIndex === 0) {
      if (chunkType !== GLB_JSON_CHUNK_TYPE) {
        throw new TypeError("VRM GLB의 첫 청크는 JSON이어야 합니다.");
      }
      if (chunkLength === 0 || chunkLength > MAX_VRM_JSON_CHUNK_BYTES) {
        throw new RangeError("VRM 메타데이터(JSON) 크기가 허용 범위를 벗어납니다.");
      }
      let jsonText: string;
      try {
        jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(payloadStart, payloadEnd));
      } catch {
        throw new TypeError("VRM 메타데이터가 올바른 UTF-8 JSON이 아닙니다.");
      }
      try {
        json = JSON.parse(jsonText.trim());
      } catch {
        throw new TypeError("VRM 메타데이터 JSON을 읽을 수 없습니다.");
      }
    }

    offset = payloadEnd;
    chunkIndex += 1;
  }

  if (offset !== bytes.byteLength || !isPlainObject(json)) {
    throw new TypeError("VRM GLB 구조가 올바르지 않습니다.");
  }
  if (!isPlainObject(json.asset) || json.asset.version !== "2.0") {
    throw new TypeError("VRM 메타데이터의 glTF asset.version은 2.0이어야 합니다.");
  }
  const extensions = json.extensions;
  if (!isPlainObject(extensions)) {
    throw new TypeError("GLB에 VRM 확장(VRM 또는 VRMC_vrm)이 없습니다.");
  }
  const hasVrm1 = Object.prototype.hasOwnProperty.call(extensions, "VRMC_vrm");
  const hasVrm0 = Object.prototype.hasOwnProperty.call(extensions, "VRM");
  if (hasVrm1 && hasVrm0) {
    throw new TypeError("VRM 0.x와 1.x 확장을 동시에 포함한 모호한 파일은 사용할 수 없습니다.");
  }
  if (hasVrm1 && isPlainObject(extensions.VRMC_vrm)) return { vrmVersion: 1 };
  if (hasVrm0 && isPlainObject(extensions.VRM)) return { vrmVersion: 0 };
  if (hasVrm1 || hasVrm0) {
    throw new TypeError("VRM 확장 메타데이터가 올바른 객체가 아닙니다.");
  }
  throw new TypeError("GLB에 VRM 확장(VRM 또는 VRMC_vrm)이 없습니다.");
}

let blobWorkTail: Promise<void> = Promise.resolve();

function runSerializedBlobWork<T>(work: () => Promise<T>): Promise<T> {
  const result = blobWorkTail.then(work, work);
  blobWorkTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function assertSafeVrmBlobSize(blob: Pick<Blob, "size">) {
  if (!Number.isSafeInteger(blob.size) || blob.size <= 0) {
    throw new TypeError("비어 있거나 길이가 올바르지 않은 VRM 파일입니다.");
  }
  if (blob.size > MAX_VRM_UPLOAD_BYTES) {
    throw new RangeError(`VRM 파일은 ${MAX_VRM_UPLOAD_BYTES / (1024 * 1024)}MB 이하여야 합니다.`);
  }
}

async function readVrmBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  assertSafeVrmBlobSize(blob);
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength !== blob.size) {
    throw new TypeError("VRM 파일을 완전히 읽지 못했습니다. 파일을 다시 선택해 주세요.");
  }
  return buffer;
}

function digestToContentHash(digest: ArrayBuffer): VrmContentHash {
  if (digest.byteLength !== 32) {
    throw new TypeError("SHA-256 결과 길이가 올바르지 않습니다.");
  }
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

async function sha256Bytes(bytes: ArrayBuffer): Promise<VrmContentHash> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("이 브라우저에서는 VRM 콘텐츠 해시를 계산할 수 없습니다.");
  return digestToContentHash(await subtle.digest("SHA-256", bytes));
}

/** Blob의 파일명이나 MIME이 아니라 실제 바이트 전체를 SHA-256으로 식별한다. */
export function hashVrmBlob(blob: Blob): Promise<VrmContentHash> {
  return runSerializedBlobWork(async () => sha256Bytes(await readVrmBlobBytes(blob)));
}

async function inspectVrmBlob(blob: Blob): Promise<{
  contentHash: VrmContentHash;
  byteSize: number;
  mimeType: string;
}> {
  return runSerializedBlobWork(async () => {
    const bytes = await readVrmBlobBytes(blob);
    validateVrmGlbBytes(bytes);
    return {
      contentHash: await sha256Bytes(bytes),
      byteSize: bytes.byteLength,
      // 입력의 Content-Type은 신뢰 경계가 아니다. 구조 검증을 통과한 뒤 안전한 정규 MIME을 부여한다.
      mimeType: "model/gltf-binary",
    };
  });
}

/** 레거시 DB v1 행을 검증하고 안정적인 콘텐츠 식별 정보로 보강한다. */
export async function ensureStoredVrmContentIdentity(
  record: VrmStoredModelRecord
): Promise<VrmStoredModelWithContentIdentity> {
  const canonicalHash = canonicalizeVrmContentHash(record.contentHash);
  if (
    canonicalHash &&
    record.byteSize === record.blob.size &&
    record.mimeType === "model/gltf-binary" &&
    record.validationVersion === VRM_VALIDATION_VERSION
  ) {
    return {
      ...record,
      contentHash: canonicalHash,
      byteSize: record.blob.size,
      mimeType: "model/gltf-binary",
      validationVersion: VRM_VALIDATION_VERSION,
    };
  }

  const inspected = await inspectVrmBlob(record.blob);
  return {
    ...record,
    ...inspected,
    validationVersion: VRM_VALIDATION_VERSION,
  };
}

function createModelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vrm-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
}

function normalizeVrmName(fileName: string) {
  const normalized = fileName.trim().replace(/\.vrm$/i, "").trim().slice(0, 120).trim();
  return normalized || "VRM 캐릭터";
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function createIndexedDbError() {
  return new Error("이 브라우저에서는 VRM 라이브러리 저장소를 사용할 수 없습니다.");
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? createIndexedDbError());
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? createIndexedDbError());
    transaction.onabort = () => reject(transaction.error ?? createIndexedDbError());
  });
}

function openLibraryDatabase() {
  if (!hasIndexedDb()) {
    return Promise.reject(createIndexedDbError());
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        db.createObjectStore(MODEL_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
        db.createObjectStore(THUMBNAIL_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? createIndexedDbError());
  });
}

async function withDatabase<T>(callback: (db: IDBDatabase) => Promise<T>) {
  const db = await openLibraryDatabase();
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

export function createUploadedVrmRecord(file: File, id = createModelId(), now = Date.now()): VrmStoredModelRecord {
  return {
    id,
    name: normalizeVrmName(file.name),
    blob: file,
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function withDefaultVrmEntry(storedModels: VrmStoredModelRecord[], sampleThumbnails: Partial<Record<string, string | null>> = {}): VrmLibraryEntry[] {
  const sampleEntries = SAMPLE_VRM_ENTRIES.map((entry) => ({
    ...entry,
    thumbnail: sampleThumbnails[entry.id] ?? entry.thumbnail,
  }));
  const uploadedEntries = storedModels
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<VrmLibraryEntry>((model) => {
      const contentHash = canonicalizeVrmContentHash(model.contentHash);
      return {
        id: model.id,
        name: model.name,
        source: "indexed-db",
        thumbnail: model.thumbnail ?? null,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
        ...(contentHash ? { contentHash } : {}),
        ...(Number.isSafeInteger(model.byteSize) && (model.byteSize ?? 0) > 0
          ? { byteSize: model.byteSize }
          : {}),
        ...(typeof model.mimeType === "string" && model.mimeType
          ? { mimeType: model.mimeType }
          : {}),
      };
    });

  return [...sampleEntries, ...uploadedEntries];
}

export function getDeletableModelIds(entries: VrmLibraryEntry[]) {
  return entries.filter((entry) => entry.source === "indexed-db").map((entry) => entry.id);
}

function isStoredVrmModelRecord(value: unknown): value is VrmStoredModelRecord {
  if (!isPlainObject(value)) return false;
  const record = value;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    record.blob instanceof Blob &&
    (record.thumbnail === null || typeof record.thumbnail === "string") &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    typeof record.updatedAt === "number" &&
    Number.isFinite(record.updatedAt) &&
    (record.contentHash === undefined || typeof record.contentHash === "string") &&
    (record.byteSize === undefined || (typeof record.byteSize === "number" && Number.isFinite(record.byteSize))) &&
    (record.mimeType === undefined || typeof record.mimeType === "string") &&
    (record.validationVersion === undefined || (typeof record.validationVersion === "number" && Number.isFinite(record.validationVersion)))
  );
}

type VrmIdentityBackfill = {
  source: VrmStoredModelRecord;
  identity: Pick<
    VrmStoredModelWithContentIdentity,
    "contentHash" | "byteSize" | "mimeType" | "validationVersion"
  >;
};

function hasSameBlobDescriptor(left: Blob, right: Blob): boolean {
  if (left.size !== right.size || left.type !== right.type) return false;
  if (typeof File === "undefined" || !(left instanceof File) || !(right instanceof File)) return true;
  return left.name === right.name && left.lastModified === right.lastModified;
}

function isSameBackfillSource(current: VrmStoredModelRecord, source: VrmStoredModelRecord): boolean {
  return (
    current.id === source.id &&
    current.name === source.name &&
    current.thumbnail === source.thumbnail &&
    current.createdAt === source.createdAt &&
    current.updatedAt === source.updatedAt &&
    current.contentHash === source.contentHash &&
    current.byteSize === source.byteSize &&
    current.mimeType === source.mimeType &&
    current.validationVersion === source.validationVersion &&
    hasSameBlobDescriptor(current.blob, source.blob)
  );
}

async function persistVrmIdentityBackfills(
  db: IDBDatabase,
  backfills: readonly VrmIdentityBackfill[]
): Promise<void> {
  const transaction = db.transaction(MODEL_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(MODEL_STORE);

  const reconcile = async () => {
    // 모든 get을 먼저 큐에 넣어 transaction이 행 사이에서 inactive가 되지 않게 한다.
    const currentRows = await Promise.all(
      backfills.map(({ source }) => requestResult<unknown>(store.get(source.id)))
    );
    currentRows.forEach((value, index) => {
      if (!isStoredVrmModelRecord(value)) return; // 삭제된 행을 되살리지 않는다.
      const backfill = backfills[index];
      if (!isSameBackfillSource(value, backfill.source)) return;

      const { identity } = backfill;
      if (
        value.contentHash === identity.contentHash &&
        value.byteSize === identity.byteSize &&
        value.mimeType === identity.mimeType &&
        value.validationVersion === identity.validationVersion
      ) {
        return;
      }
      store.put({ ...value, ...identity });
    });
  };

  await Promise.all([reconcile(), done]);
}

export async function listStoredVrmModels(): Promise<VrmStoredModelRecord[]> {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const storedRows = await requestResult<unknown[]>(store.getAll());
    await done;
    const records = storedRows.filter(isStoredVrmModelRecord);
    const results: VrmStoredModelRecord[] = [];
    const backfills: VrmIdentityBackfill[] = [];

    // 대형 VRM 여러 개의 ArrayBuffer를 동시에 보유하지 않도록 반드시 한 행씩 처리한다.
    for (const record of records) {
      try {
        const ensured = await ensureStoredVrmContentIdentity(record);
        results.push(ensured);
        if (
          ensured.contentHash !== record.contentHash ||
          ensured.byteSize !== record.byteSize ||
          ensured.mimeType !== record.mimeType ||
          ensured.validationVersion !== record.validationVersion
        ) {
          backfills.push({
            source: record,
            identity: {
              contentHash: ensured.contentHash,
              byteSize: ensured.byteSize,
              mimeType: ensured.mimeType,
              validationVersion: ensured.validationVersion,
            },
          });
        }
      } catch {
        // 손상된 레거시 한 행 때문에 나머지 라이브러리를 사용할 수 없게 하지 않는다.
        results.push(record);
      }
    }

    if (backfills.length > 0) {
      try {
        await persistVrmIdentityBackfills(db, backfills);
      } catch {
        // 메모리의 결과는 이미 쓸 수 있다. quota/race/write 실패는 목록 조회를 막지 않는다.
      }
    }

    return results;
  });
}

export async function getStoredVrmModel(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const record = await requestResult<unknown>(store.get(id));
    await done;
    return isStoredVrmModelRecord(record) ? record : null;
  });
}

export async function getStoredVrmModelByHash(hash: string): Promise<VrmStoredModelRecord | null> {
  const canonicalHash = canonicalizeVrmContentHash(hash);
  if (!canonicalHash) return null;
  const records = await listStoredVrmModels();
  return records.find((record) => canonicalizeVrmContentHash(record.contentHash) === canonicalHash) ?? null;
}

export async function getCachedVrmThumbnail(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(THUMBNAIL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(THUMBNAIL_STORE);
    const record = await requestResult<VrmThumbnailRecord | undefined>(store.get(id));
    await done;
    return record?.thumbnail ?? null;
  });
}

export async function listVrmLibraryEntries() {
  const [storedModels, cachedSampleThumbnails] = await Promise.all([
    listStoredVrmModels(),
    Promise.all(SAMPLE_VRM_ENTRIES.map(async (entry) => [entry.id, await getCachedVrmThumbnail(entry.id)] as const)),
  ]);
  return withDefaultVrmEntry(storedModels, Object.fromEntries(cachedSampleThumbnails));
}

let saveWorkTail: Promise<void> = Promise.resolve();

function runSerializedSave<T>(work: () => Promise<T>): Promise<T> {
  const result = saveWorkTail.then(work, work);
  saveWorkTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function saveVerifiedVrmBlob(input: {
  name: string;
  blob: Blob;
  expectedHash?: string;
}): Promise<VrmStoredModelRecord> {
  return runSerializedSave(async () => {
    const expectedHash = input.expectedHash === undefined
      ? null
      : canonicalizeVrmContentHash(input.expectedHash);
    if (input.expectedHash !== undefined && !expectedHash) {
      throw new TypeError("예상 VRM 해시는 sha256: 뒤에 64자리 16진수여야 합니다.");
    }

    // 검증·해시가 모두 끝나기 전에는 IndexedDB를 열거나 변경하지 않는다.
    const identity = await inspectVrmBlob(input.blob);
    if (expectedHash && identity.contentHash !== expectedHash) {
      throw new TypeError("VRM 파일의 SHA-256 해시가 프로젝트에 기록된 값과 일치하지 않습니다.");
    }

    // DB v1 레거시 행도 먼저 순차 보정해 같은 콘텐츠의 중복 저장을 막는다.
    await listStoredVrmModels();
    return withDatabase(async (db) => {
      const transaction = db.transaction(MODEL_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(MODEL_STORE);
      const currentRows = await requestResult<unknown[]>(store.getAll());
      const duplicate = currentRows
        .filter(isStoredVrmModelRecord)
        .find((record) => canonicalizeVrmContentHash(record.contentHash) === identity.contentHash);
      if (duplicate) {
        await done;
        // 기존 표시 이름/썸네일을 덮어쓰지 않는다.
        return duplicate;
      }

      const now = Date.now();
      const record: VrmStoredModelWithContentIdentity = {
        id: createModelId(),
        name: normalizeVrmName(input.name),
        blob: input.blob,
        thumbnail: null,
        createdAt: now,
        updatedAt: now,
        ...identity,
        validationVersion: VRM_VALIDATION_VERSION,
      };
      store.put(record);
      await done;
      return record;
    });
  });
}

export function saveUploadedVrm(file: File) {
  return saveVerifiedVrmBlob({ name: file.name, blob: file });
}

export async function saveVrmThumbnail(id: string, thumbnail: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    const modelStore = transaction.objectStore(MODEL_STORE);
    const existingModel = await requestResult<unknown>(modelStore.get(id));

    if (isStoredVrmModelRecord(existingModel)) {
      modelStore.put({ ...existingModel, thumbnail, updatedAt: Date.now() });
    } else {
      transaction.objectStore(THUMBNAIL_STORE).put({ id, thumbnail, updatedAt: Date.now() } satisfies VrmThumbnailRecord);
    }

    await done;
  });
}

export async function deleteStoredVrmModel(id: string) {
  if (isSampleVrmId(id)) return;

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).delete(id);
    transaction.objectStore(THUMBNAIL_STORE).delete(id);
    await done;
  });
}
