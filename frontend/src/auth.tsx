import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getBootstrapStatus,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  setAuthToken,
  bootstrapAdmin as apiBootstrapAdmin,
} from "./api";
import type { AppUser } from "./types";

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  needsBootstrap: boolean;
  refreshMe: () => Promise<void>;
  refreshBootstrapStatus: () => Promise<void>;
  login: (body: { username: string; password: string }) => Promise<void>;
  bootstrapAdmin: (body: {
    username: string;
    display_name?: string | null;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  async function refreshBootstrapStatus() {
    const bootstrap = await getBootstrapStatus();
    setNeedsBootstrap(bootstrap.needs_bootstrap);
    return bootstrap.needs_bootstrap;
  }

  async function refreshMe() {
    try {
      const me = await getMe();
      setUser(me);
      setNeedsBootstrap(false);
    } catch (error) {
      setUser(null);
      if (error instanceof ApiError && error.status === 401) {
        setAuthToken(null);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        const bootstrap = await getBootstrapStatus();
        if (cancelled) return;
        setNeedsBootstrap(bootstrap.needs_bootstrap);
        if (!bootstrap.needs_bootstrap) {
          await refreshMe();
          if (cancelled) return;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleInvalid() {
      setUser(null);
    }
    window.addEventListener("auth-invalid", handleInvalid);
    return () => window.removeEventListener("auth-invalid", handleInvalid);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      needsBootstrap,
      refreshMe,
      async refreshBootstrapStatus() {
        await refreshBootstrapStatus();
      },
      async login(body) {
        const res = await apiLogin(body);
        setAuthToken(res.token);
        setUser(res.user);
        setNeedsBootstrap(false);
      },
      async bootstrapAdmin(body) {
        const res = await apiBootstrapAdmin(body);
        setAuthToken(res.token);
        setUser(res.user);
        setNeedsBootstrap(false);
      },
      async logout() {
        try {
          await apiLogout();
        } catch {
          // swallow logout network issues; local session should still clear
        }
        setAuthToken(null);
        setUser(null);
      },
    }),
    [user, loading, needsBootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
