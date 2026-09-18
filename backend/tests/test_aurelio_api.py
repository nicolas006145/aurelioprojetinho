"""Backend API tests for Aurélio."""
import os
import time
import uuid
import json
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mentor-voice-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

TEST_USER_EMAIL = "teste@aurelio.com"
TEST_USER_PASSWORD = "senha123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(session):
    # try login existing user first
    r = session.post(f"{API}/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
    if r.status_code == 200:
        return r.json()["token"]
    # register if not existing
    r = session.post(f"{API}/auth/register", json={"name": "Teste", "email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
    if r.status_code == 200:
        return r.json()["token"]
    pytest.skip(f"Auth failed: {r.status_code} {r.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---- health ----
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "Aurélio" in r.json().get("message", "")


# ---- auth ----
def test_register_new_user(session):
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = session.post(f"{API}/auth/register", json={"name": "TEST_user", "email": email, "password": "senha123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str)
    assert data["user"]["email"] == email
    assert data["user"]["name"] == "TEST_user"
    assert "id" in data["user"]


def test_register_duplicate_email(session):
    r = session.post(f"{API}/auth/register", json={"name": "T", "email": TEST_USER_EMAIL, "password": "senha123"})
    assert r.status_code == 400


def test_login_success(session):
    r = session.post(f"{API}/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password(session):
    r = session.post(f"{API}/auth/login", json={"email": TEST_USER_EMAIL, "password": "wrongpass"})
    assert r.status_code == 401


def test_me_endpoint(session, auth_headers):
    r = session.get(f"{API}/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == TEST_USER_EMAIL
    assert "password_hash" not in data
    assert "_id" not in data


def test_me_no_auth(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---- conversations CRUD ----
def test_create_and_get_conversation(session, auth_headers):
    r = session.post(f"{API}/conversations", headers=auth_headers)
    assert r.status_code == 200
    convo = r.json()
    assert "id" in convo
    assert convo["title"] == "Nova conversa"
    cid = convo["id"]

    # get it
    r = session.get(f"{API}/conversations/{cid}", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["conversation"]["id"] == cid
    assert body["messages"] == []


def test_list_conversations(session, auth_headers):
    r = session.get(f"{API}/conversations", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_conversation_not_found(session, auth_headers):
    r = session.get(f"{API}/conversations/nonexistent-id", headers=auth_headers)
    assert r.status_code == 404


def test_chat_stream_and_title(session, auth_headers):
    # create a conversation, send message via SSE, expect title update and message persistence
    r = session.post(f"{API}/conversations", headers=auth_headers)
    cid = r.json()["id"]
    msg = "Olá Aurélio, me diga em uma frase o que é amadurecer."
    with requests.post(
        f"{API}/conversations/{cid}/chat",
        json={"message": msg},
        headers=auth_headers,
        stream=True,
        timeout=60,
    ) as r:
        assert r.status_code == 200
        deltas = 0
        done_event = None
        raw_text = ""
        for line in r.iter_lines():
            if not line:
                continue
            s = line.decode()
            if s.startswith("data: "):
                payload = json.loads(s[6:])
                if "delta" in payload:
                    deltas += 1
                    raw_text += payload["delta"]
                elif "done" in payload:
                    done_event = payload
                    break
                elif "error" in payload:
                    pytest.fail(f"stream error: {payload['error']}")
        assert deltas > 0, "no text deltas received"
        assert done_event is not None
        assert done_event.get("title") is not None  # first message => title set

    # verify persistence
    time.sleep(0.5)
    r = session.get(f"{API}/conversations/{cid}", headers=auth_headers)
    body = r.json()
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][1]["role"] == "assistant"
    assert len(body["messages"][1]["content"]) > 0
    assert body["conversation"]["title"] != "Nova conversa"


def test_delete_conversation(session, auth_headers):
    r = session.post(f"{API}/conversations", headers=auth_headers)
    cid = r.json()["id"]
    r = session.delete(f"{API}/conversations/{cid}", headers=auth_headers)
    assert r.status_code == 200
    r = session.get(f"{API}/conversations/{cid}", headers=auth_headers)
    assert r.status_code == 404


# ---- TTS ----
def test_tts(session, auth_headers):
    r = session.post(f"{API}/tts", headers=auth_headers, json={"text": "Olá, eu sou Aurélio."})
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("audio/mpeg")
    assert len(r.content) > 1000


def test_tts_empty(session, auth_headers):
    r = session.post(f"{API}/tts", headers=auth_headers, json={"text": ""})
    assert r.status_code == 400


def test_tts_no_auth(session):
    r = session.post(f"{API}/tts", json={"text": "oi"})
    assert r.status_code == 401
