// Best-effort device backup for captured/selected photos.
//
// Browsers can't write directly to the system Photos library, but we can
// surface the OS share sheet (iOS / Android) which offers "Save Image" /
// "Save to Photos". When Web Share API with files is unavailable, we fall
// back to a silent <a download> which writes to the Downloads folder on
// Android and to Files on iOS Safari.
//
// All failures are swallowed — backup is a best-effort safety net and must
// never block the capture flow.

interface BackupFile {
  filename: string;
  dataUrl: string;
}

function dataUrlToBlob(dataUrl: string, filename: string): Blob | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma === -1 || !dataUrl.startsWith("data:")) return null;
    const header = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    const mime =
      /data:([^;]+)/.exec(header)?.[1] ??
      (filename.toLowerCase().endsWith(".mp4") ? "video/mp4" : "image/jpeg");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function downloadFallback(file: BackupFile): void {
  try {
    const a = document.createElement("a");
    a.href = file.dataUrl;
    a.download = file.filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 0);
  } catch {
    // ignore
  }
}

/**
 * Save the given files to the user's device. Tries the Web Share API first
 * (which lets users tap "Save Image" → Photos on iOS / Android). Falls back
 * to a download anchor.
 *
 * Must be called from inside a user-gesture handler (e.g. the file input's
 * change event) for navigator.share to be allowed.
 */
export async function backupToDevice(files: BackupFile[]): Promise<void> {
  if (typeof window === "undefined" || files.length === 0) return;

  const fileObjs: File[] = [];
  for (const f of files) {
    const blob = dataUrlToBlob(f.dataUrl, f.filename);
    if (blob) fileObjs.push(new File([blob], f.filename, { type: blob.type }));
  }

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (
    fileObjs.length > 0 &&
    typeof nav.canShare === "function" &&
    typeof nav.share === "function" &&
    nav.canShare({ files: fileObjs })
  ) {
    try {
      await nav.share({ files: fileObjs, title: "Save to Photos" });
      return;
    } catch (e) {
      // User cancelled — don't fall back, they explicitly chose not to save.
      if ((e as Error).name === "AbortError") return;
      // Other errors → fall through to download fallback.
    }
  }

  for (const f of files) downloadFallback(f);
}
