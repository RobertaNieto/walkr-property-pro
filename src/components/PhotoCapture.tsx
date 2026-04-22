import { Camera, X } from "lucide-react";
import { ChangeEvent, useRef } from "react";
import { cn } from "@/lib/utils";

interface PhotoCaptureProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  error?: boolean;
}

export function PhotoCapture({ photos, onChange, error }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const dataUrls = await Promise.all(
      files.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(f);
          })
      )
    );
    onChange([...photos, ...dataUrls]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (idx: number) => onChange(photos.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-base font-semibold transition-colors active:scale-[0.99]",
          error
            ? "field-error border-critical bg-critical/5 text-critical"
            : "border-accent/40 bg-accent/5 text-accent hover:border-accent hover:bg-accent/10"
        )}
      >
        <Camera className="h-6 w-6" />
        Add Photo
      </button>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
              <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/70 text-background backdrop-blur-sm transition-colors hover:bg-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
