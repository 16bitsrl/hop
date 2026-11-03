import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ApiError } from "./lib/api";
import { createAppRouter } from "./router";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});
const router = createAppRouter(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={400}>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// The worker only precaches the app shell; it never touches /api, /media, /healthz or /metrics.
// A tab left open looks for a new release whenever it comes back into view; when one is found the
// page reloads by itself (registerType "autoUpdate").
if ("serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration?.update();
      });
    },
  });
}
