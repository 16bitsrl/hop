import { toast as sonner } from "sonner";

/**
 * App toasts. The same message is shown once (a repeat replaces it) and errors stay longer.
 *   toast.success(t("saved")); toast.error(errorMessage(t, e));
 */
export const toast = {
  success: (message: string) => sonner.success(message, { id: message }),
  error: (message: string) => sonner.error(message, { id: message, duration: 6000 }),
};
