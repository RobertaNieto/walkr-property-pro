import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Tracks the browser's online/offline status using navigator.onLine
 * and the window "online" / "offline" events.
 *
 * Shows a brief toast when the connection comes back.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setOnline(true);
      toast.success("Back online — ready to upload");
    };
    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
