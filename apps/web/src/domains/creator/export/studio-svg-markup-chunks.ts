/** 마크마다 문자열을 보관하지 않고 64KiB씩 묶어 긴 획의 중간 배열을 제한한다. */
export class StudioSvgMarkupChunks {
  private readonly chunks: string[] = [];
  private pending = "";

  append(markup: string): void {
    this.pending += markup;
    if (this.pending.length >= 32_768) {
      this.chunks.push(this.pending);
      this.pending = "";
    }
  }

  finish(): string {
    if (this.pending) {
      this.chunks.push(this.pending);
      this.pending = "";
    }
    return this.chunks.join("");
  }
}
