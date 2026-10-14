# Changelog

Todas as mudanças relevantes do projeto são registradas aqui, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Alterado

- `ativos.monitorar` e `ativos.removido_em` saem do schema: `status` (`ativo`/`inativo`) decide se o ativo entra no relatório e `excluido_em` marca a exclusão lógica (tarefa 010).
- POLICY informa que o primeiro admin é cadastrado no servidor, não por convite (tarefa 010).
- O CLI do banco (`db:migrate`, `db:status`, `db:admin`) exige só `DB_ARQUIVO` (com padrão), sem validar as demais variáveis da API como `CORS_ORIGENS` (tarefa 010).
- Imagens Docker instalam as dependências com `npm ci --ignore-scripts`: o better-sqlite3 traz o binário pronto, mas o npm tentava compilá-lo com node-gyp (sem Python na imagem slim). A imagem DEV roda em seguida só os scripts de `@parcel/watcher` e `unrs-resolver`; a de PROD passa a levar a pasta `migrations/`, que o compose DEV também monta (tarefa 009).
- Proxy de PROD passa a usar a imagem oficial `nginx:alpine` (mestre como root, para ler a chave da Let's Encrypt), com healthcheck interno em `127.0.0.1:8090/saude` (tarefa 006).
- Smoke de PROD testa tudo em HTTPS e inclui redirect, HSTS, desafio ACME, recusa de host desconhecido no 443 e o serviço certbot; o CI gera o certificado de teste antes de subir a stack (tarefa 006).
- Host desconhecido no HTTPS tem o handshake TLS recusado (`ssl_reject_handshake`) (tarefa 006).
- ESLint usa o `@babel/eslint-parser` nos arquivos do backend, por causa dos decorators (tarefa 002).
- `@babel/core` fixado na versão 7 via `overrides` na raiz: o Jest 30 aceita o Babel 8 como peer e o instalava no lugar do 7 (tarefa 002).

### Adicionado

- Schema inicial do banco (`backend/migrations/0001_schema_inicial.sql`): `ativos`, `execucoes`, `sinais` (com `ativo_id`), `precos_diarios`, `noticias`, `usuarios` e `agentes_tokens`, com exclusão lógica (`excluido_em`) em todas, chaves estrangeiras com cascata, índices por ativo e data, e as views `v_ativos_monitorados`, `v_resumo_atual`, `v_historico_nota` e `v_proximos_eventos` ignorando registros excluídos (tarefa 010).
- Carga inicial (`0002_carga_inicial.sql`) com os 6 ativos do início do projeto (tarefa 010).
- `npm run db:admin -w backend -- --email <e-mail> --nome <nome>`: cria um usuário admin, com a senha pedida sem eco no terminal ou lida da entrada (tarefa 010).
- Hash de senha argon2id (`@node-rs/argon2`) e política de senha com mínimo de 10 caracteres em `backend/src/auth/senha.js` (tarefa 010).
- `POLICY.md`: política de privacidade inicial (LGPD), com dados coletados, logs de acesso, e-mails pelo Gmail, armazenamento, compartilhamento, exclusão permanente da conta e direitos do titular (tarefa 008).
- README com visão geral, diagrama da arquitetura (containers e subdomínios), stack, "Como rodar em DEV" e "Como testar"; INSTALL com o Docker nos requisitos (tarefa 008).
- Teste de estrutura da documentação base: README, CHANGELOG, INSTALL e POLICY existem e têm as seções obrigatórias (tarefa 008).
- Banco SQLite com better-sqlite3: `DatabaseModule` global expondo a conexão (`CONEXAO_DB`) com `foreign_keys`, WAL e `busy_timeout`, fechada no encerramento da API; arquivo em `DB_ARQUIVO` (padrão `data/monitor.db`) (tarefa 009).
- Executor de migrations: `backend/migrations/NNNN_descricao.sql` aplicadas em ordem, cada uma em transação, com controle em `schema_migrations`; comandos `npm run db:migrate -w backend` e `npm run db:status -w backend` (na imagem de PROD: `node dist/database/cli.js migrate|status`) (tarefa 009).
- HTTPS em PROD com certificado da Let's Encrypt (um só, com `listadecompras.net`, `www.`, `app.` e `api.`): proxy na porta 443 (`PROXY_PORTA_HTTPS`) com TLS 1.2/1.3 e HTTP/2, redirect 301 do HTTP para o HTTPS e HSTS de 1 ano (tarefa 006).
- Serviço `certbot` no compose de PROD, com renovação automática a cada 12 h pelo desafio HTTP-01 servido no proxy; o proxy recarrega o Nginx a cada 6 h (tarefa 006).
- `infra/scripts/certificado-inicial.sh`: emissão inicial do certificado (`LETSENCRYPT_EMAIL`, com ensaio em `LETSENCRYPT_STAGING=1`) (tarefa 006).
- Certificado autoassinado para testes locais e CI (`--profile teste run certificado-teste`) (tarefa 006).
- `npm run verifica:https` (`infra/scripts/verifica-https.mjs`): certificado válido (alerta a menos de 15 dias do vencimento), HSTS e 301 nos quatro hosts de PROD (tarefa 006).
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
