import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function loadGoogleIdentity() {
  if (window.google?.accounts?.id && window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-google-identity]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Não foi possível carregar o login do Google."));
    document.head.appendChild(script);
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("aurelio_token");
    if (!token) {
      setUser(false);
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("aurelio_token");
        setUser(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = (data) => {
    localStorage.setItem("aurelio_token", data.token);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data);
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    persist(data);
  };

  const loginWithGoogle = useCallback(async (hint) => {
    if (GOOGLE_CLIENT_ID) {
      const google = await loadGoogleIdentity();
      return new Promise((resolve, reject) => {
        const credentialClient = google.accounts.oauth2?.initCodeClient
          ? null
          : null;
        let cancelled = true;

        const sendCredential = async (credential) => {
          try {
            const { data } = await api.post(
              "/auth/google",
              { credential },
              { withCredentials: true },
            );
            persist(data);
            cancelled = false;
            resolve(data.user);
          } catch (err) {
            reject(err);
          }
        };

        const sendAccessToken = async (accessToken) => {
          try {
            const { data } = await api.post(
              "/auth/google",
              { access_token: accessToken },
              { withCredentials: true },
            );
            persist(data);
            cancelled = false;
            resolve(data.user);
          } catch (err) {
            reject(err);
          }
        };

        try {
          google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            ux_mode: "popup",
            auto_select: false,
            cancel_on_tap_outside: false,
            callback: (response) => {
              if (response?.credential) sendCredential(response.credential);
              else reject(new Error("Login com Google falhou."));
            },
            native_callback: (response) => {
              if (response?.credential) sendCredential(response.credential);
            },
          });
          const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: "openid email profile",
            prompt: hint ? "consent" : "select_account",
            login_hint: hint || "",
            callback: (tokenResponse) => {
              if (tokenResponse?.error || !tokenResponse?.access_token) {
                reject(new Error("Login com Google cancelado."));
                return;
              }
              sendAccessToken(tokenResponse.access_token);
            },
            error_callback: () => reject(new Error("Login com Google cancelado.")),
          });
          client.requestAccessToken();
        } catch (e) {
          reject(e);
        }
      });
    }

    const redirectUrl = window.location.origin + "/chat";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }, []);

  const showGoogleOneTap = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    try {
      const google = await loadGoogleIdentity();
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: "popup",
        auto_select: true,
        cancel_on_tap_outside: true,
        callback: (response) => {
          if (response?.credential) {
            api
              .post("/auth/google", { credential: response.credential }, { withCredentials: true })
              .then((res) => persist(res.data))
              .catch(() => {});
          }
        },
      });
      google.accounts.id.prompt(() => {});
    } catch {
      initializedRef.current = false;
    }
  }, []);

  const exchangeSession = async (sessionId) => {
    const { data } = await api.post("/auth/session", { session_id: sessionId }, { withCredentials: true });
    persist(data);
    return data.user;
  };

  const logout = () => {
    api.post("/auth/logout", {}, { withCredentials: true }).catch(() => {});
    localStorage.removeItem("aurelio_token");
    setUser(false);
    if (window.google?.accounts?.id?.cancel) {
      try { window.google.accounts.id.cancel(); } catch {}
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithGoogle, exchangeSession, logout, showGoogleOneTap }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
