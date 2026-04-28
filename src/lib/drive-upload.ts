// Client-side Google Drive upload helper.
// Stages photos from IndexedDB into Supabase Storage, then invokes the
// `upload-to-drive` edge function which uploads everything to Drive +
// generates SUMMARY.pdf.

import { supabase } from "@/integrations/supabase/client";
import { preloadPhoto } from "@/lib/photo-store";
import type { Walkthrough } from "@/lib/walkthrough";

const BUCKET = "walkthrough-photos";

export interface UploadProgress {
  phase: "staging" | "drive" | "done";
  current: number;
  total: number;
  message: string;
}

export interface UploadResult {
  success: boolean;
  driveFolderUrl?: string;
  error?: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function collectPhotoNames(walk: Walkthrough): string[] {
  const names = new Set<string>();
  for (const ans of Object.values(walk.answers ?? {})) {
    (ans.photoNames ?? []).forEach((n) => n && names.add(n));
    (ans.poorPhotoNames ?? []).forEach((n) => n && names.add(n));
  }
  return Array.from(names);
}

export async function uploadWalkthroughToDrive(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  try {
    const names = collectPhotoNames(walk);
    const total = names.length;

    // Phase 1: stage every photo to Supabase Storage
    for (let i = 0; i < names.length; i++) {
      const fname = names[i];
      onProgress?.({
        phase: "staging",
        current: i,
        total,
        message: `Preparing photos... ${i + 1} of ${total}`,
      });
      const dataUrl = await preloadPhoto(fname);
      if (!dataUrl) {
        console.warn(`[upload] missing local photo ${fname}`);
        continue;
      }
      const blob = dataUrlToBlob(dataUrl);
      const path = `${userId}/${walk.id}/${fname}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw new Error(`Stage failed for ${fname}: ${error.message}`);
    }

    // Phase 2: invoke edge function to push to Drive
    onProgress?.({
      phase: "drive",
      current: total,
      total,
      message: "Uploading to Google Drive...",
    });
    const { data, error } = await supabase.functions.invoke("upload-to-drive", {
      body: { walkthroughId: walk.id },
    });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error ?? "Upload failed");

    onProgress?.({
      phase: "done",
      current: total,
      total,
      message: "Upload complete",
    });
    return { success: true, driveFolderUrl: data.driveFolderUrl };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function uploadWithRetry(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  maxAttempts = 3,
): Promise<UploadResult> {
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await uploadWalkthroughToDrive(walk, userId, onProgress);
    if (res.success) return res;
    lastErr = res.error ?? "Unknown error";
    console.warn(`[upload] attempt ${attempt} failed: ${lastErr}`);
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return { success: false, error: lastErr };
}
