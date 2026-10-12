# Imagem de desenvolvimento (tarefa 004), usada pelos serviços backend e frontend
# do infra/docker-compose.dev.yml. Contém só as dependências: o código entra por
# volumes montados, com hot reload. Mudou alguma dependência? Refaça a imagem
# com --build.
FROM node:24-slim

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/
RUN npm ci && npm cache clean --force

# Pasta do banco SQLite: recebe o volume nomeado (já com o dono node).
RUN mkdir -p backend/data
