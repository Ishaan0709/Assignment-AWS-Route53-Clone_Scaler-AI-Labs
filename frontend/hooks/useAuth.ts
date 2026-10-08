"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { api, isApiError } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import type { LoginRequest, Session, User } from "@/types/api";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** Non-401 failure (network, 5xx) while restoring the session. */
  error: Error | null;
  refetch: () => void;
}

async function fetchSession(): Promise<Session | null> {
  try {
    return await api.get<Session>("/api/auth/me", undefined, { redirectOn401: false });
  } catch (error) {
    if (isApiError(error) && error.isUnauthorized) return null;
    throw error;
  }
}

/** Current session from `/api/auth/me`; `null` data means "not signed in". */
export function useAuth(): AuthState {
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    retry: false,
  });

  let status: AuthStatus = "loading";
  if (query.isError) status = "error";
  else if (query.isSuccess) status = query.data ? "authenticated" : "unauthenticated";

  return {
    status,
    session: query.data ?? null,
    user: query.data?.user ?? null,
    error: query.error ?? null,
    refetch: () => void query.refetch(),
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginRequest) =>
      api.post<Session>("/api/auth/login", payload, { redirectOn401: false }),
    onSuccess: (session) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const notify = useNotifications();

  const mutation = useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout", undefined, { redirectOn401: false }),
  });

  const logout = useCallback(async () => {
    try {
      await mutation.mutateAsync();
    } catch {
      // The cookie is cleared server-side on a best-effort basis; still sign out locally.
    }
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    notify.info("Signed out", "You have been signed out of the AWS Management Console.");
    router.replace(ROUTES.login);
  }, [mutation, notify, queryClient, router]);

  return { logout, isPending: mutation.isPending };
}
