# Changelog

Todas as mudanças relevantes do projeto são registradas aqui, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Alterado

- ESLint usa o `@babel/eslint-parser` nos arquivos do backend, por causa dos decorators (tarefa 002).
- `@babel/core` fixado na versão 7 via `overrides` na raiz: o Jest 30 aceita o Babel 8 como peer e o instalava no lugar do 7 (tarefa 002).

### Adicionado

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
