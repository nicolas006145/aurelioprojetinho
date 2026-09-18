# Deploy do Aurélio

## Frontend na Netlify

1. Suba este projeto para um repositorio do GitHub.
2. Na Netlify, clique em `Add new site` e depois `Import from Git`.
3. Escolha o repositorio.
4. A Netlify vai ler o arquivo `netlify.toml` automaticamente.
5. Em `Site configuration > Environment variables`, adicione:

```txt
REACT_APP_BACKEND_URL=https://url-do-seu-backend
REACT_APP_GOOGLE_CLIENT_ID=client-id-do-google.apps.googleusercontent.com
```

O frontend gera a pasta `frontend/build`. As rotas como `/chat` funcionam por causa do redirect para `index.html`.

## Backend

Este projeto tem backend em FastAPI, entao a Netlify sozinha nao roda o chat, login, voz, banco e IA.

Hospede a pasta `backend` em um servico como Render, Railway ou Fly.io e configure:

```txt
MONGO_URL=mongodb+srv://usuario:senha@cluster.mongodb.net
DB_NAME=aurelio
JWT_SECRET=troque-por-um-segredo-forte
EMERGENT_LLM_KEY=sua-chave-de-ia
GOOGLE_CLIENT_ID=client-id-do-google.apps.googleusercontent.com
CORS_ORIGINS=https://seu-site.netlify.app
```

Comando de start recomendado:

```bash
uvicorn server:app --host 0.0.0.0 --port $PORT
```

## Google Login

No Google Cloud Console, crie um OAuth Client ID do tipo Web Application e adicione a URL da Netlify em `Authorized JavaScript origins`, por exemplo:

```txt
https://seu-site.netlify.app
```

Use o mesmo Client ID em `REACT_APP_GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_ID`.
