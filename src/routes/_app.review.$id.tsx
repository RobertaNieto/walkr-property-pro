import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  Play,
  Printer,
  Share2,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { resolvePhotoSrc } from "@/lib/photo-store";
import { cn } from "@/lib/utils";
import {
  getCompletedLocalById,
  getLatestCompletedLocal,
  type Walkthrough,
  type WizardAnswer,
} from "@/lib/walkthrough";
import {
  buildQuestionList,
  collectCriticalFlags,
  FINAL_CHECKLIST_ITEMS,
  SECTIONS,
  type QuestionDef,
  type SkipContext,
} from "@/lib/wizard-schema";

export const Route = createFileRoute("/_app/review/$id")({
  component: ReviewScreen,
});

const RATING_LABEL: Record<number, string> = { 1: "Good", 2: "Fair", 3: "Poor" };
const RATING_DOT: Record<number, string> = {
  1: "bg-rating-good",
  2: "bg-rating-fair",
  3: "bg-rating-poor",
};
const RATING_EMOJI: Record<number, string> = { 1: "🟢", 2: "🟡", 3: "🔴" };

interface PhotoEntry {
  src: string;
  filename: string;
  questionLabel: string;
  sectionName: string;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPropertyValue(v: string | undefined): string {
  if (!v || v.trim() === "") return "Not specified";
  return v;
}

function ReviewScreen() {
  const { id } = useParams({ from: "/_app/review/$id" });
  const navigate = useNavigate();
  const { user } = useAuth();

  const [walk, setWalk] = useState<Walkthrough | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Photo lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Section refs for scroll-to behavior
  const sectionsRef = useRef<HTMLDivElement | null>(null);
  const photosRef = useRef<HTMLDivElement | null>(null);
  const videosRef = useRef<HTMLDivElement | null>(null);
  const flagsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const local = getCompletedLocalById(id) ?? getLatestCompletedLocal();
    if (local) {
      setWalk(local);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [id]);

  const ctx: SkipContext | null = useMemo(
    () =>
      walk
        ? { config: walk.config ?? {}, answers: (walk.answers ?? {}) as SkipContext["answers"] }
        : null,
    [walk],
  );

  const allQuestions = useMemo(() => (ctx ? buildQuestionList(ctx) : []), [ctx]);
  const critical = useMemo(() => (ctx ? collectCriticalFlags(ctx) : []), [ctx]);

  // Group by section, only including sections that have visible questions.
  const grouped = useMemo(() => {
    const out: { section: { index: number; name: string }; questions: QuestionDef[] }[] = [];
    for (const s of SECTIONS) {
      const questions = allQuestions.filter((q) => q.sectionIndex === s.index);
      if (questions.length > 0) out.push({ section: { index: s.index, name: s.name }, questions });
    }
    return out;
  }, [allQuestions]);

  // Aggregate photos and videos with metadata for the gallery + count badges.
  const { photos, videos, photoBySection, criticalBySection } = useMemo(() => {
    const photosArr: PhotoEntry[] = [];
    const videosArr: PhotoEntry[] = [];
    const photoCounts = new Map<number, number>();
    const flagCounts = new Map<number, number>();
    if (!walk) {
      return {
        photos: photosArr,
        videos: videosArr,
        photoBySection: photoCounts,
        criticalBySection: flagCounts,
      };
    }
    for (const q of allQuestions) {
      const a = walk.answers?.[q.id] as WizardAnswer | undefined;
      if (!a) continue;
      if (q.critical && (a.bool === true || a.rating === 3)) {
        flagCounts.set(q.sectionIndex, (flagCounts.get(q.sectionIndex) ?? 0) + 1);
      }
      const list = a.photos ?? [];
      list.forEach((entry, i) => {
        const src = resolvePhotoSrc(entry);
        if (!src) return;
        const filename = a.photoNames?.[i] ?? `${q.photoName ?? q.id.toUpperCase()}.${q.field === "video" ? "mp4" : "jpg"}`;
        const item: PhotoEntry = {
          src,
          filename,
          questionLabel: q.label,
          sectionName: q.sectionName,
        };
        if (q.field === "video") {
          videosArr.push(item);
        } else {
          photosArr.push(item);
          photoCounts.set(q.sectionIndex, (photoCounts.get(q.sectionIndex) ?? 0) + 1);
        }
      });
    }
    return {
      photos: photosArr,
      videos: videosArr,
      photoBySection: photoCounts,
      criticalBySection: flagCounts,
    };
  }, [walk, allQuestions]);

  const visibleChecklist = useMemo(
    () => FINAL_CHECKLIST_ITEMS.filter((it) => !it.visible || it.visible(walk?.config ?? {})),
    [walk?.config],
  );

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, photos.length]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!walk || !ctx || notFound) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-xl font-bold text-foreground">No completed walkthrough found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          We couldn't find a completed walkthrough on this device.
        </p>
        <Link
          to="/"
          className="mt-2 inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Go Home
        </Link>
      </div>
    );
  }

  const addr = walk.address;
  const streetLine = [addr.houseNumber, addr.streetName].filter(Boolean).join(" ").trim() || "Property walkthrough";
  const cityLine = addr.city || "";
  const completedBy =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email ??
    "Agent";

  const cfg = walk.config ?? {};
  // Pull a few schema-derived overview values so users see them at a glance.
  const foundation = (walk.answers?.["s2_foundation"] as WizardAnswer | undefined)?.choice;
  const roofType = (walk.answers?.["s5_roof_type"] as WizardAnswer | undefined)?.choice;
  const siding = (walk.answers?.["s2_siding"] as WizardAnswer | undefined)?.choice;

  const totalSections = grouped.length + 1; // include checklist

  const handleShare = async () => {
    const text = `Property walkthrough complete: ${streetLine}${cityLine ? ", " + cityLine : ""}${
      walk.completedAt ? ` — ${formatDateTime(walk.completedAt)}` : ""
    }`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "PropertyWalk", text });
      } catch {
        // user cancelled — no-op
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        alert("Summary copied to clipboard");
      } catch {
        alert(text);
      }
    } else {
      alert(text);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Top utility bar — hidden in print */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <button
            type="button"
            onClick={() => navigate({ to: "/walkthroughs", search: { tab: "completed" } as never, replace: true })}
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold text-muted-foreground">Walkthrough Review</p>
        </div>
      </header>

      {/* Navy hero header with property + meta */}
      <section className="bg-primary text-primary-foreground print:bg-white print:text-black">
        <div className="mx-auto w-full max-w-3xl px-5 py-7 sm:py-9">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{streetLine}</h1>
          {cityLine && <p className="mt-1 text-base text-primary-foreground/80 print:text-gray-700">{cityLine}</p>}
          <p className="mt-3 text-sm text-primary-foreground/80 print:text-gray-700">
            Completed {walk.completedAt ? formatDateTime(walk.completedAt) : "—"}
          </p>
          <p className="text-sm text-primary-foreground/70 print:text-gray-700">By {completedBy}</p>
        </div>

        {/* Stats pill row */}
        <div className="mx-auto w-full max-w-3xl px-5 pb-6 print:hidden">
          <div className="flex flex-wrap gap-2">
            <StatPill
              icon={<Camera className="h-4 w-4" />}
              label={`${photos.length} Photos`}
              onClick={() => scrollTo(photosRef)}
            />
            <StatPill
              icon={<Film className="h-4 w-4" />}
              label={`${videos.length} Videos`}
              onClick={() => scrollTo(videosRef)}
            />
            <StatPill
              icon={<Star className="h-4 w-4" />}
              label={`${totalSections} Sections`}
              onClick={() => scrollTo(sectionsRef)}
            />
            <StatPill
              icon={<AlertTriangle className="h-4 w-4" />}
              label={`${critical.length} Flags`}
              danger={critical.length > 0}
              onClick={() => scrollTo(critical.length > 0 ? flagsRef : sectionsRef)}
            />
          </div>
        </div>
      </section>

      {/* Body */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 print:max-w-none">
        {/* Critical flags */}
        {critical.length > 0 && (
          <section
            ref={flagsRef}
            className="mb-6 rounded-2xl border-2 border-critical bg-critical/10 p-4 sm:p-5"
          >
            <div className="flex items-center gap-2 text-critical">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="text-base font-bold">⚠️ {critical.length} Critical Issues Flagged</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {critical.map((c) => (
                <li
                  key={c.questionId}
                  className="rounded-xl border border-critical/30 bg-card p-3 text-sm"
                >
                  <p className="font-semibold text-foreground">{c.label}</p>
                  {c.notes && <p className="mt-1 text-muted-foreground">{c.notes}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Property overview */}
        <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <h2 className="text-base font-bold text-foreground">Property Overview</h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <OverviewItem label="Bedrooms" value={formatPropertyValue(cfg.bedrooms)} />
            <OverviewItem label="Bathrooms" value={formatPropertyValue(cfg.bathrooms)} />
            <OverviewItem label="Garage" value={formatPropertyValue(cfg.garage)} />
            <OverviewItem label="Pool" value={formatPropertyValue(cfg.pool)} />
            <OverviewItem label="Spa" value={formatPropertyValue(cfg.spa)} />
            <OverviewItem label="Fireplace" value={formatPropertyValue(cfg.fireplace)} />
            <OverviewItem label="Laundry" value={formatPropertyValue(cfg.laundry)} />
            <OverviewItem label="Foundation" value={formatPropertyValue(foundation)} />
            <OverviewItem label="Roof type" value={formatPropertyValue(roofType)} />
            <OverviewItem label="Siding" value={formatPropertyValue(siding)} />
          </dl>
        </section>

        {/* Sections */}
        <div ref={sectionsRef}>
          <h2 className="mb-3 text-base font-bold text-foreground">Section Summary</h2>
          <Accordion type="multiple" className="space-y-2">
            {grouped.map(({ section, questions }) => {
              const requiredAnswered = questions
                .filter((q) => q.required)
                .every((q) => answerHasValue(walk.answers?.[q.id] as WizardAnswer | undefined));
              const photoCount = photoBySection.get(section.index) ?? 0;
              const flagCount = criticalBySection.get(section.index) ?? 0;
              return (
                <AccordionItem
                  key={section.index}
                  value={`s-${section.index}`}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]"
                >
                  <AccordionTrigger className="min-h-[56px] px-4 py-3 hover:no-underline">
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                          Section {section.index}
                        </p>
                        <p className="truncate text-base font-bold text-foreground">{section.name}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2 text-xs font-semibold">
                        {photoCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-foreground">
                            <Camera className="h-3.5 w-3.5" />
                            {photoCount}
                          </span>
                        )}
                        {flagCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-critical/10 px-2 py-1 text-critical">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {flagCount}
                          </span>
                        )}
                        {requiredAnswered && (
                          <span aria-label="All required items answered" className="text-success">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4 pt-1">
                      {questions.map((q) => (
                        <AnswerRow
                          key={q.id}
                          q={q}
                          a={walk.answers?.[q.id] as WizardAnswer | undefined}
                          onPhotoOpen={(filename) => {
                            const idx = photos.findIndex((p) => p.filename === filename);
                            if (idx >= 0) setLightboxIndex(idx);
                          }}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            {/* Final checklist */}
            <AccordionItem
              value="s-17"
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]"
            >
              <AccordionTrigger className="min-h-[56px] px-4 py-3 hover:no-underline">
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="text-left">
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                      Section 17
                    </p>
                    <p className="text-base font-bold text-foreground">Final Checklist</p>
                  </div>
                  {visibleChecklist.every((i) => {
                    const ans = walk.answers?.["s17_final_checklist"] as WizardAnswer | undefined;
                    return ans?.checklist?.[i.id];
                  }) && <span className="text-success">✓</span>}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <ChecklistList items={visibleChecklist} answers={walk.answers} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Photo gallery */}
        <section ref={photosRef} className="mt-8">
          <h2 className="mb-3 text-base font-bold text-foreground">
            All Photos ({photos.length} total)
          </h2>
          {photos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm italic text-muted-foreground">
              No photos captured.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <button
                  key={`${p.filename}-${i}`}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group flex flex-col gap-1 text-left"
                >
                  <div className="aspect-square overflow-hidden rounded-xl bg-secondary ring-1 ring-border transition-transform group-hover:scale-[1.02]">
                    <img src={p.src} alt={p.filename} className="h-full w-full object-cover" />
                  </div>
                  <p className="truncate text-[10px] font-medium text-muted-foreground" title={p.filename}>
                    {p.filename}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Videos */}
        <section ref={videosRef} className="mt-8">
          <h2 className="mb-3 text-base font-bold text-foreground">
            Videos ({videos.length} total)
          </h2>
          {videos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm italic text-muted-foreground">
              No videos uploaded.
            </p>
          ) : (
            <ul className="space-y-2">
              {videos.map((v, i) => (
                <li key={`${v.filename}-${i}`}>
                  <details className="group rounded-2xl border border-border bg-card p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-content-center rounded-full bg-primary text-primary-foreground">
                          <Play className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{v.filename}</p>
                          <p className="text-xs text-muted-foreground">{v.questionLabel}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-accent group-open:hidden">Play</span>
                      <span className="hidden text-xs font-semibold text-muted-foreground group-open:inline">
                        Hide
                      </span>
                    </summary>
                    <div className="mt-3 overflow-hidden rounded-xl bg-black">
                      <video src={v.src} controls className="h-full w-full" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Share / Print */}
        <div className="mt-8 flex justify-center gap-4 text-sm font-semibold text-accent print:hidden">
          <button type="button" onClick={handleShare} className="inline-flex items-center gap-1.5 hover:underline">
            <Share2 className="h-4 w-4" />
            Share Summary
          </button>
          <span aria-hidden className="text-muted-foreground">|</span>
          <button type="button" onClick={handlePrint} className="inline-flex items-center gap-1.5 hover:underline">
            <Printer className="h-4 w-4" />
            Print Report
          </button>
        </div>

        <div className="h-32 print:hidden" aria-hidden />
      </main>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:px-6">
          <button
            type="button"
            onClick={() => alert("Google Drive upload coming soon")}
            aria-disabled
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary/60 text-sm font-semibold text-primary-foreground/80"
          >
            <Lock className="h-4 w-4" />
            Upload to Google Drive →
            <CloudUpload className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/walkthroughs", search: { tab: "completed" } as never, replace: true })
            }
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Back to My Walkthroughs
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photo={photos[lightboxIndex]}
          index={lightboxIndex}
          total={photos.length}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))}
          onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))}
        />
      )}
    </div>
  );
}

function StatPill({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
        danger
          ? "bg-critical text-critical-foreground ring-critical/40 hover:bg-critical/90"
          : "bg-white/10 text-primary-foreground ring-white/20 hover:bg-white/15",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  const isMissing = value === "Not specified";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 sm:border-0 sm:pb-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm font-semibold",
          isMissing ? "italic text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function answerHasValue(a: WizardAnswer | undefined): boolean {
  if (!a) return false;
  return (
    (a.text !== undefined && a.text !== "") ||
    a.bool !== undefined ||
    a.rating !== undefined ||
    a.choice !== undefined ||
    (a.choices?.length ?? 0) > 0 ||
    a.number !== undefined ||
    (a.photos?.length ?? 0) > 0
  );
}

function AnswerRow({
  q,
  a,
  onPhotoOpen,
}: {
  q: QuestionDef;
  a: WizardAnswer | undefined;
  onPhotoOpen: (filename: string) => void;
}) {
  const hasAnswer = answerHasValue(a);
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr,1fr] sm:gap-4">
      <p className="text-sm font-semibold text-foreground">
        {q.critical && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-critical" />}
        {q.label}
      </p>
      <div className="space-y-1.5 text-sm text-foreground">
        {!hasAnswer && <p className="italic text-muted-foreground">Not completed</p>}
        {a?.text && <p>{a.text}</p>}
        {a?.number !== undefined && <p>{a.number}</p>}
        {a?.bool !== undefined && <p>{a.bool ? "Yes" : "No"}</p>}
        {a?.choice && <p>{a.choice}</p>}
        {a?.choices && a.choices.length > 0 && <p>{a.choices.join(", ")}</p>}
        {a?.rating !== undefined && (
          <p className="flex items-center gap-1.5 font-medium">
            <span aria-hidden>{RATING_EMOJI[a.rating]}</span>
            <span className={cn("inline-block h-2 w-2 rounded-full", RATING_DOT[a.rating])} aria-hidden />
            <span>
              {a.rating} — {RATING_LABEL[a.rating]}
            </span>
          </p>
        )}
        {a?.notes && <p className="italic text-muted-foreground">"{a.notes}"</p>}

        {a?.photos && a.photos.length > 0 && (
          <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {a.photos.map((entry, i) => {
              const src = resolvePhotoSrc(entry);
              const filename = a.photoNames?.[i] ?? entry;
              if (!src) return null;
              if (q.field === "video") {
                return (
                  <div key={i} className="flex w-28 flex-shrink-0 flex-col gap-1">
                    <div className="aspect-square overflow-hidden rounded-lg bg-black">
                      <video src={src} className="h-full w-full object-cover" controls />
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground" title={filename}>
                      {filename}
                    </p>
                  </div>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPhotoOpen(filename)}
                  className="flex w-24 flex-shrink-0 flex-col gap-1 text-left"
                >
                  <div className="aspect-square overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-transform hover:scale-[1.03]">
                    <img src={src} alt={filename} className="h-full w-full object-cover" />
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground" title={filename}>
                    {filename}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistList({
  items,
  answers,
}: {
  items: { id: string; label: string }[];
  answers: Walkthrough["answers"];
}) {
  const checklist = (answers?.["s17_final_checklist"] as WizardAnswer | undefined)?.checklist ?? {};
  return (
    <ul className="space-y-2 text-sm">
      {items.map((it) => {
        const checked = !!checklist[it.id];
        return (
          <li key={it.id} className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid h-5 w-5 place-content-center rounded border",
                checked ? "border-success bg-success text-white" : "border-input bg-background",
              )}
            >
              {checked && <span className="text-xs font-bold">✓</span>}
            </span>
            <span className={checked ? "text-foreground" : "italic text-muted-foreground"}>
              {it.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Lightbox({
  photo,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  photo: PhotoEntry;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex flex-col bg-black/95 print:hidden"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)] text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{photo.filename}</p>
          <p className="truncate text-xs text-white/70">
            {photo.sectionName} · {photo.questionLabel} · {index + 1} of {total}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <img src={photo.src} alt={photo.filename} className="max-h-full max-w-full object-contain" />
      </div>
      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
    </div>
  );
}

// Suppress unused import warnings for icons referenced indirectly via props.
void ImageIcon;
