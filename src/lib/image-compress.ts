// Compress an image to JPEG with target max bytes via canvas re-encoding.
// Iterates quality + dimension downscale until under the limit (or quality floor reached).
export async function compressImage(
  file: File,
  opts: { maxBytes?: number; maxDim?: number; mime?: string } = {},
): Promise<Blob> {
  const maxBytes = opts.maxBytes ?? 500 * 1024;
  const maxDim = opts.maxDim ?? 1024;
  const mime = opts.mime ?? "image/jpeg";

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  // Downscale to fit within maxDim while preserving aspect ratio.
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  let quality = 0.85;
  let blob = await renderToBlob(img, width, height, mime, quality);

  // Iteratively reduce quality, then dimensions, until under maxBytes.
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await renderToBlob(img, width, height, mime, quality);
  }
  while (blob.size > maxBytes && Math.max(width, height) > 256) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    blob = await renderToBlob(img, width, height, mime, quality);
  }
  return blob;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}

function renderToBlob(
  img: HTMLImageElement,
  w: number,
  h: number,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas not supported"));
      return;
    }
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encode failed"))),
      mime,
      quality,
    );
  });
}
