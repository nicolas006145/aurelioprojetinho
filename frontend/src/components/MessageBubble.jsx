import { useState } from "react";
import { Volume2, Loader2, Square, Copy, Check, BookMarked } from "lucide-react";

function VoiceWave() {
  return (
    <span className="flex items-end gap-[2px] h-3">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="voicebar w-[2px] h-full bg-[var(--terracotta)] rounded-full"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function MessageBubble({ message, onSpeak, onSaveQuote, isPlaying, isLoading }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const isUser = message.role === "user";

  const copy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveQuote = async () => {
    const selection = window.getSelection()?.toString().trim();
    const text = selection && message.content.includes(selection) ? selection : message.content;
    await onSaveQuote(text, message);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end fadeup">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-5 py-3 bg-[var(--user-bubble)] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const failed = message.status === "error";

  return (
    <div className="flex flex-col gap-2 fadeup" data-testid="aurelio-message-card">
      <div className="flex items-center gap-2">
        <span className="font-serif-display text-lg font-semibold text-[var(--terracotta)]">Aurélio</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <div className={`leading-[1.75] whitespace-pre-wrap text-[15px] ${failed ? "text-[var(--text-muted)] italic" : "text-[var(--text-primary)]"}`}>
        {message.content}
        {message.streaming && (
          <span className="inline-flex gap-1 ml-1 align-middle">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
          </span>
        )}
      </div>
      {!message.streaming && message.content && !failed && (
        <div className="flex items-center gap-4 pt-1 flex-wrap">
          <button
            data-testid="aurelio-tts-play-button"
            onClick={() => onSpeak(message.id, message.content, { url: `/messages/${message.id}/audio` })}
            className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isPlaying ? (
              <>
                <Square size={13} /> <VoiceWave />
              </>
            ) : (
              <Volume2 size={14} />
            )}
            <span>{isPlaying ? "Ouvindo…" : "Ouvir a voz de Aurélio"}</span>
          </button>
          <button
            data-testid="save-quote-button"
            onClick={saveQuote}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
          >
            {saved ? <Check size={13} /> : <BookMarked size={13} />}
            {saved ? "Guardado no diário" : "Guardar no diário"}
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
}
