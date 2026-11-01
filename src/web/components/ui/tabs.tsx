import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/cn";

const tabId = (base: string, id: string) => `${base}-tab-${id}`;
const panelId = (base: string) => `${base}-panel`;

/**
 * Controlled tab strip. Render the active panel yourself inside <TabPanel> with the same `id` and `value`.
 * Arrow keys, Home and End move between tabs; only the active tab is a Tab stop.
 */
export function Tabs<T extends string>({
  id,
  tabs,
  value,
  onChange,
}: {
  id: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex((tab) => tab.id === value);
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (current + 1) % tabs.length
      : e.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    const tab = tabs[next];
    if (!tab) return;
    e.preventDefault();
    onChange(tab.id);
    document.getElementById(tabId(id, tab.id))?.focus();
  }

  return (
    <div role="tablist" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            id={tabId(id, tab.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={selected ? panelId(id) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              selected ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** The panel of the active tab, labelled by it. */
export function TabPanel({ id, value, className, children }: { id: string; value: string; className?: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id, value)} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
