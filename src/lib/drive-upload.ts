// Client-side Google Drive upload helper.
// Stages photos from IndexedDB into Supabase Storage, then invokes the
// `upload-to-drive` edge function which uploads everything to Drive +
// generates SUMMARY.pdf.

import { supabase } from "@/integrations/supabase/client";
import { preloadPhoto } from "@/lib/photo-store";
import type { Walkthrough } from "@/lib/walkthrough";

const BUCKET = "walkthrough-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function dataUrlToBlob(dataUrl: string, filename: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.startsWith("data:")) {
    throw new Error(`Could not read ${filename}: local file data is invalid`);
  }
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    throw new Error(`Could not prepare ${filename}: local file data is corrupted`);
  }
}

function collectMediaNames(walk: Walkthrough): string[] {
  const names = new Set<string>();
  for (const ans of Object.values(walk.answers ?? {})) {
    (ans.photoNames ?? []).forEach((n) => n && names.add(n));
    (ans.poorPhotoNames ?? []).forEach((n) => n && names.add(n));
  }
  return Array.from(names);
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      return body.details ?? body.error ?? body.message ?? fallback;
    } catch {
      try {
        const text = await context.clone().text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}

export async function uploadWalkthroughToDrive(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  try {
    if (!userId) throw new Error("You must be signed in before uploading to Drive");
    if (!walk?.id || !UUID_RE.test(walk.id)) {
      throw new Error("Invalid walkthroughId: the selected walkthrough could not be uploaded");
    }

    console.log("[drive-upload] starting", { walkthroughId: walk.id, userId });

    const { data: existingWalk, error: walkErr } = await supabase
      .from("walkthroughs")
      .select("id,user_id")
      .eq("id", walk.id)
      .maybeSingle();
    if (walkErr) throw new Error(`Could not validate walkthroughId: ${walkErr.message}`);
    if (!existingWalk) throw new Error(`Walkthrough ${walk.id} was not found in the database`);
    if (existingWalk.user_id !== userId) throw new Error("This walkthrough belongs to a different signed-in user");

    const names = collectMediaNames(walk);
    const total = names.length;
    console.log("[drive-upload] media discovered", { walkthroughId: walk.id, total, names });

    // Phase 1: stage every local file from IndexedDB to Supabase Storage
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
        throw new Error(`Could not find ${fname} in local browser storage. Reattach the file, then retry.`);
      }
      console.log("[drive-upload] IndexedDB file loaded", { walkthroughId: walk.id, filename: fname });
      const blob = dataUrlToBlob(dataUrl, fname);
      const path = `${userId}/${walk.id}/${fname}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw new Error(`Stage failed for ${fname}: ${error.message}`);
      console.log("[drive-upload] storage staged", { walkthroughId: walk.id, path, contentType: blob.type, bytes: blob.size });
    }

    // Phase 2: invoke edge function to push to Drive
    onProgress?.({
      phase: "drive",
      current: total,
      total,
      message: "Uploading to Google Drive...",
    });
    console.log("[drive-upload] invoking upload-to-drive", { walkthroughId: walk.id });
    const { data, error } = await supabase.functions.invoke("upload-to-drive", {
      body: { walkthroughId: walk.id },
    });
    if (error) throw new Error(await getFunctionErrorMessage(error));
    if (!data?.success) throw new Error(data?.error ?? "Upload failed");
    console.log("[drive-upload] upload-to-drive succeeded", { walkthroughId: walk.id, driveFolderUrl: data.driveFolderUrl });

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
