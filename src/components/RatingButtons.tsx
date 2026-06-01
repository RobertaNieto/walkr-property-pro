import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/walkthrough";

interface RatingButtonsProps {
  value?: Rating;
  onChange: (rating: Rating) => void;
  error?: boolean;
}

const ratings: { value: Rating; label: string; colorClass: string }[] = [
  { value: 1, label: "Good", colorClass: "bg-rating-good text-white border-rating-good" },
  { value: 2, label: "Fair", colorClass: "bg-rating-fair text-foreground border-rating-fair" },
  { value: 3, label: "Poor", colorClass: "bg-rating-poor text-white border-rating-poor" },
];

export function RatingButtons({ value, onChange, error }: RatingButtonsProps) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-2",
        error && "field-error rounded-md p-1",
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
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-all active:scale-95",
              selected
                ? cn(r.colorClass, "shadow-sm")
                : "border-border bg-card text-foreground hover:border-accent/40",
            )}
          >
            {selected && (
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10.5l4 4 8-9" />
              </svg>
            )}
            <span>{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}
