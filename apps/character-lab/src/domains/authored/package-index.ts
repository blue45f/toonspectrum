/**
 * `public/assets/characters/index.json` 파서(순수).
 * 계약 형식 `{ packages: [...] }`(contracts/package-manifest.ts)과 Blender 레인 실제 형식
 * `toonstudio.character-lab.authored-character-index/1`(`{ baseUrl, primary, characters: [...] }`)을 모두 받아
 * 계약 `CharacterPackageIndex`와 로더용 확장 항목(manifest URL·형식·GLB SHA)으로 정규화한다.
 */
import { z } from "zod";

import { CHARACTER_ID_PATTERN, CHARACTER_PACKAGE_ASSET_ROOT, CHARACTER_PACKAGE_MANIFEST_FILENAME, SHA256_PATTERN, characterPackageIndexSchema, failVisible } from "../../contracts";

import { AUTHORED_MANIFEST_FILENAME } from "./authored-character-manifest";

import type { ManifestFormat } from "./authored-character-manifest";
import type { CharacterPackageIndex, CharacterPackageIndexEntry, LabFailure } from "../../contracts";

export const AUTHORED_INDEX_SCHEMA_ID = "toonstudio.character-lab.authored-character-index/1";

const indexFileSchema = z.looseObject({ path: z.string().min(1), bytes: z.number().int().nonnegative().optional(), sha256: z.string().regex(SHA256_PATTERN).optional() });

export const authoredCharacterIndexSchema = z.looseObject({
  schema: z.literal(AUTHORED_INDEX_SCHEMA_ID),
  baseUrl: z.string().min(1).optional(),
  primary: z.string().optional(),
  characters: z.array(
    z.looseObject({
      id: z.string().regex(CHARACTER_ID_PATTERN),
      displayName: z.string(),
      role: z.string().optional(),
      license: z.string().optional(),
      qualityScore: z.number().optional(),
      skeleton: z.boolean().optional(),
      semanticShapeKeys: z.number().optional(),
      hairLodTriangles: z.array(z.number()).optional(),
      glbTriangles: z.number().optional(),
      files: z.looseObject({ glb: indexFileSchema.optional(), manifest: indexFileSchema.optional(), slotMapping: indexFileSchema.optional(), contactSheet: indexFileSchema.optional() }).optional(),
    }),
  ),
});

export interface AuthoredIndexEntry extends CharacterPackageIndexEntry {
  readonly manifestUrl: string;
  readonly manifestFormat: ManifestFormat;
  readonly primary: boolean;
  readonly role: string | null;
  readonly glbSha256: string | null;
  readonly glbBytes: number | null;
  readonly contactSheetUrl: string | null;
  readonly summary: {
    readonly qualityScore: number | null;
    readonly skeleton: boolean | null;
    readonly semanticShapeKeys: number | null;
    readonly hairLodTriangles: readonly number[];
    readonly glbTriangles: number | null;
  };
}

export type IndexParseResult =
  | { readonly ok: true; readonly index: CharacterPackageIndex; readonly entries: readonly AuthoredIndexEntry[] }
  | { readonly ok: false; readonly failure: LabFailure };

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function join(base: string, path: string): string {
  return `${trimSlash(base)}/${path.replace(/^\/+/u, "")}`;
}

/** index.json(두 형식)을 파싱한다. */
export function parseCharacterPackageIndex(json: unknown, now?: number): IndexParseResult {
  const contract = characterPackageIndexSchema.safeParse(json);
  if (contract.success) {
    const entries: AuthoredIndexEntry[] = contract.data.packages.map((entry) => ({
      ...entry,
      manifestUrl: join(entry.baseUrl, CHARACTER_PACKAGE_MANIFEST_FILENAME),
      manifestFormat: "character-package",
      primary: false,
      role: null,
      glbSha256: null,
      glbBytes: null,
      contactSheetUrl: null,
      summary: { qualityScore: null, skeleton: null, semanticShapeKeys: null, hairLodTriangles: [], glbTriangles: null },
    }));
    return { ok: true, index: contract.data, entries };
  }
  const authored = authoredCharacterIndexSchema.safeParse(json);
  if (authored.success) {
    const root = trimSlash(authored.data.baseUrl ?? `${CHARACTER_PACKAGE_ASSET_ROOT}/`);
    const entries: AuthoredIndexEntry[] = authored.data.characters.map((character) => {
      const baseUrl = join(root, character.id);
      const manifestPath = character.files?.manifest?.path;
      const packageEntry: CharacterPackageIndexEntry = {
        characterId: character.id,
        displayName: character.displayName,
        baseUrl,
        ...(character.license ? { licenseNote: character.license } : {}),
      };
      return {
        ...packageEntry,
        manifestUrl: manifestPath ? join(root, manifestPath) : join(baseUrl, AUTHORED_MANIFEST_FILENAME),
        manifestFormat: "authored-character",
        primary: authored.data.primary === character.id,
        role: character.role ?? null,
        glbSha256: character.files?.glb?.sha256 ?? null,
        glbBytes: character.files?.glb?.bytes ?? null,
        contactSheetUrl: character.files?.contactSheet?.path ? join(root, character.files.contactSheet.path) : null,
        summary: {
          qualityScore: character.qualityScore ?? null,
          skeleton: character.skeleton ?? null,
          semanticShapeKeys: character.semanticShapeKeys ?? null,
          hairLodTriangles: character.hairLodTriangles ?? [],
          glbTriangles: character.glbTriangles ?? null,
        },
      };
    });
    const index: CharacterPackageIndex = {
      packages: entries.map(({ characterId, displayName, baseUrl, licenseNote }) => (licenseNote === undefined ? { characterId, displayName, baseUrl } : { characterId, displayName, baseUrl, licenseNote })),
    };
    return { ok: true, index, entries };
  }
  const first = authored.error.issues[0];
  return {
    ok: false,
    failure: failVisible(
      "package-index-invalid",
      `index.json 형식이 올바르지 않습니다(계약 packages[] 또는 ${AUTHORED_INDEX_SCHEMA_ID} 필요): ${first?.path.map(String).join(".") ?? ""} ${first?.message ?? ""}`.trim(),
      undefined,
      now,
    ),
  };
}
