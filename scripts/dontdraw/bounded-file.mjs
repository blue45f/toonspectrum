import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

/** Fixed-size reads: never read to a moving EOF or allocate beyond the declared limit. */
export async function readBoundedHandle(handle, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Invalid file byte limit");
  const before = await handle.stat({ bigint: true });
  if (!before.isFile() || before.size < 1n || before.size > BigInt(maximumBytes)) {
    throw new Error(`Expected a nonempty regular file within ${maximumBytes} bytes`);
  }
  const size = Number(before.size);
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(bytes, offset, Math.min(size - offset, 1024 * 1024), offset);
    if (bytesRead === 0) throw new Error("Source changed while reading: truncated file");
    offset += bytesRead;
  }
  const { bytesRead: extra } = await handle.read(Buffer.alloc(1), 0, 1, size);
  const after = await handle.stat({ bigint: true });
  if (extra || !after.isFile() || ["dev", "ino", "size", "mtimeNs", "ctimeNs"].some((key) => before[key] !== after[key])) {
    throw new Error("Source changed while reading");
  }
  return bytes;
}

export async function readBoundedFile(filename, maximumBytes) {
  // Reject FIFOs/devices before opening. NONBLOCK also prevents a replacement FIFO from hanging.
  const stat = await lstat(filename, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Expected a regular file, not a symlink or special file");
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  const handle = await open(filename, flags);
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error("Source replaced before reading");
    return await readBoundedHandle(handle, maximumBytes);
  } finally {
    await handle.close();
  }
}
