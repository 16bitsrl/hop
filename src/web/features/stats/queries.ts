import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "../../lib/api";
import type { Dashboard, Summary } from "./types";

export type StatsParams = { from: number | null; to: number; tz: string; bots: boolean };

const common = (p: StatsParams) => ({ from: p.from, to: p.to, tz: p.tz, bots: p.bots ? 1 : undefined });

/** One link (`linkId`) or the whole installation. `params` null = not ready (invalid range). */
export function useSummary(linkId: string | null, params: StatsParams | null) {
  return useQuery({
    queryKey: ["stats", "summary", linkId, params],
    queryFn: () => api<Summary>(`/api/stats/summary${qs({ linkId, ...common(params!) })}`),
    enabled: !!params,
    placeholderData: keepPreviousData,
  });
}

export function useDashboard(params: StatsParams | null) {
  return useQuery({
    queryKey: ["stats", "dashboard", params],
    queryFn: () => api<Dashboard>(`/api/stats/dashboard${qs(common(params!))}`),
    enabled: !!params,
    placeholderData: keepPreviousData,
  });
}

/** Public statistics of a link whose owner turned them on. 404 when they are off. */
export function usePublicSummary(linkId: string, params: StatsParams | null) {
  return useQuery({
    queryKey: ["stats", "public", linkId, params],
    queryFn: () => api<Summary>(`/api/public/stats/${encodeURIComponent(linkId)}${qs(common(params!))}`),
    enabled: !!params,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function exportUrl(kind: "clicks" | "summary", linkId: string | null, params: StatsParams) {
  return `/api/stats/export.csv${qs({ kind, linkId, ...common(params) })}`;
}
