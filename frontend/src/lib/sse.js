import { API } from "@/lib/api";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("aurelio_token");
  return { Authorization: `Bearer ${token}`, ...extra };
}

export async function openChatStream(convId, message) {
  return fetch(`${API}/conversations/${convId}/chat`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message }),
  });
}

export async function startChatTurn(convId, message) {
  const res = await fetch(`${API}/conversations/${convId}/chat/start`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message }),
    keepalive: message.length < 12000,
  });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
  return res.json();
}

export async function openResumeStream(messageId) {
  return fetch(`${API}/messages/${messageId}/stream`, { headers: authHeaders() });
}

// Reads a "data: {json}\n\n" SSE body and calls onEvent for each parsed event.
export async function consumeSSE(res, onEvent) {
  if (!res.ok) throw new Error(`stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      const line = part.replace(/^data: /, "").trim();
      if (line) onEvent(JSON.parse(line));
    }
  }
}
