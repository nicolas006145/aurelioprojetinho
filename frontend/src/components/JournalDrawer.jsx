import { useEffect, useState } from "react";
import { Quote, PenLine, Trash2, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

export function JournalDrawer({ open, onClose, refreshKey }) {
  const [entries, setEntries] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    if (!open) return;
    api.get("/journal").then((r) => setEntries(r.data));
  }, [open, refreshKey]);

  const addNote = async () => {
    const content = note.trim();
    if (!content) return;
    setSaving(true);
    try {
      const { data } = await api.post("/journal", { type: "note", content });
      setEntries((prev) => [data, ...prev]);
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await api.delete(`/journal/${id}`);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const visible = tab === "all" ? entries : entries.filter((e) => e.type === tab);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
          <motion.aside
            data-testid="journal-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--border)]">
              <div>
                <div className="font-serif-display text-2xl font-semibold text-[var(--text-primary)]">Diário de reflexões</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Frases de Aurélio e suas anotações
                </div>
              </div>
              <button data-testid="journal-close" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 pt-4">
              <textarea
                data-testid="journal-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="O que ficou em você hoje? Escreva com honestidade…"
                className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-accent)] transition-colors"
              />
              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {[["all", "Tudo"], ["quote", "Frases"], ["note", "Anotações"]].map(([id, label]) => (
                    <button
                      key={id}
                      data-testid={`journal-tab-${id}`}
                      onClick={() => setTab(id)}
                      className={`rounded-full px-3 py-1 text-[11px] border transition-colors ${
                        tab === id
                          ? "border-[var(--border-accent)] text-[var(--terracotta)]"
                          : "border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  data-testid="journal-add-note"
                  onClick={addNote}
                  disabled={!note.trim() || saving}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} />} Anotar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {visible.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  Nada guardado ainda. Quando uma frase de Aurélio te atingir, toque em “Guardar no diário”.
                </p>
              )}
              {visible.map((e) => (
                <div
                  key={e.id}
                  data-testid="journal-entry"
                  className={`group relative rounded-2xl border px-4 py-3.5 ${
                    e.type === "quote"
                      ? "border-[var(--border-accent)]/40 bg-[var(--aurelio-bubble)]"
                      : "border-[var(--border)] bg-[var(--bg-card)]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {e.type === "quote" ? <Quote size={11} className="text-[var(--terracotta)]" /> : <PenLine size={11} />}
                    {e.type === "quote" ? "Aurélio disse" : "Minha anotação"}
                    <span className="ml-auto font-mono-jb normal-case tracking-normal">
                      {new Date(e.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      e.type === "quote" ? "font-serif-display text-[1.05rem] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {e.content}
                  </p>
                  <button
                    data-testid="journal-entry-delete"
                    onClick={() => remove(e.id)}
                    className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-opacity"
                    aria-label="Apagar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
