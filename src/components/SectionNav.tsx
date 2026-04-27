import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Home, LayoutGrid, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSectionColor } from "@/components/WizardLayout";

export type SectionStatus = "complete" | "current" | "flagged" | "todo" | "skipped";

export interface SectionMeta {
  index: number;
  name: string;
  status: SectionStatus;
  /** First non-companion question id to navigate to. Undefined for skipped / non-question sections. */
  firstQuestionId?: string;
  /** Optional override route (used for sections 17/18 that live on dedicated routes). */
  route?: string;
  /** Reason text shown under skipped rows. */
  skipReason?: string;
}

interface SectionNavProps {
  open: boolean;
  onClose: () => void;
  currentSectionIndex: number;
  sections: SectionMeta[];
  onNavigate: (section: SectionMeta) => void;
  onGoHome: () => void;
}

// Section colors come from WizardLayout's getSectionColor for parity with banners.
// Sections 17 (final checklist) and 18 (review) get neutral tones.
const EXTRA_COLORS: Record<number, string> = {
  17: "#1B5E20", // dark green — final checklist
  18: "#6B7280", // gray — review
};

function colorFor(index: number): string {
  return EXTRA_COLORS[index] ?? getSectionColor(index);
}

export function SectionNav({
  open,
  onClose,
  currentSectionIndex,
  sections,
  onNavigate,
  onGoHome,
}: SectionNavProps) {
  const navigate = useNavigate();

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleHome = () => {
    onGoHome();
    onClose();
    void navigate({ to: "/wizard/menu" });
  };

  const handleSectionMenu = () => {
    onGoHome();
    onClose();
    void navigate({ to: "/wizard/menu" });
  };

  const handleRow = (s: SectionMeta) => {
    if (s.status === "skipped") return;
    onNavigate(s);
    onClose();
    toast(`Jumped to Section ${s.index} — ${s.name}`);
    if (s.route) {
      void navigate({ to: s.route });
    } else if (s.firstQuestionId) {
      void navigate({ to: "/wizard/q/$qid", params: { qid: s.firstQuestionId } });
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Section navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-[420px] flex-col bg-background shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 pb-4 pt-[max(env(safe-area-inset-top),1rem)]">
          <div>
            <p className="text-xl font-bold tracking-tight text-foreground">PropertyWalk</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Jump to Section</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close section navigation"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary active:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Menu (top) + Home buttons */}
        <div className="space-y-2 px-4 py-4">
          <button
            type="button"
            onClick={handleSectionMenu}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-accent/40 bg-accent/10 px-4 py-3 text-left transition-all hover:border-accent active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold text-foreground">Section Menu</span>
              <span className="block text-xs text-muted-foreground">
                Pick a section to work on next
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleHome}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 text-left transition-all hover:border-accent/40 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Home className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold text-foreground">🏠 Home</span>
              <span className="block text-xs text-muted-foreground">
                Save progress and return home
              </span>
            </span>
          </button>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <ul className="space-y-1">
            {sections.map((s) => {
              const color = colorFor(s.index);
              const isCurrent = s.index === currentSectionIndex;
              const isSkipped = s.status === "skipped";
              const isComplete = s.status === "complete";
              const isFlagged = s.status === "flagged";

              return (
                <li key={s.index}>
                  <button
                    type="button"
                    onClick={() => handleRow(s)}
                    disabled={isSkipped}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      isSkipped
                        ? "cursor-not-allowed opacity-60"
                        : "hover:bg-secondary active:bg-secondary",
                      isCurrent && "border-l-4",
                    )}
                    style={
                      isCurrent
                        ? {
                            backgroundColor: `${color}1A`, // ~10% opacity
                            borderLeftColor: color,
                          }
                        : undefined
                    }
                  >
                    {/* Color dot */}
                    <span
                      aria-hidden
                      className={cn(
                        "h-3 w-3 flex-shrink-0 rounded-full",
                        isSkipped && "opacity-40",
                      )}
                      style={{ backgroundColor: color }}
                    />

                    {/* Label */}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-semibold text-foreground",
                          isSkipped && "text-muted-foreground line-through",
                        )}
                      >
                        Section {s.index} — {s.name}
                      </span>
                      {isSkipped && s.skipReason && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {s.skipReason}
                        </span>
                      )}
                    </span>

                    {/* Status indicator */}
                    <span aria-hidden className="flex-shrink-0">
                      {isSkipped ? (
                        <span className="text-base text-muted-foreground">—</span>
                      ) : isCurrent ? (
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ) : isFlagged ? (
                        <AlertTriangle className="h-5 w-5 text-critical" />
                      ) : isComplete ? (
                        <Check className="h-5 w-5 text-accent" />
                      ) : (
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
