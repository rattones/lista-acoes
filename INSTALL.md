# Instalação

## Requisitos

- Node.js 24 (versão fixada em `.nvmrc`; com nvm: `nvm use`)
- npm 11 ou superior

## Passos

```sh
nvm use
npm install
```

O `npm install` na raiz instala as dependências compartilhadas (ESLint, Prettier) e as dos workspaces `backend` e `frontend`.

## Variáveis de ambiente

Cada serviço tem um `.env-example` com as variáveis documentadas. Copie para `.env` e ajuste:

```sh
cp .env-example .env
cp backend/.env-example backend/.env
cp frontend/.env-example frontend/.env
```

Arquivos `.env` nunca são versionados; somente os `.env-example`.

No backend, `CORS_ORIGENS` é obrigatória: sem ela a API não inicia.

## Executar a API em desenvolvimento

```sh
npm run dev -w backend
curl http://localhost:3000/v1/health
```

## Executar o frontend em desenvolvimento

```sh
npm run dev -w frontend            # app: http://localhost:8080
npm run dev:landing -w frontend    # landing: http://localhost:8081
```

`VITE_API_URL` (base da API) e `VITE_APP_URL` (link da landing para o app) ficam em `frontend/.env`. Elas são embutidas no build, então mudar o valor exige um novo build.

## Build do frontend

```sh
npm run build -w frontend
```

Gera `frontend/dist/app` (SPA) e `frontend/dist/landing` (estática), cada uma com seus próprios assets. Ao servir o app, rotas desconhecidas precisam cair no `index.html` (fallback de SPA).

## Portas (DEV)

| Serviço      | Porta |
| ------------ | ----- |
| API          | 3000  |
| App          | 8080  |
| Landing page | 8081  |
