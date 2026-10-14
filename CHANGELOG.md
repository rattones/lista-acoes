# Changelog

Todas as mudanças relevantes do projeto são registradas aqui, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Alterado

- ESLint usa o `@babel/eslint-parser` nos arquivos do backend, por causa dos decorators (tarefa 002).
- `@babel/core` fixado na versão 7 via `overrides` na raiz: o Jest 30 aceita o Babel 8 como peer e o instalava no lugar do 7 (tarefa 002).

### Adicionado

- CI com GitHub Actions (`.github/workflows/ci.yml`) a cada push na `main` e em pull requests: lint e estrutura, testes e build do backend, testes e build do frontend, e build das imagens de PROD com smoke test da stack, em jobs paralelos (tarefa 007).
- Badge de status do CI no README (tarefa 007).
- Proteção da `main`: os quatro jobs do CI são checks obrigatórios (também para administradores), a branch precisa estar atualizada antes do merge, e force push e exclusão estão bloqueados (tarefa 007).
- Stack de PROD em `infra/docker-compose.prod.yml`: `proxy` (Nginx, único com porta publicada, `PROXY_PORTA`, padrão 80), `backend` e `frontend` na rede interna, com `restart: unless-stopped`, healthchecks e volume persistente do SQLite (tarefa 005).
- Dockerfiles de produção multi-stage: `infra/docker/backend.Dockerfile` (Node 24 slim, só dependências de produção, sem root) e `infra/docker/frontend.Dockerfile` (build do Vite servido por `nginx-unprivileged`) (tarefa 005).
- Proxy Nginx (`infra/nginx/proxy.conf`) com roteamento por subdomínio (`api.`, `app.`, `www.` e raiz), `444` para hosts desconhecidos, gzip, cabeçalhos de segurança, CSP por host e `X-Request-Id` repassado à API (tarefa 005).
- Nginx do frontend (`infra/nginx/frontend.conf`) com fallback da SPA para o `index.html` e cache longo nos assets com hash (tarefa 005).
- `infra/.env-example` com as variáveis do compose de PROD (tarefa 005).
- Smoke test de PROD (`npm run smoke:prod`, `infra/scripts/smoke-prod.mjs`): `nginx -t`, portas publicadas, os três hosts, fallback da SPA, cabeçalhos, gzip e cache (tarefa 005).
- Ambiente DEV com Docker em `infra/docker-compose.dev.yml`: `backend` (API, porta 3000) e `frontend` (app 8080 e landing 8081 no mesmo container), com hot reload por volumes montados (tarefa 004).
- Imagem de desenvolvimento `infra/docker/dev.Dockerfile` (Node 24, usuário `node`, dependências na imagem) e `.dockerignore` (tarefa 004).
- Volume nomeado `dados` para o arquivo SQLite em `backend/data` (tarefa 004).
- Proxy `/v1` do Vite para a API (`API_PROXY`): em DEV, o app chama a API pela mesma origem e funciona em `casa-ratton.local` e `casaratton.ddns.net` (tarefa 004).
- `HOSTS_PERMITIDOS`: hostnames aceitos pelo servidor do Vite além de localhost (tarefa 004).
- Smoke test do DEV (`npm run smoke:dev`, `infra/scripts/smoke-dev.mjs`): health da API, app, landing, proxy, hostnames e CORS (tarefa 004).
- Script `infra/scripts/firewall-dev.sh` para abrir as portas 3000, 8080 e 8081 no ufw (tarefa 004).

- Frontend em `frontend/` com Vue 3, Vite, Vuetify 4, Pinia e Vue Router, em JavaScript (tarefa 003).
- Dois pontos de entrada com builds separados: `app` (SPA, porta 8080) e `landing` (página estática, porta 8081), gerando `dist/app` e `dist/landing` (tarefa 003).
- Layout do app com barra superior e alternância de tema claro/escuro (padrão segue a preferência do sistema) (tarefa 003).
- Router com página inicial e página 404 para rotas desconhecidas (tarefa 003).
- Cliente HTTP (`fetch`) com URL base em `VITE_API_URL` e erros da API convertidos em `ErroApi` (tarefa 003).
- Landing page provisória com link para o app em `VITE_APP_URL` (padrão: `https://app.listadecompras.net`), sem link de cadastro (tarefa 003).
- Testes do frontend com Vitest, Vue Test Utils e jsdom (tarefa 003).
- ESLint com `eslint-plugin-vue` para os arquivos do frontend (tarefa 003).
- Backend NestJS em JavaScript com Babel 7, prefixo global `/v1` e rota `GET /v1/health` (tarefa 002).
- Configuração por variáveis de ambiente validada na inicialização (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `CORS_ORIGENS`) (tarefa 002).
- CORS restrito às origens configuradas (tarefa 002).
- Filtro global de erros no formato `{ erro, mensagem, detalhes }` e `ValidacaoPipe` com esquemas Joi (tarefa 002).
- Logs estruturados em JSON (pino) com request id (`x-request-id`) (tarefa 002).
- Testes unitários e e2e do backend com Jest e Supertest (tarefa 002).

- Estrutura do monorepo com npm workspaces `backend` e `frontend` e pasta `infra/` (tarefa 001).
- Scripts agregados `test`, `lint`, `dev` e `format` na raiz (tarefa 001).
- ESLint, Prettier e EditorConfig compartilhados na raiz (tarefa 001).
- Versão do Node fixada em 24 (`.nvmrc` e `engines`) (tarefa 001).
- `.env-example` na raiz, no backend e no frontend (tarefa 001).
- Teste de verificação da estrutura do repositório em `infra/scripts/estrutura.test.mjs` (tarefa 001).
