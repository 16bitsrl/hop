import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Role = "admin" | "member" | "viewer";
export type Me = { id: string; name: string; email: string; role: Role; locale: string | null; image: string | null; defaultDomainId: string | null };

export type AppConfig = {
  setupRequired: boolean;
  setupTokenRequired?: boolean;
  passwordLogin: boolean;
  oidc: { label: string; provider: "google" | "microsoft" | "other" } | null;
  mailConfigured: boolean;
};

export const appConfigQuery = queryOptions({
  queryKey: ["app-config"],
  queryFn: () => api<AppConfig>("/api/app-config"),
  staleTime: 60_000,
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await api<{ user: Me | null }>("/api/me")).user,
  staleTime: Infinity,
});

/** The signed-in user (null while signed out). Only use inside the signed-in shell. */
export function useMe(): Me {
  const { data } = useQuery(meQuery);
  if (!data) throw new Error("useMe outside of a signed-in page");
  return data;
}

export const isAdmin = (me: Me) => me.role === "admin";
/** Same rule as the server's canModify. */
export const canModify = (me: Me, ownerId: string | null | undefined) =>
  me.role === "admin" || (me.role === "member" && !!ownerId && ownerId === me.id);
export const canCreate = (me: Me) => me.role !== "viewer";
