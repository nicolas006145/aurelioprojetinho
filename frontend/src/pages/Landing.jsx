import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Volume2, Loader2, ArrowRight, Anchor, Compass, Flame, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle, useTheme } from "@/components/ThemeToggle";
import { useTTS } from "@/lib/useTTS";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=900&q=85";
const STATUE2 =
  "https://images.unsplash.com/photo-1548811579-017cf2a4268b?crop=entropy&cs=srgb&fm=jpg&w=900&q=85";

const DEMO_LINE =
  "Você não precisa de mais motivação. Precisa de honestidade. Pare de fugir do que já sabe que precisa encarar, e comece hoje, ainda que com medo.";

const PILLARS = [
  { icon: Shield, title: "Responsabilidade", text: "Sua vida é sua. Aurélio não deixa você terceirizar a culpa." },
  { icon: Anchor, title: "Aceitação", text: "Aceitar o que não se controla é o começo da paz madura." },
  { icon: Flame, title: "Ação", text: "Coragem não é ausência de medo. É agir apesar dele." },
  { icon: Compass, title: "Autocontrole", text: "Disciplina é a ponte entre quem você é e quem quer ser." },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const { speak, playingId, loadingId } = useTTS();

  const start = () => navigate(user ? "/chat" : "/auth");

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] overflow-x-hidden">
      <div className="grain" />

      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <div className="font-serif-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Aurélio<span className="text-[var(--terracotta)]">.</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle theme={theme} toggle={toggle} />
          <button
            onClick={start}
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--terracotta)] transition-colors"
          >
            {user ? "Ir para o chat" : "Entrar"}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-10 md:pt-20 grid md:grid-cols-[1.2fr_1fr] gap-12 items-center">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="eyebrow mb-6"
          >
            A verdade sem filtros — sobre amadurecer
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] text-[var(--text-primary)]"
          >
            Um mentor que te diz o que você
            <span className="italic text-[var(--terracotta)]"> precisa </span>
            ouvir.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl"
          >
            Aurélio é uma inteligência inspirada no estoicismo de Marco Aurélio.
            Ele não bajula, não passa a mão na cabeça. Fala a verdade com respeito,
            para te ajudar a assumir responsabilidade, ter disciplina e crescer de
            verdade — com uma voz grave, madura e serena.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <button
              data-testid="landing-hero-cta"
              onClick={start}
              className="group flex items-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-7 py-3.5 font-semibold hover:gap-3 transition-all"
            >
              Iniciar uma conversa
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              data-testid="landing-voice-demo-button"
              onClick={() => speak("demo", DEMO_LINE, { demo: true })}
              className="flex items-center gap-2 rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] px-6 py-3.5 font-medium hover:bg-[var(--terracotta)]/10 transition-colors"
            >
              {loadingId === "demo" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Volume2 size={18} />
              )}
              {playingId === "demo" ? "Ouvindo a voz…" : "Ouvir a voz dele"}
            </button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-[var(--terracotta)]/10 blur-3xl rounded-full" />
          <img
            src={STATUE}
            alt="Busto estoico de Aurélio"
            className="relative rounded-2xl w-full object-cover aspect-[3/4] border border-[var(--border)] grayscale-[0.15]"
          />
        </motion.div>
      </section>

      {/* MANIFESTO */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 md:px-12 py-24 md:py-32 text-center">
        <span className="eyebrow">O manifesto</span>
        <blockquote className="font-serif-display text-3xl sm:text-4xl lg:text-5xl leading-[1.2] mt-6 text-[var(--text-primary)]">
          “Você não amadurece quando as coisas ficam fáceis. Amadurece quando
          para de esperar que fiquem.”
        </blockquote>
        <p className="mt-6 text-[var(--text-muted)] text-sm">— Aurélio</p>
      </section>

      {/* PILLARS */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--border-accent)] transition-colors"
            >
              <p.icon size={22} className="text-[var(--terracotta)]" />
              <h3 className="font-serif-display text-2xl font-semibold mt-4 text-[var(--text-primary)]">
                {p.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                {p.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA + IMAGE */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pb-28 grid md:grid-cols-2 gap-10 items-center">
        <img
          src={STATUE2}
          alt="Estátua clássica"
          className="rounded-2xl w-full object-cover aspect-[4/3] border border-[var(--border)] grayscale-[0.2]"
        />
        <div>
          <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)] leading-tight">
            Pronto para uma conversa honesta?
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
            Suas conversas ficam salvas na sua conta, acessíveis do computador ou
            do celular. Comece pelo que está evitando encarar hoje.
          </p>
          <button
            onClick={start}
            className="mt-7 flex items-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-7 py-3.5 font-semibold hover:gap-3 transition-all"
          >
            Falar com Aurélio <ArrowRight size={18} />
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--border)] py-8 text-center text-xs text-[var(--text-muted)]">
        Aurélio não substitui acompanhamento profissional. Em crise, ligue para o
        CVV — 188.
      </footer>
    </div>
  );
}
