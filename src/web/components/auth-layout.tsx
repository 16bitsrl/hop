import type { ReactNode } from "react";

/** Centered card used by sign-in, setup, invite and password pages. */
export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <img src="/icon.svg" alt="" className="size-7" />
        <span className="text-lg font-semibold tracking-tight">hop</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-(--shadow-raised) duration-200 animate-in fade-in-0 slide-in-from-bottom-1 sm:p-7">
        <h1 className="text-lg font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 text-[13px] leading-snug text-pretty text-muted-foreground">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
