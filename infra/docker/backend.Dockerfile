# API de produção (tarefa 005). Build a partir da raiz do repositório:
#   docker build -f infra/docker/backend.Dockerfile .

# 1) Transpila o código com o Babel (precisa das dependências de dev).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend
COPY backend/ backend/
RUN npm run build -w backend

# 2) Imagem final: só as dependências de produção e o código transpilado.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/
RUN npm ci -w backend --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/backend/dist backend/dist
# Pasta do banco SQLite: recebe o volume persistente (já com o dono node).
RUN mkdir -p backend/data

WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
