# Lista de Ações

[![CI](https://github.com/rattones/lista-acoes/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rattones/lista-acoes/actions/workflows/ci.yml)

Gerenciador de ações: acompanha o mercado, armazena os dados coletados por agentes e apoia a decisão de compra e venda.

## Visão geral

- **Agentes coletores** (etapa futura) enviam à API os preços diários e as notícias dos ativos monitorados, autenticados por API key.
- Um **agente de decisão** externo (etapa futura) lê esses dados e grava a nota de cada ativo (1 a 5). A API só armazena e fornece os dados; ela não calcula a nota.
- O **app** mostra o dashboard, os ativos monitorados e os usuários. O acesso é só por convite: não existe cadastro aberto.
- A **landing page** apresenta o projeto e leva ao app.
- **Bots** de compra e venda na XP Investimentos ficam para o fim do projeto.

Situação atual: fundação pronta (monorepo, Docker em DEV e PROD, HTTPS, CI) e executor de migrations do banco. O schema, o CRUD e a autenticação são as próximas etapas ([issues](https://github.com/rattones/lista-acoes/issues) e [projeto](https://github.com/users/rattones/projects/2)).

## Arquitetura

Em PROD, tudo roda em containers Docker numa VPS. Só o proxy publica portas e escolhe o destino pelo subdomínio:

```mermaid
flowchart LR
  navegador([Navegador]) -->|HTTPS 443| proxy
  agentes([Agentes]) -->|HTTPS + API key| proxy
  subgraph VPS["VPS (Docker)"]
    proxy["proxy<br/>Nginx: TLS, redirect 80→443"]
    certbot["certbot<br/>renova o certificado"]
    backend["backend<br/>API NestJS :3000"]
    frontend["frontend<br/>Nginx: app :8080, landing :8081"]
    db[("SQLite<br/>volume dados")]
    proxy -->|api.listadecompras.net| backend
    proxy -->|app.listadecompras.net| frontend
    proxy -->|www. e raiz| frontend
    backend --- db
    certbot -. certificado .- proxy
  end
```

Em DEV (servidor casa-ratton), não há proxy: cada serviço usa sua porta (API 3000, app 8080, landing 8081).

## Stack

| Camada         | Tecnologia                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Backend        | Node.js 24, NestJS 11 em JavaScript (Babel 7), Joi, pino                    |
| Banco          | SQLite com better-sqlite3 e SQL puro, migrations `.sql` versionadas         |
| Frontend       | Vue 3, Vite, Vuetify, Pinia, Vue Router; Chart.js no dashboard (tarefa 025) |
| Testes         | Jest + Supertest (backend), Vitest + Vue Test Utils (frontend)              |
| Infraestrutura | Docker Compose, Nginx, Let's Encrypt (certbot), GitHub Actions              |
| E-mail         | Gmail SMTP com nodemailer (tarefa 013)                                      |

## Estrutura

Monorepo com npm workspaces:

| Pasta       | Conteúdo                                                     |
| ----------- | ------------------------------------------------------------ |
| `backend/`  | API (NestJS) — `api.listadecompras.net`                      |
| `frontend/` | App (Vue) e landing page — `app.` e `www.listadecompras.net` |
| `infra/`    | Docker, Nginx e scripts                                      |

## Comandos (na raiz)

| Comando             | O que faz                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| `npm install`       | Instala as dependências da raiz e dos workspaces                       |
| `npm test`          | Verifica a estrutura do repositório e roda os testes de cada workspace |
| `npm run lint`      | ESLint e verificação de formatação do Prettier                         |
| `npm run format`    | Formata os arquivos com o Prettier                                     |
| `npm run dev`       | Sobe o ambiente de desenvolvimento de cada workspace                   |
| `npm run smoke:dev` | Smoke test do ambiente DEV no Docker (containers no ar)                |

## Como rodar em DEV

Com Docker, no servidor casa-ratton (API 3000, app 8080, landing 8081, com hot reload):

```sh
echo "JWT_SEGREDO=$(openssl rand -base64 48)" >> backend/.env   # uma vez: segredo dos tokens
docker compose -f infra/docker-compose.dev.yml up -d --build
docker compose -f infra/docker-compose.dev.yml exec backend npm run db:migrate -w backend
docker compose -f infra/docker-compose.dev.yml exec backend npm run db:admin -w backend -- --email <e-mail> --nome <nome>
docker compose -f infra/docker-compose.dev.yml exec backend npm run db:seed-dev -w backend   # dados fictícios (dashboard)
npm run smoke:dev
```

Sem Docker, com Node 24 (`nvm use`):

```sh
npm install
cp backend/.env-example backend/.env
echo "JWT_SEGREDO=$(openssl rand -base64 48)" >> backend/.env
npm run db:migrate -w backend
npm run db:admin -w backend -- --email <e-mail> --nome <nome>
npm run dev
```

Hostnames, firewall e variáveis: [INSTALL.md](INSTALL.md#ambiente-dev-com-docker-servidor-casa-ratton).

## Como testar

O desenvolvimento segue TDD: o teste novo é escrito antes e precisa falhar antes da implementação.

| Comando                  | O que testa                                                |
| ------------------------ | ---------------------------------------------------------- |
| `npm test`               | Tudo: estrutura do repositório, backend e frontend         |
| `npm run test:estrutura` | Estrutura do monorepo, `.gitignore` e documentação base    |
| `npm test -w backend`    | Unitários e e2e da API (banco SQLite em memória)           |
| `npm test -w frontend`   | Componentes, rotas e cliente HTTP do app e da landing      |
| `npm run lint`           | ESLint e Prettier                                          |
| `npm run smoke:dev`      | Ambiente DEV no ar (containers rodando)                    |
| `npm run smoke:prod`     | Stack de PROD local com certificado de teste (ver INSTALL) |
| `npm run verifica:https` | Certificado, HSTS e redirect nos hosts reais de PROD       |

O CI roda lint, estrutura, testes, builds e o smoke de PROD em todo pull request (ver [Integração contínua](#integração-contínua)).

## Backend (API)

NestJS em JavaScript (decorators via Babel 7), com todas as rotas sob o prefixo `/v1`. Os decorators de parâmetro (`@Body()`, `@Query()`, `@Inject()` no construtor...) são convertidos por um plugin local no `backend/babel.config.js`, no formato do `__param` do TypeScript.

| Comando                                                         | O que faz                                        |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `npm run dev -w backend`                                        | Sobe a API com recarga automática (porta `PORT`) |
| `npm test -w backend`                                           | Testes unitários e e2e (Jest + Supertest)        |
| `npm run build -w backend`                                      | Transpila `src/` para `dist/`                    |
| `npm run start -w backend`                                      | Executa a versão transpilada                     |
| `npm run db:migrate -w backend`                                 | Aplica as migrations pendentes do banco          |
| `npm run db:status -w backend`                                  | Lista as migrations aplicadas e pendentes        |
| `npm run db:admin -w backend -- --email <e-mail> --nome <nome>` | Cria um usuário admin (pede a senha)             |
| `npm run email:teste -w backend -- --para <e-mail>`             | Envia um e-mail de teste pelo SMTP configurado   |

| Rota             | Resposta                                |
| ---------------- | --------------------------------------- |
| `GET /v1/health` | `{ "status": "ok", "versao": "x.y.z" }` |

### Autenticação e permissões

Login por e-mail e senha. Toda rota exige `Authorization: Bearer <token_acesso>`, exceto `GET /v1/health`, login, refresh, as rotas de recuperação de senha e a validação e o aceite de convites.

| Rota                                    | O que faz                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/login`                   | `{ email, senha }` → `{ token_acesso, tipo: "Bearer", expira_em_segundos: 900, usuario }` + cookie do refresh                                                         |
| `POST /v1/auth/refresh`                 | Com o cookie `refresh_token`: novo token de acesso e cookie renovado                                                                                                  |
| `POST /v1/auth/logout`                  | Encerra **todas** as sessões do usuário e apaga o cookie (204)                                                                                                        |
| `GET /v1/auth/eu`                       | `{ id, email, nome, papel }` do usuário logado                                                                                                                        |
| `PATCH /v1/auth/eu`                     | `{ nome?, senha_atual?, nova_senha? }` → `{ usuario }`; com troca de senha, encerra as outras sessões e devolve uma sessão nova (como o login). E-mail não muda (400) |
| `DELETE /v1/auth/eu`                    | `{ senha }` → apaga a conta de vez, com tudo o que o usuário criou (204); 403 `senha_incorreta`; 409 `ultimo_admin`                                                   |
| `POST /v1/auth/recuperar-senha`         | `{ email }` → sempre 202; se o e-mail é de um usuário ativo, envia o link de redefinição                                                                              |
| `POST /v1/auth/redefinir-senha/validar` | `{ token }` → 200 `{ email }`; 400 `token_invalido`; 410 `token_expirado`                                                                                             |
| `POST /v1/auth/redefinir-senha`         | `{ token, senha }` → grava a nova senha, zera o bloqueio e encerra as sessões                                                                                         |
| `POST /v1/convites` (admin)             | `{ email, papel }` → envia o convite (201 `{ email, papel, expira_em }`); 409 se o e-mail já está cadastrado; 503 se o e-mail falhar                                  |
| `POST /v1/convites/validar`             | `{ token }` → 200 `{ email, papel, expira_em }`; 400 `token_invalido`; 410 `token_expirado`; 409 se o e-mail já foi cadastrado                                        |
| `POST /v1/convites/aceitar`             | `{ token, nome, senha, email_confirmado }` → cria o usuário com o e-mail e o papel do convite (201)                                                                   |

- **Tokens:** JWT de acesso de 15 minutos; refresh token de 7 dias, só em cookie `httpOnly`, `SameSite=Strict`, `Path=/v1/auth` e `Secure` em produção (`COOKIE_SEGURO`). Assinados com `JWT_SEGREDO`.
- **Sessão:** os tokens levam a `versao_sessao` do usuário. A cada requisição, a API confere no banco se o usuário existe, está ativo, não foi excluído e tem a mesma versão. Logout (e, nas próximas tarefas, troca de senha) incrementa a versão e derruba na hora os tokens já emitidos. Papel, desativação e exclusão valem imediatamente.
- **Bloqueio:** 5 senhas erradas seguidas bloqueiam a conta por 15 minutos (423 `bloqueado`, com `detalhes.segundos_restantes`). Durante o bloqueio, nem a senha certa entra, e a senha não é conferida. Login certo zera as tentativas e registra `ultimo_login_em`.
- **Erros:** e-mail inexistente, senha errada, usuário inativo ou excluído → o mesmo 401 `E-mail ou senha inválidos`, com tempo de resposta equivalente.
- **Recuperação de senha:** link sem estado no banco, válido por 24 horas: `APP_URL/redefinir-senha#t=<token>`. O token (`src/auth/token-assinado.js`) é o payload `{ id, email, exp }` em base64url mais um HMAC-SHA256 com chave derivada do `JWT_SEGREDO` e do `senha_hash` atual: trocar a senha invalida todos os links já enviados. O token vai no fragmento do link e no corpo das requisições, nunca na URL (que vai para os logs). O pedido responde 202 na hora, exista ou não o e-mail, e o envio acontece em segundo plano. Limites: 3 pedidos por hora por e-mail e 10 por 15 minutos por IP.
- **Convites:** só admin convida e escolhe o papel. Link sem estado, válido por 72 horas: `APP_URL/cadastro#c=<token>`, com `{ email, papel, por, exp }` assinado por uma chave derivada do `JWT_SEGREDO` só para convites. O e-mail do novo usuário vem do token: o formulário só o confirma (`email_confirmado`). O convite deixa de valer quando expira, quando o e-mail é cadastrado ou quando quem convidou deixa de ser um admin ativo. Não há cancelamento, e reenviar gera um link novo sem invalidar o anterior. Limite de 20 validações ou aceites por 15 minutos por IP.
- **Própria conta:** `PATCH` e `DELETE /v1/auth/eu` conferem a senha atual (403 `senha_incorreta`), com limite de 10 por 15 minutos por IP. A exclusão é física: apaga o usuário e, pelas chaves estrangeiras `ON DELETE CASCADE`, tudo o que ele criou (hoje, as API keys). O último admin ativo não pode se excluir (409). API key nunca acessa essas rotas.
- **Rate limit:** 10 tentativas de login por minuto por IP (429). Atrás do Nginx, o IP vem do `X-Forwarded-For` (`CONFIAR_PROXY=1` em PROD).

| Papel    | Pode                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| `leitor` | Listar e obter `ativos`, `execucoes`, `sinais`, `precos` e `noticias`; `GET /auth/eu`; logout                         |
| `admin`  | Tudo do leitor, mais criar, atualizar, excluir (lógica e física), restaurar, lotes, `incluir_excluidos` e `/usuarios` |

Sem token: 401 `nao_autenticado`. Papel insuficiente: 403 `proibido`. No código, `@Publico()` libera uma rota e `@Papeis('admin')` restringe uma rota ou um controller.

### API keys dos agentes

Os agentes autenticam com uma API key, no mesmo cabeçalho do usuário: `Authorization: Bearer la_<prefixo>_<segredo>`. Cada chave é de um agente, tem escopos, não expira e pode ser revogada. Só o admin gerencia as chaves.

| Rota                                  | O que faz                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/agentes-tokens`             | `{ nome, escopos }` → 201 com o registro e a `chave` completa, **exibida só nesta resposta**                         |
| `GET /v1/agentes-tokens`              | Lista paginada (como no CRUD), sem segredo nem hash; inclui as revogadas (`revogado_em`)                             |
| `GET /v1/agentes-tokens/:id`          | Obtém uma chave, sem segredo nem hash                                                                                |
| `GET /v1/agentes-tokens/escopos`      | Escopos disponíveis                                                                                                  |
| `POST /v1/agentes-tokens/:id/revogar` | Revoga a chave (200); 409 se já está revogada                                                                        |
| `DELETE`, `POST /:id/restaurar`       | Exclusão lógica, física (`?permanente=true`) e restauração, como no CRUD. Não há `PATCH`: crie outra chave e revogue |

| Escopo                                                          | Libera                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `ativos:read`                                                   | `GET /v1/ativos` e `GET /v1/ativos/:id`                 |
| `execucoes:read`, `sinais:read`, `precos:read`, `noticias:read` | Listar e obter o recurso                                |
| `execucoes:write`, `sinais:write`                               | `POST` e `PATCH` do recurso                             |
| `precos:write`, `noticias:write`                                | `POST` e `PATCH` do recurso e `POST /v1/{recurso}/lote` |

- **Armazenamento:** a chave é `la_` + prefixo de 8 caracteres hexadecimais (público, usado na busca) + segredo de 32 (128 bits). O banco guarda só o prefixo e o SHA-256 do segredo, comparado em tempo constante. Cada uso atualiza `ultimo_uso_em`.
- **Validade:** chave inválida, revogada ou excluída → 401 `nao_autenticado`. A chave também deixa de valer enquanto quem a criou não for um admin ativo e não excluído, e é apagada se o usuário for apagado.
- **Permissões:** rota fora dos escopos da chave → 403 `proibido`. Exclusão, restauração, `incluir_excluidos`, `/usuarios`, `/agentes-tokens` e `/auth` nunca aceitam API key. No código, `@Escopos('precos:write')` libera uma rota para a chave e `@EscoposCrud({ leitura, escrita })` libera as rotas herdadas do CRUD; a rota continua aceitando o JWT de usuário, com as regras de `@Papeis`.

### CRUD dos recursos

Recursos: `ativos`, `execucoes`, `sinais`, `precos` (tabela `precos_diarios`), `noticias` e `usuarios`. Todas as rotas exigem autenticação (ver [Autenticação e permissões](#autenticação-e-permissões)).

| Rota                                       | O que faz                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /v1/{recurso}`                        | Lista paginada: `{ dados, paginacao: { pagina, por_pagina, total, total_paginas } }` |
| `GET /v1/{recurso}/:id`                    | Obtém um registro (404 se não existe ou está excluído)                               |
| `POST /v1/{recurso}`                       | Cria (201); não existe para `usuarios` (cadastro só por convite, tarefa 015)         |
| `PATCH /v1/{recurso}/:id`                  | Atualiza só os campos enviados (ao menos um)                                         |
| `DELETE /v1/{recurso}/:id`                 | Exclusão lógica (204): preenche `excluido_em`                                        |
| `DELETE /v1/{recurso}/:id?permanente=true` | Exclusão física (204), inclusive de registro já excluído                             |
| `POST /v1/{recurso}/:id/restaurar`         | Desfaz a exclusão lógica (409 se o registro não está excluído)                       |
| `POST /v1/precos/lote`                     | Upsert de até 1000 preços por `(ativo_id, data)`: `{ inseridos, atualizados }`       |
| `POST /v1/noticias/lote`                   | Upsert de até 1000 notícias pela `url`: `{ inseridos, atualizados }`                 |

- **Listagem:** `pagina` (padrão 1), `por_pagina` (padrão 20, máximo 100), `ordenar` (`campo` ou `-campo` para decrescente; padrão `id`), filtros de igualdade por recurso (ex.: `ativos?status=inativo&tipo=acao`) e `incluir_excluidos=true`. Parâmetro desconhecido responde 400.
- **Validação:** esquemas Joi de cada recurso, com os mesmos valores permitidos pelos `CHECK` do schema. Campo desconhecido responde 400.
- **Conflitos:** valor único repetido (ex.: código de ativo, URL de notícia) → 409 `conflito`, com o campo em `detalhes`; registro relacionado inexistente (ex.: `ativo_id`) → 422 `entidade_invalida`.
- **Lotes:** gravados numa transação (se um item falhar, nada é gravado). No conflito, só os campos enviados são alterados, e um registro excluído logicamente continua excluído.
- **Booleanos** (`concordam`, `mm50_subindo`, `usuarios.ativo`...) são aceitos como `true`/`false` e devolvidos como `1`/`0`.
- **Sinais:** o código do ativo (`ativo`) é preenchido a partir do `ativo_id` e não é aceito no payload.
- **Usuários:** `senha_hash` nunca sai da API. Pelo `PATCH`, só `nome`, `papel` e `ativo` (o e-mail não muda; a senha tem fluxo próprio).
- **Corpo das requisições:** JSON de até 1 MB.

- **Erros:** toda resposta de erro segue o formato `{ "erro": "codigo", "mensagem": "texto", "detalhes": ... }`, com códigos como `requisicao_invalida` (400), `nao_encontrado` (404), `conflito` (409), `payload_muito_grande` (413), `entidade_invalida` (422) e `erro_interno` (500).
- **Validação:** payloads são validados com esquemas Joi (`ValidacaoPipe`); a falha responde 400 com a lista de campos em `detalhes`.
- **Configuração:** variáveis de ambiente validadas na inicialização; a API não sobe se faltar alguma obrigatória (ver `backend/.env-example`).
- **Logs:** JSON (pino), com request id em cada linha; o `x-request-id` recebido é reaproveitado ou gerado e devolvido na resposta. A linha de cada requisição tem só `id`, `method`, `url`, `remoteAddress`, `userAgent`, o `statusCode` e o `responseTime`: nenhum cabeçalho é gravado, então credenciais (`Authorization`, `Cookie`, `X-Api-Key`, `Set-Cookie`) nunca chegam ao log. Campos `senha`, `senha_hash` e `token` em objetos registrados pelo código saem como `[oculto]` (`src/comum/log.js`).
- **Rotação dos logs:** todos os containers (DEV e PROD) usam `json-file` com até 5 arquivos de 10 MB por serviço.
- **E-mail:** `MailModule` com `MailService.enviar({ para, assunto, template, dados })`, via Gmail SMTP com senha de app (nodemailer). Templates `convite` e `recuperacao-senha` (HTML e texto, em `src/mail/templates.js`, com os dados escapados). `montarLink(caminho, { t })` monta o link a partir de `APP_URL`, com os parâmetros no fragmento (`#t=...`), que o navegador não envia ao servidor. Falha de envio lança `ErroEnvioEmail` (503 `falha_envio_email` se não for tratado). O log registra o template e o destinatário mascarado (`f***@dominio`), nunca o conteúdo. Sem `SMTP_USER`/`SMTP_PASS` (fora de produção), o envio fica desligado.
- **CORS:** liberado somente para as origens em `CORS_ORIGENS`.
- **Banco:** SQLite (better-sqlite3, SQL puro) no arquivo `DB_ARQUIVO` (padrão `data/monitor.db`). O `DatabaseModule` abre uma conexão única com `foreign_keys = ON`, `journal_mode = WAL` e `busy_timeout = 5000`, injetada com `@Dependencies(CONEXAO_DB)`, e a fecha quando a API encerra.
- **Migrations:** arquivos `backend/migrations/NNNN_descricao.sql`, aplicados em ordem pelo `db:migrate`, cada um em uma transação e registrado em `schema_migrations (versao, nome, aplicada_em)`. Migration já registrada não roda de novo; se uma falhar, ela é desfeita e as seguintes não rodam. A API não aplica migrations ao iniciar.
- **Schema** (`0001_schema_inicial.sql`): `ativos`, `execucoes`, `sinais` (ligados a `ativos` por `ativo_id`), `precos_diarios`, `noticias`, `usuarios` e `agentes_tokens`, todas com exclusão lógica por `excluido_em` (NULL = registro ativo), e as views `v_ativos_monitorados` (`status = 'ativo'`), `v_resumo_atual`, `v_historico_nota` e `v_proximos_eventos`, que ignoram registros excluídos. Apagar fisicamente um ativo apaga seus preços e sinais (notícias perdem o vínculo); apagar um usuário apaga suas API keys. Referência completa: `.context/SCHEMA.sql`.
- **Vínculo com usuário:** toda tabela nova com chave estrangeira para `usuarios` deve declarar `ON DELETE CASCADE`, para a exclusão de conta não deixar dados do usuário para trás. O `schema.test.js` falha se alguma não declarar.
- **Carga inicial** (`0002_carga_inicial.sql`): os 6 ativos do início do projeto (CSCO, GOOGL, ORCL, PETR4, TSLA e USDT-BRL). O primeiro admin não é versionado: é criado com `db:admin`.
- **Senhas:** hash argon2id (`@node-rs/argon2`) e mínimo de 10 caracteres (`src/auth/senha.js`).

### Wrapper de dados de ativos

Monta o cadastro de um ativo a partir do link da página dele no Google Finance ou no Yahoo Finance. Só admin usa.

| Rota                                  | O que faz                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/ativos/pre-visualizar`      | `{ url }` → `{ ativo, cotacao }`: os campos de `ativos` preenchidos (para enviar ao `POST /v1/ativos`) e a última cotação. **Não grava nada**        |
| `POST /v1/ativos/:id/atualizar-dados` | Refaz a busca pela `url_pagina` e atualiza `nome`, `tipo`, `bolsa`, tickers e URLs; código, `status` e `observacao` não mudam → `{ ativo, cotacao }` |

| Link aceito                                                               | Exemplo                      |
| ------------------------------------------------------------------------- | ---------------------------- |
| `google.com/finance/quote/{TICKER}:{BOLSA}` (também `google.com.br`)      | `PETR4:BVMF`, `CSCO:NASDAQ`  |
| `google.com/finance/quote/{BASE}-{COTACAO}`                               | `USDT-BRL`, `USD-BRL`        |
| `finance.yahoo.com/quote/{SÍMBOLO}` (também `br.financas.yahoo.com` etc.) | `PETR4.SA`, `BRL=X`, `^BVSP` |

- **Fontes:** o Google Finance não tem API: da URL só sai o ticker. Ações, ETFs, índices e moedas → Yahoo (chart API; o tipo vem do `instrumentType`). Cripto e stablecoins → histórico na Binance e cotação no CoinGecko; sem o par na Binance, o histórico vem do Yahoo (só para pares em dólar). Ações da B3 usam o Yahoo (`.SA`), não a brapi.
- **Bolsas:** mapa Google ↔ Yahoo em `src/wrapper/urls.js` (`BVMF`→`.SA`, `NASDAQ`/`NYSE`/`NYSEARCA` sem sufixo, `TSE`→`.TO`, `LON`→`.L`...) e os índices `IBOV`, `.INX`, `.DJI` e `.IXIC`. Bolsa sem mapa → 400.
- **Substitutos:** o Yahoo não cota stablecoin contra outra moeda nem cripto fora do dólar: `USDT-BRL` usa `BRL=X` e `BTC-BRL` usa `BTC-USD` nos indicadores, com uma `observacao` explicando.
- **Erros:** link de outro site ou fora do formato → 400 `url_nao_suportada`; ticker que a fonte não conhece → 422 `ativo_nao_encontrado`; fonte fora do ar → 502 `fonte_indisponivel`, com o nome da fonte.
- **Cliente HTTP** (`src/wrapper/cliente-http.js`): timeout por tentativa (`WRAPPER_TIMEOUT_MS`), até `WRAPPER_TENTATIVAS` tentativas com backoff exponencial em erro de rede, 429 e 5xx, cache em memória de `WRAPPER_CACHE_SEGUNDOS` para respostas 2xx e `User-Agent` configurável (`WRAPPER_USER_AGENT`).
- **Testes:** usam respostas reais gravadas em `backend/test/fixtures/wrapper/` e não vão à rede.

## Frontend (app e landing page)

Vue 3 + Vite + Vuetify + Pinia + Vue Router, em JavaScript. São dois alvos com builds separados, cada um servido pelo seu host:

| Alvo      | Código              | Build          | Porta (DEV) | Host                     |
| --------- | ------------------- | -------------- | ----------- | ------------------------ |
| App (SPA) | `frontend/app/`     | `dist/app`     | 8080        | `app.listadecompras.net` |
| Landing   | `frontend/landing/` | `dist/landing` | 8081        | `www.listadecompras.net` |

| Comando                           | O que faz                                  |
| --------------------------------- | ------------------------------------------ |
| `npm run dev -w frontend`         | Sobe o app com recarga automática          |
| `npm run dev:landing -w frontend` | Sobe a landing page com recarga automática |
| `npm test -w frontend`            | Testes (Vitest + Vue Test Utils)           |
| `npm run build -w frontend`       | Gera `dist/app` e `dist/landing`           |
| `npm run preview -w frontend`     | Serve o build do app                       |

- **API:** o cliente em `app/src/api/cliente.js` usa `VITE_API_URL` como base; erros no formato `{ erro, mensagem, detalhes }` viram `ErroApi` (com `status`, `codigo`, `message` e `detalhes`); falha de rede vira `ErroApi` com `codigo: 'sem_conexao'`. Envia sempre o cookie (`credentials: 'include'`) e, com sessão aberta, o `Authorization: Bearer`. Em 401 fora de `/v1/auth/`, renova a sessão uma vez e repete a requisição.
- **Sessão** (store `auth`, `app/src/stores/auth.js`): `login`, `logout`, `renovar` e `iniciar`. O token de acesso fica só em memória, nunca em `localStorage`; ao abrir o app, `iniciar()` retoma a sessão pelo refresh token (cookie `httpOnly`). O token é renovado sozinho um minuto antes de expirar, e renovações simultâneas viram um pedido só.
- **Rotas:**

  | Rota                         | Acesso   | Tela                                                                          |
  | ---------------------------- | -------- | ----------------------------------------------------------------------------- |
  | `/login`                     | Pública  | Login (`?volta=` leva de volta à página pedida)                               |
  | `/recuperar-senha`           | Pública  | Pede o link de redefinição                                                    |
  | `/redefinir-senha#t=<token>` | Pública  | Valida o link e define a nova senha (`?t=` também é aceito)                   |
  | `/cadastro#c=<token>`        | Pública  | Cadastro por convite: e-mail do convite só confirmado (`?c=` também é aceito) |
  | `/`                          | Logado   | Dashboard (cards, gráfico, indicadores e notícias na tarefa 025)              |
  | `/ativos`                    | Logado   | Lista de ativos (leitor só vê)                                                |
  | `/ativos/novo`               | Só admin | Inclusão por link do Google Finance ou do Yahoo Finance                       |
  | `/ativos/:id`                | Logado   | Exibir; admin edita, atualiza da fonte e exclui                               |
  | `/perfil`                    | Logado   | Nome, troca de senha e exclusão da própria conta (e-mail só leitura)          |
  | `/usuarios`                  | Só admin | Lista, convites, ativar/desativar, excluir e restaurar                        |
  | `/usuarios/:id`              | Só admin | Editar nome, papel e status (e-mail só leitura)                               |
  | `/api-keys`                  | Só admin | API keys dos agentes: lista, nova chave (exibida uma vez) e revogação         |
  | qualquer outra               | Pública  | 404, mantendo o endereço digitado                                             |

  Sem login, rota privada → `/login?volta=<rota>`; leitor em rota de admin → dashboard. O app usa histórico HTML5, então o servidor precisa devolver o `index.html` para rotas desconhecidas.

- **Ativos:** lista (`v-data-table`) com código, nome, tipo, bolsa, status e a última cotação gravada em `precos_diarios` (uma consulta por ativo, `—` sem cotação), com filtros por tipo e status e busca por código ou nome (sem acento nem caixa). O admin liga e desliga o status pelo switch da linha (`PATCH { status }`, que volta ao valor anterior se a API recusar) e vê e restaura os excluídos. Em "Novo ativo", o admin cola o link da página do ativo (`google.com/finance/quote/...` ou `finance.yahoo.com/quote/...`; outro endereço é recusado sem chamar a API), confere na mesma tela os dados do `pre-visualizar` e a cotação, ajusta o que precisar e inclui. Em `/ativos/:id`, salva só os campos alterados, "Atualizar dados da fonte" refaz a busca e grava os campos do wrapper, e "Excluir" é lógica por padrão ou física com a opção marcada (apaga sinais e cotações do ativo). O leitor vê tudo só para leitura, sem botões de edição.
- **Meu perfil:** o e-mail aparece desabilitado; o nome é salvo com `PATCH /v1/auth/eu` e atualiza o menu. A troca de senha pede a atual, a nova (mínimo de 10 caracteres) e a confirmação; a API encerra as sessões dos outros aparelhos e devolve uma nova, que o app adota sem sair. "Excluir minha conta" abre um diálogo que explica a exclusão permanente e só habilita o botão com a senha preenchida e `EXCLUIR` digitado; depois de excluir, a sessão local é descartada e o app leva à landing (`VITE_LANDING_URL`). O último admin ativo recebe a mensagem de que precisa promover outro administrador antes.
- **Usuários** (só admin): lista com papel, status (Ativo, Inativo, Bloqueado pelas tentativas de login, Excluído) e último login; ativar/desativar, editar, excluir (lógica ou, marcando a opção, física, que apaga também o que o usuário criou) e restaurar com "Mostrar excluídos". O admin não se desativa, não se exclui e não muda o próprio papel por essas telas (para isso há o perfil, tarefa 022).
- **API keys** (só admin): lista com nome, prefixo (`la_<prefixo>_…`), escopos, criação, último uso e status (Ativa ou Revogada). "Nova chave" pede o nome do agente e ao menos um escopo (lista de `GET /v1/agentes-tokens/escopos`) e mostra a chave completa com o botão copiar (que funciona também por HTTP, no DEV) e o aviso de que não será exibida novamente: ela fica só no diálogo e é descartada ao fechar (o diálogo não fecha clicando fora enquanto a chave aparece). "Revogar" pede confirmação e atualiza o status. As revogadas ficam ocultas até ligar "Mostrar revogadas", que diz quantas há e fica desabilitado sem nenhuma; o filtro é feito no app, sem nova chamada à API, e não é guardado ao recarregar. Para mudar nome ou escopos, gere outra chave e revogue a antiga.
- **Convites:** "Convidar usuário" envia `{ email, papel }` (papel padrão: leitor) e mostra a confirmação, com o aviso de que o link vale 72 horas e não pode ser cancelado; "Reenviar" gera um link novo sem invalidar o anterior. O convidado abre `/cadastro#c=<token>`: o e-mail do convite aparece desabilitado e o botão só habilita com "Confirmo que este é meu e-mail" marcado. Convite expirado, inválido ou de e-mail já cadastrado mostra o aviso. Sem SMTP configurado (DEV atual), a API responde 503 ao convidar.
- **Layout:** logado, menu lateral (`v-navigation-drawer`) com nome, e-mail e papel do usuário e os tópicos Dashboard, Ativos, Usuários e API keys (só admin), Meu perfil e Sair. Telas públicas não têm menu.
- **Mensagens:** credenciais inválidas, conta bloqueada com o tempo restante (`detalhes.segundos_restantes` do 423), excesso de tentativas (429), sem conexão, e link de redefinição expirado ou já usado, com o link para pedir outro.
- **Testes:** `frontend/test/utils.js` tem a API falsa (`criarApiFalsa`, `apiComSessao`) instalada como `fetch` global e `montarApp(rota)`, que monta o app inteiro (Vuetify, router em memória e Pinia).
- **Tema:** claro e escuro, alternados pela barra superior; o inicial segue a preferência do sistema.
- **Landing page:** página estática, sem JavaScript, com o que é o projeto, como funciona (coleta → análise → nota → decisão), o aviso de acesso por convite e os links "Entrar" e "Acessar o app", que levam a `VITE_APP_URL/login` (padrão: `https://app.listadecompras.net`). Não tem link de cadastro. Tem metatags de SEO e Open Graph (endereço canônico por `VITE_LANDING_URL`), favicon, `robots.txt`, tema claro e escuro, e nota 100 no Lighthouse (performance, acessibilidade, boas práticas e SEO).
- **Política de privacidade** (`/privacidade.html`): gerada no build a partir do `POLICY.md` da raiz por um plugin do Vite (`frontend/landing/politica.js`, com `marked`), então nunca diverge do documento. No DEV, editar o `POLICY.md` recarrega a página. Um teste impede que ela cite tarefas internas ou leve a arquivos `.md`.

## Produção (Docker + Nginx)

`docker compose -f infra/docker-compose.prod.yml up -d --build --wait` sobe o proxy Nginx (portas 80 e 443), a API, o frontend e o certbot. O proxy roteia por subdomínio: `api.` vai para a API, `app.` para o app, e `www.` e o domínio raiz para a landing page. Tudo é servido em HTTPS com certificado da Let's Encrypt (renovação automática), e o HTTP redireciona com 301. `npm run smoke:prod` testa a stack e `npm run verifica:https` confere o certificado de PROD. Na VPS, `infra/scripts/deploy.sh` faz o deploy de uma nova versão (pull, build, migrations, `up --wait` e verificação de saúde) e volta às imagens anteriores se algo falhar; `npm run smoke:pos-deploy` confere de fora a saúde da API, o app, a landing e o login do admin. `configurar-ssh.sh` e `preparar-vps.sh` preparam o acesso por chave e a VPS. Backup semanal do SQLite na VPS (`backup.sh`, 8 cópias), cópia externa puxada pelo casa-ratton (`puxar-backup.sh`, 26 cópias) e restauração conferida (`restaurar-backup.sh`). Detalhes no [INSTALL.md](INSTALL.md#produção-vps-com-docker-e-nginx).

## Integração contínua

O GitHub Actions (`.github/workflows/ci.yml`) roda a cada push na `main` e em todo pull request, com quatro jobs em paralelo:

| Job                        | O que verifica                                                           |
| -------------------------- | ------------------------------------------------------------------------ |
| Lint e estrutura           | `npm run lint` e `npm run test:estrutura`                                |
| Testes do backend          | `npm test -w backend` e `npm run build -w backend`                       |
| Testes e build do frontend | `npm test -w frontend` e `npm run build -w frontend`                     |
| Imagens e smoke de PROD    | Build das imagens de PROD (sem push), stack no ar e `npm run smoke:prod` |

A `main` é protegida: os quatro jobs são checks obrigatórios, inclusive para administradores. Um PR só pode ser mergeado com todos verdes e com a branch atualizada em relação à `main`. Push direto, force push e exclusão da `main` estão bloqueados.

## Documentação

- [INSTALL.md](INSTALL.md): requisitos, variáveis de ambiente, DEV (portas e firewall) e PROD (VPS, Docker e SSL).
- [CHANGELOG.md](CHANGELOG.md): histórico de mudanças.
- [POLICY.md](POLICY.md): política de privacidade.
