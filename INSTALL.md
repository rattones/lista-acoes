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

## Portas (DEV)

| Serviço      | Porta |
| ------------ | ----- |
| API          | 3000  |
| App          | 8080  |
| Landing page | 8081  |
