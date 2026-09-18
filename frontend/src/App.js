import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Chat from "@/pages/Chat";

function Loader({ label = "Aurélio." }) {
  return (
    <div className="min-h-screen grid place-items-center bg-[var(--bg-main)]">
      <div className="font-serif-display text-3xl text-[var(--terracotta)] animate-pulse">{label}</div>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (user) return <Navigate to="/chat" replace />;
  return <Auth />;
}

// Handles {redirect}#session_id=... after Google login (Emergent Auth).
function AuthCallback() {
  const { exchangeSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const processed = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");
    window.history.replaceState(null, "", location.pathname);
    exchangeSession(sessionId)
      .then(() => navigate("/chat", { replace: true }))
      .catch(() => setError("Não foi possível concluir o login com Google."));
  }, [exchangeSession, navigate, location]);

  if (error)
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--bg-main)] px-6 text-center">
        <div>
          <p data-testid="auth-callback-error" className="text-red-400">{error}</p>
          <button
            onClick={() => navigate("/auth", { replace: true })}
            className="mt-4 text-[var(--terracotta)] underline"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  return <Loader label="Entrando…" />;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<AuthRoute />} />
      <Route
        path="/chat"
        element={
          <Protected>
            <Chat />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      <Toaster position="top-center" />
    </AuthProvider>
  );
}

export default App;
