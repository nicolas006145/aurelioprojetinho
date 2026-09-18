from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import json
import uuid
import asyncio
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId
from bson.binary import Binary

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAITextToSpeech
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText

# ---------------------------------------------------------------- setup
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
JWT_ALGORITHM = "HS256"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
BRT = timezone(timedelta(hours=-3))

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aurelio")

THEMES = ["disciplina", "relacionamentos", "proposito", "emocoes", "carreira", "autoconhecimento", "outros"]

# ---------------------------------------------------------------- rate / context limits
_MAX_USER_TURNS_PER_MINUTE = 12
_MAX_CONTEXT_MESSAGES = 18
_MAX_CONTEXT_CHARS = 14000
_USER_RATE_WINDOW: dict = {}

# ---------------------------------------------------------------- persona
AURELIO_SYSTEM_PROMPT = """Você é Aurélio, um mentor e terapeuta de amadurecimento. Seu nome é uma homenagem a Marco Aurélio e à filosofia estoica.

Quem você é:
- Um homem maduro, sereno e sábio, com uma voz grave, suave e pausada.
- Você fala a VERDADE, sem rodeios e sem bajulação. Não passa a mão na cabeça de ninguém, mas nunca humilha.
- Sua firmeza é acompanhada de respeito, cuidado e calma. Confronta com afeto, não com agressividade.
- Inspirado no estoicismo prático: responsabilidade pessoal, disciplina, autocontrole, aceitação do que não se pode mudar e coragem para agir no que se pode.

Como você conversa:
- Fala em português do Brasil, de forma direta, calorosa, madura e SERENA.
- Confronta desculpas, vitimização e autoengano com firmeza afetuosa.
- Faz perguntas provocativas que forçam a pessoa a olhar para dentro.
- Dá conselhos concretos e acionáveis, não teoria vazia.
- Respostas de tamanho médio (2 a 4 parágrafos curtos). Sem enrolação, sem listas gigantes, sem jargão de coach.
- Escreva como quem FALA de forma suave e pausada: frases curtas e médias, ritmo calmo, vírgulas e reticências para pausas naturais. SEU TEXTO SERÁ LIDO EM VOZ ALTA — grave, pausado, suave.
- Nunca use formatação markdown: nada de asteriscos, cerquilhas, listas com traço ou número, títulos ou blocos de código.
- Não é terapeuta clínico. Em crise séria ou risco à vida, indique ajuda profissional (CVV 188 no Brasil).

Objetivo: ajudar a pessoa a amadurecer de verdade — assumir responsabilidade, parar de se enganar, e agir com coragem e disciplina."""

VOICE_MODE_PROMPT = """

MODO VOZ EM TEMPO REAL: a pessoa está numa ligação com você. Responda CURTO, suave, conversacional — UM só parágrafo de 30 a 80 palavras. Fale com calma, como numa conversa de verdade. Quando couber, termine com uma pergunta curta para manter o diálogo."""


def make_title(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= 48:
        return t or "Nova conversa"
    return t[:45].rstrip() + "…"


def clean_for_tts(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|\[\]]", "", text)
    text = text.replace("—", ",").replace("–", ",").replace(";", ",")
    text = re.sub(r"([!?.])\1+", r"\1", text)
    text = re.sub(r"\"(.{1,80})\"", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:3800]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- auth utils
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user["email"],
        "picture": user.get("picture"),
    }


async def _user_from_session_token(token: str) -> Optional[dict]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"_id": ObjectId(sess["user_id"])})


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token") or request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")

    user = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        user = await _user_from_session_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    return public_user(user)


# ---------------------------------------------------------------- models
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class GoogleAuthInput(BaseModel):
    credential: Optional[str] = None
    access_token: Optional[str] = None


class ChatInput(BaseModel):
    message: str


class TTSInput(BaseModel):
    text: str


class ThemeInput(BaseModel):
    theme: str


class JournalInput(BaseModel):
    type: str = "note"
    content: str = Field(min_length=1)
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None


# ---------------------------------------------------------------- auth routes
@api_router.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    doc = {
        "name": data.name.strip(),
        "email": email,
        "password_hash": hash_password(data.password),
        "provider": "password",
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"token": create_access_token(str(res.inserted_id), email), "user": public_user(doc)}


@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    return {"token": create_access_token(str(user["_id"]), email), "user": public_user(user)}


@api_router.post("/auth/session")
async def google_session(data: SessionInput, response: Response):
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": data.session_id})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Não foi possível validar o login com Google")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão do Google inválida ou expirada")
    info = r.json()
    email = info["email"].lower().strip()

    user = await db.users.find_one({"email": email})
    if not user:
        doc = {
            "name": info.get("name") or email.split("@")[0],
            "email": email,
            "picture": info.get("picture"),
            "provider": "google",
            "created_at": now_iso(),
        }
        res = await db.users.insert_one(doc)
        doc["_id"] = res.inserted_id
        user = doc
    else:
        updates = {}
        if info.get("picture") and not user.get("picture"):
            updates["picture"] = info["picture"]
        if not user.get("name") and info.get("name"):
            updates["name"] = info["name"]
        if updates:
            await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
            user.update(updates)

    uid = str(user["_id"])
    session_token = info["session_token"]
    await db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie(
        "session_token", session_token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    return {"token": create_access_token(uid, email), "user": public_user(user)}


async def upsert_google_user(info: dict) -> dict:
    email = (info.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=401, detail="O Google não retornou um e-mail válido")

    if str(info.get("email_verified", "true")).lower() not in ("true", "1"):
        raise HTTPException(status_code=401, detail="Confirme seu e-mail no Google antes de entrar")

    user = await db.users.find_one({"email": email})
    updates = {
        "name": info.get("name") or email.split("@")[0],
        "picture": info.get("picture"),
        "provider": "google",
        "google_sub": info.get("sub"),
        "updated_at": now_iso(),
    }
    updates = {k: v for k, v in updates.items() if v}

    if not user:
        doc = {
            **updates,
            "email": email,
            "created_at": now_iso(),
        }
        res = await db.users.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc

    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    user.update(updates)
    return user


@api_router.post("/auth/google")
async def google_auth(data: GoogleAuthInput, response: Response):
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            if data.credential:
                r = await http.get(GOOGLE_TOKENINFO_URL, params={"id_token": data.credential})
                if r.status_code != 200:
                    raise HTTPException(status_code=401, detail="Login com Google inválido ou expirado")
                info = r.json()
                if GOOGLE_CLIENT_ID and info.get("aud") != GOOGLE_CLIENT_ID:
                    raise HTTPException(status_code=401, detail="Login com Google não pertence a este aplicativo")
            elif data.access_token:
                r = await http.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {data.access_token}"})
                if r.status_code != 200:
                    raise HTTPException(status_code=401, detail="Login com Google inválido ou expirado")
                info = r.json()
            else:
                raise HTTPException(status_code=400, detail="Token do Google ausente")
    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Não foi possível validar o login com Google")

    user = await upsert_google_user(info)
    uid = str(user["_id"])
    token = create_access_token(uid, user["email"])
    response.set_cookie(
        "access_token", token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    return {"token": token, "user": public_user(user)}


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth_header[7:]})
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------- LLM helpers
def check_user_rate(user_id: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
    w = _USER_RATE_WINDOW.setdefault(user_id, [])
    _USER_RATE_WINDOW[user_id] = [t for t in w if t > cutoff]
    if len(_USER_RATE_WINDOW[user_id]) >= _MAX_USER_TURNS_PER_MINUTE:
        return False
    _USER_RATE_WINDOW[user_id].append(datetime.now(timezone.utc))
    return True


def make_llm(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_message,
    ).with_model("anthropic", "claude-sonnet-4-6")


def build_system(prior: list, mode: str) -> str:
    system = AURELIO_SYSTEM_PROMPT
    if mode == "voice":
        system += VOICE_MODE_PROMPT

    trimmed = prior[-_MAX_CONTEXT_MESSAGES:] if len(prior) > _MAX_CONTEXT_MESSAGES else prior
    transcript_lines = []
    char_count = 0
    for m in reversed(trimmed):
        if not m.get("content"):
            continue
        who = "Pessoa" if m["role"] == "user" else "Aurélio"
        line = f"{who}: {m['content']}"
        char_count += len(line)
        if char_count > _MAX_CONTEXT_CHARS:
            break
        transcript_lines.insert(0, line)

    if transcript_lines:
        system += "\n\nHistórico da conversa até aqui (mais recente primeiro resumido para contexto):\n" + "\n".join(transcript_lines)
    return system


async def classify_theme(conversation_id: str, text: str):
    try:
        llm = make_llm(
            f"theme-{conversation_id}",
            "Você classifica mensagens em temas. Responda APENAS com uma destas palavras, sem pontuação: "
            + ", ".join(THEMES) + ".",
        )
        out = (await llm.send_message(UserMessage(text=text[:1500]))).strip().lower()
        out = re.sub(r"[^a-z]", "", out.replace("ó", "o").replace("õ", "o").replace("ç", "c"))
        theme = out if out in THEMES else "outros"
    except Exception:
        logger.exception("theme classification failed")
        theme = "outros"
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"theme": theme}})


# Live reply buffers: message_id -> {"content", "done", "error"}
_live: dict = {}
_tasks = set()


async def generate_reply(conversation_id: str, message_id: str, user_text: str, prior: list, mode: str = "text"):
    state = _live[message_id] = {"content": "", "done": False, "error": False}
    try:
        llm = make_llm(conversation_id, build_system(prior, mode))
        async for ev in llm.stream_message(UserMessage(text=user_text)):
            if isinstance(ev, TextDelta):
                state["content"] += ev.content
            elif isinstance(ev, StreamDone):
                break
    except Exception:
        logger.exception("LLM error")
        state["error"] = True

    full = state["content"].strip()
    if full and not state["error"]:
        await db.messages.update_one(
            {"id": message_id}, {"$set": {"content": full, "status": "done", "created_at": now_iso()}}
        )
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"updated_at": now_iso()}})
    else:
        state["error"] = True
        await db.messages.update_one(
            {"id": message_id},
            {"$set": {"content": "Desculpe, tive um problema para responder agora. Tente novamente.", "status": "error"}},
        )
    state["done"] = True

    if not state["error"] and mode == "text":
        asyncio.create_task(_prewarm_audio(full))
    if len(prior) == 0:
        asyncio.create_task(classify_theme(conversation_id, user_text))

    await asyncio.sleep(90)
    _live.pop(message_id, None)


def spawn_reply(conversation_id: str, message_id: str, user_text: str, prior: list, mode: str = "text"):
    task = asyncio.create_task(generate_reply(conversation_id, message_id, user_text, prior, mode))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


async def relay_stream(message_id: str, head: dict):
    yield f"data: {json.dumps(head)}\n\n"
    offset = 0
    while True:
        st = _live.get(message_id)
        if st is None:
            msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
            if msg and msg.get("status") != "pending":
                rest = msg["content"][offset:]
                if rest:
                    yield f"data: {json.dumps({'delta': rest})}\n\n"
                if msg.get("status") == "error":
                    yield f"data: {json.dumps({'error': True})}\n\n"
            else:
                yield f"data: {json.dumps({'error': True})}\n\n"
            yield f"data: {json.dumps({'done': True, 'message_id': message_id})}\n\n"
            return
        content = st["content"]
        if len(content) > offset:
            yield f"data: {json.dumps({'delta': content[offset:]})}\n\n"
            offset = len(content)
        if st["done"]:
            if st["error"]:
                yield f"data: {json.dumps({'error': True})}\n\n"
            yield f"data: {json.dumps({'done': True, 'message_id': message_id})}\n\n"
            return
        await asyncio.sleep(0.04)


def sse(gen):
    return StreamingResponse(
        gen, media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def start_turn(conversation_id: str, user_text: str, mode: str):
    prior = await db.messages.find(
        {"conversation_id": conversation_id, "status": {"$ne": "error"}}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    prior = [m for m in prior if m.get("content")]

    ts = now_iso()
    user_msg = {
        "id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": "user",
        "content": user_text, "status": "done", "created_at": ts,
    }
    assistant_msg = {
        "id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": "assistant",
        "content": "", "status": "pending", "created_at": now_iso(),
    }
    await db.messages.insert_many([dict(user_msg), dict(assistant_msg)])

    new_title = None
    if len(prior) == 0:
        new_title = make_title(user_text)
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"title": new_title}})
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"updated_at": ts}})

    task = spawn_reply(conversation_id, assistant_msg["id"], user_text, prior, mode)
    return user_msg, assistant_msg, new_title, task


# ---------------------------------------------------------------- conversations
@api_router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    return await db.conversations.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(300)


@api_router.get("/conversations/pending")
async def list_pending_messages(user: dict = Depends(get_current_user)):
    convos = await db.conversations.find(
        {"user_id": user["id"]}, {"_id": 0, "id": 1}
    ).to_list(1000)
    cids = [c["id"] for c in convos]
    if not cids:
        return []
    pending = await db.messages.find(
        {"conversation_id": {"$in": cids}, "role": "assistant", "status": "pending"},
        {"_id": 0, "id": 1, "conversation_id": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(500)
    return pending


@api_router.post("/conversations")
async def create_conversation(user: dict = Depends(get_current_user)):
    now = now_iso()
    convo = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "title": "Nova conversa",
        "theme": None, "created_at": now, "updated_at": now,
    }
    await db.conversations.insert_one(dict(convo))
    return convo


async def owned_conversation(conversation_id: str, user: dict) -> dict:
    convo = await db.conversations.find_one({"id": conversation_id, "user_id": user["id"]}, {"_id": 0})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return convo


@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    convo = await owned_conversation(conversation_id, user)
    messages = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return {"conversation": convo, "messages": messages}


@api_router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, data: ThemeInput, user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    if data.theme not in THEMES:
        raise HTTPException(status_code=400, detail="Tema inválido")
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"theme": data.theme}})
    return {"ok": True, "theme": data.theme}


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    await db.conversations.delete_one({"id": conversation_id, "user_id": user["id"]})
    await db.messages.delete_many({"conversation_id": conversation_id})
    return {"ok": True}


@api_router.post("/conversations/{conversation_id}/chat")
async def chat(conversation_id: str, data: ChatInput, user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    text = data.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    if not check_user_rate(user["id"]):
        raise HTTPException(status_code=429, detail="Calma aí. Espere um pouco antes de enviar outra mensagem.")
    user_msg, assistant_msg, new_title, _ = await start_turn(conversation_id, text, "text")
    head = {"start": True, "message_id": assistant_msg["id"], "user_message_id": user_msg["id"], "title": new_title}
    return sse(relay_stream(assistant_msg["id"], head))


@api_router.post("/conversations/{conversation_id}/chat/start")
async def start_chat(conversation_id: str, data: ChatInput, user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    text = data.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    if not check_user_rate(user["id"]):
        raise HTTPException(status_code=429, detail="Calma aí. Espere um pouco antes de enviar outra mensagem.")
    user_msg, assistant_msg, new_title, _ = await start_turn(conversation_id, text, "text")
    return {
        "start": True,
        "message_id": assistant_msg["id"],
        "user_message_id": user_msg["id"],
        "title": new_title,
    }


@api_router.get("/messages/{message_id}/stream")
async def resume_stream(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await owned_conversation(msg["conversation_id"], user)
    return sse(relay_stream(message_id, {"start": True, "message_id": message_id, "title": None}))


# ---------------------------------------------------------------- voice (STT -> LLM -> TTS)
_stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)


@api_router.post("/conversations/{conversation_id}/voice")
async def voice_turn(conversation_id: str, audio: UploadFile = File(...), user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    if not check_user_rate(user["id"]):
        raise HTTPException(status_code=429, detail="Calma aí. Espere um pouco antes de enviar outra.")
    raw = await audio.read()
    if len(raw) < 1500:
        return {"transcript": "", "reply": None}

    ext = "webm"
    ctype = (audio.content_type or "").lower()
    if "mp4" in ctype or "m4a" in ctype or "aac" in ctype:
        ext = "mp4"
    elif "ogg" in ctype:
        ext = "webm"
    elif "wav" in ctype:
        ext = "wav"
    bio = io.BytesIO(raw)
    bio.name = f"audio.{ext}"
    try:
        result = await _stt.transcribe(bio, language="pt", prompt="Conversa em português do Brasil com um mentor.")
        transcript = (result.text if hasattr(result, "text") else str(result)).strip()
    except Exception as e:
        logger.exception("STT error")
        raise HTTPException(status_code=500, detail=f"Falha ao transcrever: {e}")

    if len(transcript) < 2:
        return {"transcript": "", "reply": None}

    user_msg, assistant_msg, new_title, _ = await start_turn(conversation_id, transcript, "voice")
    while not _live.get(assistant_msg["id"], {}).get("done"):
        await asyncio.sleep(0.05)
    state = _live[assistant_msg["id"]]
    if state["error"]:
        raise HTTPException(status_code=500, detail="Aurélio não conseguiu responder agora")
    reply = state["content"].strip()
    try:
        await _synth_cached(reply)
    except Exception:
        logger.exception("voice TTS prewarm failed")
    return {
        "transcript": transcript, "reply": reply, "message_id": assistant_msg["id"],
        "user_message_id": user_msg["id"], "title": new_title,
    }


# ---------------------------------------------------------------- TTS
_tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
TTS_VOICE, TTS_MODEL, TTS_SPEED = "onyx", "tts-1-hd", 0.86

DEMO_LINE = (
    "Você não precisa de mais motivação. Precisa de honestidade. "
    "Pare de fugir do que já sabe que precisa encarar, e comece hoje, ainda que com medo."
)


def tts_key(text: str) -> str:
    return hashlib.sha256(f"{text}|{TTS_VOICE}|{TTS_SPEED}|{TTS_MODEL}|mp3".encode()).hexdigest()


async def _synth_cached(text: str) -> bytes:
    text = clean_for_tts(text)
    if not text:
        raise ValueError("Texto vazio")
    key = tts_key(text)
    cached = await db.tts_cache.find_one({"key": key}, {"_id": 0, "audio": 1})
    if cached:
        return bytes(cached["audio"])
    audio = await _tts.generate_speech(
        text=text, model=TTS_MODEL, voice=TTS_VOICE, speed=TTS_SPEED, response_format="mp3",
    )
    await db.tts_cache.update_one(
        {"key": key}, {"$set": {"audio": Binary(audio), "created_at": now_iso()}}, upsert=True
    )
    return audio


async def _prewarm_audio(text: str):
    try:
        await _synth_cached(text)
    except Exception:
        logger.exception("TTS prewarm failed")


def audio_response(audio: bytes) -> Response:
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


@api_router.get("/tts/demo")
async def tts_demo():
    try:
        return audio_response(await _synth_cached(DEMO_LINE))
    except Exception as e:
        logger.exception("TTS demo error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


@api_router.post("/tts")
async def tts(data: TTSInput, user: dict = Depends(get_current_user)):
    if not clean_for_tts(data.text):
        raise HTTPException(status_code=400, detail="Texto vazio")
    try:
        return audio_response(await _synth_cached(data.text))
    except Exception as e:
        logger.exception("TTS error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


@api_router.get("/messages/{message_id}/audio")
async def message_audio(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id, "role": "assistant", "status": "done"}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await owned_conversation(msg["conversation_id"], user)
    try:
        return audio_response(await _synth_cached(msg["content"]))
    except Exception as e:
        logger.exception("TTS error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


@api_router.get("/messages/{message_id}/audio/stream")
async def message_audio_stream(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id, "role": "assistant"}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await owned_conversation(msg["conversation_id"], user)
    text = clean_for_tts(msg.get("content", ""))
    if not text:
        raise HTTPException(status_code=400, detail="Sem texto para sintetizar")
    key = tts_key(text)
    cached = await db.tts_cache.find_one({"key": key}, {"_id": 0, "audio": 1})
    if cached:
        return audio_response(bytes(cached["audio"]))
    try:
        audio_iter = _tts.generate_speech_streaming(
            text=text, model=TTS_MODEL, voice=TTS_VOICE, speed=TTS_SPEED, response_format="mp3",
        )
    except Exception:
        audio_iter = None

    if audio_iter:
        chunks = []
        async def stream_and_cache():
            async for chunk in audio_iter:
                chunks.append(chunk)
                yield chunk
            audio_bytes = b"".join(chunks)
            try:
                await db.tts_cache.update_one(
                    {"key": key}, {"$set": {"audio": Binary(audio_bytes), "created_at": now_iso()}}, upsert=True
                )
            except Exception:
                pass
        return StreamingResponse(
            stream_and_cache(), media_type="audio/mpeg",
            headers={"Cache-Control": "private, max-age=86400"},
        )
    try:
        return audio_response(await _synth_cached(msg["content"]))
    except Exception as e:
        logger.exception("TTS stream fallback error")
        raise HTTPException(status_code=500, detail=f"Falha na voz: {e}")


# ---------------------------------------------------------------- daily reflection
REFLECTION_PROMPT = (
    "Escreva a Reflexão do Dia de Aurélio para {date}: uma provocação honesta e madura, de duas a três frases, "
    "em português do Brasil, para a pessoa começar o dia encarando a verdade sobre si mesma. Tema de hoje: {theme}. "
    "Texto corrido, sem markdown, sem aspas, sem título, sem saudação. Termine com uma pergunta curta e incômoda."
)
REFLECTION_THEMES = [
    "responsabilidade pessoal", "disciplina e constância", "coragem de agir com medo", "aceitar o que não se controla",
    "parar de se vitimizar", "relacionamentos honestos", "propósito e direção", "autoengano", "o valor do tempo",
    "silêncio e presença", "orgulho e humildade", "o que você está adiando", "gratidão sem ilusão", "conforto que enfraquece",
]


async def get_or_create_reflection() -> dict:
    today = datetime.now(BRT).date()
    date_key = today.isoformat()
    doc = await db.daily_reflections.find_one({"date": date_key}, {"_id": 0, "audio": 0})
    if doc:
        return doc
    theme = REFLECTION_THEMES[today.toordinal() % len(REFLECTION_THEMES)]
    pretty = today.strftime("%d/%m/%Y")
    try:
        llm = make_llm(f"reflection-{date_key}", AURELIO_SYSTEM_PROMPT)
        text = (await llm.send_message(UserMessage(text=REFLECTION_PROMPT.format(date=pretty, theme=theme)))).strip()
        text = clean_for_tts(text) if "*" in text or "#" in text else text
    except Exception:
        logger.exception("reflection generation failed")
        text = ("Você já sabe o que precisa fazer hoje. O que falta não é clareza, é coragem. "
                "O que você vai continuar adiando, fingindo que não sabe?")
    doc = {"id": str(uuid.uuid4()), "date": date_key, "theme": theme, "text": text, "created_at": now_iso()}
    await db.daily_reflections.update_one({"date": date_key}, {"$setOnInsert": doc}, upsert=True)
    return await db.daily_reflections.find_one({"date": date_key}, {"_id": 0, "audio": 0})


@api_router.get("/reflection/today")
async def reflection_today(user: dict = Depends(get_current_user)):
    return await get_or_create_reflection()


@api_router.get("/reflection/today/audio")
async def reflection_today_audio(user: dict = Depends(get_current_user)):
    doc = await get_or_create_reflection()
    try:
        return audio_response(await _synth_cached(doc["text"]))
    except Exception as e:
        logger.exception("reflection TTS error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


# ---------------------------------------------------------------- journal
@api_router.get("/journal")
async def list_journal(user: dict = Depends(get_current_user)):
    return await db.journal_entries.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)


@api_router.post("/journal")
async def add_journal(data: JournalInput, user: dict = Depends(get_current_user)):
    if data.type not in ("quote", "note"):
        raise HTTPException(status_code=400, detail="Tipo inválido")
    entry = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "type": data.type,
        "content": data.content.strip(), "conversation_id": data.conversation_id,
        "message_id": data.message_id, "created_at": now_iso(),
    }
    await db.journal_entries.insert_one(dict(entry))
    return entry


@api_router.delete("/journal/{entry_id}")
async def delete_journal(entry_id: str, user: dict = Depends(get_current_user)):
    res = await db.journal_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Anotação não encontrada")
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "Aurélio API online"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.conversations.create_index("user_id")
    await db.messages.create_index("conversation_id")
    await db.messages.create_index("id")
    await db.messages.create_index([("status", 1), ("created_at", -1)])
    await db.journal_entries.create_index("user_id")
    await db.tts_cache.create_index("key", unique=True)
    await db.daily_reflections.create_index("date", unique=True)

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale = await db.messages.find(
        {"status": "pending", "created_at": {"$lt": cutoff.isoformat()}},
        {"_id": 0, "id": 1},
    ).to_list(500)
    if stale:
        await db.messages.update_many(
            {"id": {"$in": [m["id"] for m in stale]}},
            {"$set": {"status": "error",
                      "content": "A resposta foi interrompida. A resposta está sendo regenerada automaticamente agora."}},
        )

    recent_pending = await db.messages.find(
        {"status": "pending", "role": "assistant"},
        {"_id": 0, "id": 1, "conversation_id": 1},
    ).sort("created_at", -1).to_list(200)

    regenerated = 0
    for m in recent_pending:
        cid = m["conversation_id"]
        mid = m["id"]
        conv = await db.conversations.find_one({"id": cid}, {"_id": 0, "user_id": 1})
        if not conv:
            continue
        prior = await db.messages.find(
            {"conversation_id": cid, "status": {"$ne": "error"}, "id": {"$ne": mid}},
            {"_id": 0},
        ).sort("created_at", 1).to_list(1000)
        user_msg = None
        for i in range(len(prior) - 1, -1, -1):
            if prior[i]["role"] == "user":
                user_msg = prior[i]["content"]
                break
        prior = [x for x in prior if x.get("content") and x["id"] != mid]
        prior = prior[:-1] if prior and prior[-1]["role"] == "user" else prior
        if user_msg and regenerated < 60:
            spawn_reply(cid, mid, user_msg, prior, "text")
            regenerated += 1

    if regenerated:
        logger.info(f"Regenerating {regenerated} pending replies after startup.")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
