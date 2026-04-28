import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Reliable online/offline detection.
 *
 * navigator.onLine is unreliable on mobile (esp. iOS Safari) — it can
 * report offline even with a working connection. Instead, we actively
 * probe a reliable endpoint (Supabase) on an interval and on the
 * browser's online/offline events. The banner only shows when an
 * actual probe has failed.
 *
 * Defaults:
 *  - assume online at startup (no banner until a probe fails)
 *  - probe every 30s
 *  - 5s timeout per probe
 */
const PROBE_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;

function getProbeUrl(): string {
  const base =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_SUPABASE_URL) ||
    "";
  if (base) return `${base.replace(/\/$/, "")}/auth/v1/health`;
  // Fallback — should not happen in this project
  return "/";
}

async function probeConnectivity(): Promise<boolean> {
  if (typeof fetch === "undefined") return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Use HEAD with no-cors so opaque success still resolves.
    // Cache-buster query param prevents stale 200s from a SW.
    const url = `${getProbeUrl()}?_=${Date.now()}`;
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useOnlineStatus(): boolean {
  // Start assuming online — never show the banner until a probe fails.
  const [online, setOnline] = useState<boolean>(true);
  const onlineRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const apply = (next: boolean) => {
      if (cancelled) return;
      const prev = onlineRef.current;
      if (prev === next) return;
      onlineRef.current = next;
      setOnline(next);
      if (next) {
        toast.success("Back online — ready to upload");
      }
    };

    const runProbe = async () => {
      const ok = await probeConnectivity();
      apply(ok);
    };

    // Trigger a probe on browser events, but don't trust them blindly.
    const handleOnline = () => void runProbe();
    const handleOffline = () => void runProbe();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = window.setInterval(() => void runProbe(), PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  return online;
}
