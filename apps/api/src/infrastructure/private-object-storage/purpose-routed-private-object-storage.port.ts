import { PrivateObjectStorageError } from "./private-object-storage.error";
import {
  PRIVATE_OBJECT_STORAGE_PROVIDER_IDS,
  PrivateObjectPurposeSchema,
  PrivateObjectReferenceSchema,
  isLocatedPrivateObjectReference,
  locatePrivateObjectReference,
  unlocatePrivateObjectReference,
  type CreatePrivateSignedReadUrl,
  type DeletePrivateObject,
  type PrivateObjectPurpose,
  type PrivateObjectReference,
  type PrivateObjectStorageProviderId,
  type PrivateSignedReadUrl,
  type UploadPrivateObject,
} from "./private-object-storage.contract";

import type { PrivateObjectStorageWriteAdmission } from "./private-object-storage-write-admission";

import type {
  PrivateObjectStorageCallOptions,
  PrivateObjectStoragePort,
  PrivateObjectStorageReadiness,
} from "./private-object-storage.port";

export { PRIVATE_OBJECT_STORAGE_PROVIDER_IDS };
export type { PrivateObjectStorageProviderId };

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
    const providerId = this.providerIdForPurpose(input.purpose);
    await this.writeAdmission?.assertUploadAllowed(providerId, input);
    const uploaded = await this.requireProvider(providerId).uploadImmutable(
      input,
      options,
    );
    try {
      return locatePrivateObjectReference(providerId, uploaded);
    } catch {
      throw new PrivateObjectStorageError("INVALID_RESPONSE");
    }
  }

  async createSignedReadUrl(
    inputValue: CreatePrivateSignedReadUrl,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<PrivateSignedReadUrl> {
    const input = this.parseLocatedOperation(inputValue);
    return await this.requireProvider(input.providerId).createSignedReadUrl(
      {
        object: unlocatePrivateObjectReference(input.object),
        expiresInSeconds: input.expiresInSeconds,
      },
      options,
    );
  }

  async deleteGeneratedObject(
    inputValue: DeletePrivateObject,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<void> {
    const object = PrivateObjectReferenceSchema.parse(inputValue.object);
    const providerId = this.providerIdForObject(object);
    await this.requireProvider(providerId).deleteGeneratedObject(
      { object: unlocatePrivateObjectReference(object) },
      options,
    );
  }

  private parseLocatedOperation(inputValue: CreatePrivateSignedReadUrl): {
    readonly providerId: PrivateObjectStorageProviderId;
    readonly object: PrivateObjectReference;
    readonly expiresInSeconds: number;
  } {
    const object = PrivateObjectReferenceSchema.parse(inputValue.object);
    return {
      providerId: this.providerIdForObject(object),
      object,
      expiresInSeconds: inputValue.expiresInSeconds,
    };
  }

  private providerIdForObject(
    object: PrivateObjectReference,
  ): PrivateObjectStorageProviderId {
    return isLocatedPrivateObjectReference(object)
      ? object.providerId
      : this.providerIdForPurpose(object.purpose);
  }

  private providerIdForPurpose(
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
