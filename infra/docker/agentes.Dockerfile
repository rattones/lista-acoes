# Agentes coletores de PROD (tarefa 035). Build a partir da raiz do repositório:
#   docker build -f infra/docker/agentes.Dockerfile .
# JavaScript puro (CommonJS): sem etapa de build, só as dependências de produção.
FROM node:24-slim
ENV NODE_ENV=production \
    TZ=America/Sao_Paulo
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node comum/package.json comum/
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/
COPY --chown=node:node agentes/package.json agentes/
# --ignore-scripts: os agentes não dependem de nenhum script de instalação.
RUN npm ci -w agentes --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node comum/src comum/src
COPY --chown=node:node agentes/src agentes/src

WORKDIR /app/agentes
# Processo residente com o agendador; rodada avulsa: docker compose run --rm agentes
#   node src/cli.js coletar-precos [--historico] [--ativo CODIGO]
CMD ["node", "src/main.js"]
