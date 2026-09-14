#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { privateObjectStorageRoutingFingerprint } from "../apps/api/src/infrastructure/private-object-storage/private-object-storage.config";
import {
  PRIVATE_OBJECT_STORAGE_PROVIDER_IDS,
  type PrivateObjectStorageProviderId,
  type PrivateObjectStoragePurposeRouting,
} from "../apps/api/src/infrastructure/private-object-storage/purpose-routed-private-object-storage.port";

const PURPOSES = ["source", "derived", "export"] as const;
type Purpose = (typeof PURPOSES)[number];

type Environment = Readonly<Record<string, string | undefined>>;

function argumentValue(argumentsValue: readonly string[], name: string): string | undefined {
  const exact = `--${name}`;
  const assignment = `${exact}=`;
  for (let index = 0; index < argumentsValue.length; index += 1) {
    const value = argumentsValue[index];
    if (value.startsWith(assignment)) return value.slice(assignment.length);
    if (value === exact) return argumentsValue[index + 1];
  }
  return undefined;
}

function providerId(value: string | undefined, purpose: Purpose): PrivateObjectStorageProviderId {
  if (
    !value
    || !PRIVATE_OBJECT_STORAGE_PROVIDER_IDS.includes(
      value as PrivateObjectStorageProviderId,
    )
  ) {
    throw new Error(
      `${purpose} provider must be one of ${PRIVATE_OBJECT_STORAGE_PROVIDER_IDS.join(", ")}`,
    );
  }
  return value as PrivateObjectStorageProviderId;
}

export function resolveRoutingFingerprintInput(
  argumentsValue: readonly string[],
  environment: Environment,
): PrivateObjectStoragePurposeRouting {
  return Object.fromEntries(PURPOSES.map((purpose) => {
    const environmentKey = `PRIVATE_OBJECT_STORAGE_${purpose.toUpperCase()}_PROVIDER`;
    return [
      purpose,
      providerId(
        argumentValue(argumentsValue, purpose) ?? environment[environmentKey],
        purpose,
      ),
    ];
  })) as unknown as PrivateObjectStoragePurposeRouting;
}

export function renderRoutingFingerprint(
  routing: PrivateObjectStoragePurposeRouting,
  valueOnly = false,
): string {
  const fingerprint = privateObjectStorageRoutingFingerprint(routing);
  return valueOnly
    ? fingerprint
    : `PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT=${fingerprint}`;
}

export function main(
  argumentsValue: readonly string[] = process.argv.slice(2),
  environment: Environment = process.env,
): void {
  const routing = resolveRoutingFingerprintInput(argumentsValue, environment);
  console.log(renderRoutingFingerprint(routing, argumentsValue.includes("--value-only")));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
