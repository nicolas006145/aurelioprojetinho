import { Sun, Volume2, Square, Loader2, MessageSquare, BookMarked, X, Check } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function DailyReflection({ reflection, open, onClose, onSpeak, isPlaying, isLoading, onDiscuss, onSaveQuote }) {
  const [saved, setSaved] = useState(false);
  if (!reflection) return null;

  const save = async () => {
    await onSaveQuote(reflection.text);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--bg-overlay)] backdrop-blur-md px-4"
          onClick={onClose}
          data-testid="daily-reflection-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] p-7 md:p-9 shadow-2xl overflow-hidden"
          >
            <div className="grain" />
            <button
              data-testid="daily-reflection-close"
              onClick={onClose}
              className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] z-10"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-[var(--terracotta)]">
                <Sun size={15} />
                <span className="eyebrow">Reflexão do dia</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)] capitalize">
                {new Date(reflection.date + "T12:00:00").toLocaleDateString("pt-BR", {
                  weekday: "long", day: "numeric", month: "long",
                })}
                {" · "}
                {reflection.theme}
              </p>
              <p
                data-testid="daily-reflection-text"
                className="mt-5 font-serif-display text-2xl md:text-[1.7rem] leading-snug text-[var(--text-primary)] whitespace-pre-wrap"
              >
                {reflection.text}
              </p>
              <p className="mt-4 text-right text-sm text-[var(--text-muted)]">— Aurélio</p>

              <div className="mt-7 flex flex-wrap gap-2.5">
                <button
                  data-testid="daily-reflection-listen"
                  onClick={() => onSpeak("reflection", reflection.text, { url: "/reflection/today/audio" })}
                  className="flex items-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-5 py-2.5 text-sm font-semibold hover:opacity-90"
                >
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : isPlaying ? <Square size={14} /> : <Volume2 size={15} />}
                  {isPlaying ? "Parar" : "Ouvir"}
                </button>
                <button
                  data-testid="daily-reflection-discuss"
                  onClick={onDiscuss}
                  className="flex items-center gap-2 rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--terracotta)]/10"
                >
                  <MessageSquare size={15} /> Conversar sobre isso
                </button>
                <button
                  data-testid="daily-reflection-save"
                  onClick={save}
                  className="flex items-center gap-2 rounded-full border border-[var(--border)] text-[var(--text-secondary)] px-5 py-2.5 text-sm hover:text-[var(--text-primary)] hover:border-[var(--border-accent)]"
                >
                  {saved ? <Check size={15} /> : <BookMarked size={15} />}
                  {saved ? "Guardado" : "Guardar no diário"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
