# Changelog

Todas as mudanças relevantes do projeto são registradas aqui, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Alterado

- ESLint usa o `@babel/eslint-parser` nos arquivos do backend, por causa dos decorators (tarefa 002).
- `@babel/core` fixado na versão 7 via `overrides` na raiz: o Jest 30 aceita o Babel 8 como peer e o instalava no lugar do 7 (tarefa 002).

### Adicionado

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
