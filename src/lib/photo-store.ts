// Separate localStorage bucket for large base64 photo data. Keeping this out
// of the main draft object keeps `propertywalk:cache:<id>` small enough to
// serialize instantly on every Next tap (Fix 2B).
//
// Storage shape (single key):
//   propertywalk_photos = { "EXTERIOR_FRONT.jpg": "data:image/jpeg;base64,..." }
//
// In the wizard answer we store the *filename* string in `photos[]`. The
// resolver below turns a filename back into a data URL for rendering. Legacy
// drafts that still have a raw `data:` URL in `photos[]` continue to work
// because the resolver passes those through unchanged.

const PHOTOS_KEY = "propertywalk_photos";

type PhotoMap = Record<string, string>;

function readMap(): PhotoMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PHOTOS_KEY);
    return raw ? (JSON.parse(raw) as PhotoMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: PhotoMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(map));
  } catch (e) {
    // Quota exceeded — best effort. The compressed photos should keep us
    // well under the 5MB limit for typical walkthroughs.
    console.warn("[photo-store] write failed", e);
  }
}

export function savePhoto(filename: string, dataUrl: string) {
  const map = readMap();
  map[filename] = dataUrl;
  writeMap(map);
}

export function removePhoto(filename: string) {
  const map = readMap();
  if (filename in map) {
    delete map[filename];
    writeMap(map);
  }
}

// Resolve a stored photo entry to a data URL suitable for <img src="...">.
// Accepts either a filename (looked up in the photo store) or a raw data URL
// (returned as-is for backward compatibility with older drafts).
export function resolvePhotoSrc(entry: string | undefined): string | undefined {
  if (!entry) return undefined;
  if (entry.startsWith("data:") || entry.startsWith("blob:") || entry.startsWith("http")) {
    return entry;
  }
  const map = readMap();
  return map[entry];
}

// Compress an image File to JPEG, max 1600px on the longest side, quality 0.75
// (Fix 2C). Falls back to the original data URL if anything fails (e.g. HEIC
// in a browser without decoder support).
export async function compressImage(file: File): Promise<string> {
  const MAX_DIM = 1600;
  const QUALITY = 0.75;

  const readAsDataURL = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });

  const original = await readAsDataURL(file);

  // Videos and non-images: store as-is (videos won't be compressed here).
  if (!file.type.startsWith("image/")) return original;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = original;
    });

    let { width, height } = img;
    if (width > MAX_DIM || height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } catch {
    return original;
  }
}
