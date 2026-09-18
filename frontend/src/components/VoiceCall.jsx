import { PhoneOff, Mic, Loader2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=400&q=85";

const LABELS = {
  listening: "Estou ouvindo. Fale com calma…",
  thinking: "Aurélio está refletindo…",
  speaking: "Aurélio está falando. Toque para interromper.",
  error: "Algo saiu do lugar.",
  idle: "Conectando…",
};

export function VoiceCall({ call }) {
  const { active, phase, level, lastTranscript, lastReply, error, hangUp, interrupt } = call;
  const scale = phase === "listening" ? 1 + Math.min(level * 6, 0.6) : phase === "speaking" ? 1.08 : 1;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          data-testid="voice-call-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-[var(--bg-main)] px-6 py-10 overflow-hidden"
        >
          <div className="grain" />
          <div className="relative z-10 text-center">
            <p className="eyebrow">Ligação com Aurélio</p>
            <p data-testid="voice-call-status" className="mt-2 text-sm text-[var(--text-secondary)]">
              {error || LABELS[phase]}
            </p>
          </div>

          <button
            data-testid="voice-call-orb"
            onClick={phase === "speaking" ? interrupt : undefined}
            className="relative z-10 grid place-items-center"
            aria-label="Aurélio"
          >
            <motion.span
              animate={{ scale: scale * 1.35, opacity: phase === "listening" ? 0.25 + level * 2 : 0.15 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className="absolute h-44 w-44 rounded-full bg-[var(--terracotta)]"
            />
            <motion.span
              animate={{ scale: phase === "speaking" ? [1.1, 1.25, 1.1] : scale * 1.15 }}
              transition={phase === "speaking" ? { repeat: Infinity, duration: 1.6 } : { type: "spring", stiffness: 140, damping: 16 }}
              className="absolute h-44 w-44 rounded-full border border-[var(--border-accent)]"
            />
            <img
              src={STATUE}
              alt="Aurélio"
              className="relative h-44 w-44 rounded-full object-cover border-2 border-[var(--border-accent)] shadow-2xl"
            />
            <span className="absolute -bottom-3 grid place-items-center h-10 w-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--terracotta)]">
              {phase === "thinking" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : phase === "error" ? (
                <AlertTriangle size={18} />
              ) : (
                <Mic size={18} className={phase === "listening" ? "" : "opacity-40"} />
              )}
            </span>
          </button>

          <div className="relative z-10 w-full max-w-md text-center space-y-3 min-h-[120px]">
            {lastTranscript && (
              <p data-testid="voice-call-transcript" className="text-sm text-[var(--text-muted)] italic">
                “{lastTranscript}”
              </p>
            )}
            {lastReply && (
              <p data-testid="voice-call-reply" className="font-serif-display text-lg leading-snug text-[var(--text-primary)] line-clamp-5">
                {lastReply}
              </p>
            )}
          </div>

          <button
            data-testid="voice-call-hangup"
            onClick={hangUp}
            className="relative z-10 flex items-center gap-2 rounded-full bg-red-500/90 text-white px-7 py-3.5 font-semibold hover:bg-red-500 transition-colors"
          >
            <PhoneOff size={18} /> Encerrar
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
