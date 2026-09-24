export const CREATOR_PUBLICATION_MEDIA_STORAGE_MODE_ENV =
  "CREATOR_PUBLICATION_MEDIA_STORAGE_MODE" as const;

export type CreatorPublicationMediaStorageMode =
  | "legacy"
  | "optional"
  | "required";

export interface CreatorPublicationMediaStorageConfig {
  readonly mode: CreatorPublicationMediaStorageMode;
  readonly externalizationEnabled: boolean;
  readonly storageRequired: boolean;
}

type Environment = Partial<Record<string, string | undefined>>;

export function resolveCreatorPublicationMediaStorageConfig(
  environment: Environment = process.env,
): CreatorPublicationMediaStorageConfig {
  const raw = environment[CREATOR_PUBLICATION_MEDIA_STORAGE_MODE_ENV]
    ?.trim()
    .toLowerCase();
  const mode: CreatorPublicationMediaStorageMode =
    raw === undefined || raw === ""
      ? "optional"
      : raw === "legacy" || raw === "optional" || raw === "required"
        ? raw
        : (() => {
            throw new Error(
              `${CREATOR_PUBLICATION_MEDIA_STORAGE_MODE_ENV} must be legacy, optional, or required`,
            );
          })();
  return {
    mode,
    externalizationEnabled: mode !== "legacy",
    storageRequired: mode === "required",
  };
}
