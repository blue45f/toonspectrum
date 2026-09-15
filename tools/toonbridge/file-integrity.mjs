import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

function fileError(message, code) {
  return Object.assign(new Error(message), { code });
}

export async function hashFileStream(
  path,
  {
    maxBytes = Number.MAX_SAFE_INTEGER,
    tooLargeCode = "FILE_TOO_LARGE",
  } = {},
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const linkMetadata = await lstat(path);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) {
    throw fileError("Path is not a regular file", "FILE_NOT_REGULAR");
  }

  let handle;
  try {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    handle = await open(path, constants.O_RDONLY | noFollow);
  } catch (cause) {
    if (cause?.code === "ELOOP") {
      throw fileError("Symbolic links are not valid outputs", "FILE_NOT_REGULAR");
    }
    throw cause;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw fileError("Path is not a regular file", "FILE_NOT_REGULAR");
    }
    if (metadata.size > maxBytes) {
      throw fileError("File exceeds the allowed size", tooLargeCode);
    }

    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw fileError("File exceeds the allowed size", tooLargeCode);
      }
      hash.update(chunk);
    }
    if (bytes !== metadata.size) {
      throw fileError(
        "File changed during integrity verification",
        "FILE_CHANGED_DURING_HASH",
      );
    }
    return Object.freeze({
      digest: `sha256:${hash.digest("hex")}`,
      bytes,
    });
  } finally {
    await handle.close();
  }
}
