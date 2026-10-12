# Lista de Ações

Gerenciador de ações: acompanha o mercado, armazena os dados coletados por agentes e apoia a decisão de compra e venda.

## Estrutura

Monorepo com npm workspaces:

| Pasta       | Conteúdo                                                     |
| ----------- | ------------------------------------------------------------ |
| `backend/`  | API (NestJS) — `api.listadecompras.net`                      |
| `frontend/` | App (Vue) e landing page — `app.` e `www.listadecompras.net` |
| `infra/`    | Docker, Nginx e scripts                                      |

## Comandos (na raiz)

| Comando          | O que faz                                                              |
| ---------------- | ---------------------------------------------------------------------- |
| `npm install`    | Instala as dependências da raiz e dos workspaces                       |
| `npm test`       | Verifica a estrutura do repositório e roda os testes de cada workspace |
| `npm run lint`   | ESLint e verificação de formatação do Prettier                         |
| `npm run format` | Formata os arquivos com o Prettier                                     |
| `npm run dev`    | Sobe o ambiente de desenvolvimento de cada workspace                   |

## Backend (API)

NestJS em JavaScript (decorators via Babel 7), com todas as rotas sob o prefixo `/v1`.

| Comando                    | O que faz                                        |
| -------------------------- | ------------------------------------------------ |
| `npm run dev -w backend`   | Sobe a API com recarga automática (porta `PORT`) |
| `npm test -w backend`      | Testes unitários e e2e (Jest + Supertest)        |
| `npm run build -w backend` | Transpila `src/` para `dist/`                    |
| `npm run start -w backend` | Executa a versão transpilada                     |

| Rota             | Resposta                                |
| ---------------- | --------------------------------------- |
| `GET /v1/health` | `{ "status": "ok", "versao": "x.y.z" }` |

- **Erros:** toda resposta de erro segue o formato `{ "erro": "codigo", "mensagem": "texto", "detalhes": ... }`, com códigos como `requisicao_invalida` (400), `nao_encontrado` (404) e `erro_interno` (500).
- **Validação:** payloads são validados com esquemas Joi por parâmetro: `@Body(new ValidacaoPipe(esquema))`; a falha responde 400 com a lista de campos em `detalhes`.
- **Configuração:** variáveis de ambiente validadas na inicialização; a API não sobe se faltar alguma obrigatória (ver `backend/.env-example`).
- **Logs:** JSON (pino), com request id em cada linha; o `x-request-id` recebido é reaproveitado ou gerado e devolvido na resposta.
- **CORS:** liberado somente para as origens em `CORS_ORIGENS`.

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

- **API:** o cliente em `app/src/api/cliente.js` usa `VITE_API_URL` como base; erros no formato `{ erro, mensagem, detalhes }` viram `ErroApi` (com `status`, `codigo`, `message` e `detalhes`).
- **Rotas:** `/` (início) e 404 para qualquer rota desconhecida, mantendo o endereço digitado. O app usa histórico HTML5, então o servidor precisa devolver o `index.html` para rotas desconhecidas.
- **Tema:** claro e escuro, alternados pela barra superior; o inicial segue a preferência do sistema.
- **Landing page:** o link "Acessar o app" usa `VITE_APP_URL` (padrão: `https://app.listadecompras.net`). Não tem link de cadastro: usuários entram por convite.

Instalação e configuração: [INSTALL.md](INSTALL.md). Histórico de mudanças: [CHANGELOG.md](CHANGELOG.md).
