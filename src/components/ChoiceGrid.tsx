import { cn } from "@/lib/utils";

interface ChoiceGridProps<T extends string> {
  label: string;
  options: T[];
  value?: T;
  onChange: (v: T) => void;
  columns?: number;
}

export function ChoiceGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 4,
}: ChoiceGridProps<T>) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "min-h-12 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all active:scale-95",
                selected
                  ? "border-accent bg-accent text-accent-foreground shadow-[var(--shadow-soft)]"
                  : "border-border bg-card text-foreground hover:border-accent/40"
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
