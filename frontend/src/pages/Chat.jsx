import { useEffect, useRef, useState, useCallback } from "react";
import { Menu, SendHorizontal, Sparkles, Phone, Sun } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { startChatTurn, openResumeStream, consumeSSE } from "@/lib/sse";
import { THEMES } from "@/lib/themes";
import { Sidebar } from "@/components/Sidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { ThemeToggle, useTheme } from "@/components/ThemeToggle";
import { DailyReflection } from "@/components/DailyReflection";
import { JournalDrawer } from "@/components/JournalDrawer";
import { VoiceCall } from "@/components/VoiceCall";
import { useVoiceCall } from "@/lib/useVoiceCall";
import { useTTS } from "@/lib/useTTS";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=300&q=85";

const SUGGESTIONS = [
  "O que estou evitando encarar hoje?",
  "Como parar de me vitimizar?",
  "Por que me falta disciplina?",
  "Como ter mais coragem para agir?",
];

const draftKey = (id) => `aurelio_draft:${id || "new"}`;
const activeConversationKey = "aurelio_active_conversation";
const pendingKey = "aurelio_pending_messages";

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(pendingKey) || "{}");
  } catch {
    return {};
  }
}

function rememberPending(messageId, conversationId) {
  if (!messageId) return;
  const pending = readPending();
  pending[messageId] = conversationId;
  localStorage.setItem(pendingKey, JSON.stringify(pending));
}

function forgetPending(messageId) {
  const pending = readPending();
  delete pending[messageId];
  localStorage.setItem(pendingKey, JSON.stringify(pending));
}

export default function Chat() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { speak, playingId, loadingId } = useTTS();

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(() => localStorage.getItem(draftKey(null)) || "");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalKey, setJournalKey] = useState(0);
  const [reflection, setReflection] = useState(null);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [pendingByConversation, setPendingByConversation] = useState({});
  const [newByConversation, setNewByConversation] = useState({});
  const notifiedRef = useRef(new Set());

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const feedRef = useRef(null);
  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const loadConversations = useCallback(async () => {
    const { data } = await api.get("/conversations");
    setConversations(data);
    return data;
  }, []);

  const pollPending = useCallback(async () => {
    try {
      const { data } = await api.get("/conversations/pending");
      const next = {};
      data.forEach((m) => { next[m.conversation_id] = true; });
      setPendingByConversation((prev) => {
        Object.keys(prev).forEach((cid) => {
          if (!next[cid] && prev[cid]) {
            if (cid !== activeIdRef.current && !notifiedRef.current.has(cid)) {
              notifiedRef.current.add(cid);
              const title = conversationsRef.current?.find((c) => c.id === cid)?.title || "Sua conversa";
              toast.success("Aurélio respondeu", {
                description: `${title} — clique para ver.`,
                action: {
                  label: "Abrir",
                  onClick: () => selectConversation(cid),
                },
              });
            }
            setNewByConversation((n) => ({ ...n, [cid]: true }));
          }
        });
        return next;
      });
      const active = activeIdRef.current;
      if (active) {
        for (const m of data) {
          if (m.conversation_id === active) {
            setSending(true);
            openResumeStream(m.id)
              .then((res) => attachStream(m.id, res, active))
              .finally(() => setSending(false));
          }
        }
      } else {
        const pending = readPending();
        for (const m of data) {
          if (!pending[m.id]) continue;
          setSending(true);
          openResumeStream(m.id)
            .then((res) => {
              consumeSSE(res, () => {}).catch(() => {});
            })
            .finally(() => setSending(false));
        }
      }
    } catch {}
  }, []);

  const conversationsRef = useRef([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  useEffect(() => {
    let mounted = true;
    loadConversations().then(() => {
      if (!mounted) return;
      pollPending();
    });
    api.get("/reflection/today").then(({ data }) => {
      if (!mounted) return;
      setReflection(data);
      if (localStorage.getItem("aurelio_reflection_seen") !== data.date) {
        setReflectionOpen(true);
        localStorage.setItem("aurelio_reflection_seen", data.date);
      }
    }).catch(() => {});
    const interval = setInterval(pollPending, 8000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        pollPending();
        loadConversations();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadConversations, pollPending]);

  useEffect(() => {
    if (activeId) localStorage.setItem(activeConversationKey, activeId);
    else localStorage.removeItem(activeConversationKey);
  }, [activeId]);

  useEffect(() => {
    scrollBottom();
  }, [messages, scrollBottom]);

  useEffect(() => {
    if (input) localStorage.setItem(draftKey(activeId), input);
    else localStorage.removeItem(draftKey(activeId));
  }, [input, activeId]);

  const patchMessage = (id, patch) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

  const attachStream = async (assistantId, res, convId) => {
    let currentId = assistantId;
    let newTitle = null;
    try {
      await consumeSSE(res, (evt) => {
        if (evt.start) {
          newTitle = evt.title;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === currentId) return { ...m, id: evt.message_id };
              if (evt.user_message_id && m.id === `u-${currentId}`) return { ...m, id: evt.user_message_id };
              return m;
            })
          );
          currentId = evt.message_id;
        } else if (evt.delta) {
          patchMessage(currentId, (m) => ({ content: m.content + evt.delta }));
          scrollBottom();
        } else if (evt.error) {
          patchMessage(currentId, (m) => ({
            content: m.content || "Desculpe, tive um problema para responder agora. Tente novamente.",
            status: "error",
            streaming: false,
          }));
        } else if (evt.done) {
          patchMessage(currentId, { streaming: false, status: "done" });
          forgetPending(currentId);
        }
      });
      if (newTitle) setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: newTitle } : c)));
      setTimeout(loadConversations, 4000);
    } catch (e) {
      patchMessage(currentId, (m) => (m.streaming ? { content: m.content || "Falha de conexão. A resposta continua sendo gerada — reabra a conversa em instantes.", streaming: false } : {}));
    }
  };

  const selectConversation = async (id) => {
    setActiveId(id);
    setSidebarOpen(false);
    setInput(localStorage.getItem(draftKey(id)) || "");
    setNewByConversation((n) => {
      const copy = { ...n };
      delete copy[id];
      return copy;
    });
    const { data } = await api.get(`/conversations/${id}`);
    const pending = data.messages.filter((m) => m.status === "pending");
    setMessages(data.messages.map((m) => (m.status === "pending" ? { ...m, streaming: true } : m)));
    for (const p of pending) {
      rememberPending(p.id, id);
      setSending(true);
      openResumeStream(p.id).then((res) => attachStream(p.id, res, id)).finally(() => setSending(false));
    }
  };

  const restoredConversationRef = useRef(false);
  useEffect(() => {
    if (restoredConversationRef.current || activeId || conversations.length === 0) return;
    const lastId = localStorage.getItem(activeConversationKey);
    if (!lastId || !conversations.some((c) => c.id === lastId)) return;
    restoredConversationRef.current = true;
    selectConversation(lastId);
  }, [activeId, conversations]);

  const newConversation = () => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
    setInput(localStorage.getItem(draftKey(null)) || "");
  };

  const deleteConversation = async (id) => {
    await api.delete(`/conversations/${id}`);
    if (activeIdRef.current === id) newConversation();
    loadConversations();
  };

  const ensureConversation = useCallback(async () => {
    if (activeIdRef.current) return activeIdRef.current;
    const { data } = await api.post("/conversations");
    activeIdRef.current = data.id;
    setActiveId(data.id);
    setConversations((prev) => [data, ...prev]);
    return data.id;
  }, []);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    localStorage.removeItem(draftKey(activeId));
    setSending(true);
    try {
      const convId = await ensureConversation();
      const tempId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: `u-${tempId}`, role: "user", content },
        { id: tempId, role: "assistant", content: "", streaming: true, status: "pending" },
      ]);
      const started = await startChatTurn(convId, content);
      rememberPending(started.message_id, convId);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === tempId) return { ...m, id: started.message_id };
          if (m.id === `u-${tempId}`) return { ...m, id: started.user_message_id };
          return m;
        })
      );
      if (started.title) setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: started.title } : c)));
      const res = await openResumeStream(started.message_id);
      await attachStream(started.message_id, res, convId);
    } catch (e) {
      toast.error("Não foi possível enviar. Verifique sua conexão.");
    } finally {
      setSending(false);
    }
  };

  const changeTheme = async (t) => {
    await api.patch(`/conversations/${activeId}`, { theme: t });
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, theme: t } : c)));
  };

  const saveQuote = async (text, message) => {
    await api.post("/journal", {
      type: "quote", content: text, message_id: message?.id, conversation_id: activeIdRef.current,
    });
    setJournalKey((k) => k + 1);
    toast.success("Guardado no seu diário.");
  };

  const discussReflection = () => {
    setReflectionOpen(false);
    newConversation();
    send(`Sua reflexão de hoje foi: "${reflection.text}"\n\nQuero conversar sobre isso com honestidade.`);
  };

  const call = useVoiceCall({
    getConversationId: ensureConversation,
    onTurn: (out, convId) => {
      if (activeIdRef.current !== convId) return;
      setMessages((prev) => [
        ...prev,
        { id: out.user_message_id, role: "user", content: out.transcript },
        { id: out.message_id, role: "assistant", content: out.reply, status: "done" },
      ]);
      if (out.title) setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: out.title } : c)));
      setTimeout(loadConversations, 4000);
    },
  });

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const activeConvo = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-screen bg-[var(--bg-main)] overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        onOpenJournal={() => { setJournalOpen(true); setSidebarOpen(false); }}
        user={user}
        onLogout={logout}
        pendingByConversation={pendingByConversation}
        newByConversation={newByConversation}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-2 px-4 md:px-6 py-3.5 border-b border-[var(--border)]">
          <button data-testid="chat-sidebar-toggle" className="md:hidden text-[var(--text-secondary)]" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="font-serif-display text-lg font-semibold text-[var(--text-primary)] md:hidden">Aurélio</div>
          <div className="hidden md:block eyebrow truncate">Conversa honesta sobre amadurecimento</div>
          <div className="flex items-center gap-2">
            {activeConvo && (
              <select
                data-testid="conversation-theme-select"
                value={activeConvo.theme || "outros"}
                onChange={(e) => changeTheme(e.target.value)}
                className="hidden sm:block h-9 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs text-[var(--text-secondary)] outline-none hover:border-[var(--border-accent)]"
                aria-label="Tema da conversa"
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
            <button
              data-testid="open-reflection-button"
              onClick={() => setReflectionOpen(true)}
              disabled={!reflection}
              className="grid place-items-center h-9 w-9 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--terracotta)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-40"
              aria-label="Reflexão do dia"
            >
              <Sun size={16} />
            </button>
            <ThemeToggle theme={theme} toggle={toggle} />
          </div>
        </header>

        <div ref={feedRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center max-w-xl mx-auto">
              <img src={STATUE} alt="Aurélio" className="h-20 w-20 rounded-full object-cover border-2 border-[var(--border-accent)] mb-6" />
              <h2 className="font-serif-display text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
                Olá, {user?.name?.split(" ")[0]}. Sou Aurélio.
              </h2>
              <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                Estou aqui para te dizer a verdade — com respeito, mas sem rodeios. O que pesa em você hoje?
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-3 w-full">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="flex items-center gap-2 text-left rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Sparkles size={15} className="text-[var(--terracotta)] shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-7">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onSpeak={speak}
                  onSaveQuote={saveQuote}
                  isPlaying={playingId === m.id}
                  isLoading={loadingId === m.id}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--bg-main)]">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
            <div className="flex items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 focus-within:border-[var(--border-accent)] transition-colors">
              <textarea
                data-testid="chat-input-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Escreva com sinceridade…"
                className="flex-1 resize-none bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] max-h-40 leading-relaxed"
                style={{ minHeight: "24px" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
              />
              <button
                data-testid="voice-call-button"
                onClick={call.start}
                disabled={sending}
                title="Falar com Aurélio em tempo real"
                className="grid place-items-center h-9 w-9 rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] transition-colors shrink-0 disabled:opacity-40"
                aria-label="Ligar para Aurélio"
              >
                <Phone size={16} />
              </button>
              <button
                data-testid="chat-send-button"
                onClick={() => send()}
                disabled={!input.trim() || sending}
                className="grid place-items-center h-9 w-9 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
              >
                <SendHorizontal size={17} />
              </button>
            </div>
            <p className="text-center text-[11px] text-[var(--text-muted)] mt-2.5">
              Aurélio pode se enganar. Em crise, ligue para o CVV — 188.
            </p>
          </div>
        </div>
      </main>

      <DailyReflection
        reflection={reflection}
        open={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        onSpeak={speak}
        isPlaying={playingId === "reflection"}
        isLoading={loadingId === "reflection"}
        onDiscuss={discussReflection}
        onSaveQuote={(text) => saveQuote(text, null)}
      />
      <JournalDrawer open={journalOpen} onClose={() => setJournalOpen(false)} refreshKey={journalKey} />
      <VoiceCall call={call} />
    </div>
  );
}
