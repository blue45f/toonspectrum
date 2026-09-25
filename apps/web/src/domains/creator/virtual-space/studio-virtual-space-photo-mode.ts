export interface StudioVirtualPhotoCapture {
  readonly filename: string;
  readonly bytes: number;
}

function photoFilename(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/gu, "-");
  return `toonspectrum-virtual-studio-${stamp}.png`;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("photo-encoding-failed"));
      }, "image/png");
    } catch (error) {
      reject(error instanceof Error ? error : new Error("photo-encoding-failed"));
    }
  });
}

export async function captureStudioVirtualPhoto(
  root: ParentNode = document,
  now = Date.now(),
): Promise<StudioVirtualPhotoCapture> {
  const canvas = root.querySelector<HTMLCanvasElement>(".studio-vspace-phaser-canvas canvas");
  if (!canvas || canvas.width < 1 || canvas.height < 1) throw new Error("photo-canvas-unavailable");
  const blob = await canvasBlob(canvas);
  const filename = photoFilename(now);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return Object.freeze({ filename, bytes: blob.size });
}
