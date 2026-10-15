import { useEffect, useState } from "react";
import { signOut, type SignOutOptions } from "@/lib/api";

export type AuthUser = {
  id?: string;
  name?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string | null;
  full_name?: string | null;
  github_username?: string | null;
  github_connected?: boolean;
  /** From GET /auth/me: false for GitHub sign-in accounts, absent if unknown. */
  has_password?: boolean | null;
  created_at?: string;
  username?: string;
  login?: string;
  bio?: string | null;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "user") {
        try {
          setUser(e.newValue ? JSON.parse(e.newValue) : null);
        } catch {
          setUser(null);
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function login(u: AuthUser, token?: string, refreshToken?: string) {
    setUser(u);
    try {
      localStorage.setItem("user", JSON.stringify(u));
      if (token) localStorage.setItem("token", token);
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
    } catch {}
  }

  /**
   * Sign out: revoke the session server-side, clear every local cache, and
   * reload into `redirectTo`. Delegates to signOut() in lib/api so there is one
   * implementation. This used to only delete the tokens from localStorage,
   * which left the session valid on the server until it expired.
   */
  function logout(options?: SignOutOptions) {
    setUser(null);
    return signOut(options);
  }

  const isAuthenticated = !!localStorage.getItem("token") || !!user;

  return { user, isAuthenticated, login, logout } as const;
}
