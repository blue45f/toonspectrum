/** Bounded PNG scanline encoder. Native zlib stream; never allocates a full image/canvas. */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let n = i;
  for (let bit = 0; bit < 8; bit++)
    n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  CRC_TABLE[i] = n >>> 0;
}
function chunk(
  type: string,
  payload: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(payload.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.length);
  for (let i = 0; i < 4; i++) result[4 + i] = type.charCodeAt(i);
  result.set(payload, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < result.length - 4; i++)
    crc = CRC_TABLE[(crc ^ result[i]!) & 255]! ^ (crc >>> 8);
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}
export class StudioBg3dStreamingPng {
  private readonly writer: WritableStreamDefaultWriter<BufferSource>;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  private readonly reading: Promise<void>;
  private chunks: Uint8Array<ArrayBuffer>[] = [];
  private bytes = 0;
  private rows = 0;
  private closed = false;
  private failure: unknown;
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly maxBytes = 24 * 1024 * 1024,
  ) {
    if (
      !Number.isSafeInteger(width) ||
      width < 1 ||
      width > 4096 ||
      !Number.isSafeInteger(height) ||
      height < 1 ||
      height > 4096 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 128
    )
      throw new RangeError("Invalid PNG output budget.");
    if (typeof CompressionStream !== "function")
      throw new Error("Streaming PNG compression is unavailable.");
    const stream = new CompressionStream("deflate");
    this.writer = stream.writable.getWriter();
    this.reader = stream.readable.getReader();
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8;
    header[9] = 6;
    this.add(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    this.add(chunk("IHDR", header));
    this.add(chunk("sRGB", new Uint8Array([0])));
    const reader = this.reader;
    this.reading = (async () => {
      while (true) {
        const value = await reader.read();
        if (value.done) break;
        if (value.value.length)
          this.add(chunk("IDAT", new Uint8Array(value.value)));
      }
    })().catch((error: unknown) => {
      this.failure = error;
      void this.writer.abort(error).catch(() => {});
    });
  }
  private add(value: Uint8Array<ArrayBuffer>): void {
    if (this.bytes + value.length > this.maxBytes)
      throw new RangeError("Compressed PNG exceeds its output budget.");
    this.bytes += value.length;
    this.chunks.push(value);
  }
  async appendRows(
    rgba: Uint8Array | Uint8ClampedArray,
    count: number,
  ): Promise<void> {
    if (this.closed || this.failure)
      throw this.failure ?? new Error("PNG encoder is closed.");
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      this.rows + count > this.height ||
      rgba.length !== this.width * count * 4
    )
      throw new RangeError("Invalid PNG row band.");
    // Bounded write chunks give compression real backpressure without holding the full frame.
    for (let y = 0; y < count; y += 32) {
      const rows = Math.min(32, count - y);
      const stride = this.width * 4;
      const scanlines = new Uint8Array((stride + 1) * rows);
      for (let row = 0; row < rows; row++) {
        const destination = row * (stride + 1);
        scanlines[destination] = 1; // PNG Sub filter.
        for (let x = 0; x < stride; x++)
          scanlines[destination + 1 + x] =
            (rgba[(y + row) * stride + x]! -
              (x >= 4 ? rgba[(y + row) * stride + x - 4]! : 0)) &
            255;
      }
      await this.writer.write(scanlines);
      if (this.failure) throw this.failure;
    }
    this.rows += count;
  }
  async finish(): Promise<Blob> {
    if (this.closed || this.rows !== this.height)
      throw new Error("PNG rows are incomplete or encoder is closed.");
    this.closed = true;
    await this.writer.close();
    await this.reading;
    if (this.failure) throw this.failure;
    this.add(chunk("IEND", new Uint8Array()));
    const png = new Blob(this.chunks, { type: "image/png" });
    this.chunks = [];
    return png;
  }
  async abort(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([this.writer.abort(), this.reader.cancel()]);
    await this.reading;
    this.chunks = [];
  }
}
