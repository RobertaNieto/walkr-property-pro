// Edge function: upload-to-drive
// Receives a walkthroughId, fetches the walkthrough + photos from Supabase
// Storage, then uploads everything (photos + SUMMARY.pdf) to a Google Drive
// subfolder using a service account.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const THUMB_W = 80;
const THUMB_H = 60;
const THUMB_MAX_BYTES = 15 * 1024;
const THUMBS_PER_ROW = 4;
const THUMB_GAP = 8;
const MAX_TOTAL_THUMBS = 60;

async function makeThumbnail(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const img = await Image.decode(bytes);
    img.resize(THUMB_W, THUMB_H);
    let quality = 30;
    let out = await img.encodeJPEG(quality);
    while (out.length > THUMB_MAX_BYTES && quality > 10) {
      quality -= 5;
      out = await img.encodeJPEG(quality);
    }
    return out;
  } catch (err) {
    console.warn("[upload-to-drive] thumbnail failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

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
  drive_folder_url?: string | null;
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

// Permanently delete every non-trashed file inside a Drive folder.
// Used during re-upload so the folder ends up with the latest content only.
async function purgeFolderContents(token: string, folderId: string): Promise<number> {
  let deleted = 0;
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to list folder ${folderId} for purge: ${await res.text()}`);
    }
    const json = (await res.json()) as { files?: { id: string; name: string }[]; nextPageToken?: string };
    const files = json.files ?? [];
    for (const f of files) {
      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?${DRIVE_QS}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!delRes.ok && delRes.status !== 404) {
        console.warn("[upload-to-drive] purge: delete failed (non-fatal)", { id: f.id, name: f.name, status: delRes.status });
      } else {
        deleted++;
      }
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return deleted;
}

// Find a single file by name in a folder, optionally restricted to a mime type.
async function findFileByName(
  token: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    q: `name = '${escapeDriveQuery(name)}' and '${parentId}' in parents and trashed = false`,
    fields: "files(id, name)",
    pageSize: "10",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
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

// ----- Human-readable label resolver for question IDs -----

const SECTION_NAMES: Record<string, string> = {
  s1: "Arrival & Access",
  s2: "Exterior Front",
  s3: "Exterior Sides & Back",
  s4: "Garage",
  s5: "Roof",
  s6: "Pool & Spa",
  s7: "Entry & First Impressions",
  s8: "Living Room",
  s9: "Kitchen",
  s10: "Hallways",
  s13: "Laundry",
  s14: "Mechanical Systems",
  s15: "Walkthrough Videos",
  s16: "Miscellaneous",
};

// Explicit overrides where the auto-generated label would be unclear.
const LABEL_OVERRIDES: Record<string, string> = {
  // Section 1
  s1_lockbox_code: "Lockbox Code",
  s1_lockbox_photo: "Lockbox Location Photo",
  s1_key_works: "Key Works in Lock",
  // Section 2
  s2_trash_cleared: "Obstructions Cleared",
  s2_front_straight: "Front of Property",
  s2_front_left: "Front Left Angle",
  s2_front_right: "Front Right Angle",
  s2_frontdoor: "Front Door",
  s2_roofline: "Roofline & Fascia",
  s2_exterior_paint: "Exterior Paint Condition",
  s2_siding_photo: "Siding Photo",
  s2_siding_type: "Siding Type",
  s2_foundation_type: "Foundation Type",
  s2_driveway_photo: "Driveway Photo",
  s2_driveway_condition: "Driveway Condition",
  s2_landscape: "Landscape Condition",
  s2_additional: "Additional Exterior Details",
  // Section 3
  s3_left: "Left Side of House",
  s3_right: "Right Side of House",
  s3_back: "Back of House",
  s3_yard_outview: "Backyard — Outward View",
  s3_yard_houseview: "Backyard — House View",
  s3_fence_photo: "Fence Photo",
  s3_outbuildings: "Outbuildings or Sheds",
  s3_additional: "Additional Backyard Details",
  // Section 4
  s4_exterior: "Garage Exterior",
  s4_interior: "Garage Interior",
  s4_roofline: "Garage Roofline",
  s4_attached: "Attached or Detached",
  s4_door_works: "Garage Door Works",
  s4_additional: "Additional Garage Details",
  // Section 5
  s5_overall: "Overall Roof Photo",
  s5_type: "Roof Type",
  s5_condition: "Roof Condition",
  // Section 6
  s6_pool_1: "Pool — Angle 1",
  s6_pool_2: "Pool — Angle 2",
  s6_pool_equipment: "Pool Equipment",
  s6_pool_location: "Pool Location",
  s6_pool_clean: "Pool Cleanliness",
  s6_pool_water: "Pool Water Level",
  s6_spa_1: "Spa — Angle 1",
  s6_spa_2: "Spa — Angle 2",
  s6_spa_location: "Spa Location",
  s6_spa_condition: "Spa Condition",
  // Section 7
  s7_hot_water: "Hot Water Working",
  s7_gas_stove: "Gas Stove Working",
  s7_smells: "Unusual Smells",
  s7_noises: "Unusual Noises",
  // Section 8
  s8_mls: "Living Room — Wide Photo",
  s8_floor_photo: "Living Room — Floor Photo",
  s8_fireplace_photo: "Living Room — Fireplace Photo",
  s8_windows_photo: "Living Room — Windows Photo",
  s8_ceiling_photo: "Living Room — Ceiling Photo",
  s8_floor_type: "Flooring Type & Condition",
  s8_fireplace_type: "Fireplace Type",
  s8_window_type: "Window Type",
  s8_window_condition: "Window Condition",
  s8_lights: "Light Fixtures Condition",
  s8_baseboards: "Baseboards Condition",
  s8_paint: "Paint Condition",
  s8_additional: "Additional Living Room Details",
  // Section 9
  s9_mls: "Kitchen — Wide Photo",
  s9_cab_closed: "Cabinets Closed",
  s9_cab_open_1: "Cabinets Open Sample",
  s9_cab_overall: "Cabinets Overall Condition",
  s9_pantry_exists: "Pantry Present",
  s9_pantry: "Pantry Photo",
  s9_bases: "Cabinet Bases Photo",
  s9_counters_photo: "Kitchen Counters",
  s9_counters_cond: "Counters Condition",
  s9_sink_photo: "Sink & Faucet Photo",
  s9_sink_cond: "Sink Condition",
  s9_floor_photo: "Kitchen Floor Photo",
  s9_floor_cond: "Kitchen Floor Condition",
  s9_stove: "Stove & Oven",
  s9_fridge: "Refrigerator",
  s9_dishwasher: "Dishwasher",
  s9_microwave: "Microwave Present",
  s9_microwave_rating: "Microwave Condition",
  s9_lights: "Light Fixtures Condition",
  s9_baseboards: "Baseboards Condition",
  s9_additional: "Additional Kitchen Details",
  // Section 10
  s10_wide: "Hallway Wide Photo",
  s10_floor: "Hallway Flooring Condition",
  s10_lights: "Light Fixtures Condition",
  s10_baseboards: "Baseboards Condition",
  s10_paint: "Paint Condition",
  // Section 13
  s13_wide: "Laundry Wide Photo",
  s13_hookups: "Laundry Hookups",
  s13_condition: "Laundry Condition",
  s13_additional: "Additional Laundry Details",
  // Section 14
  s14_hvac_photo: "HVAC Photo",
  s14_hvac_cond: "HVAC Condition",
  s14_furnace_photo: "Furnace Photo",
  s14_furnace_cond: "Furnace Condition",
  s14_thermo_photo: "Thermostat Photo",
  s14_thermo_cond: "Thermostat Condition",
  s14_wh_loc: "Water Heater Location",
  s14_wh_photo: "Water Heater Photo",
  s14_wh_strapped: "Water Heater Double-Strapped",
  s14_additional: "Mechanical Systems Notes",
  // Section 15
  s15_exterior_brief: "Exterior Walkthrough Video",
  s15_interior_video: "Interior Walkthrough Video",
  s15_critical_videos: "Issue Close-Up Videos",
  // Section 16
  s16_neighbors: "Final Observations",
  s16_other: "Additional Notes",
};

// Per-loop suffix labels for bedroom/bathroom item keys.
const BATH_SUFFIX_LABELS: Record<string, string> = {
  type: "Bathroom Type",
  exists: "Bathroom Present",
  mls: "Wide Photo",
  tub: "Tub Photo",
  shower: "Shower Photo",
  sink: "Sink Photo",
  toilet: "Toilet Photo",
  tub_cond: "Tub Condition",
  shower_cond: "Shower Condition",
  sink_cond: "Sink Condition",
  toilet_cond: "Toilet Condition",
  floor: "Flooring Condition",
  lights: "Light Fixtures Condition",
  baseboards: "Baseboards Condition",
  water_pooling: "Water Pooling",
  active_leaks: "Active Leaks",
  smells: "Unusual Smells",
  microbial: "Microbial Growth",
  additional: "Additional Details",
};

const BED_SUFFIX_LABELS: Record<string, string> = {
  mls: "Wide Photo",
  closet: "Closet Photo",
  closet_cond: "Closet Condition",
  windows: "Windows Photo",
  window_cond: "Window Condition",
  floor: "Flooring Condition",
  lights: "Light Fixtures Condition",
  baseboards: "Baseboards Condition",
  paint: "Paint Condition",
  feature: "Unique Feature Photo",
  additional: "Additional Details",
};

function titleCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

interface QidInfo {
  section: string;
  label: string;
}

function resolveQid(qid: string): QidInfo {
  // Bathroom loop: s11_b{n}_{key}
  let m = qid.match(/^s11_b(\d+)_(.+)$/);
  if (m) {
    const n = m[1];
    const key = m[2];
    return {
      section: `Bathroom ${n}`,
      label: BATH_SUFFIX_LABELS[key] ?? titleCase(key),
    };
  }
  // Bedroom loop: s12_b{n}_{key}
  m = qid.match(/^s12_b(\d+)_(.+)$/);
  if (m) {
    const n = m[1];
    const key = m[2];
    return {
      section: `Bedroom ${n}`,
      label: BED_SUFFIX_LABELS[key] ?? titleCase(key),
    };
  }
  // Section prefix: s{N}_...
  const sm = qid.match(/^(s\d+)_(.+)$/);
  const sectionKey = sm?.[1] ?? "";
  const section = SECTION_NAMES[sectionKey] ?? "Other";
  const label = LABEL_OVERRIDES[qid] ?? titleCase(sm?.[2] ?? qid);
  return { section, label };
}

const SECTION_ORDER = [
  "Arrival & Access",
  "Exterior Front",
  "Exterior Sides & Back",
  "Garage",
  "Roof",
  "Pool & Spa",
  "Entry & First Impressions",
  "Living Room",
  "Kitchen",
  "Hallways",
];

function sectionSortKey(name: string): string {
  const idx = SECTION_ORDER.indexOf(name);
  if (idx >= 0) return `A${String(idx).padStart(3, "0")}`;
  const bath = name.match(/^Bathroom (\d+)$/);
  if (bath) return `B${String(bath[1]).padStart(3, "0")}`;
  const bed = name.match(/^Bedroom (\d+)$/);
  if (bed) return `C${String(bed[1]).padStart(3, "0")}`;
  const tail = ["Laundry", "Mechanical Systems", "Walkthrough Videos", "Miscellaneous"];
  const ti = tail.indexOf(name);
  if (ti >= 0) return `D${String(ti).padStart(3, "0")}`;
  return `Z${name}`;
}

// ----- Full schema enumeration (mirrors src/lib/wizard-schema.ts) -----
// Returns the ordered list of every question id that should appear in the PDF
// for a given walkthrough config + answers, regardless of whether the user
// answered it. Unanswered questions render as "N/A".

function parseCount(v: string | undefined): number {
  if (!v) return 0;
  const m = v.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
function bathCountCfg(c: Record<string, string | undefined>): number {
  if (!c.bathrooms) return 0;
  const n = parseFloat(c.bathrooms);
  return Number.isFinite(n) ? Math.ceil(n) : 0;
}
function bedCountCfg(c: Record<string, string | undefined>): number {
  return parseCount(c.bedrooms);
}

function enumerateQuestionIds(
  config: Record<string, string | undefined>,
  answers: Record<string, AnswerRow>,
): string[] {
  const out: string[] = [];

  // S1
  out.push("s1_lockbox_code", "s1_lockbox_photo", "s1_key_works");

  // S2
  out.push(
    "s2_trash_cleared",
    "s2_front_straight",
    "s2_front_left",
    "s2_front_right",
    "s2_frontdoor",
    "s2_roofline",
    "s2_exterior_paint",
    "s2_siding_photo",
    "s2_siding_type",
    "s2_foundation_type",
    "s2_driveway_photo",
    "s2_driveway_condition",
    "s2_landscape",
    "s2_additional",
  );

  // S3
  out.push(
    "s3_left",
    "s3_right",
    "s3_back",
    "s3_yard_outview",
    "s3_yard_houseview",
    "s3_fence_photo",
    "s3_outbuildings",
    "s3_additional",
  );

  // S4 — Garage (only if present)
  if (config.garage && config.garage !== "None") {
    out.push(
      "s4_exterior",
      "s4_interior",
      "s4_roofline",
      "s4_attached",
      "s4_door_works",
      "s4_additional",
    );
  }

  // S5
  out.push("s5_overall", "s5_type", "s5_condition");

  // S6 — Pool & Spa
  if (config.pool === "Yes") {
    out.push(
      "s6_pool_1",
      "s6_pool_2",
      "s6_pool_equipment",
      "s6_pool_location",
      "s6_pool_clean",
      "s6_pool_water",
    );
  }
  if (config.spa === "Yes") {
    out.push("s6_spa_1", "s6_spa_2", "s6_spa_location", "s6_spa_condition");
  }

  // S7
  out.push("s7_hot_water", "s7_gas_stove", "s7_smells", "s7_noises");

  // S8 — Living Room
  out.push("s8_mls", "s8_floor_photo");
  if (config.fireplace === "Yes") out.push("s8_fireplace_photo");
  out.push("s8_windows_photo", "s8_ceiling_photo", "s8_floor_type");
  if (config.fireplace === "Yes") out.push("s8_fireplace_type");
  out.push(
    "s8_window_type",
    "s8_window_condition",
    "s8_lights",
    "s8_baseboards",
    "s8_paint",
    "s8_additional",
  );

  // S9 — Kitchen
  out.push(
    "s9_mls",
    "s9_cab_closed",
    "s9_cab_open_1",
    "s9_cab_overall",
    "s9_pantry_exists",
  );
  if (answers["s9_pantry_exists"]?.bool === true) out.push("s9_pantry");
  out.push(
    "s9_bases",
    "s9_counters_photo",
    "s9_counters_cond",
    "s9_sink_photo",
    "s9_sink_cond",
    "s9_floor_photo",
    "s9_floor_cond",
    "s9_stove",
    "s9_fridge",
    "s9_dishwasher",
    "s9_microwave",
  );
  if (answers["s9_microwave"]?.bool === true) out.push("s9_microwave_rating");
  out.push("s9_lights", "s9_baseboards", "s9_additional");

  // S10 — Hallways
  out.push("s10_wide", "s10_floor", "s10_lights", "s10_baseboards", "s10_paint");

  // S11 — Bathrooms
  const bathTotal = bathCountCfg(config);
  for (let n = 1; n <= bathTotal; n++) {
    const id = (k: string) => `s11_b${n}_${k}`;
    if (n > 1) out.push(id("exists"));
    // If bathroom 2+ marked not present, skip its loop questions entirely
    if (n > 1 && answers[id("exists")]?.bool === false) continue;
    out.push(id("type"), id("mls"));
    const t = answers[id("type")]?.choice;
    if (t === "Full bath") out.push(id("tub"));
    if (t === "Full bath" || t === "Three-quarter bath") out.push(id("shower"));
    out.push(id("sink"), id("toilet"));
    if (t === "Full bath") out.push(id("tub_cond"));
    if (t === "Full bath" || t === "Three-quarter bath") out.push(id("shower_cond"));
    out.push(
      id("sink_cond"),
      id("toilet_cond"),
      id("floor"),
      id("lights"),
      id("baseboards"),
      id("water_pooling"),
      id("active_leaks"),
      id("smells"),
      id("microbial"),
      id("additional"),
    );
  }

  // S12 — Bedrooms
  const bedTotal = bedCountCfg(config);
  for (let n = 1; n <= bedTotal; n++) {
    const id = (k: string) => `s12_b${n}_${k}`;
    out.push(
      id("mls"),
      id("closet"),
      id("closet_cond"),
      id("windows"),
      id("window_cond"),
      id("floor"),
      id("lights"),
      id("baseboards"),
      id("paint"),
      id("feature"),
      id("additional"),
    );
  }

  // S13 — Laundry
  out.push("s13_wide", "s13_hookups", "s13_condition", "s13_additional");

  // S14 — Mechanical
  out.push(
    "s14_hvac_photo",
    "s14_hvac_cond",
    "s14_furnace_photo",
    "s14_furnace_cond",
    "s14_thermo_photo",
    "s14_thermo_cond",
    "s14_wh_loc",
    "s14_wh_photo",
    "s14_wh_strapped",
    "s14_additional",
  );

  // S15 — Videos
  out.push("s15_exterior_brief", "s15_interior_video", "s15_critical_videos");

  // S16
  out.push("s16_neighbors", "s16_other");

  return out;
}

async function buildSummaryPdf(
  walk: Walkthrough,
  agentName: string,
  driveLink: string,
  admin: SupabaseClient,
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
      const info = resolveQid(c.qid);
      drawText(`• ${info.section} — ${info.label}`, { size: 11, color: rgb(0.75, 0.1, 0.1) });
      if (c.notes) drawText(`  ${c.notes}`, { font: italic, size: 10 });
    }
  }

  // ---- Pages 3+: every schema question, grouped section by section ----
  newPage();
  drawText("Walkthrough Detail", { font: bold, size: 18, gap: 10 });

  // Enumerate every question id that should appear for this walkthrough config,
  // then group by resolved section. Unanswered questions render as "N/A" so
  // nothing from the schema is silently omitted.
  const enumeratedIds = enumerateQuestionIds(
    cfg as Record<string, string | undefined>,
    walk.answers ?? {},
  );
  const seen = new Set<string>(enumeratedIds);
  // Append any answer ids the enumerator didn't know about (defensive).
  for (const qid of Object.keys(walk.answers ?? {})) {
    if (!seen.has(qid)) {
      enumeratedIds.push(qid);
      seen.add(qid);
    }
  }

  type DetailRow = { qid: string; label: string; ans: AnswerRow | undefined };
  const grouped = new Map<string, DetailRow[]>();
  const sectionOrderSeen: string[] = [];
  for (const qid of enumeratedIds) {
    const info = resolveQid(qid);
    if (!grouped.has(info.section)) {
      grouped.set(info.section, []);
      sectionOrderSeen.push(info.section);
    }
    grouped.get(info.section)!.push({
      qid,
      label: info.label,
      ans: walk.answers?.[qid],
    });
  }

  const sortedSections = sectionOrderSeen.slice().sort((a, b) =>
    sectionSortKey(a).localeCompare(sectionSortKey(b)),
  );

  const formatAnswer = (ans: AnswerRow | undefined): string => {
    if (!ans) return "N/A";
    const parts: string[] = [];
    if (ans.text && ans.text.trim()) parts.push(ans.text.trim());
    if (ans.choice) parts.push(ans.choice);
    if (ans.choices?.length) parts.push(ans.choices.join(", "));
    if (typeof ans.bool === "boolean") parts.push(ans.bool ? "Yes" : "No");
    if (typeof ans.number === "number") parts.push(String(ans.number));
    if (ans.rating) parts.push(`Rating: ${ratingLabel(ans.rating)}`);
    const hasPhotos =
      (ans.photos?.length ?? 0) > 0 || (ans.poorPhotos?.length ?? 0) > 0;
    if (parts.length === 0 && hasPhotos) parts.push("Photo captured");
    return parts.length ? parts.join("  •  ") : "N/A";
  };

  // Collect photo names per section (images only), capped at MAX_TOTAL_THUMBS total.
  const isImage = (n: string) => /\.(jpe?g|png|webp|gif)$/i.test(n);
  const sectionPhotoNames = new Map<string, string[]>();
  let thumbBudget = MAX_TOTAL_THUMBS;
  for (const sectionName of sortedSections) {
    if (thumbBudget <= 0) break;
    const items = grouped.get(sectionName)!;
    const names: string[] = [];
    for (const { ans } of items) {
      for (const n of [...(ans?.photoNames ?? []), ...(ans?.poorPhotoNames ?? [])]) {
        if (n && isImage(n) && !names.includes(n)) names.push(n);
      }
    }
    const take = names.slice(0, thumbBudget);
    if (take.length) {
      sectionPhotoNames.set(sectionName, take);
      thumbBudget -= take.length;
    }
  }

  // Fetch + thumbnail all selected photos in parallel, then embed JPEGs in PDF.
  const allThumbNames = Array.from(new Set(Array.from(sectionPhotoNames.values()).flat()));
  const embeddedThumbs = new Map<string, { img: Awaited<ReturnType<typeof pdf.embedJpg>> }>();
  await Promise.all(
    allThumbNames.map(async (fname) => {
      try {
        const path = `${walk.user_id}/${walk.id}/${fname}`;
        const { data: blob, error } = await admin.storage.from("walkthrough-photos").download(path);
        if (error || !blob) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const thumb = await makeThumbnail(bytes);
        if (!thumb) return;
        const img = await pdf.embedJpg(thumb);
        embeddedThumbs.set(fname, { img });
      } catch (err) {
        console.warn("[upload-to-drive] thumb embed skipped", { fname, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  for (const sectionName of sortedSections) {
    const items = grouped.get(sectionName)!;
    ensure(40);
    y -= 4;
    drawText(sectionName.toUpperCase(), { font: bold, size: 14, color: rgb(0.1, 0.2, 0.5), gap: 6 });
    ensure(8);
    page.drawLine({
      start: { x: margin, y: y + 2 },
      end: { x: pageW - margin, y: y + 2 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 6;

    for (const { label, ans } of items) {
      ensure(50);
      drawText(label, { font: bold, size: 11 });
      const value = formatAnswer(ans);
      drawText(value, {
        size: 11,
        color: value === "N/A" ? rgb(0.55, 0.55, 0.55) : rgb(0, 0, 0),
      });
      if (ans?.notes) drawText(`Notes: ${ans.notes}`, { font: italic, size: 10 });
      const allPhotos = [
        ...(ans?.photoNames ?? []),
        ...(ans?.poorPhotoNames ?? []),
      ];
      if (allPhotos.length) {
        drawText(`Photos: ${allPhotos.join(", ")}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
      }
      y -= 6;
    }

    // Inline thumbnails for this section
    const sectionThumbs = (sectionPhotoNames.get(sectionName) ?? [])
      .map((n) => ({ name: n, embed: embeddedThumbs.get(n) }))
      .filter((t) => t.embed);
    if (sectionThumbs.length) {
      const labelSize = 7;
      const rowH = THUMB_H + labelSize + 8;
      for (let i = 0; i < sectionThumbs.length; i += THUMBS_PER_ROW) {
        ensure(rowH + 4);
        const rowItems = sectionThumbs.slice(i, i + THUMBS_PER_ROW);
        const rowTopY = y;
        rowItems.forEach((t, idx) => {
          const x = margin + idx * (THUMB_W + THUMB_GAP);
          page.drawImage(t.embed!.img, { x, y: rowTopY - THUMB_H, width: THUMB_W, height: THUMB_H });
          // filename below thumbnail (truncate to fit width)
          let name = t.name;
          while (font.widthOfTextAtSize(name, labelSize) > THUMB_W && name.length > 4) {
            name = name.slice(0, -2);
          }
          if (name !== t.name) name = name.slice(0, -1) + "…";
          page.drawText(name, {
            x,
            y: rowTopY - THUMB_H - labelSize - 2,
            size: labelSize,
            font,
            color: rgb(0.45, 0.45, 0.45),
          });
        });
        y -= rowH;
      }
    }

    y -= 8;
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
    const isReupload = body.mode === "reupload";
    // phase: "photos" (default) uploads images + SUMMARY.pdf, then marks
    // upload_status = "photos_complete" (or "confirmed" if no videos exist).
    // phase: "videos" uploads a single named video. The client iterates one
    // video at a time so each call stays well under the edge timeout.
    const phase = (body.phase as "photos" | "videos") ?? "photos";
    const videoFilename = body.videoFilename as string | undefined;
    const purgeVideosFolder = body.purgeFirst === true; // only used in phase=videos
    const markConfirmed = body.markComplete === true; // only used in phase=videos
    walkIdForFailure = walkId;
    console.log("[upload-to-drive] request payload", { walkthroughId: walkId, mode: isReupload ? "reupload" : "initial", phase, videoFilename, purgeVideosFolder, markConfirmed });
    if (!walkId) throw new Error("Upload failed: missing walkthroughId in request payload");
    if (phase === "videos" && !videoFilename) throw new Error("Upload failed: videoFilename is required for phase=videos");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch walkthrough (admin) + verify ownership
    const { data: walkRow, error: walkErr } = await admin
      .from("walkthroughs")
      .select("*")
      .eq("id", walkId)
      .single();
    if (walkErr || !walkRow) throw new Error(`Upload failed: walkthrough ${walkId} was not found`);
    if (walkRow.user_id !== userId) {
      // Allow admins to upload on behalf of an agent (Fix Missing Items flow).
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role,status")
        .eq("user_id", userId)
        .maybeSingle();
      const isAdmin = roleRow?.role === "admin" && roleRow?.status === "active";
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[upload-to-drive] admin re-upload on behalf of agent", {
        adminId: userId, agentId: walkRow.user_id, walkthroughId: walkId,
      });
    }
    const walk = walkRow as Walkthrough;
    console.log("[upload-to-drive] walkthrough loaded", { walkthroughId: walk.id, userId: walk.user_id });

    // Mark as uploading only for photos phase. Videos phase keeps the
    // existing "photos_complete" status visible until it flips to confirmed.
    if (phase === "photos") {
      await admin
        .from("walkthroughs")
        .update({ upload_status: "uploading" })
        .eq("id", walkId);
      console.log("[upload-to-drive] marked walkthrough uploading", { walkthroughId: walkId });
    }

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
    console.log("[upload-to-drive] Photos subfolder ready", { walkthroughId: walkId, photosFolderId });
    const videosFolderId = await createDriveFolder(token, "Videos", subfolderId);
    console.log("[upload-to-drive] Videos subfolder ready", { walkthroughId: walkId, videosFolderId });

    const isVideoName = (n: string) => /\.(mp4|mov)$/i.test(n);

    // Collect ALL filenames referenced by answers, then split by media type.
    const allNames = new Set<string>();
    for (const ans of Object.values(walk.answers ?? {})) {
      (ans.photoNames ?? []).forEach((n) => n && allNames.add(n));
      (ans.poorPhotoNames ?? []).forEach((n) => n && allNames.add(n));
    }
    const photoFiles = Array.from(allNames).filter((n) => !isVideoName(n));
    const videoFiles = Array.from(allNames).filter(isVideoName);
    console.log("[upload-to-drive] media split", { walkthroughId: walkId, photos: photoFiles.length, videos: videoFiles.length, phase });

    // Helper: download from Storage and push to Drive.
    const uploadOneToFolder = async (fname: string, folderId: string): Promise<boolean> => {
      const path = `${walk.user_id}/${walkId}/${fname}`;
      const { data: blob, error: dlErr } = await admin.storage
        .from("walkthrough-photos")
        .download(path);
      if (dlErr || !blob) {
        console.warn("[upload-to-drive] missing file in storage", { path, error: dlErr?.message });
        return false;
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
      try {
        await uploadFileToDrive(token, fname, mime, bytes, folderId);
        console.log("[upload-to-drive] file uploaded ✓", { filename: fname, mime, bytes: bytes.length });
        return true;
      } catch (err) {
        console.error("[upload-to-drive] file upload ✗", { filename: fname, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    };

    // ============= PHASE: VIDEOS =============
    // Upload a single named video to the Videos subfolder. Optionally purge
    // the Videos folder first (used by the client on the first video of a
    // re-upload run). Optionally mark the walkthrough as fully confirmed
    // (set by the client on the last video).
    if (phase === "videos") {
      if (purgeVideosFolder) {
        const deleted = await purgeFolderContents(token, videosFolderId);
        console.log("[upload-to-drive] re-upload: purged Videos folder", { walkthroughId: walkId, deleted });
      }
      const ok = await uploadOneToFolder(videoFilename!, videosFolderId);
      if (!ok) throw new Error(`Video upload failed: ${videoFilename} could not be read from storage`);

      const driveLink = walk.drive_folder_url ?? (await setFolderShareableLink(token, subfolderId));
      if (markConfirmed) {
        await admin
          .from("walkthroughs")
          .update({
            upload_status: "confirmed",
            drive_folder_url: driveLink,
            uploaded_at: new Date().toISOString(),
          })
          .eq("id", walkId);
      } else {
        // keep status as photos_complete; ensure drive link is set
        await admin
          .from("walkthroughs")
          .update({ upload_status: "photos_complete", drive_folder_url: driveLink })
          .eq("id", walkId);
      }
      return new Response(
        JSON.stringify({ success: true, driveFolderUrl: driveLink, videoUploaded: videoFilename, markedConfirmed: markConfirmed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============= PHASE: PHOTOS (default) =============
    // Re-upload mode: purge existing Photos folder + prior SUMMARY.pdf so
    // this folder reflects the latest photos only. Videos folder is left
    // alone — Phase 2 will purge it before uploading the first new video.
    if (isReupload) {
      console.log("[upload-to-drive] re-upload: purging Photos folder + prior SUMMARY.pdf", { walkthroughId: walkId });
      const photosDeleted = await purgeFolderContents(token, photosFolderId);
      const priorPdfId = await findFileByName(token, "SUMMARY.pdf", subfolderId);
      if (priorPdfId) {
        const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${priorPdfId}?${DRIVE_QS}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!delRes.ok && delRes.status !== 404) {
          console.warn("[upload-to-drive] re-upload: failed to delete prior SUMMARY.pdf (non-fatal)", { status: delRes.status });
        }
      }
      console.log("[upload-to-drive] re-upload: photos-phase purge complete", { walkthroughId: walkId, photosDeleted, priorPdfDeleted: Boolean(priorPdfId) });
    }

    // Run uploads in parallel chunks so 75+ files finish under the 150s
    // edge-function timeout. Concurrency 6 keeps us well under Drive's
    // per-user write quota.
    const CONCURRENCY = 6;
    let uploaded = 0;
    let failed = 0;
    for (let i = 0; i < photoFiles.length; i += CONCURRENCY) {
      const chunk = photoFiles.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((f) => uploadOneToFolder(f, photosFolderId)));
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value) uploaded++;
        } else {
          failed++;
        }
      }
      console.log("[upload-to-drive] chunk done", { walkthroughId: walkId, progress: `${Math.min(i + CONCURRENCY, photoFiles.length)}/${photoFiles.length}`, uploaded, failed });
    }
    if (failed > 0) {
      throw new Error(`Drive upload incomplete: ${failed} of ${photoFiles.length} photos failed`);
    }

    // Generate Drive shareable link
    const driveLink = await setFolderShareableLink(token, subfolderId);
    console.log("[upload-to-drive] Drive folder share link ready", { walkthroughId: walkId, driveLink, uploaded });

    // Build & upload SUMMARY.pdf
    console.log("[upload-to-drive] generating SUMMARY.pdf", { walkthroughId: walkId });
    const pdfBytes = await buildSummaryPdf(walk, agentName, driveLink, admin);
    console.log("[upload-to-drive] SUMMARY.pdf generated", { walkthroughId: walkId, bytes: pdfBytes.length });
    console.log("[upload-to-drive] uploading SUMMARY.pdf to Drive", { walkthroughId: walkId, parentId: subfolderId });
    await uploadFileToDrive(
      token,
      "SUMMARY.pdf",
      "application/pdf",
      pdfBytes,
      subfolderId,
    );
    console.log("[upload-to-drive] SUMMARY.pdf uploaded ✓", { walkthroughId: walkId });

    // If there are no videos, the walkthrough is fully uploaded.
    // Otherwise Phase 2 will flip the status to "confirmed" after videos.
    const finalStatus = videoFiles.length === 0 ? "confirmed" : "photos_complete";
    await admin
      .from("walkthroughs")
      .update({
        upload_status: finalStatus,
        drive_folder_url: driveLink,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", walkId);

    return new Response(
      JSON.stringify({
        success: true,
        driveFolderUrl: driveLink,
        photosUploaded: uploaded,
        videos: videoFiles,
        videosPending: videoFiles.length,
        status: finalStatus,
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
