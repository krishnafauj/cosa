"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, onForcedLogout, tokens } from "./api";
import type { Me } from "./types";

interface LoginResponse {
  access: string;
  refresh: string;
  user: Me;
}

interface AuthState {
  user: Me | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  devLogin: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const reload = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<Me>("/api/auth/me/"));
    } catch {
      tokens.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return onForcedLogout(() => {
      setUser(null);
      queryClient.clear();
    });
  }, [reload, queryClient]);

  const finishLogin = useCallback((data: LoginResponse) => {
    tokens.set(data.access, data.refresh);
    setUser(data.user);
  }, []);

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      finishLogin(await api<LoginResponse>("/api/auth/google/", { method: "POST", body: { id_token: idToken }, auth: false }));
    },
    [finishLogin],
  );

  const devLogin = useCallback(
    async (email: string) => {
      finishLogin(await api<LoginResponse>("/api/auth/dev-login/", { method: "POST", body: { email }, auth: false }));
    },
    [finishLogin],
  );

  const logout = useCallback(async () => {
    const refresh = tokens.refresh;
    try {
      if (refresh) await api("/api/auth/logout/", { method: "POST", body: { refresh } });
    } catch {
      /* token may already be invalid; log out locally anyway */
    }
    tokens.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, loginWithGoogle, devLogin, logout, reload }),
    [user, loading, loginWithGoogle, devLogin, logout, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
