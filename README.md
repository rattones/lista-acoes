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

Instalação e configuração: [INSTALL.md](INSTALL.md). Histórico de mudanças: [CHANGELOG.md](CHANGELOG.md).
