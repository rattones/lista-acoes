# App e landing page de produção (tarefa 005). Build a partir da raiz do repositório:
#   docker build -f infra/docker/frontend.Dockerfile .
# As variáveis VITE_* são embutidas no build: mudar o valor exige uma nova imagem.

# 1) Build do Vite: gera dist/app e dist/landing.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w frontend
COPY frontend/ frontend/

ARG VITE_API_URL=https://api.listadecompras.net
ARG VITE_APP_URL=https://app.listadecompras.net
ARG VITE_LANDING_URL=https://www.listadecompras.net
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_LANDING_URL=$VITE_LANDING_URL
RUN npm run build -w frontend

# 2) Nginx sem root: app na porta 8080 e landing na 8081 (o proxy escolhe pelo subdomínio).
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY infra/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist/app /usr/share/nginx/app
COPY --from=build /app/frontend/dist/landing /usr/share/nginx/landing
EXPOSE 8080 8081
