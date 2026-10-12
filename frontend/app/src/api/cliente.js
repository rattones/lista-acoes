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

export function criarCliente({ baseUrl, fetch = globalThis.fetch }) {
  async function requisitar(metodo, caminho, corpo) {
    const opcoes = { method: metodo, headers: { accept: 'application/json' } };
    if (corpo !== undefined) {
      opcoes.headers['content-type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }

    const resposta = await fetch(juntar(baseUrl, caminho), opcoes);
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
    delete: (caminho) => requisitar('DELETE', caminho),
  };
}

export const api = criarCliente({ baseUrl: import.meta.env.VITE_API_URL ?? '' });
