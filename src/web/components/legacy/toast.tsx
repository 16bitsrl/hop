import type { ReactNode } from "react";
import { toast } from "../../lib/toast";

/** Transitional: toasts now go through Sonner (lib/toast). Removed once every page imports it directly. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useToast() {
  return toast;
}
