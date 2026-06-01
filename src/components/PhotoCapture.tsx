import { Camera, CheckCircle2, Loader2, Play, X } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getStorageSignedUrl,
  removePhoto,
  removeStoragePhoto,
  resolvePhotoSrc,
  savePhoto,
  saveStoragePhoto,
  type StorageContext,
} from "@/lib/photo-store";

interface PhotoCaptureProps {
  photos: string[];
  filenames?: string[];
  baseName?: string;
  isVideo?: boolean;
  onChange: (photos: string[], filenames: string[]) => void;
  error?: boolean;
  readOnly?: boolean;
  /** When provided, label is rendered on the left of the trigger button. */
  label?: string;
  required?: boolean;
  storageContext?: StorageContext;
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
  readOnly: _readOnly,
  label,
  required: _required,
  storageContext,
}: PhotoCaptureProps) {

  const readOnly = false;
  const useStorage = !!storageContext;
  // Cached signed URLs for filenames being viewed in storage mode.
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const localCache = useRef<Record<string, string>>({});
  const fileMeta = useRef<Record<string, { size: number; original: string }>>({});
  const [processing, setProcessing] = useState(false);
  const [orientationError, setOrientationError] = useState<string | null>(null);

  const getImageDims = (dataUrl: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("decode"));
      img.src = dataUrl;
    });

  const getVideoDims = (dataUrl: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        resolve({ width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => reject(new Error("decode"));
      v.src = dataUrl;
    });

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setProcessing(true);
    setOrientationError(null);
    try {
      const startIdx = photos.length;
      const newPhotos: string[] = [];
      const newNames: string[] = [];
      let orientationFail = false;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(r.error);
          r.readAsDataURL(file);
        });
        // Orientation check — reject before saving.
        try {
          const { width, height } = isVideo
            ? await getVideoDims(dataUrl)
            : await getImageDims(dataUrl);
          if (width && height) {
            if (isVideo && width > height) {
              orientationFail = true;
              continue;
            }
            if (!isVideo && height > width) {
              orientationFail = true;
              continue;
            }
          }
        } catch {
          // If dimension probing fails, allow the file through.
        }
        const name = baseName
          ? makeName(baseName, startIdx + i, !!isVideo)
          : `PHOTO_${Date.now()}_${i}.${isVideo ? "mp4" : "jpg"}`;
        if (useStorage && storageContext) {
          await saveStoragePhoto(storageContext, name, dataUrl);
        } else {
          await savePhoto(name, dataUrl);
        }
        localCache.current[name] = dataUrl;
        fileMeta.current[name] = { size: file.size, original: file.name };
        newPhotos.push(name);
        newNames.push(name);
      }
      if (newPhotos.length > 0) {
        onChange([...photos, ...newPhotos], [...(filenames ?? photos), ...newNames]);
      }
      if (orientationFail) {
        setOrientationError(
          isVideo
            ? "This video is horizontal. Please retake it vertically (hold your phone upright) and reselect."
            : "This photo is vertical. Please retake it horizontally (turn your phone sideways) and reselect.",
        );
      }
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };


  const remove = (idx: number) => {
    const entry = photos[idx];
    if (entry && !entry.startsWith("data:")) {
      if (useStorage && storageContext) void removeStoragePhoto(storageContext, entry);
      else void removePhoto(entry);
    }
    const nextPhotos = photos.filter((_, i) => i !== idx);
    const nextNames = (filenames ?? photos).filter((_, i) => i !== idx);
    onChange(nextPhotos, nextNames);
  };

  // In storage mode, fetch signed URLs for all photo filenames so thumbnails
  // render. We never look in the admin's local IDB for these files.
  useEffect(() => {
    if (!useStorage || !storageContext) return;
    let cancelled = false;
    const need = photos.filter(
      (e) => e && !e.startsWith("data:") && !e.startsWith("blob:") && !e.startsWith("http"),
    );
    if (need.length === 0) return;
    void Promise.all(
      need.map(async (fn) => [fn, await getStorageSignedUrl(storageContext, fn)] as const),
    ).then((pairs) => {
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const [fn, url] of pairs) next[fn] = url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [useStorage, storageContext, photos]);

  const hasPhotos = photos.length > 0;
  const triggerLabel = processing
    ? "Loading…"
    : isVideo
      ? hasPhotos ? "📹 Add Video" : "📹 Select Video"
      : hasPhotos ? "📷 Add Photo" : "📷 Select Photo";

  const triggerButton = !readOnly ? (
    <button
      type="button"
      disabled={processing}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] font-medium transition-colors active:scale-[0.98] disabled:opacity-60",
        error
          ? "field-error border-critical bg-critical/5 text-critical"
          : "border-input text-foreground hover:bg-muted"
      )}
    >
      {processing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span>{triggerLabel}</span>
    </button>
  ) : null;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={isVideo ? "video/*" : "image/*"}
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {label !== undefined ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="block text-sm font-semibold text-foreground">
            {label}
          </label>

          {triggerButton}
        </div>
      ) : (
        triggerButton
      )}

      {readOnly && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          Photos are read-only in admin edit view.
        </p>
      )}

      {orientationError && (
        <div className="rounded-lg border-2 border-critical bg-critical/5 p-3">
          <p className="text-sm font-medium text-critical">{orientationError}</p>
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                setOrientationError(null);
                inputRef.current?.click();
              }}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-critical bg-background px-3 text-[13px] font-medium text-critical hover:bg-critical/10"
            >
              Select Different {isVideo ? "Video" : "Photo"}
            </button>
          )}
        </div>
      )}





      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((entry, i) => {
            const src = useStorage
              ? signedUrls[entry] ?? localCache.current[entry] ?? null
              : resolvePhotoSrc(entry) ?? localCache.current[entry];
            const meta = fileMeta.current[entry];
            const displayName = meta?.original ?? entry;
            const loaded = !!src || !!meta;
            return (
              <div key={i} className="flex w-[60px] flex-col gap-0.5">
                <div className="relative h-[60px] w-[60px] overflow-hidden rounded-md bg-secondary">
                  {isVideo ? (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      {loaded ? (
                        <Play className="h-4 w-4 fill-white text-white" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-white/80" />
                      )}
                    </div>
                  ) : src ? (
                    <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-800">
                      <Camera className="h-4 w-4 text-white/80" />
                    </div>
                  )}
                  {loaded && (
                    <div
                      className="absolute left-0.5 top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white"
                      aria-label="Attached"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    </div>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label="Remove"
                      className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-foreground/75 text-background hover:bg-foreground"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                <p className="line-clamp-1 text-[11px] text-muted-foreground" title={displayName}>
                  {displayName}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

