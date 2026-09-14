import { PrivateObjectStorageError } from "./private-object-storage.error";
import {
  PrivateObjectPurposeSchema,
  type CreatePrivateSignedReadUrl,
  type DeletePrivateObject,
  type PrivateObjectPurpose,
  type PrivateObjectReference,
  type PrivateSignedReadUrl,
  type UploadPrivateObject,
} from "./private-object-storage.contract";

import type { PrivateObjectStorageWriteAdmission } from "./private-object-storage-write-admission";

import type {
  PrivateObjectStorageCallOptions,
  PrivateObjectStoragePort,
  PrivateObjectStorageReadiness,
} from "./private-object-storage.port";

export const PRIVATE_OBJECT_STORAGE_PROVIDER_IDS = [
  "supabase",
  "cloudflare-r2",
  "backblaze-b2",
] as const;

export type PrivateObjectStorageProviderId =
  (typeof PRIVATE_OBJECT_STORAGE_PROVIDER_IDS)[number];

export type PrivateObjectStoragePurposeRouting = Readonly<
  Record<PrivateObjectPurpose, PrivateObjectStorageProviderId>
>;

const ALL_PURPOSES = PrivateObjectPurposeSchema.options;

function uniquePurposes(
  purposes: readonly PrivateObjectPurpose[] | undefined,
): readonly PrivateObjectPurpose[] {
  const parsed = (purposes ?? ALL_PURPOSES).map((purpose) =>
    PrivateObjectPurposeSchema.parse(purpose),
  );
  return [...new Set(parsed)];
}

export class PurposeRoutedPrivateObjectStoragePort
  implements PrivateObjectStoragePort
{
  constructor(
    private readonly routing: PrivateObjectStoragePurposeRouting,
    private readonly providers: ReadonlyMap<
      PrivateObjectStorageProviderId,
      PrivateObjectStoragePort
    >,
    private readonly writeAdmission?: PrivateObjectStorageWriteAdmission,
  ) {
    for (const purpose of ALL_PURPOSES) {
      const providerId = routing[purpose];
      if (!PRIVATE_OBJECT_STORAGE_PROVIDER_IDS.includes(providerId)) {
        throw new PrivateObjectStorageError("ROUTING_INVALID");
      }
      if (!providers.has(providerId)) {
        throw new PrivateObjectStorageError("PROVIDER_NOT_CONFIGURED");
      }
    }
  }

  async verifyPrivatePurposeBuckets(
    options: PrivateObjectStorageCallOptions = {},
    purposes?: readonly PrivateObjectPurpose[],
  ): Promise<PrivateObjectStorageReadiness> {
    const requested = uniquePurposes(purposes);
    if (requested.length === 0) {
      throw new PrivateObjectStorageError("INVALID_INPUT");
    }
    const grouped = new Map<
      PrivateObjectStorageProviderId,
      PrivateObjectPurpose[]
    >();
    for (const purpose of requested) {
      const providerId = this.routing[purpose];
      const group = grouped.get(providerId) ?? [];
      group.push(purpose);
      grouped.set(providerId, group);
    }

    const verifiedCounts = await Promise.all(
      [...grouped.entries()].map(async ([providerId, group]) => {
        const provider = this.requireProvider(providerId);
        const readiness = await provider.verifyPrivatePurposeBuckets(
          options,
          group,
        );
        if (
          readiness.ready !== true
          || readiness.privatePurposeBuckets !== group.length
        ) {
          throw new PrivateObjectStorageError("BUCKET_POLICY_INVALID");
        }
        return readiness.privatePurposeBuckets;
      }),
    );
    const verified = verifiedCounts.reduce((total, count) => total + count, 0);
    if (verified !== requested.length) {
      throw new PrivateObjectStorageError("BUCKET_POLICY_INVALID");
    }
    return { ready: true, privatePurposeBuckets: verified };
  }

  async uploadImmutable(
    input: UploadPrivateObject,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<PrivateObjectReference> {
    const providerId = this.providerIdFor(input.purpose);
    await this.writeAdmission?.assertUploadAllowed(providerId, input);
    return this.requireProvider(providerId).uploadImmutable(input, options);
  }

  createSignedReadUrl(
    input: CreatePrivateSignedReadUrl,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<PrivateSignedReadUrl> {
    return this.providerFor(input.object.purpose).createSignedReadUrl(
      input,
      options,
    );
  }
  deleteGeneratedObject(
    input: DeletePrivateObject,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<void> {
    return this.providerFor(input.object.purpose).deleteGeneratedObject(
      input,
      options,
    );
  }

  private providerFor(
    purposeValue: PrivateObjectPurpose,
  ): PrivateObjectStoragePort {
    return this.requireProvider(this.providerIdFor(purposeValue));
  }

  private providerIdFor(
    purposeValue: PrivateObjectPurpose,
  ): PrivateObjectStorageProviderId {
    const purpose = PrivateObjectPurposeSchema.parse(purposeValue);
    return this.routing[purpose];
  }

  private requireProvider(
    providerId: PrivateObjectStorageProviderId,
  ): PrivateObjectStoragePort {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new PrivateObjectStorageError("PROVIDER_NOT_CONFIGURED");
    }
    return provider;
  }
}
