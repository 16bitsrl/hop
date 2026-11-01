import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon, CloseIcon } from "./icons";

type ToastItem = { id: number; message: string; tone: "success" | "error" };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const Ctx = createContext<ToastApi | null>(null);

/** Wrap the app once. Then `const toast = useToast(); toast.success("Saved")`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastItem["tone"]) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur.filter((i) => i.message !== message), { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push(m, "success"), error: (m) => push(m, "error") }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {items.map((i) => (
          <div
            key={i.id}
            role={i.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 text-sm shadow-lg",
              "animate-[hop-pop_160ms_ease-out]",
              i.tone === "error" ? "border-danger/40" : "border-line",
            )}
          >
            <span className={cn("shrink-0", i.tone === "error" ? "text-danger" : "text-success")}>
              {i.tone === "error" ? <CloseIcon /> : <CheckIcon />}
            </span>
            <span>{i.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast needs <ToastProvider>");
  return ctx;
}
