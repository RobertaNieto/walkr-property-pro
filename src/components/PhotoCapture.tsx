import { Camera, CheckCircle2, Loader2, Play, X } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { compressImage, removePhoto, resolvePhotoSrc, savePhoto } from "@/lib/photo-store";

interface PhotoCaptureProps {
  // Each entry is either a filename (preferred, points into photo-store) or
  // a legacy raw data URL. PhotoCapture handles both transparently.
  photos: string[];
  // Index-aligned filenames for newly captured photos. When provided, the
  // component will store the compressed data URL under that filename in the
  // photo store and pass the filename back to the parent via onChange.
  filenames?: string[];
  // Base filename used to generate names for newly captured photos
  // (e.g. "EXTERIOR_FRONT" -> "EXTERIOR_FRONT.jpg", "EXTERIOR_FRONT_2.jpg").
  baseName?: string;
  // True when capturing video (.mp4 extension and <video> preview).
  isVideo?: boolean;
  onChange: (photos: string[], filenames: string[]) => void;
  error?: boolean;
  // When true, hides the add and remove controls. Used when an admin is
  // editing another agent's walkthrough — they can view photos but not
  // add or delete them.
  readOnly?: boolean;
}

function makeName(base: string, idx: number, isVideo: boolean): string {
  const ext = isVideo ? "mp4" : "jpg";
  return idx === 0 ? `${base}.${ext}` : `${base}_${idx + 1}.${ext}`;
}

export function PhotoCapture({
  photos,
  filenames,
  baseName,
  isVideo,
  onChange,
  error,
  readOnly,
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const localCache = useRef<Record<string, string>>({});
  const fileMeta = useRef<Record<string, { size: number; original: string }>>({});
  const [processing, setProcessing] = useState(false);
  const [orientationError, setOrientationError] = useState(false);

  const getDimensions = (dataUrl: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("decode failed"));
      img.src = dataUrl;
    });

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setProcessing(true);
    setOrientationError(false);
    try {
      const startIdx = photos.length;
      const newPhotos: string[] = [];
      const newNames: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = isVideo
          ? await new Promise<string>((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(r.result as string);
              r.onerror = () => rej(r.error);
              r.readAsDataURL(file);
            })
          : await compressImage(file);
        // Enforce landscape orientation for photos.
        if (!isVideo) {
          try {
            const { width, height } = await getDimensions(compressed);
            if (height > width) {
              setOrientationError(true);
              continue;
            }
          } catch {
            // If dimension check fails, allow through.
          }
        }
        const name = baseName
          ? makeName(baseName, startIdx + i, !!isVideo)
          : `PHOTO_${Date.now()}_${i}.${isVideo ? "mp4" : "jpg"}`;
        // Persist heavy data in IndexedDB photo bucket. Await ensures any
        // failure surfaces before we tell the parent the photo exists.
        await savePhoto(name, compressed);
        // Belt-and-suspenders: keep an instance-local copy so the thumbnail
        // renders even if the IDB write or memCache lookup is somehow slow.
        localCache.current[name] = compressed;
        fileMeta.current[name] = { size: file.size, original: file.name };
        newPhotos.push(name);
        newNames.push(name);
      }
      if (newPhotos.length > 0) {
        onChange([...photos, ...newPhotos], [...(filenames ?? photos), ...newNames]);
      }
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (idx: number) => {
    const entry = photos[idx];
    // Only remove from store if it was a filename we saved.
    if (entry && !entry.startsWith("data:")) void removePhoto(entry);
    const nextPhotos = photos.filter((_, i) => i !== idx);
    const nextNames = (filenames ?? photos).filter((_, i) => i !== idx);
    onChange(nextPhotos, nextNames);
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={isVideo ? "video/*" : "image/*"}
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <button
            type="button"
            disabled={processing}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-3 py-2 text-base font-semibold transition-colors active:scale-[0.99] disabled:opacity-60",
              error
                ? "field-error border-critical bg-critical/5 text-critical"
                : "border-accent/40 bg-accent/5 text-accent hover:border-accent hover:bg-accent/10"
            )}
          >
            {processing ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Processing photo…
              </>
            ) : isVideo ? (
              <>
                <Camera className="h-6 w-6" />
                Add Video
              </>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-base font-bold">📷 Add Photo</span>
                <span className="text-xs font-normal opacity-75">
                  🔄 Landscape orientation required
                </span>
              </div>
            )}
          </button>

          {orientationError && !isVideo && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <span className="text-lg">📱➡️</span>
              <span>
                Portrait photo detected.<br />
                <strong>Please rotate your phone sideways</strong> and retake.
              </span>
            </div>
          )}
        </>
      )}

      {readOnly && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          Photos are read-only in admin edit view.
        </p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((entry, i) => {
            const src = resolvePhotoSrc(entry) ?? localCache.current[entry];
            const meta = fileMeta.current[entry];
            const displayName = meta?.original ?? entry;
            const sizeMb = meta ? Math.max(1, Math.round(meta.size / (1024 * 1024))) : null;
            const loaded = !!src || !!meta;
            return (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xl bg-secondary"
              >
                {isVideo ? (
                  // Always show a clear video confirmation card, even when the
                  // <video> poster fails to render on iOS Safari.
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-900 px-2 text-center">
                    {loaded ? (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                          <Play className="h-5 w-5 fill-white text-white" />
                        </div>
                        <p className="line-clamp-1 max-w-full text-[10px] font-medium text-white/90">
                          {displayName}
                        </p>
                        {sizeMb !== null && (
                          <p className="text-[10px] text-white/60">{sizeMb} MB</p>
                        )}
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin text-white/80" />
                        <p className="text-[10px] text-white/70">Loading…</p>
                      </>
                    )}
                  </div>
                ) : src ? (
                  <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-800 text-center">
                    <Camera className="h-6 w-6 text-white/80" />
                    <p className="text-[10px] font-medium text-white/90">Photo added ✓</p>
                  </div>
                )}

                {loaded && (
                  <div
                    className="absolute left-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
                    aria-label="Attached"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove"
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/70 text-background backdrop-blur-sm transition-colors hover:bg-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
