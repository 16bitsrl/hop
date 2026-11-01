import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import { ToastProvider } from "./components/ui/toast";
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
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// The worker only precaches the app shell; it never touches /api, /media, /healthz or /metrics.
if ("serviceWorker" in navigator) registerSW({ immediate: true });
