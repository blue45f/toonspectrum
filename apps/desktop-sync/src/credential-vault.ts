export interface DesktopCredentialVault {
  get(service: string, account: string, signal?: AbortSignal): Promise<string | null>;
  set(
    service: string,
    account: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void>;
  delete(service: string, account: string, signal?: AbortSignal): Promise<boolean>;
}

export type DesktopCredentialVaultErrorCode =
  | "invalid-key"
  | "unavailable"
  | "read-failed"
  | "write-failed"
  | "delete-failed";

export class DesktopCredentialVaultError extends Error {
  constructor(
    readonly code: DesktopCredentialVaultErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DesktopCredentialVaultError";
  }
}

function normalizedKey(value: string, label: string): string {
  const clean = value.normalize("NFKC").trim();
  const hasControlCharacter = Array.from(clean).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    clean.length < 1
    || clean.length > 240
    || hasControlCharacter
  ) {
    throw new DesktopCredentialVaultError(
      "invalid-key",
      `${label} must contain 1-240 printable characters`,
    );
  }
  return clean;
}

interface AsyncKeyringEntry {
  getPassword(signal?: AbortSignal | null): Promise<string | undefined>;
  setPassword(value: string, signal?: AbortSignal | null): Promise<void>;
  deleteCredential(signal?: AbortSignal | null): Promise<boolean>;
}

interface AsyncKeyringEntryConstructor {
  new(service: string, username: string): AsyncKeyringEntry;
}

async function createSystemEntry(
  service: string,
  account: string,
): Promise<AsyncKeyringEntry> {
  let module: typeof import("@napi-rs/keyring");
  try {
    module = await import("@napi-rs/keyring");
  } catch (error) {
    throw new DesktopCredentialVaultError(
      "unavailable",
      "the operating-system credential vault is unavailable",
      { cause: error },
    );
  }
  const Constructor = module.AsyncEntry as unknown as AsyncKeyringEntryConstructor;
  if (process.platform !== "linux") {
    return new Constructor(service, account);
  }
  try {
    return Reflect.construct(Constructor, [
      service,
      account,
      { linux: { store: "secret-service" } },
    ]) as AsyncKeyringEntry;
  } catch (error) {
    throw new DesktopCredentialVaultError(
      "unavailable",
      "a persistent Secret Service credential vault is required on Linux",
      { cause: error },
    );
  }
}

function isMissingCredential(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("no entry")
    || message.includes("not found")
    || message.includes("no matching entry");
}

export class SystemDesktopCredentialVault implements DesktopCredentialVault {
  async get(
    serviceValue: string,
    accountValue: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const service = normalizedKey(serviceValue, "credential service");
    const account = normalizedKey(accountValue, "credential account");
    if (signal?.aborted) throw signal.reason;
    try {
      const entry = await createSystemEntry(service, account);
      const value = await entry.getPassword(signal ?? null);
      return typeof value === "string" ? value : null;
    } catch (error) {
      if (isMissingCredential(error)) return null;
      if (error instanceof DesktopCredentialVaultError) throw error;
      throw new DesktopCredentialVaultError(
        "read-failed",
        "the operating-system credential vault could not read the credential",
        { cause: error },
      );
    }
  }

  async set(
    serviceValue: string,
    accountValue: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const service = normalizedKey(serviceValue, "credential service");
    const account = normalizedKey(accountValue, "credential account");
    if (!value || Buffer.byteLength(value, "utf8") > 256 * 1024) {
      throw new DesktopCredentialVaultError(
        "write-failed",
        "credential payload must contain 1-262144 UTF-8 bytes",
      );
    }
    if (signal?.aborted) throw signal.reason;
    try {
      const entry = await createSystemEntry(service, account);
      await entry.setPassword(value, signal ?? null);
    } catch (error) {
      if (error instanceof DesktopCredentialVaultError) throw error;
      throw new DesktopCredentialVaultError(
        "write-failed",
        "the operating-system credential vault could not store the credential",
        { cause: error },
      );
    }
  }

  async delete(
    serviceValue: string,
    accountValue: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const service = normalizedKey(serviceValue, "credential service");
    const account = normalizedKey(accountValue, "credential account");
    if (signal?.aborted) throw signal.reason;
    try {
      const entry = await createSystemEntry(service, account);
      return await entry.deleteCredential(signal ?? null);
    } catch (error) {
      if (isMissingCredential(error)) return false;
      if (error instanceof DesktopCredentialVaultError) throw error;
      throw new DesktopCredentialVaultError(
        "delete-failed",
        "the operating-system credential vault could not delete the credential",
        { cause: error },
      );
    }
  }
}

export class MemoryDesktopCredentialVault implements DesktopCredentialVault {
  private readonly values = new Map<string, string>();

  private key(service: string, account: string): string {
    return `${normalizedKey(service, "credential service")}\u0000${normalizedKey(account, "credential account")}`;
  }

  async get(service: string, account: string, signal?: AbortSignal): Promise<string | null> {
    if (signal?.aborted) throw signal.reason;
    return this.values.get(this.key(service, account)) ?? null;
  }

  async set(
    service: string,
    account: string,
    value: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    if (!value) {
      throw new DesktopCredentialVaultError("write-failed", "credential is empty");
    }
    this.values.set(this.key(service, account), value);
  }

  async delete(service: string, account: string, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) throw signal.reason;
    return this.values.delete(this.key(service, account));
  }
}
