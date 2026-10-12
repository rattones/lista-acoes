# Instalação

## Requisitos

- Node.js 24 (versão fixada em `.nvmrc`; com nvm: `nvm use`)
- npm 11 ou superior

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

No backend, `CORS_ORIGENS` é obrigatória: sem ela a API não inicia.

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

- **Hot reload:** o código (`backend/src`, `frontend/app`, `frontend/landing` e as configs do Vite) é montado nos containers. A API reinicia sozinha (nodemon) e o app atualiza no navegador (HMR do Vite).
- **Dependências:** ficam dentro da imagem. Depois de mudar um `package.json`, rode o `up` com `--build`.
- **Configuração:** as variáveis de DEV estão no `docker-compose.dev.yml`. O `backend/.env` é opcional e serve para ajustes, como `LOG_LEVEL`; as variáveis do compose têm precedência sobre ele.
- **API no app:** em DEV, o app chama a API pela mesma origem (`/v1`), e o Vite encaminha para o container `backend` (`API_PROXY`). Assim, o app funciona pelos dois hostnames sem precisar de um build para cada um. A porta 3000 continua aberta para acesso direto, com CORS liberado para o app nos dois hostnames.
- **Banco SQLite:** fica no volume nomeado `lista-acoes-dev_dados`, montado em `backend/data`. Ele sobrevive ao `down`; só o `down -v` apaga.
- **Smoke test:** `npm run smoke:dev` testa `localhost`; para outro host, use `SMOKE_HOST=casaratton.ddns.net npm run smoke:dev`.

> **Risco aceito:** em DEV, a API fica exposta à internet. Use apenas dados de teste, nunca credenciais de produção.

### Firewall e roteador

Para abrir as portas no ufw do servidor:

```sh
sudo infra/scripts/firewall-dev.sh
```

- O Docker publica as portas direto no iptables, sem passar pelas regras do ufw. As regras deixam a liberação registrada e valem para serviços rodando fora do Docker (`npm run dev`).
- Para o acesso externo (`casaratton.ddns.net`), o roteador precisa encaminhar as portas 3000, 8080 e 8081 para o casa-ratton.
