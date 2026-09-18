import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import { stopAllAudio } from "@/lib/useTTS";

const SPEECH_THRESHOLD = 0.018;
const SILENCE_MS = 700;
const MAX_TURN_MS = 40000;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function useVoiceCall({ getConversationId, onTurn }) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [level, setLevel] = useState(0);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [error, setError] = useState("");

  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const activeRef = useRef(false);
  const interruptedRef = useRef(false);

  const cleanupRecorder = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  };

  const hangUp = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setPhase("idle");
    setLevel(0);
    cleanupRecorder();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => () => hangUp(), [hangUp]);

  const speakReply = useCallback(
    (messageId) =>
      new Promise((resolve) => {
        if (!activeRef.current) return resolve();
        const token = localStorage.getItem("aurelio_token");
        const playFull = () => {
          fetch(`${API}/messages/${messageId}/audio`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("audio"))))
            .then((blob) => {
              if (!activeRef.current || interruptedRef.current) return resolve();
              const objectUrl = URL.createObjectURL(blob);
              const a = new Audio(objectUrl);
              audioRef.current = a;
              const finish = () => { URL.revokeObjectURL(objectUrl); resolve(); };
              a.onended = finish;
              a.onerror = finish;
              a.onpause = finish;
              setPhase("speaking");
              a.play().catch(finish);
            })
            .catch(() => resolve());
        };
        const canMSE =
          typeof window.MediaSource !== "undefined" &&
          typeof window.MediaSource.isTypeSupported === "function" &&
          window.MediaSource.isTypeSupported('audio/mpeg; codecs="mp3"');
        if (!canMSE) {
          playFull();
          return;
        }
        fetch(`${API}/messages/${messageId}/audio/stream`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(async (r) => {
            if (!r.ok) throw new Error("audio fetch");
            if (typeof r.body?.getReader !== "function") throw new Error("no body stream");
            const reader = r.body.getReader();
            const mediaSource = new MediaSource();
            const audio = new Audio();
            audioRef.current = audio;
            audio.src = URL.createObjectURL(mediaSource);
            let sourceBuffer = null;
            let queue = [];
            let updating = false;
            let ended = false;
            let cancelled = false;
            const finish = (result) => {
              if (cancelled) return;
              cancelled = true;
              try { URL.revokeObjectURL(audio.src); } catch {}
              resolve(result);
            };
            audio.onerror = () => { playFull(); };
            audio.onended = () => finish();
            const tryAppend = () => {
              if (!sourceBuffer || updating || queue.length === 0) return;
              updating = true;
              const first = queue.shift();
              try {
                sourceBuffer.appendBuffer(first);
              } catch {
                updating = false;
                setTimeout(tryAppend, 20);
              }
            };
            mediaSource.addEventListener("sourceopen", () => {
              try {
                sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg; codecs="mp3"');
                sourceBuffer.addEventListener("updateend", () => {
                  updating = false;
                  if (queue.length > 0) tryAppend();
                  else if (ended && mediaSource.readyState === "open") {
                    try { mediaSource.endOfStream(); } catch {}
                  }
                });
                sourceBuffer.addEventListener("error", () => {
                  if (!cancelled) { cancelled = true; playFull(); }
                });
                setPhase("speaking");
                audio.play().catch(() => {});
                (async () => {
                  try {
                    while (true) {
                      const { value, done } = await reader.read();
                      if (done) break;
                      if (cancelled) return;
                      if (value && value.length) {
                        const arr = value.buffer instanceof ArrayBuffer
                          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
                          : new Uint8Array(value);
                        queue.push(arr);
                        tryAppend();
                      }
                    }
                    ended = true;
                    if (sourceBuffer && !updating && queue.length === 0 && mediaSource.readyState === "open") {
                      try { mediaSource.endOfStream(); } catch {}
                    } else {
                      tryAppend();
                    }
                  } catch {
                    if (!cancelled) { cancelled = true; playFull(); }
                  }
                })();
              } catch {
                if (!cancelled) { cancelled = true; playFull(); }
              }
            });
            setTimeout(() => {
              if (!cancelled && mediaSource.readyState === "closed") {
                cancelled = true;
                playFull();
              }
            }, 5000);
          })
          .catch(() => playFull());
      }),
    []
  );

  const listen = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;
    interruptedRef.current = false;
    setPhase("listening");
    const mime = pickMime();
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    recorderRef.current = rec;
    const chunks = [];
    let speechStarted = false;
    let lastVoice = Date.now();
    let started = Date.now();
    const data = new Uint8Array(analyserRef.current.fftSize);

    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearInterval(timerRef.current);
      setLevel(0);
      if (!activeRef.current) return;
      if (!speechStarted) return listen();
      setPhase("thinking");
      try {
        const convId = await getConversationId();
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
        const ext = (rec.mimeType || mime).includes("mp4") ? "mp4" : "webm";
        const fd = new FormData();
        fd.append("audio", blob, `audio.${ext}`);
        const token = localStorage.getItem("aurelio_token");
        const res = await fetch(`${API}/conversations/${convId}/voice`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!res.ok) throw new Error("voice failed");
        const out = await res.json();
        if (!activeRef.current) return;
        if (!out.reply) return listen();
        setLastTranscript(out.transcript);
        setLastReply(out.reply);
        onTurn(out, convId);
        await speakReply(out.message_id);
        audioRef.current = null;
        if (activeRef.current) listen();
      } catch (e) {
        setError("Não consegui processar sua fala. Tente de novo.");
        setPhase("error");
        setTimeout(() => activeRef.current && listen(), 1500);
      }
    };

    rec.start(180);
    timerRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(rms);
      const now = Date.now();
      if (rms > SPEECH_THRESHOLD) {
        speechStarted = true;
        lastVoice = now;
      }
      if (speechStarted && now - lastVoice > SILENCE_MS) rec.stop();
      else if (speechStarted && now - started > MAX_TURN_MS) rec.stop();
      else if (!speechStarted && now - started > 12000) started = now;
    }, 50);
  }, [getConversationId, onTurn, speakReply]);

  const start = useCallback(async () => {
    setError("");
    try {
      stopAllAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      ctx.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      activeRef.current = true;
      setActive(true);
      listen();
    } catch (e) {
      setError("Preciso de acesso ao microfone para conversar por voz.");
      setPhase("error");
      setActive(true);
    }
  }, [listen]);

  const interrupt = useCallback(() => {
    interruptedRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  return { active, phase, level, lastTranscript, lastReply, error, start, hangUp, interrupt };
}
