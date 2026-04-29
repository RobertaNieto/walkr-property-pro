// Edge function: upload-to-drive
// Receives a walkthroughId, fetches the walkthrough + photos from Supabase
// Storage, then uploads everything (photos + SUMMARY.pdf) to a Google Drive
// subfolder using a service account.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Walkthrough {
  id: string;
  user_id: string;
  house_number: string;
  street_name: string;
  city: string;
  state: string;
  zip_code: string | null;
  config: Record<string, unknown>;
  answers: Record<string, AnswerRow>;
  completed_at: string | null;
}

interface AnswerRow {
  text?: string;
  rating?: 1 | 2 | 3;
  notes?: string;
  photos?: string[];
  photoNames?: string[];
  poorPhotos?: string[];
  poorPhotoNames?: string[];
  bool?: boolean;
  choice?: string;
  choices?: string[];
  number?: number;
  checklist?: Record<string, boolean>;
}

// ----- Google service account JWT -> access token -----

function pemToBinary(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let pk = Deno.env.get("GOOGLE_PRIVATE_KEY");
  console.log("[upload-to-drive] checking Google Drive secrets", {
    hasServiceAccountEmail: Boolean(email),
    hasPrivateKey: Boolean(pk),
  });
  if (!email) throw new Error("Google Drive upload failed: GOOGLE_SERVICE_ACCOUNT_EMAIL is missing");
  if (!pk) throw new Error("Google Drive upload failed: GOOGLE_PRIVATE_KEY is missing");
  // Handle escaped newlines in env vars
  pk = pk.replace(/\\n/g, "\n");
  console.log("[upload-to-drive] normalized private key", {
    hasBeginMarker: pk.includes("-----BEGIN PRIVATE KEY-----"),
    hasNewlines: pk.includes("\n"),
  });

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;

  let cryptoKey: CryptoKey;
  try {
    const keyData = pemToBinary(pk);
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    console.error("[upload-to-drive] private key import failed", error);
    throw new Error("Google Drive upload failed: GOOGLE_PRIVATE_KEY could not be parsed as a service-account private key");
  }
  let sig: ArrayBuffer;
  try {
    sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );
  } catch (error) {
    console.error("[upload-to-drive] RS256 JWT signing failed", error);
    throw new Error("Google Drive upload failed: JWT signing with RS256 failed");
  }
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
  console.log("[upload-to-drive] RS256 JWT signed, exchanging token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[upload-to-drive] OAuth2 token exchange failed", { status: res.status, body: t });
    throw new Error(`Google Drive upload failed: OAuth2 token exchange failed (${res.status}) ${t}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Google Drive upload failed: OAuth2 token exchange returned no access token");
  console.log("[upload-to-drive] OAuth2 token exchange succeeded");
  return json.access_token as string;
}

// ----- Drive helpers -----
// All calls below pass `supportsAllDrives=true` and `includeItemsFromAllDrives=true`
// so they work whether the configured GOOGLE_DRIVE_FOLDER_ID lives in My Drive
// or inside a Shared Drive. Service accounts have no personal storage quota,
// so uploads MUST go into a Shared Drive (folder shared with the SA, owned by
// the Shared Drive itself) — without the supportsAllDrives flag the API
// returns 403 storageQuotaExceeded.

const DRIVE_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

function escapeDriveQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolderByName(
  token: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const q = encodeURIComponent(
    `name = '${escapeDriveQuery(name)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&${DRIVE_QS}&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.warn("[upload-to-drive] folder lookup failed", { name, parentId, status: res.status, body: await res.text() });
    return null;
  }
  const json = await res.json();
  const id = json.files?.[0]?.id;
  return id ?? null;
}

async function createDriveFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  // Reuse existing folder when present so re-uploading the same property
  // doesn't create duplicates.
  const existing = await findFolderByName(token, name, parentId);
  if (existing) {
    console.log("[upload-to-drive] reusing existing Drive folder", { name, parentId, folderId: existing });
    return existing;
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${DRIVE_QS}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  if (!res.ok) throw new Error(`Folder create failed (${name}): ${await res.text()}`);
  const json = await res.json();
  return json.id as string;
}

async function uploadFileToDrive(
  token: string,
  name: string,
  mimeType: string,
  body: Uint8Array,
  parentId: string,
): Promise<void> {
  const boundary = `----pw${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name, parents: [parentId] });

  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const payload = new Uint8Array(head.length + body.length + tail.length);
  payload.set(head, 0);
  payload.set(body, head.length);
  payload.set(tail, head.length + body.length);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${DRIVE_QS}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    },
  );
  if (!res.ok) throw new Error(`Upload failed (${name}): ${await res.text()}`);
}

async function setFolderShareableLink(
  token: string,
  folderId: string,
): Promise<string> {
  // Make folder readable by anyone with link. Failure here is non-fatal —
  // the folder still exists, just without an anonymous share link.
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?${DRIVE_QS}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    },
  );
  if (!res.ok) {
    console.warn("[upload-to-drive] share link permission failed (non-fatal)", { folderId, status: res.status, body: await res.text() });
  }
  return `https://drive.google.com/drive/folders/${folderId}`;
}

// ----- PDF -----

function ratingLabel(r?: number): string {
  if (r === 1) return "Good";
  if (r === 2) return "Fair";
  if (r === 3) return "Poor";
  return "—";
}

async function buildSummaryPdf(
  walk: Walkthrough,
  agentName: string,
  driveLink: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageW = 612;
  const pageH = 792;
  const margin = 50;

  const stateZip = [walk.state, walk.zip_code ?? ""].filter(Boolean).join(" ").trim();
  const cityLine = [walk.city, stateZip].filter((s) => s && s.length > 0).join(", ");
  const street = `${walk.house_number} ${walk.street_name}`.trim();
  const address = [street, cityLine].filter(Boolean).join(", ");
  const completedAt = walk.completed_at
    ? new Date(walk.completed_at).toLocaleString()
    : "—";

  // ---- helpers ----
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPage = () => {
    page = pdf.addPage([pageW, pageH]);
    y = pageH - margin;
  };
  const ensure = (h: number) => {
    if (y - h < margin) newPage();
  };
  const wrap = (text: string, f = font, size = 11, maxW = pageW - margin * 2) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const drawText = (
    text: string,
    opts: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 11;
    const color = opts.color ?? rgb(0, 0, 0);
    const lines = wrap(text, f, size);
    for (const line of lines) {
      ensure(size + 4);
      page.drawText(line, { x: margin, y: y - size, size, font: f, color });
      y -= size + 4;
    }
    if (opts.gap) y -= opts.gap;
  };

  // ---- Page 1: cover ----
  y -= 60;
  page.drawText("PROPERTY WALKTHROUGH", {
    x: margin,
    y: y - 24,
    size: 24,
    font: bold,
  });
  y -= 60;
  page.drawText(address, { x: margin, y: y - 18, size: 18, font: bold });
  y -= 40;
  page.drawText(`Completed: ${completedAt}`, {
    x: margin,
    y: y - 12,
    size: 12,
    font,
  });
  y -= 24;
  page.drawText(`Agent: ${agentName}`, {
    x: margin,
    y: y - 12,
    size: 12,
    font,
  });

  // ---- Page 2: overview ----
  newPage();
  drawText("Property Overview", { font: bold, size: 18, gap: 10 });
  const cfg = walk.config as Record<string, string | undefined>;
  const overview = [
    ["Bedrooms", cfg.bedrooms ?? "—"],
    ["Bathrooms", cfg.bathrooms ?? "—"],
    ["Garage", cfg.garage ?? "—"],
    ["Pool", cfg.pool ?? "—"],
    ["Spa", cfg.spa ?? "—"],
    ["Fireplace", cfg.fireplace ?? "—"],
    ["Laundry", cfg.laundry ?? "—"],
  ];
  for (const [k, v] of overview) {
    drawText(`${k}: ${v}`, { size: 11 });
  }

  let totalPhotos = 0;
  const criticals: { qid: string; notes?: string }[] = [];
  for (const [qid, ans] of Object.entries(walk.answers ?? {})) {
    if (ans.photos) totalPhotos += ans.photos.length;
    if (ans.poorPhotos) totalPhotos += ans.poorPhotos.length;
    if (ans.rating === 3) criticals.push({ qid, notes: ans.notes });
  }
  y -= 8;
  drawText(`Total photos: ${totalPhotos}`, { size: 11 });
  drawText(`Critical flags: ${criticals.length}`, { size: 11, gap: 8 });

  if (criticals.length > 0) {
    drawText("Critical Items", { font: bold, size: 14, color: rgb(0.75, 0.1, 0.1), gap: 4 });
    for (const c of criticals) {
      drawText(`• ${c.qid}`, { size: 11, color: rgb(0.75, 0.1, 0.1) });
      if (c.notes) drawText(`  ${c.notes}`, { font: italic, size: 10 });
    }
  }

  // ---- Pages 3+: section by section ----
  newPage();
  drawText("Walkthrough Detail", { font: bold, size: 18, gap: 10 });
  for (const [qid, ans] of Object.entries(walk.answers ?? {})) {
    ensure(60);
    drawText(qid, { font: bold, size: 12 });
    const parts: string[] = [];
    if (ans.text) parts.push(ans.text);
    if (ans.choice) parts.push(ans.choice);
    if (ans.choices?.length) parts.push(ans.choices.join(", "));
    if (typeof ans.bool === "boolean") parts.push(ans.bool ? "Yes" : "No");
    if (typeof ans.number === "number") parts.push(String(ans.number));
    if (ans.rating) parts.push(`Rating: ${ratingLabel(ans.rating)}`);
    if (parts.length) drawText(parts.join("  •  "), { size: 11 });
    if (ans.notes) drawText(`Notes: ${ans.notes}`, { font: italic, size: 10 });
    const allPhotos = [
      ...(ans.photoNames ?? []),
      ...(ans.poorPhotoNames ?? []),
    ];
    if (allPhotos.length) {
      drawText(`Photos: ${allPhotos.join(", ")}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    }
    y -= 6;
  }

  // ---- Final page: sign-off ----
  newPage();
  drawText("Sign-off", { font: bold, size: 18, gap: 14 });
  drawText(`Agent: ${agentName}`, { size: 12 });
  drawText(`Completed: ${completedAt}`, { size: 12 });
  drawText(`Property: ${address}`, { size: 12, gap: 12 });
  drawText("Drive folder:", { font: bold, size: 12 });
  drawText(driveLink, { size: 10, color: rgb(0, 0, 0.7) });

  return await pdf.save();
}

// ----- Main handler -----

Deno.serve(async (req) => {
  console.log("[upload-to-drive] function called", { method: req.method, url: req.url });
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let walkIdForFailure: string | undefined;
  try {
    const authHeader = req.headers.get("Authorization");
    console.log("[upload-to-drive] auth header present", { hasAuthHeader: Boolean(authHeader) });
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUB_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const PARENT_FOLDER = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
    console.log("[upload-to-drive] environment check", {
      hasSupabaseUrl: Boolean(SUPABASE_URL),
      hasServiceRoleKey: Boolean(SERVICE_KEY),
      hasPublishableKey: Boolean(PUB_KEY),
      hasDriveFolderId: Boolean(PARENT_FOLDER),
    });
    if (!SUPABASE_URL) throw new Error("Upload failed: backend URL is missing");
    if (!SERVICE_KEY) throw new Error("Upload failed: service role key is missing");
    if (!PUB_KEY) throw new Error("Upload failed: publishable key is missing");
    if (!PARENT_FOLDER) throw new Error("Google Drive upload failed: GOOGLE_DRIVE_FOLDER_ID is missing");

    // Identify user via the auth header (RLS-safe client)
    const userClient = createClient(SUPABASE_URL, PUB_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;
    const agentName =
      (userRes.user.user_metadata?.display_name as string | undefined) ??
      userRes.user.email ??
      "Agent";

    const body = await req.json();
    const walkId = body.walkthroughId as string;
    walkIdForFailure = walkId;
    console.log("[upload-to-drive] request payload", { walkthroughId: walkId });
    if (!walkId) throw new Error("Upload failed: missing walkthroughId in request payload");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch walkthrough (admin) + verify ownership
    const { data: walkRow, error: walkErr } = await admin
      .from("walkthroughs")
      .select("*")
      .eq("id", walkId)
      .single();
    if (walkErr || !walkRow) throw new Error(`Upload failed: walkthrough ${walkId} was not found`);
    if (walkRow.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const walk = walkRow as Walkthrough;
    console.log("[upload-to-drive] walkthrough loaded", { walkthroughId: walk.id, userId: walk.user_id });

    // Mark as uploading
    await admin
      .from("walkthroughs")
      .update({ upload_status: "uploading" })
      .eq("id", walkId);
    console.log("[upload-to-drive] marked walkthrough uploading", { walkthroughId: walkId });

    // Get Google access token
    const token = await getAccessToken();

    // Create subfolder HOUSENUMBER_STREETNAME_CITY_STATE
    // Folder name: HOUSENUMBER_STREET_CITY_STATE_ZIPCODE
    // Spaces become hyphens; only [A-Z0-9-] allowed; uppercased.
    const slug = (s: string) =>
      (s ?? "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^A-Z0-9-]/g, "");
    const sanitizeNum = (s: string) =>
      (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const folderName = [
      sanitizeNum(walk.house_number),
      slug(walk.street_name),
      slug(walk.city),
      sanitizeNum(walk.state),
      sanitizeNum(walk.zip_code ?? ""),
    ]
      .filter(Boolean)
      .join("_");
    console.log("[upload-to-drive] creating Drive folder", { walkthroughId: walkId, folderName });
    const subfolderId = await createDriveFolder(token, folderName, PARENT_FOLDER);
    console.log("[upload-to-drive] Drive folder created", { walkthroughId: walkId, subfolderId });

    // Create "Photos" and "Videos" subfolders inside the property folder
    const photosFolderId = await createDriveFolder(token, "Photos", subfolderId);
    const videosFolderId = await createDriveFolder(token, "Videos", subfolderId);
    void videosFolderId; // reserved for future video uploads

    // Collect photo filenames from answers
    const photoNames = new Set<string>();
    for (const ans of Object.values(walk.answers ?? {})) {
      (ans.photoNames ?? []).forEach((n) => n && photoNames.add(n));
      (ans.poorPhotoNames ?? []).forEach((n) => n && photoNames.add(n));
    }
    console.log("[upload-to-drive] staged filenames from walkthrough", { walkthroughId: walkId, total: photoNames.size });

    // Download each photo from the staging bucket and upload to Drive
    let uploaded = 0;
    for (const fname of photoNames) {
      const path = `${userId}/${walkId}/${fname}`;
      const { data: blob, error: dlErr } = await admin.storage
        .from("walkthrough-photos")
        .download(path);
      if (dlErr || !blob) {
        console.warn(`[upload-to-drive] missing photo ${path}`, dlErr);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const lower = fname.toLowerCase();
      const mime = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".mov")
          ? "video/quicktime"
          : lower.endsWith(".mp4")
            ? "video/mp4"
            : "image/jpeg";
      const targetFolderId = mime.startsWith("video/") ? videosFolderId : photosFolderId;
      console.log("[upload-to-drive] uploading staged file to Drive", { walkthroughId: walkId, filename: fname, mime, bytes: bytes.length });
      await uploadFileToDrive(token, fname, mime, bytes, targetFolderId);
      uploaded++;
    }

    // Generate Drive shareable link
    const driveLink = await setFolderShareableLink(token, subfolderId);
    console.log("[upload-to-drive] Drive folder share link ready", { walkthroughId: walkId, driveLink, uploaded });

    // Build & upload SUMMARY.pdf
    const pdfBytes = await buildSummaryPdf(walk, agentName, driveLink);
    await uploadFileToDrive(
      token,
      "SUMMARY.pdf",
      "application/pdf",
      pdfBytes,
      subfolderId,
    );
    console.log("[upload-to-drive] SUMMARY.pdf uploaded", { walkthroughId: walkId });

    // Mark confirmed
    await admin
      .from("walkthroughs")
      .update({
        upload_status: "confirmed",
        drive_folder_url: driveLink,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", walkId);

    return new Response(
      JSON.stringify({
        success: true,
        driveFolderUrl: driveLink,
        photosUploaded: uploaded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[upload-to-drive] error", e);
    // Best-effort failure status
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      if (walkIdForFailure) {
        await admin
          .from("walkthroughs")
          .update({ upload_status: "failed" })
          .eq("id", walkIdForFailure);
      }
    } catch {
      // ignore
    }
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ success: false, error: message, details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
