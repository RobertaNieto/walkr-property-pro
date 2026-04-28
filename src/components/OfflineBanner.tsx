import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Global thin banner shown at the very top of the screen when the
 * device loses its network connection. Disappears automatically when
 * the connection is restored.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-xs font-semibold text-warning-foreground shadow-sm"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      <span>You're offline — answers are saved locally</span>
    </div>
  );
}
