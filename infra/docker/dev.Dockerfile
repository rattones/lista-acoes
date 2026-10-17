# Imagem de desenvolvimento (tarefa 004), usada pelos serviços backend e frontend
# do infra/docker-compose.dev.yml. Contém só as dependências: o código entra por
# volumes montados, com hot reload. Mudou alguma dependência? Refaça a imagem
# com --build.
FROM node:24-slim

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node comum/package.json comum/
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/
COPY --chown=node:node agentes/package.json agentes/
# --ignore-scripts: o better-sqlite3 traz o binário pronto (prebuilds/), mas o npm
# tenta compilá-lo com node-gyp (sem Python na imagem slim). Os únicos scripts de
# instalação necessários (frontend) rodam em seguida com npm rebuild.
RUN npm ci --ignore-scripts && npm rebuild @parcel/watcher unrs-resolver \
  && npm cache clean --force

# Pasta do banco SQLite: recebe o volume nomeado (já com o dono node).
RUN mkdir -p backend/data /app/destaques
