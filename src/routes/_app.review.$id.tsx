import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchById, formatTimestamp, type Walkthrough } from "@/lib/walkthrough";

export const Route = createFileRoute("/_app/review/$id")({
  component: ReviewScreen,
});

interface QuestionDef {
  id: string;
  section: string;
  label: string;
}

const QUESTIONS: QuestionDef[] = [
  { id: "lockbox_code", section: "Access", label: "Lockbox code & location" },
  { id: "front_of_house", section: "Exterior", label: "Front of house" },
  { id: "exterior_paint", section: "Exterior", label: "Exterior paint condition" },
];

const RATING_LABEL: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
};

function ReviewScreen() {
  const { id } = useParams({ from: "/_app/review/$id" });
  const [walk, setWalk] = useState<Walkthrough | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchById(id)
      .then((w) => setWalk(w))
      .catch((e) => toast.error(e.message ?? "Could not load walkthrough"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!walk) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-foreground">Walkthrough not found.</p>
        <Link to="/" className="text-sm font-semibold text-accent underline">
          Back to home
        </Link>
      </div>
    );
  }

  const addr = walk.address;
  const addressLine = [addr.houseNumber, addr.streetName].filter(Boolean).join(" ");
  const cityLine = addr.city;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/"
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Review</p>
            <h1 className="text-lg font-bold text-foreground">
              {addressLine || "Walkthrough"}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {walk.completedAt && (
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed {formatTimestamp(walk.completedAt)}
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Property
          </h2>
          <p className="text-base font-semibold text-foreground">{addressLine || "—"}</p>
          {cityLine && <p className="text-sm text-muted-foreground">{cityLine}</p>}
        </section>

        {Object.keys(walk.config ?? {}).length > 0 && (
          <section className="mb-6 rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pre-walk configuration
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(walk.config).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="font-semibold text-foreground">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Answers
          </h2>
          {QUESTIONS.map((q) => {
            const a = walk.answers?.[q.id];
            if (!a) return null;
            return (
              <div key={q.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {q.section}
                </p>
                <h3 className="mt-1 text-base font-bold text-foreground">{q.label}</h3>

                {a.text && (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Code: </span>
                    <span className="font-semibold tracking-wider text-foreground">{a.text}</span>
                  </p>
                )}

                {a.rating !== undefined && (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Rating: </span>
                    <span className="font-semibold text-foreground">
                      {RATING_LABEL[a.rating] ?? a.rating}
                    </span>
                  </p>
                )}

                {a.notes && (
                  <p className="mt-2 text-sm text-foreground">
                    <span className="text-muted-foreground">Notes: </span>
                    {a.notes}
                  </p>
                )}

                {a.photos && a.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {a.photos.map((src, i) => (
                      <div
                        key={i}
                        className="relative aspect-square overflow-hidden rounded-xl bg-secondary"
                      >
                        <img
                          src={src}
                          alt={`${q.label} ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {Object.keys(walk.answers ?? {}).length === 0 && (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No answers were saved for this walkthrough.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
