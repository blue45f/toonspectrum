import { z } from "zod";

export const CREATOR_MARKETPLACE_RESOURCE_KINDS = [
  "asset",
  "brush",
  "filter",
  "palette",
  "template",
  "3d-preset",
] as const;

export const CREATOR_MARKETPLACE_RESOURCE_LICENSES = [
  "toonspectrum-standard",
  "cc0-1.0",
  "cc-by-4.0",
  "cc-by-nc-4.0",
] as const;

export const CREATOR_MARKETPLACE_RESOURCE_ENGINES = [
  "canvas2d",
  "webgl2",
  "webgpu",
  "three",
] as const;

export const CREATOR_MARKETPLACE_RESOURCE_RUNTIMES = [
  "studio-procedural-asset-v1",
  "studio-brush-v1",
  "studio-filter-v1",
  "studio-palette-v1",
  "studio-template-v1",
  "studio-bg3d-preset-v1",
] as const;

export const CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES = 64 * 1_024;
export const CREATOR_MARKETPLACE_RESOURCE_MAX_ENTRY_BYTES = 16 * 1_024;
export const CREATOR_MARKETPLACE_RESOURCE_MAX_PAGE_SIZE = 20;
export const CREATOR_MARKETPLACE_RESOURCE_MAX_ENTRIES = 32;
export const CREATOR_MARKETPLACE_RESOURCE_CURSOR_MAX_CHARACTERS = 512;

export type CreatorMarketplaceResourceKind =
  (typeof CREATOR_MARKETPLACE_RESOURCE_KINDS)[number];
export type CreatorMarketplaceResourceLicense =
  (typeof CREATOR_MARKETPLACE_RESOURCE_LICENSES)[number];
export type CreatorMarketplaceResourceEngine =
  (typeof CREATOR_MARKETPLACE_RESOURCE_ENGINES)[number];

export const CREATOR_MARKETPLACE_RUNTIME_BY_KIND = {
  asset: "studio-procedural-asset-v1",
  brush: "studio-brush-v1",
  filter: "studio-filter-v1",
  palette: "studio-palette-v1",
  template: "studio-template-v1",
  "3d-preset": "studio-bg3d-preset-v1",
} as const satisfies Record<CreatorMarketplaceResourceKind, string>;

export const CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND = {
  asset: "studio-asset:",
  template: "studio-scene-template:",
  "3d-preset": "studio-bg3d-preset:",
} as const;

export type CreatorMarketplaceJsonValue =
  | null
  | boolean
  | number
  | string
  | CreatorMarketplaceJsonValue[]
  | { [key: string]: CreatorMarketplaceJsonValue };

const SemverSchema = z
  .string()
  .trim()
  .max(40)
  .regex(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u,
    "버전은 1.2.3 형식이어야 합니다."
  );
const ResourceKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u, "리소스 식별자 형식이 올바르지 않습니다.");
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const HttpsUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => value.startsWith("https://"), "HTTPS 주소만 사용할 수 있습니다.");

const ShallowPortableDefinitionSchema = z.custom<
  Record<string, CreatorMarketplaceJsonValue>
>(
  (value) => isPlainRecord(value) && Object.keys(value).length > 0,
  "portable JSON definition은 비어 있지 않은 일반 객체여야 합니다."
);

const CreatorMarketplaceResourceKindSchema = z.enum(CREATOR_MARKETPLACE_RESOURCE_KINDS);
const CreatorMarketplaceResourceLicenseSchema = z.enum(
  CREATOR_MARKETPLACE_RESOURCE_LICENSES
);
const CreatorMarketplaceResourceRuntimeSchema = z.enum(
  CREATOR_MARKETPLACE_RESOURCE_RUNTIMES
);

export const CreatorMarketplacePortablePayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    resourceKind: CreatorMarketplaceResourceKindSchema,
    runtime: CreatorMarketplaceResourceRuntimeSchema,
    definition: ShallowPortableDefinitionSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    const issue = inspectPortablePayload(payload.definition);
    if (issue) {
      context.addIssue({
        code: "custom",
        path: ["definition", ...issue.path],
        message: issue.message,
      });
    }
    if (
      payload.runtime !==
      CREATOR_MARKETPLACE_RUNTIME_BY_KIND[payload.resourceKind]
    ) {
      context.addIssue({
        code: "custom",
        path: ["runtime"],
        message: "리소스 종류와 portable runtime 식별자가 일치해야 합니다.",
      });
    }
    if (!issue) {
      const definitionIssue = inspectKindDefinition(
        payload.resourceKind,
        payload.definition
      );
      if (definitionIssue) {
        context.addIssue({
          code: "custom",
          path: ["definition", ...definitionIssue.path],
          message: definitionIssue.message,
        });
      }
    }
  });

export type CreatorMarketplacePortablePayload = z.infer<
  typeof CreatorMarketplacePortablePayloadSchema
>;

const CreatorMarketplaceResourceProvenanceSchema = z.discriminatedUnion("origin", [
  z
    .object({
      origin: z.literal("original"),
      authoredByPublisher: z.literal(true),
    })
    .strict(),
  z
    .object({
      origin: z.literal("permissive"),
      authoredByPublisher: z.literal(false),
      sourceName: z.string().trim().min(1).max(120),
      sourceUrl: HttpsUrlSchema,
      sourceLicenseUrl: HttpsUrlSchema,
    })
    .strict(),
]);

const CreatorMarketplaceBuiltinDeliverySchema = z
  .object({
    mode: z.literal("builtin-ref"),
    runtimeRef: ResourceKeySchema,
    byteSize: z.literal(0),
    sha256: Sha256Schema,
  })
  .strict();

const CreatorMarketplacePortableDeliverySchema = z
  .object({
    mode: z.enum(["portable-json", "procedural-recipe"]),
    mediaType: z.enum([
      "application/vnd.toonspectrum.asset+json",
      "application/vnd.toonspectrum.brush+json",
      "application/vnd.toonspectrum.filter+json",
      "application/vnd.toonspectrum.palette+json",
      "application/vnd.toonspectrum.template+json",
      "application/vnd.toonspectrum.3d-preset+json",
    ]),
    payload: CreatorMarketplacePortablePayloadSchema,
    byteSize: z.number().int().min(2).max(CREATOR_MARKETPLACE_RESOURCE_MAX_ENTRY_BYTES),
    sha256: Sha256Schema,
  })
  .strict();

export const CreatorMarketplaceResourceEntrySchema = z
  .object({
    id: ResourceKeySchema,
    kind: CreatorMarketplaceResourceKindSchema,
    name: z.string().trim().min(1).max(80),
    delivery: z.discriminatedUnion("mode", [
      CreatorMarketplaceBuiltinDeliverySchema,
      CreatorMarketplacePortableDeliverySchema,
    ]),
  })
  .strict();

const CREATOR_MARKETPLACE_MEDIA_TYPE_BY_KIND: Record<
  CreatorMarketplaceResourceKind,
  string
> = {
  asset: "application/vnd.toonspectrum.asset+json",
  brush: "application/vnd.toonspectrum.brush+json",
  filter: "application/vnd.toonspectrum.filter+json",
  palette: "application/vnd.toonspectrum.palette+json",
  template: "application/vnd.toonspectrum.template+json",
  "3d-preset": "application/vnd.toonspectrum.3d-preset+json",
};

const CreatorMarketplaceResourceManifestBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: ResourceKeySchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1_000).default(""),
    kind: CreatorMarketplaceResourceKindSchema,
    resourceVersion: SemverSchema,
    minimumStudioVersion: SemverSchema,
    tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
    license: CreatorMarketplaceResourceLicenseSchema,
    attributionText: z.string().trim().max(240).default(""),
    containsAi: z.boolean().default(false),
    rightsConfirmed: z.literal(true),
    provenance: CreatorMarketplaceResourceProvenanceSchema,
    compatibility: z
      .object({
        engines: z.array(z.enum(CREATOR_MARKETPLACE_RESOURCE_ENGINES)).min(1).max(4),
      })
      .strict(),
    previewRef: ResourceKeySchema.optional(),
    entries: z
      .array(CreatorMarketplaceResourceEntrySchema)
      .min(1)
      .max(CREATOR_MARKETPLACE_RESOURCE_MAX_ENTRIES),
  })
  .strict();

type CreatorMarketplaceResourceManifestSemanticValue = Omit<
  z.infer<typeof CreatorMarketplaceResourceManifestBaseSchema>,
  "rightsConfirmed"
>;

function refineCreatorMarketplaceManifest(
  manifest: CreatorMarketplaceResourceManifestSemanticValue,
  context: z.RefinementCtx
): void {
    if (
      (manifest.license === "cc-by-4.0" || manifest.license === "cc-by-nc-4.0") &&
      !manifest.attributionText
    ) {
      context.addIssue({
        code: "custom",
        path: ["attributionText"],
        message: "CC BY 계열 리소스에는 출처 표시 문구가 필요합니다.",
      });
    }
    if (
      manifest.provenance.origin === "permissive" &&
      manifest.license === "toonspectrum-standard"
    ) {
      context.addIssue({
        code: "custom",
        path: ["license"],
        message: "외부 허용 리소스를 ToonSpectrum 표준 사용권으로 재라이선스할 수 없습니다.",
      });
    }

    const entryIds = new Set<string>();
    for (const [index, entry] of manifest.entries.entries()) {
      if (entry.kind !== manifest.kind) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "kind"],
          message: "패키지 종류와 항목 종류가 일치해야 합니다.",
        });
      }
      const normalizedId = entry.id.toLowerCase();
      if (entryIds.has(normalizedId)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: "패키지 안에서 리소스 식별자는 중복될 수 없습니다.",
        });
      }
      entryIds.add(normalizedId);

      if (entry.delivery.mode === "builtin-ref") {
        const expectedPrefix =
          entry.kind === "asset" ||
          entry.kind === "template" ||
          entry.kind === "3d-preset"
            ? CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND[entry.kind]
            : null;
        if (
          !expectedPrefix ||
          !entry.delivery.runtimeRef.startsWith(expectedPrefix) ||
          !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/u.test(
            entry.delivery.runtimeRef.slice(expectedPrefix?.length ?? 0)
          )
        ) {
          context.addIssue({
            code: "custom",
            path: ["entries", index, "delivery", "runtimeRef"],
            message: "리소스 종류에 등록된 안정적인 built-in 참조만 공유할 수 있습니다.",
          });
        }
        continue;
      }

      if (
        (entry.kind === "asset" || entry.kind === "3d-preset") &&
        entry.delivery.mode !== "procedural-recipe"
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "delivery", "mode"],
          message: "2D/3D 리소스는 절차형 recipe만 portable 콘텐츠로 공유할 수 있습니다.",
        });
      }
      if (
        entry.kind !== "asset" &&
        entry.kind !== "3d-preset" &&
        entry.delivery.mode !== "portable-json"
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "delivery", "mode"],
          message: "브러시·필터·팔레트·템플릿은 적용 가능한 portable JSON으로 공유해야 합니다.",
        });
      }

      if (
        entry.delivery.payload.resourceKind !== entry.kind ||
        entry.delivery.payload.runtime !==
          CREATOR_MARKETPLACE_RUNTIME_BY_KIND[entry.kind]
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "delivery", "payload"],
          message: "리소스 종류와 portable runtime 식별자가 일치해야 합니다.",
        });
      }
      if (entry.delivery.mediaType !== CREATOR_MARKETPLACE_MEDIA_TYPE_BY_KIND[entry.kind]) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "delivery", "mediaType"],
          message: "리소스 종류와 portable JSON 미디어 타입이 일치해야 합니다.",
        });
      }
      const issue = inspectPortablePayload(entry.delivery.payload);
      if (issue) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "delivery", "payload", ...issue.path],
          message: issue.message,
        });
      } else {
        const definitionIssue = inspectKindDefinition(
          entry.kind,
          entry.delivery.payload.definition
        );
        if (definitionIssue) {
          context.addIssue({
            code: "custom",
            path: [
              "entries",
              index,
              "delivery",
              "payload",
              "definition",
              ...definitionIssue.path,
            ],
            message: definitionIssue.message,
          });
        }
      }
      if (
        !issue &&
        creatorMarketplaceJsonByteSize(entry.delivery.payload) !==
          entry.delivery.byteSize
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "delivery", "byteSize"],
          message: "선언한 항목 크기와 실제 JSON 크기가 일치하지 않습니다.",
        });
      }
    }
}

export const CreatorMarketplaceResourceManifestSchema =
  CreatorMarketplaceResourceManifestBaseSchema.superRefine((manifest, context) => {
    refineCreatorMarketplaceManifest(manifest, context);
    const definitionsAreStructurallySafe = manifest.entries.every(
      (entry) =>
        entry.delivery.mode === "builtin-ref" ||
        inspectPortablePayload(entry.delivery.payload) === null
    );
    if (
      definitionsAreStructurallySafe &&
      creatorMarketplaceJsonByteSize(manifest) >
      CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES
    ) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "공유 manifest가 허용된 크기를 초과했습니다.",
      });
    }
  });

export type CreatorMarketplaceResourceManifest = z.infer<
  typeof CreatorMarketplaceResourceManifestSchema
>;

export const CreatorMarketplaceResourcePublisherSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(120),
    avatar: z.string().max(500).nullable(),
  })
  .strict();

const CreatorMarketplacePublicManifestBaseSchema =
  CreatorMarketplaceResourceManifestBaseSchema.omit({ rightsConfirmed: true });

export const CreatorMarketplacePublicManifestSchema =
  CreatorMarketplacePublicManifestBaseSchema.superRefine(
    refineCreatorMarketplaceManifest
  );

export const CreatorMarketplaceResourceRecordSchema =
  CreatorMarketplacePublicManifestBaseSchema
    .extend({
      id: z.string().uuid(),
      manifestHash: Sha256Schema,
      manifestByteSize: z
        .number()
        .int()
        .min(1)
        .max(CREATOR_MARKETPLACE_RESOURCE_MAX_MANIFEST_BYTES),
      publisher: CreatorMarketplaceResourcePublisherSchema,
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      isOwner: z.boolean(),
      access: z.literal("free"),
    })
    .strict()
    .superRefine(refineCreatorMarketplaceManifest);

export type CreatorMarketplaceResourceRecord = z.infer<
  typeof CreatorMarketplaceResourceRecordSchema
>;

export const CreatorMarketplaceResourceListPageSchema = z
  .object({
    items: z
      .array(CreatorMarketplaceResourceRecordSchema)
      .max(CREATOR_MARKETPLACE_RESOURCE_MAX_PAGE_SIZE),
    limit: z.number().int().min(1).max(CREATOR_MARKETPLACE_RESOURCE_MAX_PAGE_SIZE),
    hasMore: z.boolean(),
    nextCursor: z
      .string()
      .min(1)
      .max(CREATOR_MARKETPLACE_RESOURCE_CURSOR_MAX_CHARACTERS)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable(),
  })
  .strict();

export type CreatorMarketplaceResourceListPage = z.infer<
  typeof CreatorMarketplaceResourceListPageSchema
>;

export function creatorMarketplaceJsonByteSize(value: unknown): number {
  const serialized = canonicalizeCreatorMarketplaceJson(value);
  return new TextEncoder().encode(serialized).byteLength;
}

export function canonicalizeCreatorMarketplaceJson(value: unknown): string {
  type PendingToken =
    | { type: "text"; value: string }
    | { type: "value"; value: unknown; depth: number };
  const pending: PendingToken[] = [{ type: "value", value, depth: 0 }];
  const serialized: string[] = [];
  const visitedObjects = new WeakSet<object>();
  let visited = 0;

  while (pending.length > 0) {
    const token = pending.pop()!;
    if (token.type === "text") {
      serialized.push(token.value);
      continue;
    }
    visited += 1;
    if (visited > 100_000 || token.depth > 64) {
      throw new TypeError("JSON canonicalization limits exceeded.");
    }
    if (token.value === null) {
      serialized.push("null");
      continue;
    }
    if (typeof token.value === "string" || typeof token.value === "boolean") {
      serialized.push(JSON.stringify(token.value));
      continue;
    }
    if (typeof token.value === "number") {
      if (!Number.isFinite(token.value)) {
        throw new TypeError("Only finite JSON numbers can be canonicalized.");
      }
      serialized.push(JSON.stringify(token.value));
      continue;
    }
    if (typeof token.value !== "object") {
      throw new TypeError("Only JSON values can be canonicalized.");
    }
    if (visitedObjects.has(token.value)) {
      throw new TypeError("Cyclic or shared object references cannot be canonicalized.");
    }
    visitedObjects.add(token.value);

    if (Array.isArray(token.value)) {
      pending.push({ type: "text", value: "]" });
      for (let index = token.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          type: "value",
          value: token.value[index],
          depth: token.depth + 1,
        });
        if (index > 0) pending.push({ type: "text", value: "," });
      }
      pending.push({ type: "text", value: "[" });
      continue;
    }
    if (!isPlainRecord(token.value)) {
      throw new TypeError("Only plain JSON objects can be canonicalized.");
    }

    const entries = Object.entries(token.value).sort(([left], [right]) =>
      left === right ? 0 : left < right ? -1 : 1
    );
    pending.push({ type: "text", value: "}" });
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index]!;
      pending.push({
        type: "value",
        value: child,
        depth: token.depth + 1,
      });
      pending.push({ type: "text", value: ":" });
      pending.push({ type: "text", value: JSON.stringify(key) });
      if (index > 0) pending.push({ type: "text", value: "," });
    }
    pending.push({ type: "text", value: "{" });
  }
  return serialized.join("");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasPortableControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function inspectPortablePayload(
  payload: unknown
): { path: Array<string | number>; message: string } | null {
  const pending: Array<{
    value: unknown;
    path: Array<string | number>;
    depth: number;
  }> = [{ value: payload, path: [], depth: 0 }];
  const visitedObjects = new WeakSet<object>();
  let visited = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    visited += 1;
    if (visited > 4_096) {
      return { path: current.path, message: "portable JSON 항목 수가 너무 많습니다." };
    }
    if (current.depth > 12) {
      return { path: current.path, message: "portable JSON 중첩 깊이가 너무 큽니다." };
    }
    if (typeof current.value === "string") {
      if (
        current.value.length > 1_000 ||
        hasPortableControlCharacter(current.value) ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(current.value.trim()) ||
        /^(?:\/\/|\\\\)/u.test(current.value.trim())
      ) {
        return {
          path: current.path,
          message: "portable JSON에는 제어문자, URI scheme, 원격 또는 protocol-relative 참조를 넣을 수 없습니다.",
        };
      }
      continue;
    }
    if (
      current.value === null ||
      typeof current.value === "boolean"
    ) continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        return { path: current.path, message: "portable JSON 숫자는 유한해야 합니다." };
      }
      continue;
    }
    if (typeof current.value !== "object") {
      return { path: current.path, message: "portable JSON 값 형식이 올바르지 않습니다." };
    }
    if (visitedObjects.has(current.value)) {
      return { path: current.path, message: "portable JSON에는 순환·공유 객체 참조를 넣을 수 없습니다." };
    }
    visitedObjects.add(current.value);

    if (Array.isArray(current.value)) {
      if (current.value.length > 256) {
        return { path: current.path, message: "portable JSON 배열 항목이 너무 많습니다." };
      }
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: current.value[index],
          path: [...current.path, index],
          depth: current.depth + 1,
        });
      }
      continue;
    }
    if (!isPlainRecord(current.value)) {
      return { path: current.path, message: "portable JSON에는 일반 객체만 사용할 수 있습니다." };
    }

    for (const [key, child] of Object.entries(current.value)) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(key)) {
        return {
          path: [...current.path, key],
          message: "portable JSON 키는 ASCII 식별자 형식이어야 합니다.",
        };
      }
      if (/^(?:data[-_]?url|base64|binary|blob|remote[-_]?url)$/iu.test(key)) {
        return {
          path: [...current.path, key],
          message: "portable JSON에는 바이너리 또는 원격 콘텐츠 필드를 넣을 수 없습니다.",
        };
      }
      pending.push({
        value: child,
        path: [...current.path, Array.isArray(current.value) ? Number(key) : key],
        depth: current.depth + 1,
      });
    }
  }
  return null;
}

function inspectKindDefinition(
  kind: CreatorMarketplaceResourceKind,
  definition: Record<string, CreatorMarketplaceJsonValue>
): { path: Array<string | number>; message: string } | null {
  const keys = Object.keys(definition).sort();
  const exactKeys = (...expected: string[]) =>
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index]);
  const stableId = (value: unknown) =>
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/u.test(value);

  if (kind === "brush") {
    if (!exactKeys("snapshot") || !isPlainRecord(definition.snapshot) ||
      Object.keys(definition.snapshot).length === 0) {
      return {
        path: [],
        message: "브러시 definition은 비어 있지 않은 snapshot 객체 하나만 포함해야 합니다.",
      };
    }
    return null;
  }
  if (kind === "filter") {
    if (
      !exactKeys("engine", "values") ||
      !stableId(definition.engine) ||
      !isPlainRecord(definition.values) ||
      Object.keys(definition.values).length === 0
    ) {
      return {
        path: [],
        message: "필터 definition에는 engine과 비어 있지 않은 values 객체가 필요합니다.",
      };
    }
    return null;
  }
  if (kind === "palette") {
    if (!exactKeys("colors") || !Array.isArray(definition.colors) ||
      definition.colors.length < 1 || definition.colors.length > 64) {
      return { path: ["colors"], message: "팔레트에는 1~64개의 색상이 필요합니다." };
    }
    const colors = definition.colors;
    if (
      colors.some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}$/u.test(color)) ||
      new Set(colors).size !== colors.length
    ) {
      return {
        path: ["colors"],
        message: "팔레트 색상은 중복 없는 소문자 #rrggbb 형식이어야 합니다.",
      };
    }
    return null;
  }
  if (kind === "template") {
    if (!exactKeys("templateId") || !stableId(definition.templateId)) {
      return {
        path: [],
        message: "템플릿 definition에는 안정적인 templateId 하나만 필요합니다.",
      };
    }
    return null;
  }
  if (
    !(
      exactKeys("recipeId") ||
      exactKeys("parameters", "recipeId")
    ) ||
    !stableId(definition.recipeId) ||
    (Object.hasOwn(definition, "parameters") && !isPlainRecord(definition.parameters))
  ) {
    return {
      path: [],
      message: "절차형 2D/3D definition에는 recipeId와 선택적 parameters 객체만 사용할 수 있습니다.",
    };
  }
  return null;
}
