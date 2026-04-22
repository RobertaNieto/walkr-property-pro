import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { completeWalkthrough, loadActive, setAnswer, type WizardAnswer } from "@/lib/walkthrough";
import { FINAL_CHECKLIST_ITEMS } from "@/lib/wizard-schema";

const QID = "s17_final_checklist";

export const Route = createFileRoute("/_app/wizard/checklist")({
  component: ChecklistScreen,
});

function ChecklistScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const w = useMemo(() => loadActive(), []);
  const [items, setItems] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const visibleItems = useMemo(
    () => FINAL_CHECKLIST_ITEMS.filter((it) => !it.visible || it.visible(w?.config ?? {})),
    [w?.config],
  );

  useEffect(() => {
    const existing = (w?.answers?.[QID] as WizardAnswer | undefined)?.checklist ?? {};
    setItems(existing);
  }, [w?.id]);

  // Auto-save
  useEffect(() => {
    const t = setTimeout(() => {
      setAnswer(QID, { checklist: items });
    }, 150);
    return () => clearTimeout(t);
  }, [items]);

  const allChecked = visibleItems.every((it) => items[it.id]);

  const toggle = (id: string) => setItems((m) => ({ ...m, [id]: !m[id] }));

  const handleComplete = async () => {
    if (!allChecked || submitting) return;
    setSubmitting(true);
    try {
      setAnswer(QID, { checklist: items });
      const done = await completeWalkthrough();
      if (done) {
        navigate({ to: "/review/$id", params: { id: done.id } });
        return;
      }

      const active = loadActive();
      if (active) {
        navigate({ to: "/review/$id", params: { id: active.id } });
      } else {
        alert("Could not complete walkthrough. Please go back and try again.");
      }
    } catch {
      alert("Failed to complete walkthrough. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <button
            onClick={() => router.history.back()}
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Section 17 of 18 — Final Checklist
            </p>
            <p className="text-xs text-muted-foreground">Confirm before leaving the property</p>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <h1 className="text-2xl font-bold text-foreground">Before you leave</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Confirm each item before leaving the property.
          </p>

          <ul className="mt-6 space-y-2">
            {visibleItems.map((it) => {
              const checked = !!items[it.id];
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => toggle(it.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border-2 bg-card px-4 py-4 text-left transition-all active:scale-[0.99]",
                      checked
                        ? "border-success bg-success/5"
                        : "border-border hover:border-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 flex-shrink-0 place-content-center rounded-md border-2",
                        checked ? "border-success bg-success text-white" : "border-input bg-background",
                      )}
                    >
                      {checked && <Check className="h-4 w-4" />}
                    </span>
                    <span className="text-base font-semibold text-foreground">{it.label}</span>
                    {/* Hidden checkbox for a11y */}
                    <Checkbox checked={checked} className="sr-only" tabIndex={-1} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          <button
            onClick={handleComplete}
            aria-disabled={!allChecked || submitting}
            disabled={!allChecked || submitting}
            className={cn(
              "inline-flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold transition-all",
              allChecked && !submitting
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] hover:bg-primary/90 active:scale-[0.99]"
                : "bg-muted text-muted-foreground",
            )}
          >
            {submitting ? "Saving…" : "Complete Walkthrough"}
          </button>
        </div>
      </footer>
    </div>
  );
}
