import { useEffect, useState } from "react";

type User = {
  name: string;
  email?: string;
  avatar?: string;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? (JSON.parse(raw) as User) : null;
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

  function login(u: User, token?: string, refreshToken?: string) {
    setUser(u);
    try {
      localStorage.setItem("user", JSON.stringify(u));
      if (token) localStorage.setItem("token", token);
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
    } catch {}
  }

  function logout() {
    setUser(null);
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
    } catch {}
  }

  const isAuthenticated = !!localStorage.getItem("token") || !!user;

  return { user, isAuthenticated, login, logout } as const;
}
