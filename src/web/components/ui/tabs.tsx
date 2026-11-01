import { cn } from "../../lib/cn";

/** Controlled tab strip. Render the active panel yourself. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.id === value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
