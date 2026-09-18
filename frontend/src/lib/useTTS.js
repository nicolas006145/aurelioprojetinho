import { useRef, useState, useCallback } from "react";
import { API } from "@/lib/api";

// Shared single audio element so only one plays at a time.
let currentAudio = null;

export function stopAllAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export function useTTS() {
  const [playingId, setPlayingId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const cache = useRef({});

  const stop = useCallback(() => {
    stopAllAudio();
    setPlayingId(null);
  }, []);

  // opts: { demo: true } | { url: "/messages/:id/audio" } | none (POST /tts with text)
  const speak = useCallback(
    async (id, text, opts = {}) => {
      if (playingId === id) {
        stop();
        return;
      }
      stop();
      setLoadingId(id);
      try {
        let url = cache.current[id];
        if (!url) {
          const token = localStorage.getItem("aurelio_token");
          let res;
          if (opts.demo) {
            res = await fetch(`${API}/tts/demo`);
          } else if (opts.url) {
            res = await fetch(`${API}${opts.url}`, { headers: { Authorization: `Bearer ${token}` } });
          } else {
            res = await fetch(`${API}/tts`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ text }),
            });
          }
          if (!res.ok) throw new Error("tts failed");
          url = URL.createObjectURL(await res.blob());
          cache.current[id] = url;
        }
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => setPlayingId((p) => (p === id ? null : p));
        audio.onpause = () => setPlayingId((p) => (p === id ? null : p));
        await audio.play();
        setPlayingId(id);
      } catch (e) {
        setPlayingId(null);
      } finally {
        setLoadingId(null);
      }
    },
    [playingId, stop]
  );

  return { speak, stop, playingId, loadingId };
}
