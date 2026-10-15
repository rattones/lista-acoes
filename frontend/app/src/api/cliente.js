// Cliente HTTP da API. Erros seguem o formato da API: { erro, mensagem, detalhes }.
export class ErroApi extends Error {
  constructor({ status, codigo, mensagem, detalhes = null }) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

const juntar = (base, caminho) => `${base.replace(/\/+$/, '')}/${caminho.replace(/^\/+/, '')}`;

// Rotas de autenticação não tentam renovar a sessão em 401 (login errado, refresh recusado...).
const ROTAS_AUTH = /^\/?v1\/auth\//;

async function lerCorpo(resposta) {
  if (resposta.status === 204) return null;
  const texto = await resposta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

// fetch: injetável nos testes; sem ele, usa o fetch global do momento da chamada.
// Sessão (tarefa 019): configurarSessao({ obterToken, renovar }) liga o token de acesso
// (Authorization: Bearer) e a renovação automática: em 401, renovar() é chamado uma vez e,
// se der certo, a requisição é repetida com o token novo. O cookie do refresh vai sempre
// (credentials: 'include'): em PROD o app e a API têm origens diferentes.
export function criarCliente({ baseUrl, fetch }) {
  let sessao = { obterToken: () => null, renovar: async () => false };

  async function enviar(metodo, caminho, corpo) {
    const opcoes = {
      method: metodo,
      headers: { accept: 'application/json' },
      credentials: 'include',
    };
    const token = sessao.obterToken();
    if (token) opcoes.headers.authorization = `Bearer ${token}`;
    if (corpo !== undefined) {
      opcoes.headers['content-type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    try {
      return await (fetch ?? globalThis.fetch)(juntar(baseUrl, caminho), opcoes);
    } catch {
      throw new ErroApi({
        status: 0,
        codigo: 'sem_conexao',
        mensagem: 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.',
      });
    }
  }

  async function requisitar(metodo, caminho, corpo) {
    let resposta = await enviar(metodo, caminho, corpo);
    if (resposta.status === 401 && sessao.obterToken() && !ROTAS_AUTH.test(caminho)) {
      if (await sessao.renovar()) resposta = await enviar(metodo, caminho, corpo);
    }
    const dados = await lerCorpo(resposta);

    if (!resposta.ok) {
      const erroDaApi = dados && typeof dados === 'object' && dados.erro;
      throw new ErroApi({
        status: resposta.status,
        codigo: erroDaApi ? dados.erro : 'erro_http',
        mensagem: erroDaApi ? dados.mensagem : `Erro HTTP ${resposta.status}`,
        detalhes: erroDaApi ? (dados.detalhes ?? null) : null,
      });
    }
    return dados;
  }

  return {
    get: (caminho) => requisitar('GET', caminho),
    post: (caminho, corpo) => requisitar('POST', caminho, corpo),
    put: (caminho, corpo) => requisitar('PUT', caminho, corpo),
    patch: (caminho, corpo) => requisitar('PATCH', caminho, corpo),
    delete: (caminho, corpo) => requisitar('DELETE', caminho, corpo),
    configurarSessao(novaSessao) {
      sessao = { ...sessao, ...novaSessao };
    },
  };
}

export const api = criarCliente({ baseUrl: import.meta.env.VITE_API_URL ?? '' });
