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

Instalação e configuração: [INSTALL.md](INSTALL.md). Histórico de mudanças: [CHANGELOG.md](CHANGELOG.md).
