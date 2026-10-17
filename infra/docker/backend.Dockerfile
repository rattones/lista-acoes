# API de produção (tarefa 005). Build a partir da raiz do repositório:
#   docker build -f infra/docker/backend.Dockerfile .

# 1) Transpila o código com o Babel (precisa das dependências de dev).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY comum/package.json comum/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY agentes/package.json agentes/
# --ignore-scripts: o better-sqlite3 traz o binário pronto (prebuilds/), mas o npm
# tenta compilá-lo com node-gyp (sem Python na imagem slim). O backend não depende
# de nenhum script de instalação.
RUN npm ci -w backend --ignore-scripts
COPY backend/ backend/
RUN npm run build -w backend

# 2) Imagem final: só as dependências de produção e o código transpilado.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node comum/package.json comum/
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/
COPY --chown=node:node agentes/package.json agentes/
RUN npm ci -w backend --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build --chown=node:node /app/backend/dist backend/dist
# Código compartilhado com os agentes (tarefa 035), em JavaScript puro: vai sem build.
COPY --chown=node:node comum/src comum/src
# Migrations do banco: node dist/database/cli.js migrate (tarefa 009).
COPY --chown=node:node backend/migrations backend/migrations
# Pasta do banco SQLite: recebe o volume persistente (já com o dono node).
# Destaques da landing (tarefa 034): pasta do volume compartilhado com o frontend.
RUN mkdir -p backend/data /app/destaques

WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
