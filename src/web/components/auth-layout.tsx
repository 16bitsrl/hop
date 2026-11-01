import type { ReactNode } from "react";

/** Centered card used by sign-in, setup, invite and password pages. */
export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-fg">h</span>
        <span className="text-lg font-semibold tracking-tight">hop</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13px] leading-snug text-muted">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
