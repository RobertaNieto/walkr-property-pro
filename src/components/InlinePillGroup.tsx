import { cn } from "@/lib/utils";

export type PillTone = "good" | "fair" | "poor" | "neutral";

export interface InlinePillOption {
  label: string;
  selected: boolean;
  onClick: () => void;
  tone?: PillTone;
}

interface Props {
  options: InlinePillOption[];
}

const toneClass: Record<PillTone, string> = {
  good: "bg-rating-good text-white border-rating-good",
  fair: "bg-rating-fair text-foreground border-rating-fair",
  poor: "bg-rating-poor text-white border-rating-poor",
  neutral: "bg-accent text-accent-foreground border-accent",
};

export function InlinePillGroup({ options }: Props) {
  return (
    <div className="inline-flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={opt.onClick}
          className={cn(
            "inline-flex h-8 min-w-[60px] items-center justify-center rounded-full border px-3 text-sm font-semibold transition-all active:scale-95",
            opt.selected
              ? cn(toneClass[opt.tone ?? "neutral"], "shadow-sm")
              : "border-border bg-card text-muted-foreground hover:border-accent/40",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
