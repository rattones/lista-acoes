# Changelog

Todas as mudanças relevantes do projeto são registradas aqui, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Corrigido

- App: o botão "Copiar" da nova API key falhava fora de HTTPS (DEV por HTTP), onde o navegador não oferece o `navigator.clipboard`. Agora a cópia usa um `textarea` temporário com `execCommand('copy')` como reserva e, se nada funcionar, deixa a chave selecionada para o Ctrl+C (tarefa 030).
- O log de cada requisição da API gravava todos os cabeçalhos, inclusive `Authorization` e `Cookie`, em texto puro. Agora grava só `id`, método, URL, IP, user agent, status e tempo; `senha`, `senha_hash` e `token` em objetos registrados pelo código saem como `[oculto]` (tarefa 029).
- Logs dos containers cresciam sem limite: todos os serviços dos composes de DEV e PROD usam rotação `json-file` (5 arquivos de 10 MB) (tarefa 029).
- O `babel-plugin-parameter-decorator` gerava código inválido (`dec(_class.prototype, ...)` antes de `_class` existir) para qualquer decorator de parâmetro, em método ou construtor; foi removido (tarefa 011).
- Corpo de requisição grande demais respondia 500; agora responde 413 `payload_muito_grande` no formato padrão (tarefa 011).

### Alterado

- `npm run test:estrutura` também roda os testes dos scripts de deploy e da VPS; INSTALL com o passo a passo da primeira subida e do deploy de novas versões (tarefa 027).
- POLICY: sem referências a tarefas internas nem link para arquivo do repositório (agora também é publicada na landing), e a nota de "versão inicial" dá lugar à data da última atualização (tarefa 026).
- Docker: a imagem do frontend copia o `POLICY.md` e o compose de DEV o monta no container; o DEV precisa de `up --build` por causa do `marked` (tarefa 026).
- Especificação do dashboard (tarefa 024): gráfico de preço (linha) e nota (barras) do ativo em foco, cards do resumo atual, tabela de indicadores, últimas notícias e filtros rápidos e avançados guardados na URL. Implementação na tarefa 025, com dados fictícios no DEV (tarefa 032); README e tela inicial passam a citar a 025.
- App: leitura do token dos links de e-mail (`#t=`, `#c=`, com `?` aceito) e formatos de data, papel e status compartilhados em `app/src/utils/` (tarefa 020).
- Testes do frontend: o app é desmontado depois de cada teste (`enableAutoUnmount`) e o setup simula o `visualViewport`, usado pelos diálogos do Vuetify (tarefa 020).
- Cliente HTTP do app: envia o cookie (`credentials: 'include'`) e o token de acesso, renova a sessão uma vez em 401 e repete a requisição, aceita corpo no `DELETE` e converte falha de rede em `ErroApi` `sem_conexao` (tarefa 019).
- A página inicial do app vira o Dashboard (só com login); Ativos, Usuários, API keys e Meu perfil aparecem como "em breve" até as tarefas 020 a 023 (tarefa 019).
- POLICY: o wrapper consulta Yahoo, Binance e CoinGecko enviando só o código do ativo, sem dados pessoais (tarefa 018).
- POLICY: a exclusão de conta pede a senha, apaga cadastro e API keys e não vale para o último admin ativo (tarefa 017).
- O repositório genérico do CRUD aceita a opção `apresentar`, para ajustar o que sai da API (ex.: `agentes_tokens.escopos` em array) (tarefa 016).
- Rate limits nomeados centralizados em `src/auth/limites.js`, com o decorator `@limitar(...)`: cada rota declara só os limites que valem para ela (tarefa 015).
- POLICY: o convite leva o nome de quem convidou e nada é guardado antes do aceite (tarefa 015).
- POLICY: a redefinição de senha encerra as sessões abertas e o pedido não revela se o e-mail está cadastrado (tarefa 014).
- Composes definem `APP_URL` (DEV `http://casaratton.ddns.net:8080`; PROD o mesmo `VITE_APP_URL` do app); o CI grava um SMTP fictício no `backend/.env` do smoke de PROD (tarefa 013).
- POLICY: o log de envio guarda só o tipo de e-mail e o destinatário mascarado (tarefa 013).
- Todas as rotas do CRUD passam a exigir autenticação; `GET /v1/health` continua público (tarefa 012).
- `backend/.env` passa a ser obrigatório nos composes de DEV e PROD (guarda o `JWT_SEGREDO`); o CI gera um segredo descartável para o smoke de PROD (tarefa 012).
- CORS com `credentials: true` (o app envia o cookie do refresh) e `trust proxy` configurável (tarefa 012).
- O teste de rotação dos logs lê os composes com `js-yaml` (schema YAML 1.1, que resolve `<<`), sem depender da versão do Docker nem do `backend/.env` (tarefa 012).
- `@nestjs/jwt` fixado na 11.x: a 12 é só ESM e não carrega no Jest (CommonJS via Babel) (tarefa 012).
- POLICY descreve a retenção dos logs (até 50 MB por serviço) e que credenciais não são gravadas; INSTALL orienta recriar os containers do DEV depois de um `git pull` (arquivos montados um a um não acompanham o git) (tarefa 029).
- Decorators de parâmetro (`@Body()`, `@Query()`, `@Param()`, `@Inject()` no construtor) passam a ser convertidos por um plugin local no `backend/babel.config.js`, no formato do `__param` do TypeScript (tarefa 011).
- Limite do corpo JSON da API sobe de 100 KB para 1 MB, para os lotes dos agentes (tarefa 011).
- `usuarios` nunca devolve `senha_hash`; o `PATCH` aceita só `nome`, `papel` e `ativo` (tarefa 011).
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

- Deploy em PROD (tarefa 027): `infra/scripts/deploy.sh` (pull, marca das imagens em uso como `:anterior`, build, migrations com a imagem nova, `up --wait`, verificação de saúde em HTTPS e rollback para as imagens anteriores), `preparar-vps.sh` (Docker, usuário `deploy`, firewalld só com 22022, 80 e 443, configurado offline antes de ser ligado quando está desligado, e o Docker reiniciado em seguida), `configurar-ssh.sh` (acesso à VPS por chave e, opcionalmente, sem senha) e `npm run smoke:pos-deploy` (saúde, app, landing e login do admin pelo DNS e HTTPS reais).
- Landing page completa: o que é, como funciona (coleta → análise → nota → decisão), aviso de acesso por convite e links para o login do app (`VITE_APP_URL/login`); metatags de SEO e Open Graph, favicon e `robots.txt`; sem JavaScript (tarefa 026).
- Landing: página `/privacidade.html` gerada no build a partir do `POLICY.md` (plugin do Vite com `marked`) (tarefa 026).
- App: tela de API keys dos agentes (`/api-keys`, só admin) com nome, prefixo, escopos, criação, último uso e status; diálogo "Nova chave" (nome + escopos) que mostra a chave completa uma única vez, com botão copiar, e a descarta ao fechar; revogação com confirmação (tarefa 023).
- App: tela Meu perfil (`/perfil`) com nome editável, e-mail só leitura, troca de senha (a sessão nova da API é adotada sem sair) e exclusão permanente da própria conta, confirmada pela senha e pela palavra `EXCLUIR`; depois, a sessão local é descartada e o app leva à landing. Mensagem própria para o último admin (tarefa 022).
- Variável `VITE_LANDING_URL` (padrão `https://www.listadecompras.net`; DEV `http://casaratton.ddns.net:8081`), endereço da landing usado depois da exclusão da conta (tarefa 022).
- App: lista de ativos (`/ativos`) com código, nome, tipo, bolsa, status e última cotação, filtros por tipo e status, busca, switch de status com reversão em caso de erro e restauração dos excluídos (admin) (tarefa 021).
- App: inclusão de ativo (`/ativos/novo`, só admin) a partir do link do Google Finance ou do Yahoo Finance, com o link conferido antes de chamar a API e a confirmação dos dados do `pre-visualizar` na mesma tela (tarefa 021).
- App: exibição e edição de ativo (`/ativos/:id`) com Salvar (só os campos alterados), Atualizar dados da fonte e Excluir (lógica ou física); leitor só lê (tarefa 021).
- App: tela de usuários (`/usuarios`, só admin) com papel, status, último login, ativar/desativar, editar, exclusão lógica ou física com confirmação e restauração dos excluídos (tarefa 020).
- App: edição de usuário (`/usuarios/:id`, só admin) com nome, papel e status; e-mail só leitura; o admin não muda o próprio papel nem o próprio status (tarefa 020).
- App: diálogo "Convidar usuário" (e-mail + papel), com confirmação, aviso de 72 horas sem cancelamento e "Reenviar" (tarefa 020).
- App: cadastro por convite (`/cadastro#c=`), com o e-mail do convite desabilitado e confirmado por checkbox, e avisos para convite expirado, inválido ou de e-mail já cadastrado (tarefa 020).
- App: login, recuperação e redefinição de senha (`/login`, `/recuperar-senha`, `/redefinir-senha#t=`), com mensagens para credenciais inválidas, conta bloqueada (com o tempo restante), excesso de tentativas, falta de conexão e link expirado ou já usado (tarefa 019).
- App: store `auth` (Pinia) com login, logout, sessão retomada pelo cookie do refresh ao abrir o app e renovação automática do token de acesso, que fica só em memória (tarefa 019).
- App: guards de rota (rotas privadas exigem login, com volta à página pedida; rotas de admin exigem papel `admin`) e layout com menu lateral: usuário logado, Dashboard, Ativos, Usuários e API keys (só admin), Meu perfil e Sair (tarefa 019).
- O 423 do login informa `detalhes.segundos_restantes` até o desbloqueio (tarefa 019).
- Wrapper de dados de ativos (tarefa 018): `POST /v1/ativos/pre-visualizar { url }` monta os campos de `ativos` e a última cotação a partir de um link do Google Finance ou do Yahoo Finance, sem gravar; `POST /v1/ativos/:id/atualizar-dados` refaz a busca e atualiza o cadastro. Só admin.
- Fontes do wrapper: Yahoo (ações, ETFs, índices e moedas), Binance e CoinGecko (cripto e stablecoins), com mapa de bolsas Google ↔ Yahoo e cliente HTTP com timeout, retry com backoff e cache curto. Erros 400 `url_nao_suportada`, 422 `ativo_nao_encontrado` e 502 `fonte_indisponivel` (tarefa 018).
- Variáveis `WRAPPER_USER_AGENT`, `WRAPPER_TIMEOUT_MS`, `WRAPPER_TENTATIVAS` e `WRAPPER_CACHE_SEGUNDOS`, todas opcionais (tarefa 018).
- Edição do próprio perfil (tarefa 017): `PATCH /v1/auth/eu { nome?, senha_atual?, nova_senha? }`; o e-mail não muda (400). Trocar a senha exige a atual, encerra as outras sessões e devolve uma sessão nova.
- Exclusão permanente da própria conta (tarefa 017): `DELETE /v1/auth/eu { senha }` apaga o usuário e, em cascata, as API keys que ele criou; senha errada → 403 `senha_incorreta`; o último admin ativo não pode se excluir (409 `ultimo_admin`). Limite de 10 confirmações de senha por 15 minutos por IP.
- Teste do schema garante que toda chave estrangeira para `usuarios` é `ON DELETE CASCADE` (tarefa 017).
- API keys dos agentes (tarefa 016): `POST /v1/agentes-tokens` (devolve a chave `la_<prefixo>_<segredo>` uma única vez), `GET /v1/agentes-tokens` e `/:id` (sem segredo nem hash), `GET /v1/agentes-tokens/escopos`, `POST /v1/agentes-tokens/:id/revogar`, exclusão e restauração, só para admin. O banco guarda só o prefixo e o SHA-256 do segredo.
- Autenticação de agentes por `Authorization: Bearer la_...` (`ApiKeyGuard`): chave inválida, revogada, excluída ou de criador que não é mais admin ativo → 401; rota fora dos escopos → 403. Escopos `ativos:read`, `execucoes:read/write`, `sinais:read/write`, `precos:read/write` e `noticias:read/write`, declarados nas rotas com `@Escopos(...)` e `@EscoposCrud(...)` (tarefa 016).
- Convites (tarefa 015): `POST /v1/convites` (admin; envia o link e devolve `{ email, papel, expira_em }`), `POST /v1/convites/validar` e `POST /v1/convites/aceitar` (públicos), com link assinado sem estado válido por 72 horas, e-mail do novo usuário vindo do token (só confirmado) e papel escolhido pelo admin.
- Convite deixa de valer quando o e-mail é cadastrado (409) ou quando quem convidou deixa de ser um admin ativo (400) (tarefa 015).
- Rate limit de 20 validações ou aceites de convite por 15 minutos por IP (tarefa 015).
- Recuperação de senha (tarefa 014): `POST /v1/auth/recuperar-senha` (sempre 202; envia o link só para usuário ativo, em segundo plano), `POST /v1/auth/redefinir-senha/validar` (200, 400 `token_invalido` ou 410 `token_expirado`) e `POST /v1/auth/redefinir-senha` (grava a nova senha, zera o bloqueio e encerra as sessões).
- Tokens de link assinados sem estado (`src/auth/token-assinado.js`): payload em base64url + HMAC-SHA256 com chave derivada por finalidade; o de recuperação usa o `senha_hash` atual, então vale uma vez só e expira em 24 horas (tarefa 014).
- Rate limit da recuperação: 3 pedidos por hora por e-mail e 10 por 15 minutos por IP (tarefa 014).
- Serviço de e-mail (`MailModule`/`MailService`) com Gmail SMTP e senha de app (nodemailer): templates `convite` e `recuperacao-senha` em HTML e texto, links montados a partir de `APP_URL` com os parâmetros no fragmento, e `ErroEnvioEmail` (503 `falha_envio_email`) em caso de falha (tarefa 013).
- `npm run email:teste -w backend -- --para <e-mail>` (`node dist/mail/enviar-teste.js` em PROD) para testar o envio real (tarefa 013).
- Variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` e `APP_URL`; em produção, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` e `APP_URL` são obrigatórias (tarefa 013).
- Login por e-mail e senha (`POST /v1/auth/login`): token de acesso JWT de 15 minutos e refresh token de 7 dias em cookie `httpOnly`/`SameSite=Strict`; `POST /v1/auth/refresh`, `POST /v1/auth/logout` (encerra todas as sessões) e `GET /v1/auth/eu` (tarefa 012).
- Bloqueio de 15 minutos após 5 senhas erradas seguidas (423), mensagem genérica para credenciais inválidas e rate limit de 10 tentativas de login por minuto por IP (429) (tarefa 012).
- Guards globais de autenticação e papéis (`@Publico()`, `@Papeis('admin')`): leitor só lê; admin escreve, exclui, restaura, usa lotes, vê excluídos e gerencia usuários (tarefa 012).
- Migration `0003_sessao_usuarios.sql`: `usuarios.versao_sessao`, que invalida os tokens já emitidos no logout (tarefa 012).
- Variáveis `JWT_SEGREDO` (obrigatória), `COOKIE_SEGURO` e `CONFIAR_PROXY` (tarefa 012).
- CRUD de `ativos`, `execucoes`, `sinais`, `precos` (`precos_diarios`), `noticias` e `usuarios`: listagem paginada com ordenação, filtros e `incluir_excluidos`, obter, criar, atualizar (PATCH), exclusão lógica, exclusão física (`?permanente=true`) e restauração (`POST /:id/restaurar`) (tarefa 011).
- Repositório genérico em SQL puro (`src/comum/crud/repositorio.js`) e controlador base (`src/comum/crud/controlador-crud.js`) reutilizados pelos recursos (tarefa 011).
- `POST /v1/precos/lote` e `POST /v1/noticias/lote`: upsert de até 1000 itens numa transação, devolvendo `{ inseridos, atualizados }` (tarefa 011).
- Violações de restrição do SQLite viram respostas no formato padrão: duplicata → 409 `conflito` (com os campos), registro relacionado inexistente → 422 `entidade_invalida` (tarefa 011).
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

### Removido

- App: tela provisória "em breve" (`EmBreveView`), sem uso depois da tela de API keys (tarefa 023).
