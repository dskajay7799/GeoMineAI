import { createContext, useContext, useEffect, useState, useCallback } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? "https://geomine-ai-backend.onrender.com"
    : "http://127.0.0.1:8000");

if (!API_BASE_URL) {
  console.error("VITE_API_URL is not configured.");
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("geomine_token"));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback(
    (path, options = {}) => {
      const headers = { ...(options.headers || {}) };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    },
    [token]
  );

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Session expired");
        return response.json();
      })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("geomine_token");
        setLoading(false);
      });
  }, [token]);

  const login = async (username, password) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Login failed");
    }

    localStorage.setItem("geomine_token", data.access_token);
    setToken(data.access_token);
    setUser(data.user);

    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("geomine_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}