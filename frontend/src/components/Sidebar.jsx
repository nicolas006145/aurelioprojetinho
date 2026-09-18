import { useState } from "react";
import { Plus, Trash2, LogOut, X, BookMarked, ChevronDown } from "lucide-react";
import { THEMES, themeOf } from "@/lib/themes";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=200&q=80";

function ConversationItem({ c, active, onSelect, onDelete, hasPending, hasNew }) {
  const { Icon } = themeOf(c.theme);
  return (
    <div
      data-testid="chat-history-item"
      onClick={() => onSelect(c.id)}
      className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        active
          ? "bg-[var(--bg-card)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]/60"
      }`}
    >
      <Icon size={15} className="shrink-0 text-[var(--text-muted)]" />
      <span className="flex-1 truncate text-sm">{c.title}</span>
      {hasPending && (
        <span className="grid place-items-center shrink-0 h-2.5 w-2.5 rounded-full bg-[var(--terracotta)] animate-pulse" title="Aurélio está respondendo" />
      )}
      {!hasPending && hasNew && (
        <span className="grid place-items-center shrink-0 h-2 w-2 rounded-full bg-green-500" title="Nova resposta disponível" />
      )}
      <button
        data-testid="chat-history-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(c.id);
        }}
        className={`text-[var(--text-muted)] hover:text-red-400 transition-opacity ${hasPending || hasNew ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ThemeGroup({ theme, items, activeId, onSelect, onDelete, pendingMap, newMap }) {
  const [open, setOpen] = useState(true);
  const { label, Icon } = themeOf(theme);
  return (
    <div data-testid={`theme-group-${theme}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
      >
        <Icon size={12} />
        <span className="flex-1 text-left">{label}</span>
        <span className="font-mono-jb">{items.length}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open &&
        items.map((c) => (
          <ConversationItem
            key={c.id}
            c={c}
            active={activeId === c.id}
            onSelect={onSelect}
            onDelete={onDelete}
            hasPending={pendingMap?.[c.id]}
            hasNew={newMap?.[c.id]}
          />
        ))}
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenJournal,
  user,
  onLogout,
  pendingByConversation,
  newByConversation,
}) {
  const [filter, setFilter] = useState("all");
  const usedThemes = THEMES.filter((t) => conversations.some((c) => themeOf(c.theme).id === t.id));
  const visible = filter === "all" ? conversations : conversations.filter((c) => themeOf(c.theme).id === filter);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed md:static z-40 top-0 left-0 h-full w-[280px] shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <img src={STATUE} alt="Aurélio" className="h-9 w-9 rounded-full object-cover border border-[var(--border-accent)]" />
            <div className="leading-tight">
              <div className="font-serif-display text-xl font-semibold text-[var(--text-primary)]">Aurélio</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Mentor de amadurecimento</div>
            </div>
          </div>
          <button className="md:hidden text-[var(--text-muted)]" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="px-4 space-y-2">
          <button
            data-testid="chat-new-conversation-button"
            onClick={onNew}
            className="w-full flex items-center gap-2 justify-center rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] py-2.5 text-sm font-medium hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] transition-colors"
          >
            <Plus size={16} /> Nova conversa
          </button>
          <button
            data-testid="open-journal-button"
            onClick={onOpenJournal}
            className="w-full flex items-center gap-2 justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] py-2.5 text-sm font-medium hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
          >
            <BookMarked size={16} /> Diário de reflexões
          </button>
        </div>

        <div className="px-4 mt-6 mb-2 flex items-center justify-between">
          <span className="eyebrow">Conversas por tema</span>
        </div>
        {usedThemes.length > 1 && (
          <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
            {[{ id: "all", label: "Todos" }, ...usedThemes].map((t) => (
              <button
                key={t.id}
                data-testid={`theme-filter-${t.id}`}
                onClick={() => setFilter(t.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] border transition-colors ${
                  filter === t.id
                    ? "border-[var(--border-accent)] text-[var(--terracotta)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-2">
          {conversations.length === 0 && (
            <p className="px-2 text-sm text-[var(--text-muted)] leading-relaxed">
              Suas reflexões aparecerão aqui, organizadas por tema, para você retomar quando quiser.
            </p>
          )}
          {filter === "all"
            ? THEMES.map((t) => {
                const items = visible.filter((c) => themeOf(c.theme).id === t.id);
                if (!items.length) return null;
                return (
                  <ThemeGroup
                    key={t.id}
                    theme={t.id}
                    items={items}
                    activeId={activeId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    pendingMap={pendingByConversation}
                    newMap={newByConversation}
                  />
                );
              })
            : visible.map((c) => (
                <ConversationItem
                  key={c.id}
                  c={c}
                  active={activeId === c.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  hasPending={pendingByConversation?.[c.id]}
                  hasNew={newByConversation?.[c.id]}
                />
              ))}
        </div>

        <div className="border-t border-[var(--border)] p-4 flex items-center gap-3">
          {user?.picture ? (
            <img src={user.picture} alt="" className="h-9 w-9 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] grid place-items-center font-semibold uppercase">
              {user?.name?.[0] || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate text-[var(--text-primary)]">{user?.name}</div>
            <div className="text-xs truncate text-[var(--text-muted)]">{user?.email}</div>
          </div>
          <button
            data-testid="logout-button"
            onClick={onLogout}
            className="text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
            aria-label="Sair"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
