# Instalação

## Requisitos

- Node.js 24 (versão fixada em `.nvmrc`; com nvm: `nvm use`)
- npm 11 ou superior
- Docker com Compose v2, para o ambiente DEV em containers e para PROD
- Em PROD: VPS Linux com as portas 80 e 443 liberadas e os registros DNS dos subdomínios (ver [Produção](#produção-vps-com-docker-e-nginx))

## Passos

```sh
nvm use
npm install
```

O `npm install` na raiz instala as dependências compartilhadas (ESLint, Prettier) e as dos workspaces `backend` e `frontend`.

## Variáveis de ambiente

Cada serviço tem um `.env-example` com as variáveis documentadas. Copie para `.env` e ajuste:

```sh
cp .env-example .env
cp backend/.env-example backend/.env
cp frontend/.env-example frontend/.env
```

Arquivos `.env` nunca são versionados; somente os `.env-example`.

No backend, `CORS_ORIGENS` e `JWT_SEGREDO` são obrigatórias: sem elas a API não inicia. O `JWT_SEGREDO` assina os tokens de login (mínimo de 32 caracteres) e deve ser diferente em cada ambiente. Para gerar:

```sh
echo "JWT_SEGREDO=$(openssl rand -base64 48)" >> backend/.env
```

Trocar o segredo encerra todas as sessões abertas.

## Banco de dados (migrations)

O banco é um arquivo SQLite em `DB_ARQUIVO` (padrão `backend/data/monitor.db`; a pasta é criada se não existir). As tabelas vêm das migrations em `backend/migrations/`, que **não** são aplicadas pela API ao iniciar:

```sh
npm run db:status -w backend    # aplicadas (com a data) e pendentes
npm run db:migrate -w backend   # aplica as pendentes, em ordem
```

Os comandos leem `DB_ARQUIVO` do ambiente ou do `backend/.env` (só essa variável; as demais da API não são exigidas). Rodar o `db:migrate` de novo sem migration nova não muda nada.

As migrations criam o schema e a carga inicial (6 ativos), mas nenhum usuário. O cadastro no app é só por convite, então o primeiro admin é criado pelo terminal:

```sh
npm run db:admin -w backend -- --email admin@exemplo.com --nome "Nome do Admin"
```

A senha (mínimo de 10 caracteres) é pedida duas vezes, sem aparecer na tela. Sem terminal (ex.: script), ela é lida da primeira linha da entrada: `echo "$SENHA" | npm run db:admin -w backend -- ...`. Nunca passe a senha como argumento: ela ficaria no histórico do shell.

Nova migration: crie `backend/migrations/NNNN_descricao.sql` com o próximo número (4 dígitos). Cada arquivo roda em uma transação, então não use `BEGIN`/`COMMIT` nele, nem `PRAGMA foreign_keys` (não tem efeito dentro de transação). Migration aplicada não deve ser editada: corrija com uma nova.

## E-mail (Gmail SMTP)

A API envia convites e links de recuperação de senha pelo Gmail, com uma **senha de app** (não a senha da conta):

1. Na conta Google que vai enviar, ative a verificação em duas etapas.
2. Gere a senha de app em <https://myaccount.google.com/apppasswords> (16 caracteres).
3. Preencha no `backend/.env`: `SMTP_USER` (o e-mail da conta), `SMTP_PASS` (a senha de app) e `MAIL_FROM` (ex.: `"Lista de Ações <conta@gmail.com>"`). `SMTP_HOST` e `SMTP_PORT` já vêm com `smtp.gmail.com` e `465`.
4. Teste o envio para uma caixa sua:

```sh
npm run email:teste -w backend -- --para voce@exemplo.com
# DEV com Docker:
docker compose -f infra/docker-compose.dev.yml exec backend npm run email:teste -w backend -- --para voce@exemplo.com
# PROD:
docker compose -f infra/docker-compose.prod.yml exec backend node dist/mail/enviar-teste.js --para voce@exemplo.com
```

- **Limite:** o Gmail aceita cerca de **500 destinatários por dia** por conta; acima disso, os envios falham até o dia seguinte.
- **Obrigatório em produção:** sem `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` (e `APP_URL`), a API não sobe. Fora de produção, sem usuário e senha o envio fica desligado e as rotas que mandam e-mail respondem com erro.
- **Links:** montados a partir de `APP_URL`. Os composes definem DEV `http://casaratton.ddns.net:8080` e PROD `https://app.listadecompras.net` (o mesmo `VITE_APP_URL` do app).
- **Erro de autenticação (`EAUTH`):** confira se a senha é de app e se a verificação em duas etapas continua ativa. Trocar a senha da conta Google revoga as senhas de app.

## Executar a API em desenvolvimento

```sh
npm run dev -w backend
curl http://localhost:3000/v1/health
```

## Executar o frontend em desenvolvimento

```sh
npm run dev -w frontend            # app: http://localhost:8080
npm run dev:landing -w frontend    # landing: http://localhost:8081
```

`VITE_API_URL` (base da API) e `VITE_APP_URL` (link da landing para o app) ficam em `frontend/.env`. Elas são embutidas no build, então mudar o valor exige um novo build.

## Build do frontend

```sh
npm run build -w frontend
```

Gera `frontend/dist/app` (SPA) e `frontend/dist/landing` (estática), cada uma com seus próprios assets. Ao servir o app, rotas desconhecidas precisam cair no `index.html` (fallback de SPA).

## Ambiente DEV com Docker (servidor casa-ratton)

Requer Docker com o plugin Compose. Na raiz do repositório:

```sh
docker compose -f infra/docker-compose.dev.yml up -d --build   # sobe backend e frontend
npm run smoke:dev                                               # verifica se está tudo no ar
docker compose -f infra/docker-compose.dev.yml logs -f          # acompanha os logs
docker compose -f infra/docker-compose.dev.yml down             # para (o banco é mantido)
```

| Serviço      | Porta | Interno                       | Externo                         |
| ------------ | ----- | ----------------------------- | ------------------------------- |
| API          | 3000  | http://casa-ratton.local:3000 | http://casaratton.ddns.net:3000 |
| App          | 8080  | http://casa-ratton.local:8080 | http://casaratton.ddns.net:8080 |
| Landing page | 8081  | http://casa-ratton.local:8081 | http://casaratton.ddns.net:8081 |

- **Hot reload:** o código (`backend/src`, `frontend/app`, `frontend/landing` e as configs do Vite) é montado nos containers. A API reinicia sozinha (nodemon) e o app atualiza no navegador (HMR do Vite). Arquivos montados um a um (`backend/babel.config.js` e as configs do Vite) não acompanham trocas feitas pelo git (checkout, pull, merge): o container continua vendo a versão antiga. Depois de um `git pull`, rode `docker compose -f infra/docker-compose.dev.yml up -d --force-recreate`.
- **Logs:** `docker compose -f infra/docker-compose.dev.yml logs -f backend`. A rotação (5 arquivos de 10 MB por serviço) vale para containers criados depois da tarefa 029; recrie com `up -d` se necessário.
- **Dependências:** ficam dentro da imagem. Depois de mudar um `package.json`, rode o `up` com `--build`.
- **Configuração:** as variáveis de DEV estão no `docker-compose.dev.yml`. O `backend/.env` é **obrigatório** (o compose não sobe sem ele) e guarda os segredos, como o `JWT_SEGREDO` (`echo "JWT_SEGREDO=$(openssl rand -base64 48)" >> backend/.env`), e ajustes como `LOG_LEVEL`; as variáveis do compose têm precedência sobre ele.
- **API no app:** em DEV, o app chama a API pela mesma origem (`/v1`), e o Vite encaminha para o container `backend` (`API_PROXY`). Assim, o app funciona pelos dois hostnames sem precisar de um build para cada um. A porta 3000 continua aberta para acesso direto, com CORS liberado para o app nos dois hostnames.
- **Banco SQLite:** fica no volume nomeado `lista-acoes-dev_dados`, montado em `backend/data`. Ele sobrevive ao `down`; só o `down -v` apaga. As migrations (`backend/migrations`, montada no container) são aplicadas com `docker compose -f infra/docker-compose.dev.yml exec backend npm run db:migrate -w backend` (e `db:status` para conferir). O primeiro admin: `docker compose -f infra/docker-compose.dev.yml exec backend npm run db:admin -w backend -- --email <e-mail> --nome <nome>`.
- **Smoke test:** `npm run smoke:dev` testa `localhost`; para outro host, use `SMOKE_HOST=casaratton.ddns.net npm run smoke:dev`.

> **Risco aceito:** em DEV, a API fica exposta à internet. Use apenas dados de teste, nunca credenciais de produção.

### Firewall e roteador

Para abrir as portas no ufw do servidor:

```sh
sudo infra/scripts/firewall-dev.sh
```

- O Docker publica as portas direto no iptables, sem passar pelas regras do ufw. As regras deixam a liberação registrada e valem para serviços rodando fora do Docker (`npm run dev`).
- Para o acesso externo (`casaratton.ddns.net`), o roteador precisa encaminhar as portas 3000, 8080 e 8081 para o casa-ratton.

## Produção (VPS) com Docker e Nginx

Quatro containers:

- `proxy`: Nginx, o único com portas publicadas no host (80 e 443). Termina o HTTPS.
- `certbot`: renova o certificado da Let's Encrypt.
- `backend`: a API.
- `frontend`: Nginx servindo o app e a landing page.

O proxy roteia pelo subdomínio:

| Host                                            | Destino                                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| `api.listadecompras.net`                        | `backend:3000` (API)                                     |
| `app.listadecompras.net`                        | `frontend:8080` (SPA)                                    |
| `www.listadecompras.net` e `listadecompras.net` | `frontend:8081` (landing)                                |
| qualquer outro (ou acesso pelo IP)              | HTTP: conexão fechada (`444`); HTTPS: handshake recusado |

No HTTP (80), o proxy só atende o desafio da Let's Encrypt (`/.well-known/acme-challenge/`) e redireciona todo o resto com **301** para o HTTPS. No HTTPS (443) envia **HSTS** de 1 ano (`max-age=31536000; includeSubDomains`).

### Primeira subida na VPS

Pré-requisitos:

- Registros DNS A de `listadecompras.net`, `www.`, `app.` e `api.` apontando para a VPS.
- Portas 80 e 443 liberadas.

Na raiz do repositório, na VPS:

```sh
cp infra/.env-example infra/.env               # preencha LETSENCRYPT_EMAIL e revise o resto
echo "JWT_SEGREDO=$(openssl rand -base64 48)" >> backend/.env   # segredo dos tokens (só de PROD)
docker compose -f infra/docker-compose.prod.yml build

# 1) Ensaio com o ambiente de testes da Let's Encrypt (certificado não confiável)
LETSENCRYPT_STAGING=1 infra/scripts/certificado-inicial.sh

# 2) Emissão real (substitui o certificado de teste)
infra/scripts/certificado-inicial.sh

npm run smoke:prod                             # stack: subdomínios, redirect, HSTS, certbot
npm run verifica:https                         # de fora: certificado válido, HSTS e 301
```

O `certificado-inicial.sh`:

1. Para o proxy.
2. Emite **um** certificado com os quatro nomes, usando o certbot em modo `--standalone` na porta 80 (desafio HTTP-01).
3. Sobe a stack.

Ele não sobrescreve um certificado da Let's Encrypt já emitido.

### Renovação do certificado

É automática; não exige ação manual.

- O serviço `certbot` roda `certbot renew --webroot` a cada 12 h. A Let's Encrypt renova quando faltam 30 dias ou menos para o vencimento (o certificado vale 90 dias). O desafio é servido pelo proxy, sem parar nada.
- O proxy recarrega o Nginx a cada 6 h e passa a usar o certificado novo.
- Avisos de vencimento chegam ao `LETSENCRYPT_EMAIL`.

Comandos úteis:

```sh
docker compose -f infra/docker-compose.prod.yml exec certbot certbot certificates        # validade
docker compose -f infra/docker-compose.prod.yml exec certbot certbot renew --webroot -w /var/www/certbot --dry-run   # ensaio
docker compose -f infra/docker-compose.prod.yml exec proxy nginx -s reload               # usar já o certificado novo
npm run verifica:https                                                                   # falha se faltar menos de 15 dias
```

Se a renovação falhar (o `verifica:https` acusa o vencimento próximo):

1. Veja os logs: `docker compose -f infra/docker-compose.prod.yml logs certbot`.
2. Confira se o DNS e a porta 80 continuam apontando para a VPS.
3. Rode o `renew` acima sem `--dry-run`.

### Operação

- **Variáveis:** o Compose lê `infra/.env` sozinho. O `backend/.env` é obrigatório e guarda os segredos da API (`JWT_SEGREDO`); `NODE_ENV`, `PORT`, `CORS_ORIGENS` e `CONFIAR_PROXY` vêm do compose. As `VITE_*` são embutidas no build do frontend, então mudar o valor exige `up --build`.
- **Imagens:** multi-stage. A API roda em `node:24-slim` com só as dependências de produção, e o frontend em `nginx-unprivileged`; os dois rodam sem root. O proxy usa a imagem oficial `nginx:alpine`: o processo mestre roda como root para ler a chave da Let's Encrypt e abrir as portas 80 e 443, e os workers rodam como `nginx`.
- **Migrations:** vão dentro da imagem da API. Depois de cada `up --build` com migration nova, aplique com `docker compose -f infra/docker-compose.prod.yml exec backend node dist/database/cli.js migrate` (`... cli.js status` para conferir). Faça backup do volume antes. Na primeira subida, crie o admin: `docker compose -f infra/docker-compose.prod.yml exec backend node dist/database/cli.js admin --email <e-mail> --nome <nome>`.
- **Logs:** `docker compose -f infra/docker-compose.prod.yml logs <serviço>`. Todos os serviços usam rotação (`json-file`, 5 arquivos de 10 MB, até 50 MB por serviço); os mais antigos são descartados. A API não grava cabeçalhos da requisição, então credenciais não aparecem nos logs.
- **Volumes:** `lista-acoes_dados` guarda o SQLite e `lista-acoes_letsencrypt`, o certificado e a conta da Let's Encrypt. Os dois sobrevivem a `down` e a rebuilds; **não use `down -v`** em PROD.
- **Nginx:** `infra/nginx/proxy.conf` (subdomínios, TLS, redirect, gzip, cabeçalhos de segurança e HSTS, CSP, `X-Request-Id` repassado à API) e `infra/nginx/frontend.conf` (fallback da SPA para o `index.html`, cache longo nos assets com hash e `no-cache` no `index.html`). Depois de alterar a config do proxy: `docker compose -f infra/docker-compose.prod.yml exec proxy nginx -t` e depois `... exec proxy nginx -s reload`.
- **Healthchecks e restart:** todos os serviços têm `restart: unless-stopped`, e `proxy`, `backend` e `frontend` têm healthcheck. O proxy só sobe depois que a API e o frontend estão saudáveis, e consulta o DNS do Docker a cada 10 s, acompanhando a troca de IP quando um container é recriado.

### Testar localmente simulando os subdomínios

Com um certificado **autoassinado** de teste (mesmos nomes e caminho do real) e as portas 80 e 443 ocupadas no host, use outras portas:

```sh
export PROXY_PORTA=8088 PROXY_PORTA_HTTPS=8444
docker compose -f infra/docker-compose.prod.yml --profile teste run --rm certificado-teste
docker compose -f infra/docker-compose.prod.yml up -d --build --wait
npm run smoke:prod
curl -k --resolve app.listadecompras.net:8444:127.0.0.1 https://app.listadecompras.net:8444/
curl -i -H 'Host: api.listadecompras.net' http://localhost:8088/v1/health   # 301 para o HTTPS
docker compose -f infra/docker-compose.prod.yml down -v                     # -v: só em teste!
```

O CI faz o mesmo no job "Imagens e smoke de PROD".
