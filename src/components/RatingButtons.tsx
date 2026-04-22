import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/walkthrough";

interface RatingButtonsProps {
  value?: Rating;
  onChange: (rating: Rating) => void;
  error?: boolean;
}

const ratings: { value: Rating; label: string; sub: string; colorClass: string; ringClass: string }[] = [
  { value: 1, label: "1", sub: "GOOD", colorClass: "bg-rating-good text-white", ringClass: "ring-rating-good" },
  { value: 2, label: "2", sub: "FAIR", colorClass: "bg-rating-fair text-foreground", ringClass: "ring-rating-fair" },
  { value: 3, label: "3", sub: "POOR", colorClass: "bg-rating-poor text-white", ringClass: "ring-rating-poor" },
];

export function RatingButtons({ value, onChange, error }: RatingButtonsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-3 rounded-2xl p-1",
        error && "field-error"
      )}
    >
      {ratings.map((r) => {
        const selected = value === r.value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-full border-2 text-center transition-all active:scale-95",
              selected
                ? cn(r.colorClass, "border-transparent shadow-[var(--shadow-elevated)] ring-4", r.ringClass, "ring-opacity-30")
                : "border-border bg-card text-foreground hover:border-accent/40"
            )}
          >
            <span className="text-3xl font-bold leading-none">{r.label}</span>
            <span className="mt-1 text-[11px] font-bold tracking-wider">{r.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
