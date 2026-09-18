import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=1000&q=85";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register, loginWithGoogle, showGoogleOneTap } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    showGoogleOneTap();
  }, [showGoogleOneTap]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      navigate("/chat");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle(email || undefined);
      navigate("/chat");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-[var(--bg-main)]">
      <div className="hidden md:block relative">
        <img src={STATUE} alt="Aurélio" className="h-full w-full object-cover grayscale-[0.2]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-main)] via-transparent to-transparent" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="eyebrow mb-3">Aurélio</p>
          <p className="font-serif-display text-3xl leading-tight text-[#f2ede4]">
            “A disciplina de hoje é a liberdade de amanhã.”
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12 relative">
        <div className="grain" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm relative z-10"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--terracotta)] mb-8 transition-colors"
          >
            <ArrowLeft size={15} /> Voltar
          </Link>

          <h1 className="font-serif-display text-4xl font-bold text-[var(--text-primary)]">
            {isLogin ? "Bem-vindo de volta" : "Comece sua jornada"}
          </h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">
            {isLogin
              ? "Entre para retomar suas conversas com Aurélio."
              : "Crie sua conta. Suas reflexões ficam salvas com segurança."}
          </p>

          <button
            data-testid="auth-google-button"
            type="button"
            onClick={submitGoogle}
            disabled={loading}
            className="mt-8 w-full flex items-center justify-center gap-3 rounded-full border border-[var(--border)] bg-[var(--bg-card)] py-3.5 font-medium text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : (
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.8c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.1-10.1 7.1-17.2z" />
              <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.8 24c0-1.6.3-3.2.8-4.6l-8-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8-6.2z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.2 0-11.5-4.1-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z" />
            </svg>
            )}
            Continuar com Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">ou com e-mail</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  Nome
                </label>
                <input
                  data-testid="auth-register-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)] transition-colors"
                  placeholder="Como devo te chamar?"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                E-mail
              </label>
              <input
                data-testid={isLogin ? "auth-login-email-input" : "auth-register-email-input"}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)] transition-colors"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Senha
              </label>
              <input
                data-testid={isLogin ? "auth-login-password-input" : "auth-register-password-input"}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1.5 w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)] transition-colors"
                placeholder="Mínimo de 6 caracteres"
              />
            </div>

            {error && (
              <p data-testid="auth-error" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              data-testid={isLogin ? "auth-login-submit-button" : "auth-register-submit-button"}
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] py-3.5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading && <Loader2 size={17} className="animate-spin" />}
              {isLogin ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <p className="mt-6 text-sm text-[var(--text-secondary)] text-center">
            {isLogin ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
            <button
              data-testid="auth-toggle-mode"
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError("");
              }}
              className="text-[var(--terracotta)] font-medium hover:underline"
            >
              {isLogin ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
