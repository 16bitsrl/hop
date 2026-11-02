import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "../../components/legacy";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";

export type LinkRule = {
  devices?: ("ios" | "android" | "desktop" | "mobile" | "tablet")[];
  countries?: string[];
  languages?: string[];
  url: string;
  appUrl?: string;
};
export type LinkVariant = { url: string; weight: number };
export type TagRef = { id: string; name: string; color: string | null };
export type LinkState = "active" | "disabled" | "expired" | "broken" | "protected";

export type Link = {
  id: string;
  domainId: string;
  host: string;
  shortUrl: string;
  slug: string;
  url: string;
  title: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  folderId: string | null;
  tags: TagRef[];
  redirectType: 301 | 302 | 307 | 308;
  forwardQuery: boolean;
  enabled: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  maxClicks: number | null;
  fallbackUrl: string | null;
  rules: LinkRule[];
  variants: LinkVariant[];
  appUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  publicStats: boolean;
  clickCount: number;
  lastClickedAt: string | null;
  healthStatus: "unknown" | "ok" | "broken";
  healthCode: number | null;
  healthCheckedAt: string | null;
  states: LinkState[];
  createdAt: string;
  updatedAt: string;
  canModify: boolean;
};

export type Domain = {
  id: string;
  host: string;
  isDefault: boolean;
  rootUrl: string | null;
  notFoundUrl: string | null;
  linkCount: number;
};
export type Tag = { id: string; name: string; color: string | null; linkCount: number };
export type Folder = { id: string; name: string; parentId: string | null; createdBy: string | null; linkCount: number; canModify: boolean };

export const domainsQuery = queryOptions({
  queryKey: ["domains"],
  queryFn: async () => (await api<{ domains: Domain[] }>("/api/domains")).domains,
  staleTime: 0,
});
export const tagsQuery = queryOptions({
  queryKey: ["tags"],
  queryFn: async () => (await api<{ tags: Tag[] }>("/api/tags")).tags,
  staleTime: 0,
});
export const foldersQuery = queryOptions({
  queryKey: ["folders"],
  queryFn: async () => (await api<{ folders: Folder[] }>("/api/folders")).folders,
  staleTime: 0,
});
export const directoryQuery = queryOptions({
  queryKey: ["users", "directory"],
  queryFn: async () => (await api<{ users: { id: string; name: string }[] }>("/api/users/directory")).users,
});
export const linkQuery = (id: string) =>
  queryOptions({
    queryKey: ["link", id],
    queryFn: async () => (await api<{ link: Link }>(`/api/links/${id}`)).link,
    staleTime: 0,
  });

/** Folders as a flat list in tree order, with a depth for indentation. */
export function folderTree(folders: Folder[]): (Folder & { depth: number })[] {
  const out: (Folder & { depth: number })[] = [];
  const ids = new Set(folders.map((f) => f.id));
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => (x.parentId && ids.has(x.parentId) ? x.parentId : null) === parent)) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Saves part of a link, shows the result and refreshes the caches. */
export function usePatchLink(id: string, opts: { silent?: boolean } = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ link: Link }>(`/api/links/${id}`, { method: "PATCH", body }),
    onSuccess: ({ link }) => {
      queryClient.setQueryData(["link", id], link);
      void queryClient.invalidateQueries({ queryKey: ["links"] });
      void queryClient.invalidateQueries({ queryKey: ["link-history", id] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      if (!opts.silent) toast.success(t("saved"));
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
}
